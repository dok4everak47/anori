import type { ExtensionContext, SdkCommand } from "@anori/sdk";
import { scoreMatch } from "../utils/match";

const GITHUB_QUERY = "github";

export function registerSearchGitHubCommand(ctx: ExtensionContext): SdkCommand {
  const command: SdkCommand = {
    id: "dev.search-github",
    title: "Developer: Search GitHub Bookmarks",
    description: "Search all bookmarks for GitHub links using the Anori Bookmark API.",
    keywords: ["developer", "github", "search", "bookmarks"],
    execute: async () => {
      const result = await ctx.bookmarks.search(GITHUB_QUERY);
      const bookmarkMatches = result.bookmarks
        .filter((b) => scoreMatch({ title: b.title, url: b.url }, GITHUB_QUERY) > 0)
        .map((b) => ({ title: b.title, url: b.url, folderId: b.folderId }));
      const groupMatches = result.groups
        .filter((g) => scoreMatch({ title: g.title }, GITHUB_QUERY) > 0)
        .map((g) => ({ title: g.title, folderId: g.folderId, urlCount: g.urls.length }));

      ctx.logger.info(
        `Developer: found ${bookmarkMatches.length} GitHub bookmark(s) and ${groupMatches.length} matching group(s).`,
      );

      return { success: true };
    },
  };
  ctx.commands.register(command);
  return command;
}
