import { defineExtension } from "@anori/sdk";
import { z } from "zod";

export const exampleExtension = defineExtension({
  manifest: {
    id: "anori-example",
    name: "Example Extension",
    version: "1.0.0",
    description: "A minimal Anori extension demonstrating commands, tools, and events.",
    permissions: ["commands.register", "tools.register", "bookmarks.read", "events.read", "workspace.read"],
  },
  activate(ctx) {
    ctx.logger.info("Example extension activated.");

    ctx.commands.register({
      id: "example.hello",
      title: "Example: Hello",
      description: "Log a hello from the example extension.",
      keywords: ["example", "hello", "demo"],
      execute: () => {
        ctx.logger.info("Hello from the example extension!");
        return { success: true };
      },
    });

    ctx.tools.register({
      name: "example_search",
      description: "Search the current workspace for bookmarks and groups by a text query.",
      permission: "read",
      inputSchema: z.object({ query: z.string().min(1).describe("Text to match against titles and URLs.") }),
      execute: async (rawInput) => {
        const input = rawInput as { query: string };
        const results = await ctx.bookmarks.search(input.query);
        return {
          ok: true,
          content: {
            query: input.query,
            bookmarkCount: results.bookmarks.length,
            groupCount: results.groups.length,
            bookmarks: results.bookmarks.map((b) => ({ title: b.title, url: b.url })),
          },
        };
      },
    });

    ctx.events.on("bookmark.created", (payload) => {
      ctx.logger.info(`Observed bookmark created: ${payload.bookmark.title}`);
    });
  },
});
