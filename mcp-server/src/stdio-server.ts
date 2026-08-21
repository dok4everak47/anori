import { createInterface } from "node:readline";
import { InMemoryFolderStore } from "./in-memory-store.js";
import { NativeBridgeStore } from "./native-bridge.js";
import type { FolderStore } from "./shared/bookmark-service.js";
import { BookmarkToolService } from "./shared/bookmark-service.js";
import { discoverTools, dispatchTool } from "./shared/mcp-protocol.js";
import { buildBookmarkMcpTools } from "./shared/mcp-tools.js";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "anori";
const SERVER_VERSION = "2.3.0";

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function pickStore(): FolderStore {
  const mode = process.env.ANORI_MCP_MODE ?? "native";
  if (mode === "memory" || process.env.ANORI_MCP_DEMO === "1") {
    return InMemoryFolderStore.seeded();
  }
  return new NativeBridgeStore(process.env.ANORI_NATIVE_HOST ?? "com.anori.mcp");
}

const tools = buildBookmarkMcpTools();
const service = new BookmarkToolService(pickStore());
const discovered = discoverTools(tools);
let initialized = false;
let shutdownRequested = false;

function annotations(permission: string, requiresConfirmation: boolean) {
  return {
    title: permission,
    readOnlyHint: permission === "read",
    destructiveHint: permission === "destructive",
    openWorldHint: false,
    ...(requiresConfirmation ? { confirmationHint: true } : {}),
  };
}

function tokenFrom(args: unknown): string | undefined {
  if (args && typeof args === "object" && "confirmationToken" in args) {
    const v = (args as { confirmationToken?: unknown }).confirmationToken;
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

async function handle(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  if (request.id === undefined || request.id === null) {
    if (request.method === "notifications/initialized" || request.method === "initialized") initialized = true;
    if (request.method === "shutdown" || request.method === "exit") shutdownRequested = true;
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
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    };
  }

  if (!initialized) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: INVALID_REQUEST, message: "Initialize the server first." },
    };
  }

  switch (request.method) {
    case "ping":
      return { jsonrpc: "2.0", id: request.id, result: {} };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: discovered.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: annotations(t.permission, t.requiresConfirmation),
          })),
        },
      };

    case "tools/call": {
      const params = (request.params ?? {}) as { name?: unknown; arguments?: unknown };
      if (typeof params.name !== "string") {
        return { jsonrpc: "2.0", id: request.id, error: { code: INVALID_PARAMS, message: "Missing tool name." } };
      }
      const result = await dispatchTool(tools, params.name, params.arguments, service, {
        confirmationToken: tokenFrom(params.arguments),
      });
      if (result.ok) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: { content: [{ type: "text", text: JSON.stringify(result.content, null, 2) }], isError: false },
        };
      }
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [{ type: "text", text: `${result.errorCode}: ${result.message}` }],
          isError: true,
          structuredContent: {
            error: result.errorCode,
            message: result.message,
            ...(result.confirmation ? { confirmation: result.confirmation } : {}),
          },
        },
      };
    }

    case "shutdown":
      shutdownRequested = true;
      return { jsonrpc: "2.0", id: request.id, result: null };

    default:
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: METHOD_NOT_FOUND, message: `Method not found: ${request.method}` },
      };
  }
}

function send(response: JsonRpcResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

async function onLine(line: string): Promise<void> {
  if (!line.trim()) return;
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "Parse error" } });
    return;
  }
  if (request?.jsonrpc !== "2.0" || typeof request.method !== "string") {
    send({ jsonrpc: "2.0", id: request?.id ?? null, error: { code: INVALID_REQUEST, message: "Invalid Request" } });
    return;
  }
  try {
    const response = await handle(request);
    if (response) send(response);
  } catch (e) {
    send({
      jsonrpc: "2.0",
      id: request.id ?? null,
      error: { code: INTERNAL_ERROR, message: e instanceof Error ? e.message : "Internal error" },
    });
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  void onLine(line);
});

process.on("SIGINT", () => {
  shutdownRequested = true;
});
process.on("SIGTERM", () => {
  shutdownRequested = true;
});

process.stdin.on("end", () => {
  shutdownRequested = true;
});

function shutdownWatchdog(): void {
  if (shutdownRequested) {
    rl.close();
    process.exit(0);
  }
  setTimeout(shutdownWatchdog, 100);
}
shutdownWatchdog();
