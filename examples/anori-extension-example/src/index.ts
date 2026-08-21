import { type Disposable, defineExtension } from "@anori/sdk";
import { z } from "zod";

const disposables: Disposable[] = [];

export const exampleStarter = defineExtension({
  manifest: {
    id: "example-starter",
    name: "Example Starter",
    version: "1.0.0",
    description: "Demonstrates an Anori extension with a command, a read tool, and event listeners.",
    permissions: [
      "commands.register",
      "tools.register",
      "bookmarks.read",
      "bookmarks.write",
      "bookmarks.delete",
      "workspace.read",
      "events.read",
    ],
  },

  activate(ctx) {
    ctx.logger.info("Example starter activated.");

    disposables.push(
      ctx.commands.register({
        id: "starter.summarize-workspace",
        title: "Starter: Summarize Workspace",
        description: "Log how many bookmarks and groups are in the current folder.",
        keywords: ["example", "starter", "summary", "count"],
        execute: async () => {
          const workspace = await ctx.workspace.current();
          const results = await ctx.bookmarks.search("");
          ctx.logger.info(
            `${workspace.activeFolder.name}: ${results.bookmarks.length} bookmarks, ${results.groups.length} groups.`,
          );
          return { success: true };
        },
      }),
    );

    disposables.push(
      ctx.tools.register({
        name: "starter_count_bookmarks",
        description: "Count bookmarks matching an optional query in the active folder. Read-only.",
        permission: "read",
        inputSchema: z.object({
          query: z.string().optional().describe("Optional case-insensitive text filter."),
        }),
        execute: async (input) => {
          const results = await ctx.bookmarks.search(input.query ?? "");
          return {
            ok: true,
            content: {
              bookmarkCount: results.bookmarks.length,
              groupCount: results.groups.length,
            },
          };
        },
      }),
    );

    disposables.push(
      ctx.events.on("bookmark.created", (event) => {
        ctx.logger.info(`Bookmark added: ${event.bookmark.title}`);
      }),
      ctx.events.on("bookmark.deleted", (event) => {
        ctx.logger.info(`Bookmark removed: ${event.instanceId} (from ${event.folderId})`);
      }),
    );
  },

  deactivate() {
    for (const disposable of disposables) disposable.dispose();
    disposables.length = 0;
  },
});
