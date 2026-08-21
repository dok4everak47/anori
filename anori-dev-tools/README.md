# Anori Developer Tools (`anori-dev-tools`)

A **third-party Anori extension** built entirely against the public
[`@anori/sdk`](../docs/extensions/README.md). It demonstrates commands, tools,
permissions, and event subscriptions — without importing a single line of
Anori's internal source.

```
anori-dev-tools
       ↓
   @anori/sdk        ← only public API surface
       ↓
 Anori Public API
```

There are **no** `../../src/...` imports, no React access, no direct storage
access, and no internal-state access anywhere in this package.

---

## What it adds

### Commands (visible in ⌘K)

| ID                       | Title                                |
| ------------------------ | ------------------------------------ |
| `dev.open-github`        | Developer: Open GitHub               |
| `dev.search-github`      | Developer: Search GitHub Bookmarks   |
| `dev.current-workspace`  | Developer: Current Workspace         |

- **Open GitHub** asks the host to open `https://github.com`. The current
  public SDK does not expose a browser/tabs navigation API, so this command
  logs the request and returns a documented gap result (see **Known gaps**).
- **Search GitHub Bookmarks** uses `ctx.bookmarks.search("github")` and logs the
  matches.
- **Current Workspace** uses `ctx.workspace.current()` and logs the active
  folder name.

### Tools (usable by the AI agent / MCP)

| Name                     | Permission | Purpose                                            |
| ------------------------ | ---------- | -------------------------------------------------- |
| `dev_search_bookmarks`   | `read`     | Search dev bookmarks (GitHub, GitLab, Linear, Notion, VS Code, Terminal, Docker, …). |
| `dev_create_bookmark`    | `write`    | Create a bookmark via the Bookmark API (`title`, `url`). |

No destructive (`delete`) tool is registered — this phase validates read + write
only.

### Events

Subscribes to `bookmark.created` to demonstrate read-only event observation.

### Permissions declared

```json
["commands.register", "tools.register", "workspace.read", "bookmarks.read", "bookmarks.write", "events.read"]
```

Notably, `bookmarks.delete` is **not** requested (least privilege).

---

## Project layout

```text
anori-dev-tools/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── src/
│   ├── index.ts                 # defineExtension({ ... })
│   ├── commands/
│   │   ├── open-github.ts
│   │   ├── search-github.ts
│   │   └── current-workspace.ts
│   ├── tools/
│   │   ├── search-bookmarks.ts
│   │   └── create-bookmark.ts
│   └── utils/
│       ├── constants.ts
│       └── match.ts
└── tests/
    ├── mock-context.ts
    ├── extension.test.ts
    ├── commands.test.ts
    ├── tools.test.ts
    └── sdk-imports.test.ts
```

---

## Installing the SDK (developer setup)

`@anori/sdk` is not yet published to npm. While developing alongside this repo,
resolve it via a path mapping. The extension's `tsconfig.json` already does
this:

```jsonc
{
  "compilerOptions": {
    "paths": {
      "@anori/sdk": ["../src/sdk/index.ts"]
    }
  }
}
```

`vitest.config.ts` mirrors the same mapping for tests.

> **DX note:** A published package (e.g. `npm install @anori/sdk`) is not yet
> available. Once published, consumers would only need a normal dependency and
> could remove the path mappings. This is tracked as a known gap below.

