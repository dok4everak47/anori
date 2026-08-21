import type { ExtensionContext, SdkTool } from "@anori/sdk";
import { z } from "zod";
import { type Matchable, matchesDevelopmentTerms, scoreMatch } from "../utils/match";

const inputSchema = z.object({
  query: z.string().optional().describe("Optional case-insensitive text filter over title and URL."),
  folderId: z.string().optional().describe("Optional folder id; defaults to the active folder."),
});

type Input = z.infer<typeof inputSchema>;

export function registerSearchBookmarksTool(ctx: ExtensionContext): SdkTool<Input> {
  const tool: SdkTool<Input> = {
    name: "dev_search_bookmarks",
    description:
      "Search development-related bookmarks (GitHub, GitLab, Linear, Notion, VS Code, Terminal, Docker, etc.). Returns matching bookmarks and groups. Read-only.",
    permission: "read",
    inputSchema,
    execute: async (input) => {
      const query = input.query ?? "";
      const result = await ctx.bookmarks.search(query, input.folderId);

      const isRelevant = (item: Matchable): boolean => query.length > 0 || matchesDevelopmentTerms(item);

      const bookmarks = result.bookmarks
        .filter((b) => isRelevant({ title: b.title, url: b.url }))
        .map((b) => ({
          instanceId: b.instanceId,
          title: b.title,
          url: b.url,
          folderId: b.folderId,
          score: scoreMatch({ title: b.title, url: b.url }, query),
        }))
        .sort((a, b) => b.score - a.score);

      const groups = result.groups
        .filter((g) => isRelevant({ title: g.title }))
        .map((g) => ({
          instanceId: g.instanceId,
          title: g.title,
          folderId: g.folderId,
          urlCount: g.urls.length,
          score: scoreMatch({ title: g.title }, query),
        }))
        .sort((a, b) => b.score - a.score);

      return {
        ok: true,
        content: {
          query,
          counts: { bookmarks: bookmarks.length, groups: groups.length },
          bookmarks,
          groups,
        },
      };
    },
  };
  ctx.tools.register(tool as SdkTool);
  return tool;
}
