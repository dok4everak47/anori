# Anori MCP Server

Anori ships a local [Model Context Protocol](https://modelcontextprotocol.io) server that exposes your bookmarks and groups to external AI coding agents — DeepSeek Harness, OpenCode, Claude Desktop, Cursor, and any other MCP-compatible client.

The server is **local-only**: it speaks JSON-RPC 2.0 over stdio, never binds a network port, and never talks to the public internet itself.

## What it does

External agents get a structured, schema-driven set of tools for the data Anori already manages:

- `get_workspace` — list folders and the active folder
- `list_bookmarks`, `list_groups`, `get_bookmark`, `search_bookmarks` — read
- `create_bookmark`, `update_bookmark`, `move_bookmark`, `create_group`, `add_to_group` — write
- `delete_bookmark`, `bulk_delete_bookmarks` (max 50), `delete_group` — destructive

Every tool has:

- a canonical [Zod](https://zod.dev) input schema (the same schema used by the built-in AI command layer — there is one source of truth);
- a `read` / `write` / `destructive` permission, surfaced to clients via MCP tool annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint: false`, `confirmationHint`);
- structured error codes: `INVALID_INPUT`, `NOT_FOUND`, `PERMISSION_DENIED`, `CONFIRMATION_REQUIRED`, `CONFLICT`, `BULK_LIMIT`, `INTERNAL_ERROR`.

## Destructive operations require confirmation

`delete_bookmark`, `bulk_delete_bookmarks`, and `delete_group` do not run on the first call. The first call returns:

```json
{
  "error": "CONFIRMATION_REQUIRED",
  "message": "Destructive action requires confirmation. Repeat the call with confirmationToken=\"confirm_...\" within 60s.",
  "confirmation": {
    "token": "confirm_...",
    "expiresAt": 1787320703306,
    "details": { "tool": "delete_bookmark", "instanceId": "b1" }
  }
}
```

The agent must repeat the **exact same arguments** plus the token. Tokens are single-use, expire after 60 seconds, and are bound to the exact target (a token for bookmark `b1` cannot delete bookmark `b2`). This is the same confirmation gate used by the in-extension AI panel.

Bulk operations are capped at 50 items by the input schema (`maxItems`), so a stray model instruction cannot wipe an entire library in one call.

## Running the server

The server lives in [`mcp-server/`](../mcp-server) and is a zero-runtime-dependency Node ESM program (Node 22+; it uses only the standard library plus the project's existing `zod`).

```bash
# try it without the extension installed (in-memory demo data)
cd mcp-server
ANORI_MCP_DEMO=1 node dist/index.js
```

Build it:

```bash
cd mcp-server
npx tsc -p tsconfig.json
# binary: mcp-server/dist/index.js
```

### Connecting to live extension data

When not in demo mode the server forwards storage calls to a native bridge host (`ANORI_NATIVE_HOST`, default `com.anori.mcp`) using stdio. Browser extensions cannot be reached directly from a local process, so the bridge is the single supported path between the MCP server and Anori's extension storage. Until the native host is installed, live calls return a clear error; set `ANORI_MCP_MODE=memory` (or `ANORI_MCP_DEMO=1`) for offline/demo use.

## Client configuration

MCP clients launch the server as a local subprocess. Add it to your client's MCP config:

```json
{
  "mcpServers": {
    "anori": {
      "command": "node",
      "args": ["/absolute/path/to/anori/mcp-server/dist/index.js"],
      "env": { "ANORI_MCP_MODE": "memory" }
    }
  }
}
```

- **DeepSeek Harness / OpenCode** — add the block above to the client's MCP server settings; both discover the tool list from the standard `tools/list` response.
- **Demo vs live** — omit `ANORI_MCP_MODE` (or set it to `native`) once the native bridge is installed to operate on real bookmarks.

## Security model

- **Local-only transport.** stdio only; there is no HTTP server, no `0.0.0.0` bind, no inbound port. The process cannot be reached from another machine.
- **No open-world access.** Tools only read/write Anori's own bookmark data for the current folder. There is no shell tool, no arbitrary `fetch`, and no access to other plugins' private storage.
- **Permissions + confirmation.** Writes are gated by the agent runtime; destructive actions require a bound, expiring confirmation token issued by the server.
- **Bulk caps.** Array inputs are capped at 50 items via the schema.
- **Prompt-injection safe.** Bookmark titles and URLs are treated strictly as data — stored and returned verbatim, never executed or interpreted as instructions. The server performs no string evaluation.
- **If a network transport is added later**, it must bind to `127.0.0.1`, require a bearer token, and never expose `0.0.0.0`.

## Architecture

```
external agent (DeepSeek Harness / OpenCode / ...)
        │  stdio · JSON-RPC 2.0 · MCP (initialize / tools/list / tools/call)
        ▼
mcp-server/src/stdio-server.ts        ← protocol only, no storage
        │
        ▼
src/utils/bookmark-service/
  ├── mcp-tools.ts                    ← canonical tool defs + Zod schemas + confirmation
  ├── mcp-protocol.ts                 ← discovery, argument validation, dispatch, errors
  └── bookmark-service.ts             ← environment-agnostic CRUD over a FolderStore
        │
        ▼
FolderStore (injected)
  ├── InMemoryFolderStore (demo/tests) — mcp-server/src/in-memory-store.ts
  ├── NativeBridgeStore (live)         — mcp-server/src/native-bridge.ts
  └── extension store                  — src/utils/bookmark-service/extension-store.ts
```

The same `BookmarkToolService` and tool definitions back both the external MCP server and the in-extension AI command layer, so capabilities, validation, permissions, and error codes never drift. The MCP layer is a pure transport/protocol adapter: it never touches React state or the AI provider/agent loop directly.

## Tests

```bash
pnpm test
```

Covers discovery and canonical schemas, every CRUD tool, bulk caps, argument validation, all three confirmation flows (required / valid token / wrong or reused token), structured error mapping, JSON-RPC initialize/list/call/shutdown and parse/method errors, and a prompt-injection resistance case.
