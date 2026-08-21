import { defineExtension } from "@anori/sdk";
import { registerCurrentWorkspaceCommand } from "./commands/current-workspace";
import { registerOpenGitHubCommand } from "./commands/open-github";
import { registerSearchGitHubCommand } from "./commands/search-github";
import { registerCreateBookmarkTool } from "./tools/create-bookmark";
import { registerSearchBookmarksTool } from "./tools/search-bookmarks";
import { EXTENSION_ID } from "./utils/constants";

export const anoriDevTools = defineExtension({
  manifest: {
    id: EXTENSION_ID,
    name: "Anori Developer Tools",
    version: "1.0.0",
    description: "Developer commands and tools for GitHub and development bookmarks.",
    permissions: [
      "commands.register",
      "tools.register",
      "workspace.read",
      "bookmarks.read",
      "bookmarks.write",
      "events.read",
    ],
  },
  activate(ctx) {
    ctx.logger.info("Activating Anori Developer Tools.");

    registerOpenGitHubCommand(ctx);
    registerSearchGitHubCommand(ctx);
    registerCurrentWorkspaceCommand(ctx);

    registerSearchBookmarksTool(ctx);
    registerCreateBookmarkTool(ctx);

    ctx.events.on("bookmark.created", (event) => {
      ctx.logger.info(`Developer tools observed a new bookmark: ${event.bookmark.title}`);
    });
  },
});
