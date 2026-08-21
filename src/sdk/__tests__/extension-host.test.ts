import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../../utils/ai/tool-registry";
import {
  BookmarkToolService,
  type FolderStore,
  type WidgetInFolderLike,
} from "../../utils/bookmark-service/bookmark-service";
import { createCommandRegistry } from "../../utils/commands/registry";
import { defineExtension } from "../define-extension";
import { createExtensionHost, ExtensionActivationError } from "../extension-host";

class MemoryStore implements FolderStore {
  private folders = [
    { id: "home", name: "Home" },
    { id: "work", name: "Work" },
  ];
  private widgets = new Map<string, WidgetInFolderLike[]>();

  constructor() {
    this.widgets.set("home", []);
    this.widgets.set("work", []);
  }

  async getFolders() {
    return this.folders;
  }
  async getWidgets(folderId: string) {
    return this.widgets.get(folderId) ?? [];
  }
  async setWidgets(folderId: string, widgets: WidgetInFolderLike[]) {
    this.widgets.set(folderId, [...widgets]);
  }
}

function makeHost() {
  const service = new BookmarkToolService(new MemoryStore(), {
    createId: () => `id-${Math.random().toString(36).slice(2)}`,
  });
  const commands = createCommandRegistry();
  const tools = new ToolRegistry();
  const host = createExtensionHost({
    commands,
    tools,
    service,
    activeFolderId: () => "home",
  });
  return { host, service, commands, tools };
}

describe("extension host lifecycle", () => {
  it("calls activate on load and deactivate on unload", async () => {
    const { host } = makeHost();
    const activate = vi.fn();
    const deactivate = vi.fn();
    const ext = defineExtension({
      manifest: { id: "life", name: "Life", version: "1.0.0", permissions: ["workspace.read"] },
      activate,
      deactivate,
    });
    await host.load(ext);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(host.isLoaded("life")).toBe(true);
    await host.unload("life");
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(host.isLoaded("life")).toBe(false);
  });

  it("does not register the extension when activate throws", async () => {
    const { host } = makeHost();
    const ext = defineExtension({
      manifest: { id: "boom", name: "Boom", version: "1.0.0", permissions: ["workspace.read"] },
      activate: () => {
        throw new Error("nope");
      },
    });
    await expect(host.load(ext)).rejects.toBeInstanceOf(ExtensionActivationError);
    expect(host.isLoaded("boom")).toBe(false);
  });

  it("prevents double-loading the same extension id", async () => {
    const { host } = makeHost();
    const ext = defineExtension({
      manifest: { id: "dup", name: "Dup", version: "1.0.0", permissions: ["workspace.read"] },
      activate: () => {},
    });
    await host.load(ext);
    await expect(host.load(ext)).rejects.toThrow(/already loaded/);
  });
});

describe("extension permissions", () => {
  it("blocks commands.register when the permission is missing", async () => {
    const { host } = makeHost();
    const ext = defineExtension({
      manifest: { id: "nocmd", name: "No Cmd", version: "1.0.0", permissions: ["workspace.read"] },
      activate: (ctx) => {
        ctx.commands.register({ id: "x.foo", title: "Foo", execute: () => ({ success: true }) });
      },
    });
    await expect(host.load(ext)).rejects.toThrow(/commands.register/);
  });

  it("blocks bookmarks.read when the permission is missing", async () => {
    const { host } = makeHost();
    const ext = defineExtension({
      manifest: { id: "nobm", name: "No BM", version: "1.0.0", permissions: ["workspace.read"] },
      activate: async (ctx) => {
        await ctx.bookmarks.search("anything");
      },
    });
    await expect(host.load(ext)).rejects.toThrow(/bookmarks.read/);
  });

  it("blocks a write tool without the bookmarks.write permission", async () => {
    const { host } = makeHost();
    const ext = defineExtension({
      manifest: {
        id: "nowrite",
        name: "No Write",
        version: "1.0.0",
        permissions: ["tools.register", "bookmarks.read"],
      },
      activate: (ctx) => {
        ctx.tools.register({
          name: "w",
          description: "write tool",
          permission: "write",
          inputSchema: z.object({}),
          execute: async () => ({ ok: true, content: null }),
        });
      },
    });
    await expect(host.load(ext)).rejects.toThrow(/bookmarks.write/);
  });
});

