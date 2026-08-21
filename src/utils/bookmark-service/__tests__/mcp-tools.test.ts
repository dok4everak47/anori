import { describe, expect, it } from "vitest";
import type { FolderStore, WidgetInFolderLike } from "../bookmark-service";
import { BOOKMARK_PLUGIN_ID, BOOKMARK_WIDGET_ID, BookmarkToolService, GROUP_WIDGET_ID } from "../bookmark-service";
import { discoverTools, dispatchTool } from "../mcp-protocol";
import { buildBookmarkMcpTools } from "../mcp-tools";

function bookmark(instanceId: string, title: string, url: string): WidgetInFolderLike {
  return {
    pluginId: BOOKMARK_PLUGIN_ID,
    widgetId: BOOKMARK_WIDGET_ID,
    instanceId,
    configuration: { url, title, icon: "default" },
    width: 1,
    height: 1,
    x: 0,
    y: 0,
  };
}

function group(instanceId: string, title: string, urls: string[]): WidgetInFolderLike {
  return {
    pluginId: BOOKMARK_PLUGIN_ID,
    widgetId: GROUP_WIDGET_ID,
    instanceId,
    configuration: { title, icon: "default", urls },
    width: 1,
    height: 1,
    x: 0,
    y: 0,
  };
}

class MemoryStore implements FolderStore {
  folders = [{ id: "home", name: "Home" }];
  widgets = new Map<string, WidgetInFolderLike[]>();

  static seeded(): MemoryStore {
    const store = new MemoryStore();
    store.widgets.set("home", [
      bookmark("b1", "Example", "https://example.com"),
      group("g1", "Reading", ["https://anori.app"]),
    ]);
    return store;
  }
  async getFolders() {
    return this.folders.map((f) => ({ ...f }));
  }
  async getWidgets(id: string) {
    return (this.widgets.get(id) ?? []).map((w) => ({ ...w, configuration: { ...w.configuration } }));
  }
  async setWidgets(id: string, ws: WidgetInFolderLike[]) {
    this.widgets.set(
      id,
      ws.map((w) => ({ ...w, configuration: { ...w.configuration } })),
    );
  }
}

const setup = () => {
  const tools = buildBookmarkMcpTools();
  const service = new BookmarkToolService(MemoryStore.seeded(), { createId: () => "new-id" });
  return { tools, service };
};

describe("MCP tool discovery and schema", () => {
  it("discovers tools with names, descriptions, permissions and JSON schemas", () => {
    const discovered = discoverTools(buildBookmarkMcpTools());
    const names = discovered.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "add_to_group",
        "bulk_delete_bookmarks",
        "create_bookmark",
        "create_group",
        "delete_bookmark",
        "delete_group",
        "get_bookmark",
        "get_workspace",
        "list_bookmarks",
        "list_groups",
        "move_bookmark",
        "search_bookmarks",
        "update_bookmark",
      ].sort(),
    );
    const search = discovered.find((t) => t.name === "search_bookmarks");
    expect(search?.permission).toBe("read");
    expect(search?.inputSchema).toMatchObject({ type: "object" });
    expect(search?.inputSchema.properties).toHaveProperty("query");
    expect(search?.inputSchema.required).toContain("query");
    const del = discovered.find((t) => t.name === "delete_bookmark");
    expect(del?.permission).toBe("destructive");
    expect(del?.requiresConfirmation).toBe(true);
  });

  it("does not use function names as descriptions", () => {
    for (const t of discoverTools(buildBookmarkMcpTools())) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.description).not.toBe(t.name);
      expect(t.description).toMatch(/[a-z]/);
    }
  });
});

describe("MCP dispatch", () => {
  it("runs a read tool and returns structured data", async () => {
    const { tools, service } = setup();
    const r = await dispatchTool(tools, "list_bookmarks", {}, service);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const data = r.content as { bookmarks: Array<{ instanceId: string }> };
    expect(data.bookmarks).toHaveLength(1);
  });

  it("returns INVALID_INPUT for unknown tool", async () => {
    const { tools, service } = setup();
    const r = await dispatchTool(tools, "does_not_exist", {}, service);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errorCode).toBe("INVALID_INPUT");
  });

  it("validates arguments with the canonical zod schema", async () => {
    const { tools, service } = setup();
    const r = await dispatchTool(tools, "search_bookmarks", { query: 123 }, service);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errorCode).toBe("INVALID_INPUT");
  });

  it("returns NOT_FOUND for a missing bookmark", async () => {
    const { tools, service } = setup();
    const r = await dispatchTool(tools, "update_bookmark", { instanceId: "nope", title: "X" }, service);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errorCode).toBe("NOT_FOUND");
  });

  it("rejects oversize bulk requests with BULK_LIMIT", async () => {
    const { tools, service } = setup();
    const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`);
    const r = await dispatchTool(tools, "bulk_delete_bookmarks", { instanceIds: ids }, service);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errorCode).toBe("INVALID_INPUT");
  });
});

describe("MCP destructive confirmation", () => {
  it("returns CONFIRMATION_REQUIRED on the first delete call", async () => {
    const { tools, service } = setup();
    const r = await dispatchTool(tools, "delete_bookmark", { instanceId: "b1" }, service);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errorCode).toBe("CONFIRMATION_REQUIRED");
    expect(r.confirmation?.token).toBeTruthy();
  });

  it("executes delete only when a valid matching token is supplied", async () => {
    const { tools, service } = setup();
    const first = await dispatchTool(tools, "delete_bookmark", { instanceId: "b1" }, service);
    if (first.ok) throw new Error("expected confirmation");
    const token = first.confirmation?.token as string;
    const second = await dispatchTool(
      tools,
      "delete_bookmark",
      { instanceId: "b1", confirmationToken: token },
      service,
    );
    expect(second.ok).toBe(true);
  });

  it("rejects a token used for a different target", async () => {
    const { tools, service } = setup();
    const first = await dispatchTool(tools, "delete_bookmark", { instanceId: "b1" }, service);
    if (first.ok) throw new Error("expected confirmation");
    const token = first.confirmation?.token as string;
    const r = await dispatchTool(tools, "delete_bookmark", { instanceId: "other", confirmationToken: token }, service);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errorCode).toBe("PERMISSION_DENIED");
  });

  it("rejects an invalid token", async () => {
    const { tools, service } = setup();
    const r = await dispatchTool(
      tools,
      "delete_group",
      { groupInstanceId: "g1", confirmationToken: "confirm_notreal" },
      service,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errorCode).toBe("PERMISSION_DENIED");
  });

  it("requires confirmation for bulk delete and applies with a token", async () => {
    const { tools, service } = setup();
    const first = await dispatchTool(tools, "bulk_delete_bookmarks", { instanceIds: ["b1"] }, service);
    if (first.ok) throw new Error("expected confirmation");
    expect(first.errorCode).toBe("CONFIRMATION_REQUIRED");
    const token = first.confirmation?.token as string;
    const second = await dispatchTool(
      tools,
      "bulk_delete_bookmarks",
      { instanceIds: ["b1"], confirmationToken: token },
      service,
    );
    expect(second.ok).toBe(true);
  });
});
