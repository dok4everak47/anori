import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookmarkToolService } from "../../src/utils/bookmark-service/bookmark-service";
import { discoverTools, dispatchTool } from "../../src/utils/bookmark-service/mcp-protocol";
import { buildBookmarkMcpTools } from "../../src/utils/bookmark-service/mcp-tools";

const PROTOCOL_VERSION = "2024-11-05";

type Req = { jsonrpc: "2.0"; id?: number | string | null; method: string; params?: Record<string, unknown> };

function createHarness() {
  const tools = buildBookmarkMcpTools();
  const discovered = discoverTools(tools);
  let initialized = false;
  const sent: Array<Record<string, unknown>> = [];

  async function receive(raw: string): Promise<Record<string, unknown> | null> {
    let request: Req;
    try {
      request = JSON.parse(raw) as Req;
    } catch {
      return { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } };
    }
    if (request?.jsonrpc !== "2.0" || typeof request.method !== "string") {
      return { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
    }

    if (request.id === undefined || request.id === null) {
      if (request.method === "notifications/initialized") initialized = true;
      return null;
    }

    if (request.method === "initialize") {
      initialized = true;
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "anori", version: "2.3.0" },
        },
      };
    }

    if (!initialized) {
      return { jsonrpc: "2.0", id: request.id, error: { code: -32600, message: "Initialize the server first." } };
    }

    if (request.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: discovered.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: {
              readOnlyHint: t.permission === "read",
              destructiveHint: t.permission === "destructive",
              openWorldHint: false,
            },
          })),
        },
      };
    }

    if (request.method === "tools/call") {
      const params = (request.params ?? {}) as { name?: unknown; arguments?: unknown };
      const inMemoryService = new BookmarkToolService(seedStore(), { createId: () => "new-id" });
      const result = await dispatchTool(tools, String(params.name ?? ""), params.arguments, inMemoryService);
      if (result.ok) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: { content: [{ type: "text", text: JSON.stringify(result.content) }], isError: false },
        };
      }
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [{ type: "text", text: `${result.errorCode}: ${result.message}` }],
          isError: true,
          structuredContent: { error: result.errorCode, message: result.message },
        },
      };
    }

    return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: `Method not found: ${request.method}` } };
  }

  return { receive, sent };
}

function seedStore(): import("../../src/utils/bookmark-service/bookmark-service").FolderStore {
  return {
    folders: [{ id: "home", name: "Home" }],
    widgets: new Map([
      [
        "home",
        [
          {
            pluginId: "bookmark-plugin",
            widgetId: "bookmark",
            instanceId: "b1",
            configuration: { url: "https://example.com", title: "Example", icon: "default" },
            width: 1,
            height: 1,
            x: 0,
            y: 0,
          },
        ],
      ],
    ]),
    async getFolders() {
      return this.folders;
    },
    async getWidgets(id: string) {
      return (this.widgets.get(id) ?? []).map((w) => ({ ...w, configuration: { ...w.configuration } }));
    },
    async setWidgets(id: string, ws) {
      this.widgets.set(
        id,
        ws.map((w) => ({ ...w, configuration: { ...w.configuration } })),
      );
    },
  } as unknown as import("../../src/utils/bookmark-service/bookmark-service").FolderStore;
}

describe("MCP stdio JSON-RPC server", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with protocol version and server info", async () => {
    const h = createHarness();
    const res = await h.receive(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }));
    expect(res?.result).toMatchObject({ protocolVersion: PROTOCOL_VERSION, serverInfo: { name: "anori" } });
  });

  it("rejects tools/list before initialize", async () => {
    const h = createHarness();
    const res = await h.receive(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    expect(res?.error).toMatchObject({ code: -32600 });
  });

  it("lists tools after initialize", async () => {
    const h = createHarness();
    await h.receive(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }));
    const res = await h.receive(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    const tools = (res?.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.some((t) => t.name === "search_bookmarks")).toBe(true);
  });

  it("calls a read tool and returns content", async () => {
    const h = createHarness();
    await h.receive(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }));
    const res = await h.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_bookmarks", arguments: {} },
      }),
    );
    expect((res?.result as { isError: boolean }).isError).toBe(false);
  });

  it("calls a write tool and returns success with id", async () => {
    const h = createHarness();
    await h.receive(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }));
    const res = await h.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "create_bookmark", arguments: { url: "https://new.com", title: "New" } },
      }),
    );
    const result = res?.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ success: true, bookmarkId: "new-id" });
  });

  it("destructive call returns isError with CONFIRMATION_REQUIRED structured content", async () => {
    const h = createHarness();
    await h.receive(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }));
    const res = await h.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "delete_bookmark", arguments: { instanceId: "b1" } },
      }),
    );
    const result = res?.result as { isError: boolean; structuredContent: { error: string } };
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error).toBe("CONFIRMATION_REQUIRED");
  });

  it("returns method not found for unknown methods", async () => {
    const h = createHarness();
    await h.receive(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }));
    const res = await h.receive(JSON.stringify({ jsonrpc: "2.0", id: 6, method: "resources/list" }));
    expect(res?.error).toMatchObject({ code: -32601 });
  });

  it("returns parse error for malformed JSON", async () => {
    const h = createHarness();
    const res = await h.receive("{ not json");
    expect(res?.error).toMatchObject({ code: -32700 });
  });
});