describe("extension commands", () => {
  it("surfaces extension commands in the shared command registry and emits command.executed", async () => {
    const { host, commands } = makeHost();
    const exec = vi.fn(() => ({ success: true }));
    const onExecuted = vi.fn();
    host._bus.on("command.executed", onExecuted);
    await host.load(
      defineExtension({
        manifest: { id: "cmd", name: "Cmd", version: "1.0.0", permissions: ["commands.register"] },
        activate: (ctx) => {
          ctx.commands.register({ id: "cmd.hello", title: "Hello", execute: exec });
        },
      }),
    );
    const registered = commands.list().find((c) => c.id === "cmd.hello");
    expect(registered).toBeTruthy();
    expect(registered?.source).toBe("extension");
    expect(registered?.category).toBe("extension");
    await commands.execute("cmd.hello", {});
    expect(exec).toHaveBeenCalledTimes(1);
    expect(onExecuted).toHaveBeenCalledWith({ commandId: "cmd.hello" });
  });

  it("isolates a command that throws so it returns a failure result instead of crashing", async () => {
    const { host, commands } = makeHost();
    await host.load(
      defineExtension({
        manifest: { id: "badcmd", name: "Bad", version: "1.0.0", permissions: ["commands.register"] },
        activate: (ctx) => {
          ctx.commands.register({
            id: "bad.boom",
            title: "Boom",
            execute: () => {
              throw new Error("kaboom");
            },
          });
        },
      }),
    );
    const result = await commands.execute("bad.boom", {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/kaboom/);
  });

  it("disposes extension commands on unload", async () => {
    const { host, commands } = makeHost();
    await host.load(
      defineExtension({
        manifest: { id: "dispose", name: "Dispose", version: "1.0.0", permissions: ["commands.register"] },
        activate: (ctx) => {
          ctx.commands.register({ id: "d.1", title: "D", execute: () => ({ success: true }) });
        },
      }),
    );
    expect(commands.list().some((c) => c.id === "d.1")).toBe(true);
    await host.unload("dispose");
    expect(commands.list().some((c) => c.id === "d.1")).toBe(false);
  });
});

describe("extension events", () => {
  it("delivers canonical events from underlying data mutations", async () => {
    const { host, service } = makeHost();
    const created = vi.fn();
    await host.load(
      defineExtension({
        manifest: {
          id: "ev",
          name: "Events",
          version: "1.0.0",
          permissions: ["events.read", "bookmarks.read", "bookmarks.write"],
        },
        activate: (ctx) => {
          ctx.events.on("bookmark.created", created);
        },
      }),
    );
    await service.createBookmark({ url: "https://example.com", title: "Example", folderId: "home" });
    expect(created).toHaveBeenCalledTimes(1);
    expect(created.mock.calls[0][0].bookmark.url).toBe("https://example.com/");
  });

  it("isolates a throwing listener so other listeners still run", async () => {
    const { host } = makeHost();
    const good = vi.fn();
    await host.load(
      defineExtension({
        manifest: { id: "bad-listener", name: "Bad", version: "1.0.0", permissions: ["events.read"] },
        activate: (ctx) => {
          ctx.events.on("workspace.changed", () => {
            throw new Error("listener boom");
          });
          ctx.events.on("workspace.changed", good);
        },
      }),
    );
    expect(() => host._bus.emit("workspace.changed", { folderId: "home" })).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe("extension tools", () => {
  it("registers tools into the shared tool registry and isolates thrown errors", async () => {
    const { host, tools } = makeHost();
    await host.load(
      defineExtension({
        manifest: {
          id: "tool-ext",
          name: "Tools",
          version: "1.0.0",
          permissions: ["tools.register", "bookmarks.read"],
        },
        activate: (ctx) => {
          ctx.tools.register({
            name: "ext_ping",
            description: "always throws",
            permission: "read",
            inputSchema: z.object({}),
            execute: async () => {
              throw new Error("tool boom");
            },
          });
        },
      }),
    );
    const tool = tools.get("ext_ping");
    expect(tool).toBeTruthy();
    if (!tool) throw new Error("tool not registered");
    const result = await tool.execute({}, { folderId: "home", selection: null });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/tool boom/);
  });
});
