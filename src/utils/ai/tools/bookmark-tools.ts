import { BookmarkToolService } from "@anori/utils/bookmark-service/bookmark-service";
import { createExtensionFolderStore, extensionLocatePosition } from "@anori/utils/bookmark-service/extension-store";
import { z } from "zod";
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../types";

let servicePromise: Promise<BookmarkToolService> | null = null;

function getService(): Promise<BookmarkToolService> {
  if (!servicePromise) {
    servicePromise = createExtensionFolderStore().then(
      (store) =>
        new BookmarkToolService(store, {
          createId: () => crypto.randomUUID(),
          locatePosition: extensionLocatePosition,
        }),
    );
  }
  return servicePromise;
}

const ok = (content: unknown): ToolResult => ({ ok: true, content });
const fail = (message: string): ToolResult => ({ ok: false, content: null, error: message });

function toToolResult<T>(r: { ok: true; data: T } | { ok: false; error: { message: string } }): ToolResult {
  return r.ok ? ok(r.data) : fail(r.error.message);
}

const listBookmarksTool: ToolDefinition = {
  name: "list_bookmarks",
  description: "List all bookmarks in the current workspace folder. Returns id, title, url, and position for each.",
  permission: "read",
  inputSchema: z.object({}).strict(),
  execute: (async (_input: unknown, ctx: ToolExecutionContext) => {
    const service = await getService();
    return toToolResult(await service.listBookmarks({ folderId: ctx.folderId }));
  }) as ToolDefinition["execute"],
};

const searchBookmarksTool: ToolDefinition = {
  name: "search_bookmarks",
  description: "Search bookmarks and groups by a case-insensitive query matched against title and URL. Read-only.",
  permission: "read",
  inputSchema: z.object({
    query: z.string().min(1).describe("Search text matched against bookmark titles and URLs."),
  }),
  execute: (async (input: unknown, ctx: ToolExecutionContext) => {
    const { query } = input as { query: string };
    const service = await getService();
    return toToolResult(await service.searchBookmarks({ query, folderId: ctx.folderId }));
  }) as ToolDefinition["execute"],
};

const getWorkspaceTool: ToolDefinition = {
  name: "get_workspace",
  description:
    "Get the current workspace folder, including its id, name, and the list of all folders available. Read-only.",
  permission: "read",
  inputSchema: z.object({}).strict(),
  execute: (async (_input: unknown, ctx: ToolExecutionContext) => {
    const service = await getService();
    return toToolResult(await service.getWorkspace({ folderId: ctx.folderId }));
  }) as ToolDefinition["execute"],
};

const createBookmarkTool: ToolDefinition = {
  name: "create_bookmark",
  description: "Create a new bookmark in the current workspace folder.",
  permission: "write",
  inputSchema: z
    .object({
      url: z.string().url().describe("Full URL of the bookmark, including https://."),
      title: z.string().optional().describe("Display title. Defaults to the URL when omitted."),
    })
    .strict(),
  execute: (async (input: unknown, ctx: ToolExecutionContext) => {
    const { url, title } = input as { url: string; title?: string };
    const service = await getService();
    return toToolResult(await service.createBookmark({ url, title, folderId: ctx.folderId }));
  }) as ToolDefinition["execute"],
};

const updateBookmarkTool: ToolDefinition = {
  name: "update_bookmark",
  description: "Update the title or URL of an existing bookmark.",
  permission: "write",
  inputSchema: z
    .object({
      instanceId: z.string().describe("The id of the bookmark to update."),
      title: z.string().optional().describe("New display title."),
      url: z.string().url().optional().describe("New URL."),
    })
    .strict(),
  execute: (async (input: unknown, ctx: ToolExecutionContext) => {
    const { instanceId, title, url } = input as { instanceId: string; title?: string; url?: string };
    const service = await getService();
    return toToolResult(await service.updateBookmark({ instanceId, title, url, folderId: ctx.folderId }));
  }) as ToolDefinition["execute"],
};

const deleteBookmarkTool: ToolDefinition = {
  name: "delete_bookmark",
  description: "Permanently delete a bookmark from the current workspace folder. Destructive.",
  permission: "destructive",
  inputSchema: z
    .object({
      instanceId: z.string().describe("The id of the bookmark to delete."),
    })
    .strict(),
  execute: (async (input: unknown, ctx: ToolExecutionContext) => {
    const { instanceId } = input as { instanceId: string };
    const service = await getService();
    return toToolResult(await service.deleteBookmark({ instanceId, folderId: ctx.folderId }));
  }) as ToolDefinition["execute"],
};

const createGroupTool: ToolDefinition = {
  name: "create_group",
  description: "Create a bookmark group that bundles multiple URLs under one widget.",
  permission: "write",
  inputSchema: z
    .object({
      title: z.string().describe("Name of the group."),
      urls: z.array(z.string().url()).optional().describe("URLs to include in the group."),
    })
    .strict(),
  execute: (async (input: unknown, ctx: ToolExecutionContext) => {
    const { title, urls } = input as { title: string; urls?: string[] };
    const service = await getService();
    return toToolResult(await service.createGroup({ title, urls, folderId: ctx.folderId }));
  }) as ToolDefinition["execute"],
};

const addToGroupTool: ToolDefinition = {
  name: "add_to_group",
  description: "Add one or more URLs to an existing bookmark group.",
  permission: "write",
  inputSchema: z
    .object({
      groupInstanceId: z.string().describe("The id of the group to add URLs to."),
      urls: z.array(z.string().url()).min(1).describe("URLs to add."),
    })
    .strict(),
  execute: (async (input: unknown, ctx: ToolExecutionContext) => {
    const { groupInstanceId, urls } = input as { groupInstanceId: string; urls: string[] };
    const service = await getService();
    return toToolResult(await service.addToGroup({ groupInstanceId, urls, folderId: ctx.folderId }));
  }) as ToolDefinition["execute"],
};

const deleteGroupTool: ToolDefinition = {
  name: "delete_group",
  description: "Permanently delete a bookmark group and all its URLs. Destructive.",
  permission: "destructive",
  inputSchema: z
    .object({
      groupInstanceId: z.string().describe("The id of the group to delete."),
    })
    .strict(),
  execute: (async (input: unknown, ctx: ToolExecutionContext) => {
    const { groupInstanceId } = input as { groupInstanceId: string };
    const service = await getService();
    return toToolResult(await service.deleteGroup({ groupInstanceId, folderId: ctx.folderId }));
  }) as ToolDefinition["execute"],
};

export function registerBookmarkTools(registry: { register: (t: ToolDefinition) => () => void }): () => void {
  const unregisters = [
    registry.register(listBookmarksTool),
    registry.register(searchBookmarksTool),
    registry.register(getWorkspaceTool),
    registry.register(createBookmarkTool),
    registry.register(updateBookmarkTool),
    registry.register(deleteBookmarkTool),
    registry.register(createGroupTool),
    registry.register(addToGroupTool),
    registry.register(deleteGroupTool),
  ];
  return () => {
    unregisters.forEach((u) => {
      u();
    });
  };
}

export const READ_TOOL_NAMES = [listBookmarksTool.name, searchBookmarksTool.name, getWorkspaceTool.name];
