# Anori Extension SDK

Build extensions for Anori that add **commands** (in the ⌘K palette), **tools**
(usable by the AI agent and MCP), and react to **events** — all from a single,
sandboxed API surface.

This document is the complete developer guide for the public `@anori/sdk`
package introduced in Phase 11.

---

## 1. Overview

An extension is a module that exports the result of `defineExtension(...)`. It
receives a restricted `ExtensionContext` at activation and can:

- **register commands** that appear in the Command Palette (⌘K);
- **register tools** with a Zod input schema and a permission level, callable by
  the in-app AI agent and (through the shared tool service) external MCP
  clients;
- **read and mutate bookmarks and groups** through a permission-gated facade;
- **subscribe to typed events** emitted by the host;
- **read workspace/folder information**.

Extensions never get direct access to the storage database, React internals, the
DOM, other plugins' private storage, `fetch`, or any shell capability.

---

## 2. Getting started

The smallest possible extension:

```ts
import { defineExtension } from "@anori/sdk";

export default defineExtension({
  manifest: {
    id: "hello-world",
    name: "Hello World",
    version: "1.0.0",
    permissions: ["commands.register"],
  },
  activate(ctx) {
    ctx.commands.register({
      id: "hello.say",
      title: "Say hello",
      description: "Logs a greeting from the extension.",
      keywords: ["hello", "greeting"],
      execute: () => {
        ctx.logger.info("Hello from an extension!");
        return { success: true };
      },
    });
  },
});
```

A runnable, more complete example lives in
[`examples/anori-extension-example/`](../../examples/anori-extension-example/).

> **Note on distribution:** Phase 11 ships the SDK and the in-process extension
> host for extensions bundled with or programmatically loaded into Anori. A
> marketplace, remote extension loading, and auto-update are **out of scope** and
> not implemented.

---

## 3. The manifest

```ts
type ExtensionManifest = {
  id: string;              // lowercase, kebab-case, e.g. "my-extension"
  name: string;            // human-readable, non-empty
  version: string;         // semver, e.g. "1.2.3"
  description?: string;
  permissions?: ExtensionPermission[];
};
```

`defineExtension` validates the manifest up front and throws on:

- a missing or non-kebab-case `id`;
- an empty `name`;
- an invalid (non-semver) `version`;
- an **unknown permission** (fail-fast, so typos never silently pass);

duplicate permissions are de-duplicated.

### Permissions

Permissions are explicit and default-deny. An extension can only do what its
manifest declares.

| Permission            | Grants                                                                 |
| --------------------- | ---------------------------------------------------------------------- |
| `commands.register`   | Register Command Palette commands via `ctx.commands`.                  |
| `tools.register`      | Register AI/MCP tools via `ctx.tools` (tool permission still applies). |
| `bookmarks.read`      | Read/search/list bookmarks and groups; read tools.                     |
| `bookmarks.write`     | Create/update bookmarks and groups; register write tools.              |
| `bookmarks.delete`    | Delete bookmarks/groups (with confirmation); destructive tools.        |
| `workspace.read`      | Read the active folder and list folders.                               |
| `events.read`         | Subscribe to public host events.                                       |

Tool registration also enforces the matching data permission: a `write` tool
requires `bookmarks.write`, a `destructive` tool requires `bookmarks.delete`,
and a `read` tool requires `bookmarks.read`. There is no tool that bypasses the
permission system, and no tool can access arbitrary filesystem, network, or
shell resources.

---

## 4. The extension context

`activate(ctx)` receives an `ExtensionContext`:

```ts
type ExtensionContext = {
  commands: { register(command: SdkCommand): Disposable };
  tools: { register(tool: SdkTool): Disposable };
  events: { on<K>(name: K, listener): Disposable };
  workspace: {
    current(): Promise<WorkspaceSnapshot>;
    list(): Promise<WorkspaceFolder[]>;
    get(folderId: string): Promise<WorkspaceFolder | undefined>;
  };
  bookmarks: {
    search(query, folderId?): Promise<BookmarkSearchResult>;
    get(instanceId, folderId?): Promise<Bookmark | BookmarkGroup | undefined>;
    create(input): Promise<{ bookmarkId: string }>;
    update(input): Promise<{ bookmarkId: string }>;
    delete(input): Promise<DeleteResult>;          // confirmation-gated
    createGroup(input): Promise<{ groupId: string }>;
    addToGroup(input): Promise<{ groupId; totalUrls; addedCount }>;
    deleteGroup(input): Promise<DeleteGroupResult>; // confirmation-gated
  };
  logger: ExtensionLogger;
};
```

The context exposes **no** access to raw storage, React, the DOM, other
extensions' state, or the network.

### Logger

`ctx.logger` is namespaced per extension. Every line is prefixed with
`[extension:<id>]`:

```ts
ctx.logger.info("Ready");
ctx.logger.warn("Something odd", detail);
ctx.logger.error("Failed", err);
```

---

## 5. Commands

```ts
ctx.commands.register({
  id: "my-ext.open",            // unique, namespaced (prefix with your id)
  title: "Open my thing",
  description: "Short subtitle shown in the palette.",
  keywords: ["thing", "open"],  // optional extra search terms
  execute: async (context) => {
    // context.selection is available when the palette was opened
    // with a selected widget/folder.
    return { success: true };
  },
});
```

- Commands are **searchable** in the ⌘K palette automatically.
- Return `{ success: false, error }` to surface a failure without crashing.
- If `execute` throws, the host catches it, logs it under the extension's
  namespace, and returns a failure result. **One extension's command can never
  crash the palette or another extension.**
- The returned `Disposable` (and unload) removes the command.

---

## 6. Tools

