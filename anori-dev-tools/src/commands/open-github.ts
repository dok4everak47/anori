import type { ExtensionContext, SdkCommand } from "@anori/sdk";
import { GITHUB_URL } from "../utils/constants";

export function registerOpenGitHubCommand(ctx: ExtensionContext): SdkCommand {
  const command: SdkCommand = {
    id: "dev.open-github",
    title: "Developer: Open GitHub",
    description: "Open github.com in the browser.",
    keywords: ["developer", "github", "open", "browser"],
    execute: () => {
      ctx.logger.warn(
        `Developer: Open GitHub requested (${GITHUB_URL}), but the public Anori SDK does not expose a browser/tabs navigation API in this version.`,
      );
      return {
        success: false,
        error:
          "Navigation is not available in @anori/sdk yet. The host does not expose a browser/tabs.open API to extensions (SDK Gap).",
      };
    },
  };
  ctx.commands.register(command);
  return command;
}
