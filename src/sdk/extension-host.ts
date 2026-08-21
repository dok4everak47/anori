import type { ToolRegistry } from "@anori/utils/ai/tool-registry";
import type { BookmarkToolService } from "@anori/utils/bookmark-service/bookmark-service";
import type { CommandRegistry } from "@anori/utils/commands/types";
import { createBookmarksApi } from "./bookmarks-api";
import { createEventBus, type EventBus } from "./events";
import { createExtensionLogger } from "./logger";
import { assertCanRegisterTool, hasPermission, PermissionError, requirePermission } from "./permissions";
import type { AnoriEventMap, AnoriExtension, Disposable, SdkCommand, SdkCommandContext, SdkTool } from "./types";

export type ExtensionHostDeps = {
  commands: Pick<CommandRegistry, "register" | "execute" | "list">;
  tools: Pick<ToolRegistry, "register">;
  service: BookmarkToolService;
  activeFolderId: () => string;
};

export type LoadedExtension = {
  id: string;
  manifest: AnoriExtension["manifest"];
  activate: () => Promise<void>;
  deactivate: () => Promise<void>;
};

export function createExtensionHost(deps: ExtensionHostDeps) {
  const bus = createEventBus({
    warn: (m) => console.warn("[sdk:events]", m),
    error: (m) => console.error("[sdk:events]", m),
  });
  const loaded = new Map<string, { extension: AnoriExtension; disposables: Disposable[] }>();

  function relayServiceEvents(): Disposable {
    const unbind = deps.service.subscribe((event) => {
      switch (event.type) {
        case "bookmark.created":
          bus.emit("bookmark.created", { bookmark: event.bookmark as AnoriEventMap["bookmark.created"]["bookmark"] });
          bus.emit("workspace.changed", { folderId: event.folderId });
          break;
        case "bookmark.updated":
          bus.emit("bookmark.updated", { bookmark: event.bookmark } as AnoriEventMap["bookmark.updated"]);
          bus.emit("workspace.changed", { folderId: event.folderId });
          break;
        case "bookmark.deleted":
          bus.emit("bookmark.deleted", { instanceId: event.instanceId, folderId: event.folderId });
          bus.emit("workspace.changed", { folderId: event.folderId });
          break;
        case "group.created":
          bus.emit("group.created", { group: event.group as AnoriEventMap["group.created"]["group"] });
          bus.emit("workspace.changed", { folderId: event.folderId });
          break;
        case "group.updated":
          bus.emit("group.updated", { group: event.group } as AnoriEventMap["group.updated"]);
          bus.emit("workspace.changed", { folderId: event.folderId });
          break;
        case "group.deleted":
          bus.emit("group.deleted", { instanceId: event.instanceId, folderId: event.folderId });
          bus.emit("workspace.changed", { folderId: event.folderId });
          break;
      }
    });
    return { dispose: unbind };
  }

  const serviceRelay = relayServiceEvents();

  function buildContext(extension: AnoriExtension) {
    const manifest = extension.manifest;
    const logger = createExtensionLogger(manifest.id);
    const { workspace, bookmarks } = createBookmarksApi(manifest, deps.service);
    const disposables: Disposable[] = [];

    const commands = {
      register(command: SdkCommand): Disposable {
        requirePermission(manifest, "commands.register");
        if (!command.id || !command.title) {
          throw new Error(`Extension "${manifest.id}" tried to register a command without id or title.`);
        }
        const unregister = deps.commands.register({
          ...command,
          category: "extension",
          source: "extension",
          execute: async (ctx: SdkCommandContext) => {
            try {
              const result = await command.execute(ctx);
              bus.emit("command.executed", { commandId: command.id });
              return result ?? { success: true };
            } catch (e) {
              logger.error(`Command "${command.id}" failed: ${e instanceof Error ? e.message : String(e)}`);
              return { success: false, error: e instanceof Error ? e.message : String(e) };
            }
          },
        });
        const disposable = { dispose: unregister };
        disposables.push(disposable);
        return disposable;
      },
    };

    const tools = {
      register(tool: SdkTool): Disposable {
        assertCanRegisterTool(manifest, tool.permission);
        const unregister = deps.tools.register({
          name: tool.name,
          description: tool.description,
          permission: tool.permission,
          inputSchema: tool.inputSchema,
          execute: async (input, ctx) => {
            try {
              return await tool.execute(input, ctx);
            } catch (e) {
              logger.error(`Tool "${tool.name}" failed: ${e instanceof Error ? e.message : String(e)}`);
              return { ok: false, content: null, error: e instanceof Error ? e.message : String(e) };
            }
          },
        });
        const disposable = { dispose: unregister };
        disposables.push(disposable);
        return disposable;
      },
    };

    const events = {
      on<K extends keyof AnoriEventMap>(name: K, listener: (payload: AnoriEventMap[K]) => void): Disposable {
        requirePermission(manifest, "events.read");
        const disposable = bus.on(name, listener);
        disposables.push(disposable);
        return disposable;
      },
    };

    return {
      commands,
      tools,
      events,
      workspace,
      bookmarks,
      logger,
      _disposables: disposables,
    };
  }

  async function load(extension: AnoriExtension): Promise<void> {
    if (loaded.has(extension.manifest.id)) {
      throw new Error(`Extension "${extension.manifest.id}" is already loaded.`);
    }
    const context = buildContext(extension);
    loaded.set(extension.manifest.id, { extension, disposables: context._disposables });
    try {
      await extension.activate(context);
    } catch (e) {
      loaded.delete(extension.manifest.id);
      console.error(
        `[sdk] Extension "${extension.manifest.id}" failed to activate: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw new ExtensionActivationError(extension.manifest.id, e instanceof Error ? e.message : String(e));
    }
  }

  async function unload(id: string): Promise<void> {
    const entry = loaded.get(id);
    if (!entry) return;
    for (const disposable of entry.disposables) {
      try {
        disposable.dispose();
      } catch (e) {
        console.warn(`[sdk] Error disposing extension "${id}": ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (entry.extension.deactivate) {
      try {
        await entry.extension.deactivate();
      } catch (e) {
        console.warn(`[sdk] Extension "${id}" deactivate threw: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    loaded.delete(id);
  }

  function isLoaded(id: string): boolean {
    return loaded.has(id);
  }

  function listLoaded(): string[] {
    return Array.from(loaded.keys());
  }

  function events(): Pick<EventBus, "emit"> {
    return { emit: bus.emit };
  }

  async function dispose(): Promise<void> {
    const ids = Array.from(loaded.keys());
    for (const id of ids) await unload(id);
    serviceRelay.dispose();
  }

  return { load, unload, isLoaded, listLoaded, events, dispose, _bus: bus };
}

export class ExtensionActivationError extends Error {
  readonly extensionId: string;
  constructor(extensionId: string, message: string) {
    super(`Extension "${extensionId}" activation failed: ${message}`);
    this.name = "ExtensionActivationError";
    this.extensionId = extensionId;
  }
}

export { hasPermission, PermissionError };