Tools are typed, permissioned capabilities exposed to the AI agent loop and, via
the existing MCP companion, to external agents.

```ts
import { z } from "zod";

ctx.tools.register({
  name: "my_ext_find",          // unique, snake_case by convention
  description: "Find bookmarks matching a query. Read-only.",
  permission: "read",           // "read" | "write" | "destructive"
  inputSchema: z.object({
    query: z.string().min(1).describe("Text to match against titles and URLs."),
  }),
  execute: async (input, toolCtx) => {
    const hits = await ctx.bookmarks.search(input.query);
    return { ok: true, content: hits };
  },
});
```

- `inputSchema` is a **Zod schema** — the single source of truth used for
  runtime validation by both the AI agent and MCP, and for generating the JSON
  Schema advertised to MCP clients.
- `permission` drives the AI agent's read/write/destructive policy: `read` tools
  run automatically; `write` and `destructive` tools are proposed in an action
  plan and require user approval.
- Tool errors are isolated: a thrown error becomes
  `{ ok: false, error }` and is logged, never propagated to crash the host.
- Tools have **no** network/filesystem/shell access; they operate only through
  the same permission-gated context.

---

## 7. Events

The host emits a small, typed set of public events:

```ts
type AnoriEventMap = {
  "bookmark.created":   { bookmark: Bookmark };
  "bookmark.updated":   { bookmark: Partial<Bookmark> & { instanceId: string; folderId: string } };
  "bookmark.deleted":   { instanceId: string; folderId: string };
  "group.created":      { group: BookmarkGroup };
  "group.updated":      { group: Partial<BookmarkGroup> & { instanceId: string; folderId: string } };
  "group.deleted":      { instanceId: string; folderId: string };
  "workspace.changed":  { folderId: string };
  "command.executed":   { commandId: string };
};
```

Subscribe with `ctx.events.on(...)` (requires `events.read`):

```ts
const off = ctx.events.on("bookmark.created", ({ bookmark }) => {
  ctx.logger.info(`New bookmark: ${bookmark.title}`);
});
off.dispose(); // when done
```

Events are **synchronous** (a listener may be async; rejections are logged and
do not affect other listeners). Listener errors are **isolated**: one throwing
listener never blocks the others or the mutation that emitted the event. Events
are canonical and emitted from the shared `BookmarkToolService`, so changes made
by the UI, AI tools, MCP, and extensions all produce the same events.

---

## 8. Lifecycle

```ts
export default defineExtension({
  manifest: { ... },
  activate(ctx) {
    // Register commands/tools/events here. Store disposables if needed.
  },
  deactivate() {
    // Optional. Tear down anything not auto-disposed.
  },
});
```

- `activate` may be async.
- If `activate` throws, the extension is **not** registered and an
  `ExtensionActivationError` is raised to the loader; the rest of Anori keeps
  running.
- On unload, the host disposes every disposable the extension created (commands,
  tools, event listeners) and then calls `deactivate` (awaiting it if async).
  Errors during `deactivate` are logged and do not prevent unload.
- Loading the same extension id twice is rejected.

### Loading extensions programmatically

In the host app, extensions are passed to the runtime at startup:

```ts
import { startExtensionRuntime } from "@anori/sdk/app-runtime";
import myExtension from "./my-extension";

await startExtensionRuntime([myExtension], () => currentFolderId);
```

`startExtensionRuntime` is idempotent (safe across React StrictMode double
mounts).

---

## 9. Security and isolation model

- **Default-deny permissions:** every capability requires a declared permission;
  missing permissions throw `PermissionError`.
- **No ambient power:** the context does not expose `window`, `document`, React,
  storage internals, `fetch`, `eval`, child processes, or other plugins' data.
- **Destructive confirmation:** `bookmarks.delete` / `deleteGroup` are two-step.
  The first call returns
  `{ success: false, confirmation: { token, expiresAt } }`. Repeat the exact
  same call with `confirmationToken` within 60 seconds; tokens are single-use
  and bound to the exact target (a token for one bookmark cannot delete
  another).
- **Bulk limits:** any bulk operation is capped at 50 items by the underlying
  service.
- **URL safety:** bookmark URLs must be `http(s)`; other schemes (e.g.
  `javascript:`) are rejected. Text is sanitized of control characters.
- **Structured errors:** failures carry codes such as `INVALID_INPUT`,
  `NOT_FOUND`, `PERMISSION_DENIED`, `CONFIRMATION_REQUIRED`, `CONFLICT`,
  `BULK_LIMIT`, and `INTERNAL_ERROR` — never free-form strings to act on.
- **Error isolation:** activation, command execution, tool execution, and event
  listeners are all wrapped so a misbehaving extension cannot crash Anori or
  other extensions.
- **Prompt-injection safety:** bookmark titles/URLs are stored and returned
  verbatim as data, never interpreted as instructions.

---

## 10. What's intentionally not supported (Phase 11 scope)

To keep the platform safe and focused, Phase 11 does **not** implement:

- a marketplace / extension directory;
- remote loading or downloading of extensions;
- auto-updates;
- a permissions UI / consent prompts (permissions are declared in-manifest and
  enforced by the host; a future phase may add a user-facing consent screen);
- custom UI surfaces/widgets inside the new-tab dashboard (extensions currently
  contribute commands and tools, not React widgets);
- network/filesystem/shell tools;
- cross-extension messaging.

These are explicit non-goals for this phase.

---

## 11. Testing

The SDK ships with a full unit-test suite under `src/sdk/__tests__/` covering
manifest validation, lifecycle, permission gating, command/tool isolation,
event delivery, and the destructive confirmation flow. Run them with the rest of
the project:

```bash
pnpm test
pnpm typecheck
```
