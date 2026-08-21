import { describe, expect, it } from "vitest";
import {
  BookmarkToolService,
  type FolderStore,
  type WidgetInFolderLike,
} from "../../utils/bookmark-service/bookmark-service";
import { defineExtension } from "../define-extension";
import { createExtensionHost } from "../extension-host";

class MemoryStore implements FolderStore {
  private folders = [{ id: "home", name: "Home" }];
  private widgets = new Map<string, WidgetInFolderLike[]>([["home", []]]);
  async getFolders() {
    return this.folders;
  }
  async getWidgets(folderId: string) {
    return this.widgets.get(folderId) ?? [];
  }
  async setWidgets(folderId: string, widgets: WidgetInFolderLike[]) {
    this.widgets.set(folderId, [...widgets]);
  }
  seed(w: WidgetInFolderLike) {
    this.widgets.get("home")?.push(w);
  }
}

function setup(permissions: string[]) {
  const store = new MemoryStore();
  const service = new BookmarkToolService(store, { createId: () => "new-id" });
  const commands = { register: () => () => {}, execute: async () => ({ success: true as const }), list: () => [] };
  const tools = { register: () => () => {} };
  const host = createExtensionHost({
    commands,
    tools,
    service,
    activeFolderId: () => "home",
  });
  let ctx: Parameters<Parameters<typeof host.load>[0]["activate"]>[0] | undefined;
  const ext = defineExtension({
    manifest: { id: "perm", name: "Perm", version: "1.0.0", permissions: permissions as never[] },
    activate: (c) => {
      ctx = c;
    },
  });
  const getCtx = () => {
    if (!ctx) throw new Error("extension not activated");
    return ctx;
  };
  return { host, ext, getCtx, service, store };
}

const bookmarkWidget = (id: string, url: string): WidgetInFolderLike => ({
  pluginId: "bookmark",
  widgetId: "bookmark",
  instanceId: id,
  configuration: { url, title: "Example", icon: "default" },
  width: 1,
  height: 1,
  x: 0,
  y: 0,
});

describe("bookmarks facade permissions and confirmation", () => {
  it("allows read and returns workspace data", async () => {
    const { host, ext, getCtx } = setup(["workspace.read", "bookmarks.read"]);
    await host.load(ext);
    const ws = await getCtx().workspace.current();
    expect(ws.activeFolder.id).toBe("home");
  });

  it("requires confirmation before a delete and then executes with a valid token", async () => {
    const { host, ext, getCtx, store } = setup(["bookmarks.delete"]);
    store.seed(bookmarkWidget("bm1", "https://example.com/"));
    await host.load(ext);
    const first = await getCtx().bookmarks.delete({ instanceId: "bm1" });
    expect(first.success).toBe(false);
    if (first.success) throw new Error("should require confirmation");
    expect(first.confirmation).toBeTruthy();
    const second = await getCtx().bookmarks.delete({
      instanceId: "bm1",
      confirmationToken: first.confirmation?.token,
    });
    expect(second.success).toBe(true);
  });

  it("rejects a confirmation token for a different target", async () => {
    const { host, ext, getCtx, store } = setup(["bookmarks.delete"]);
    store.seed(bookmarkWidget("bm1", "https://example.com/"));
    store.seed(bookmarkWidget("bm2", "https://other.com/"));
    await host.load(ext);
    const first = await getCtx().bookmarks.delete({ instanceId: "bm1" });
    if (first.success) throw new Error("should require confirmation");
    const mismatched = await getCtx().bookmarks.delete({
      instanceId: "bm2",
      confirmationToken: first.confirmation?.token,
    });
    expect(mismatched.success).toBe(false);
  });

  it("throws when creating without bookmarks.write permission", async () => {
    const { host, ext, getCtx } = setup(["bookmarks.read"]);
    await host.load(ext);
    await expect(getCtx().bookmarks.create({ url: "https://x.com" })).rejects.toThrow(/bookmarks.write/);
  });

  it("rejects non-http(s) urls via the underlying service", async () => {
    const { host, ext, getCtx } = setup(["bookmarks.write"]);
    await host.load(ext);
    await expect(getCtx().bookmarks.create({ url: "javascript:alert(1)" })).rejects.toThrow();
  });
});
