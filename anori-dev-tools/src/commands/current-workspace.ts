import type { ExtensionContext, SdkCommand } from "@anori/sdk";

export function registerCurrentWorkspaceCommand(ctx: ExtensionContext): SdkCommand {
  const command: SdkCommand = {
    id: "dev.current-workspace",
    title: "Developer: Current Workspace",
    description: "Show the name of the currently active folder/workspace.",
    keywords: ["developer", "workspace", "folder", "current"],
    execute: async () => {
      const snapshot = await ctx.workspace.current();
      ctx.logger.info(`Current workspace: ${snapshot.activeFolder.name}`);
      return { success: true };
    },
  };
  ctx.commands.register(command);
  return command;
}
