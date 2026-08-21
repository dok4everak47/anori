import { toolRegistry } from "@anori/utils/ai/tool-registry";
import { BookmarkToolService } from "@anori/utils/bookmark-service/bookmark-service";
import { createExtensionFolderStore, extensionLocatePosition } from "@anori/utils/bookmark-service/extension-store";
import { createCommandRegistry } from "@anori/utils/commands/registry";
import type { CommandRegistry } from "@anori/utils/commands/types";
import { initExtensionRuntime, loadExtension } from "./runtime";
import type { AnoriExtension } from "./types";

export const appCommandRegistry: CommandRegistry = createCommandRegistry();

let appService: BookmarkToolService | null = null;
let started = false;

export async function getAppBookmarkService(): Promise<BookmarkToolService> {
  if (!appService) {
    const store = await createExtensionFolderStore();
    appService = new BookmarkToolService(store, {
      createId: () => crypto.randomUUID(),
      locatePosition: extensionLocatePosition,
    });
  }
  return appService;
}

export async function startExtensionRuntime(extensions: AnoriExtension[], activeFolderId: () => string): Promise<void> {
  if (started) return;
  started = true;
  const service = await getAppBookmarkService();
  initExtensionRuntime({
    commands: appCommandRegistry,
    tools: toolRegistry,
    service,
    activeFolderId,
  });
  for (const extension of extensions) {
    try {
      await loadExtension(extension);
    } catch (e) {
      console.error(`[sdk] Failed to load extension "${extension.manifest.id}":`, e);
    }
  }
}