The extension also uses [`zod`](https://zod.dev/) for tool input schemas, which
is a peer dependency of the SDK's tool types.

---

## Writing an extension

The entry point calls `defineExtension` and registers things inside
`activate(ctx)`:

```ts
import { defineExtension } from "@anori/sdk";
import { z } from "zod";

export default defineExtension({
  manifest: {
    id: "my-extension",
    name: "My Extension",
    version: "1.0.0",
    permissions: ["commands.register", "tools.register", "bookmarks.read"],
  },
  activate(ctx) {
    ctx.commands.register({
      id: "my.say-hello",
      title: "My: Say Hello",
      execute: () => {
        ctx.logger.info("Hello!");
        return { success: true };
      },
    });

    ctx.tools.register({
      name: "my_search",
      description: "Search bookmarks. Read-only.",
      permission: "read",
      inputSchema: z.object({ query: z.string() }),
      execute: async (input) => {
        const results = await ctx.bookmarks.search(input.query);
        return { ok: true, content: results };
      },
    });
  },
});
```

### Registering a command

`ctx.commands.register({ id, title, description?, keywords?, execute })` returns
a `Disposable`. The command automatically appears in the Command Palette —
extensions never touch palette UI.

### Registering a tool

`ctx.tools.register({ name, description, permission, inputSchema, execute })`.
`inputSchema` is a Zod schema; `permission` is `"read" | "write" |
"destructive"`. The host enforces the matching manifest permission.

### Reading/workspace data

- `ctx.workspace.current()` — active folder + all folders.
- `ctx.bookmarks.search(query, folderId?)` — structured bookmarks/groups.
- `ctx.bookmarks.create({ url, title?, folderId? })` — write.

All calls go through the permission-gated facade; there is no database handle.

---

## Testing

Tests use a hand-rolled mock `ExtensionContext` (see `tests/mock-context.ts`)
and import only `@anori/sdk` types — they never import Anori internals.

From this directory (using the repo's installed toolchain):

```bash
# typecheck
../node_modules/.bin/tsc --noEmit -p tsconfig.json

# tests
../node_modules/.bin/vitest run --config vitest.config.ts
```

Coverage:

- extension activation and manifest validity;
- command registration and execution (all 3 commands);
- tool registration and execution (read + write) and Zod validation;
- permission least-privilege assertions (no `bookmarks.delete`);
- a static check that the extension only imports `@anori/sdk`, `zod`, and
  relative modules;
- a static check that the public `@anori/sdk` entry graph contains no internal
  Anori aliases.

---

## Loading into Anori (current state)

> **Important:** Phase 12's charter is to validate the SDK without modifying
> Anori Core. The current host loads extensions that are passed to
> `startExtensionRuntime([...])` at startup — there is not yet a user-facing
> "install external extension" flow (no marketplace / remote loading /
> auto-update). See the Phase 12 report for the full integration-gap list.

To exercise this extension in a local build, a host build would add
`anoriDevTools` to the array passed to `startExtensionRuntime`. No change to the
extension itself is required.

---

## Known SDK gaps discovered during validation

These were found by building a real extension against `@anori/sdk`. **Core was
not modified** to work around them.

1. **No navigation/tabs API.** `ExtensionContext` cannot open a URL, so
   `dev.open-github` cannot truly open the browser. Needed: something like
   `ctx.shell.openExternal(url)` (a permissioned host capability).
2. **Command results carry no payload.** `SdkCommandResult` is
   `{ success: boolean; error?: string }` — commands can only signal
   success/failure, so richer results must go through `ctx.logger`. A `data?`
   field would improve DX.
3. **`SdkTool<TInput>` variance.** `ctx.tools.register` is typed as
   `(tool: SdkTool)` (= `SdkTool<unknown>`), which does not accept a typed
   `SdkTool<MyInput>` without an extension-side cast because `execute(input)`
   is parameter-contravariant. Recommended fix in the SDK: declare
   `register(tool: SdkTool<any>)` or use a bivariant-friendly signature.
4. **No disposer return from `activate`.** Extensions clean up via the optional
   `deactivate()` (the host also auto-disposes registrations). Returning a
   disposer from `activate` would be more ergonomic.
5. **SDK not published to npm.** Onboarding a brand-new consumer currently
   requires a path mapping; `npm install @anori/sdk` does not resolve yet.
6. **No external extension loader.** Extensions are loaded programmatically;
   there is no on-disk discovery or user-facing install UI yet.
