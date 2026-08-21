import type { ExtensionContext, SdkTool } from "@anori/sdk";
import { z } from "zod";

const inputSchema = z.object({
  title: z.string().min(1).max(200).describe("Display title for the new bookmark."),
  url: z.string().min(1).describe("Full http(s) URL of the bookmark."),
  folderId: z.string().optional().describe("Optional folder id; defaults to the active folder."),
});

type Input = z.infer<typeof inputSchema>;

export function registerCreateBookmarkTool(ctx: ExtensionContext): SdkTool<Input> {
  const tool: SdkTool<Input> = {
    name: "dev_create_bookmark",
    description: "Create a new development bookmark via the Anori Bookmark API (does not write to storage directly).",
    permission: "write",
    inputSchema,
    execute: async (input) => {
      const result = await ctx.bookmarks.create({
        title: input.title,
        url: input.url,
        folderId: input.folderId,
      });
      return {
        ok: true,
        content: {
          created: true,
          bookmarkId: result.bookmarkId,
          title: input.title,
          url: input.url,
        },
      };
    },
  };
  ctx.tools.register(tool as SdkTool);
  return tool;
}
