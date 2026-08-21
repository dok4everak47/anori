import { z } from "zod";
import type { BookmarkToolService } from "./bookmark-service";
import { MAX_BULK_ITEMS } from "./bookmark-service";

export type McpToolPermission = "read" | "write" | "destructive";

export type McpToolContext = {
  service: BookmarkToolService;
  confirmationToken?: string;
};

export type McpToolResult =
  | { ok: true; content: unknown }
  | {
      ok: false;
      errorCode: string;
      message: string;
      confirmation?: { token: string; expiresAt: number; details: unknown };
    };

export type McpToolDefinition = {
  name: string;
  description: string;
  permission: McpToolPermission;
  requiresConfirmation: boolean;
  inputSchema: z.ZodType;
  run: (input: unknown, ctx: McpToolContext) => Promise<McpToolResult>;
};

const folderIdField = z
  .string()
  .optional()
  .describe("Optional folder id. Defaults to the active (home) folder when omitted.");

const urlField = z.string().describe("Full http(s) URL.");

export function buildBookmarkMcpTools(): McpToolDefinition[] {
  return [
    {
      name: "get_workspace",
      description:
        "Get the active folder id and name, plus the list of all folders. Use this first to discover valid folder ids. Read-only.",
      permission: "read",
      requiresConfirmation: false,
      inputSchema: z.object({ folderId: folderIdField }).strict(),
      run: async (input, { service }) => {
        const r = await service.getWorkspace(input as { folderId?: string });
        return r.ok ? { ok: true, content: r.data } : fail(r.error.code, r.error.message);
      },
    },
    {
      name: "list_bookmarks",
      description:
        "List every bookmark and group in a folder as structured data (id, title, url, position). Read-only.",
      permission: "read",
      requiresConfirmation: false,
      inputSchema: z.object({ folderId: folderIdField }).strict(),
      run: async (input, { service }) => {
        const r = await service.listBookmarks(input as { folderId?: string });
        return r.ok ? { ok: true, content: r.data } : fail(r.error.code, r.error.message);
      },
    },
    {
      name: "list_groups",
      description: "List all bookmark groups in a folder (id, title, urls). Read-only.",
      permission: "read",
      requiresConfirmation: false,
      inputSchema: z.object({ folderId: folderIdField }).strict(),
      run: async (input, { service }) => {
        const r = await service.listGroups(input as { folderId?: string });
        return r.ok ? { ok: true, content: r.data } : fail(r.error.code, r.error.message);
      },
    },
    {
      name: "search_bookmarks",
      description:
        "Search bookmarks and groups by a case-insensitive query matched against title and URL. Returns structured matches. Read-only.",
      permission: "read",
      requiresConfirmation: false,
      inputSchema: z
        .object({
          query: z.string().min(1).describe("Text to match against bookmark titles and URLs."),
          folderId: folderIdField,
        })
        .strict(),
      run: async (input, { service }) => {
        const r = await service.searchBookmarks(input as { query: string; folderId?: string });
        return r.ok ? { ok: true, content: r.data } : fail(r.error.code, r.error.message);
      },
    },
    {
      name: "get_bookmark",
      description: "Get a single bookmark or group by its instance id. Returns its structured fields. Read-only.",
      permission: "read",
      requiresConfirmation: false,
      inputSchema: z
        .object({
          instanceId: z.string().describe("The instance id of the bookmark or group."),
          folderId: folderIdField,
        })
        .strict(),
      run: async (input, { service }) => {
        const r = await service.getBookmark(input as { instanceId: string; folderId?: string });
        return r.ok ? { ok: true, content: r.data } : fail(r.error.code, r.error.message);
      },
    },
    {
      name: "create_bookmark",
      description: "Create a single bookmark in a folder. Returns { success, bookmarkId, title, url }. Write.",
      permission: "write",
      requiresConfirmation: false,
      inputSchema: z
        .object({
          url: urlField,
          title: z.string().max(200).optional().describe("Display title. Defaults to the URL when omitted."),
          folderId: folderIdField,
        })
        .strict(),
      run: async (input, { service }) => {
        const r = await service.createBookmark(input as { url: string; title?: string; folderId?: string });
        return r.ok ? { ok: true, content: { success: true, ...r.data } } : fail(r.error.code, r.error.message);
      },
    },
    {
      name: "update_bookmark",
      description: "Update the title and/or URL of an existing bookmark. Returns { success, bookmarkId }. Write.",
      permission: "write",
      requiresConfirmation: false,
      inputSchema: z
        .object({
          instanceId: z.string().describe("The id of the bookmark to update."),
          title: z.string().max(200).optional().describe("New display title."),
          url: urlField.optional().describe("New http(s) URL."),
          folderId: folderIdField,
        })
        .strict()
        .refine((v) => v.title !== undefined || v.url !== undefined, {
          message: "Provide at least one of title or url.",
        }),
      run: async (input, { service }) => {
        const r = await service.updateBookmark(
          input as { instanceId: string; title?: string; url?: string; folderId?: string },
        );
        return r.ok ? { ok: true, content: { success: true, ...r.data } } : fail(r.error.code, r.error.message);
      },
    },
    {
      name: "move_bookmark",
      description: "Move a bookmark from one folder to another. Returns { success, bookmarkId, folderId }. Write.",
      permission: "write",
      requiresConfirmation: false,
      inputSchema: z
        .object({
          instanceId: z.string().describe("The id of the bookmark to move."),
          toFolderId: z.string().describe("Destination folder id."),
          fromFolderId: folderIdField,
        })
        .strict(),
      run: async (input, { service }) => {
        const r = await service.moveBookmark(
          input as { instanceId: string; toFolderId: string; fromFolderId?: string },
        );
        return r.ok ? { ok: true, content: { success: true, ...r.data } } : fail(r.error.code, r.error.message);
      },
    },
    {
      name: "create_group",
      description:
        "Create a bookmark group bundling multiple URLs under one widget. Returns { success, groupId, title, urlCount }. Write.",
      permission: "write",
      requiresConfirmation: false,
      inputSchema: z
        .object({
          title: z.string().min(1).max(200).describe("Name of the group."),
          urls: z.array(urlField).max(MAX_BULK_ITEMS).optional().describe("URLs to include in the group."),
          folderId: folderIdField,
        })
        .strict(),
      run: async (input, { service }) => {
        const r = await service.createGroup(input as { title: string; urls?: string[]; folderId?: string });
        return r.ok ? { ok: true, content: { success: true, ...r.data } } : fail(r.error.code, r.error.message);
      },
    },
    {
      name: "add_to_group",
      description:
        "Add one or more URLs to an existing group. Returns { success, groupId, totalUrls, addedCount }. Write.",
      permission: "write",
      requiresConfirmation: false,
      inputSchema: z
        .object({
          groupInstanceId: z.string().describe("The id of the group."),
          urls: z.array(urlField).min(1).max(MAX_BULK_ITEMS).describe("URLs to add."),
          folderId: folderIdField,
        })
        .strict(),
      run: async (input, { service }) => {
        const r = await service.addToGroup(input as { groupInstanceId: string; urls: string[]; folderId?: string });
        return r.ok ? { ok: true, content: { success: true, ...r.data } } : fail(r.error.code, r.error.message);
      },
    },
    {
      name: "delete_bookmark",
      description:
        "Permanently delete a single bookmark. Destructive and irreversible. Requires a confirmation token: the first call returns CONFIRMATION_REQUIRED with a token, repeat the call with confirmationToken to proceed.",
      permission: "destructive",
      requiresConfirmation: true,
      inputSchema: z
        .object({
          instanceId: z.string().describe("The id of the bookmark to delete."),
          folderId: folderIdField,
          confirmationToken: z
            .string()
            .optional()
            .describe("Token from a previous CONFIRMATION_REQUIRED response for this exact action."),
        })
        .strict(),
      run: async (input, { service, confirmationToken }) => {
        const args = input as { instanceId: string; folderId?: string; confirmationToken?: string };
        const token = args.confirmationToken ?? confirmationToken;
        const target = canonicalTarget("delete_bookmark", { instanceId: args.instanceId, folderId: args.folderId });
        if (!token)
          return confirmationRequired("delete_bookmark", { instanceId: args.instanceId, folderId: args.folderId });
        if (!isValidToken(token, "delete_bookmark", target))
          return fail("PERMISSION_DENIED", "Invalid or mismatched confirmation token.");
        const r = await service.deleteBookmark(args);
        return r.ok ? { ok: true, content: { success: true, ...r.data } } : fail(r.error.code, r.error.message);
      },
    },
    {
      name: "bulk_delete_bookmarks",
      description: `Permanently delete up to ${MAX_BULK_ITEMS} bookmarks at once. Destructive and irreversible. Requires a confirmation token from a prior CONFIRMATION_REQUIRED response. Returns { success, deletedIds, notFoundIds }.`,
      permission: "destructive",
      requiresConfirmation: true,
      inputSchema: z
        .object({
          instanceIds: z.array(z.string()).min(1).max(MAX_BULK_ITEMS).describe("Ids of bookmarks to delete."),
          folderId: folderIdField,
          confirmationToken: z.string().optional().describe("Confirmation token for this exact batch."),
        })
        .strict(),
      run: async (input, { service, confirmationToken }) => {
        const args = input as { instanceIds: string[]; folderId?: string; confirmationToken?: string };
        const token = args.confirmationToken ?? confirmationToken;
        const target = canonicalTarget("bulk_delete_bookmarks", {
          instanceIds: args.instanceIds,
          folderId: args.folderId,
        });
        if (!token)
          return confirmationRequired("bulk_delete_bookmarks", {
            instanceIds: args.instanceIds,
            folderId: args.folderId,
          });
        if (!isValidToken(token, "bulk_delete_bookmarks", target)) {
          return fail("PERMISSION_DENIED", "Invalid or mismatched confirmation token.");
        }
        const r = await service.bulkDeleteBookmarks(args);
        return r.ok ? { ok: true, content: { success: true, ...r.data } } : fail(r.error.code, r.error.message);
      },
    },
    {
      name: "delete_group",
      description:
        "Permanently delete a group and all its URLs. Destructive and irreversible. Requires a confirmation token from a prior CONFIRMATION_REQUIRED response.",
      permission: "destructive",
      requiresConfirmation: true,
      inputSchema: z
        .object({
          groupInstanceId: z.string().describe("The id of the group to delete."),
          folderId: folderIdField,
          confirmationToken: z.string().optional().describe("Confirmation token for this exact action."),
        })
        .strict(),
      run: async (input, { service, confirmationToken }) => {
        const args = input as { groupInstanceId: string; folderId?: string; confirmationToken?: string };
        const token = args.confirmationToken ?? confirmationToken;
        const target = canonicalTarget("delete_group", {
          groupInstanceId: args.groupInstanceId,
          folderId: args.folderId,
        });
        if (!token)
          return confirmationRequired("delete_group", {
            groupInstanceId: args.groupInstanceId,
            folderId: args.folderId,
          });
        if (!isValidToken(token, "delete_group", target))
          return fail("PERMISSION_DENIED", "Invalid or mismatched confirmation token.");
        const r = await service.deleteGroup(args);
        return r.ok ? { ok: true, content: { success: true, ...r.data } } : fail(r.error.code, r.error.message);
      },
    },
  ];
}

function fail(errorCode: string, message: string): McpToolResult {
  return { ok: false, errorCode, message };
}

const CONFIRMATION_TTL_MS = 60_000;
const pendingConfirmations = new Map<string, { tool: string; target: string; expiresAt: number }>();

function confirmationRequired(tool: string, details: Record<string, unknown>): McpToolResult {
  const target = canonicalTarget(tool, details);
  const token = `confirm_${randomHex(16)}`;
  const expiresAt = Date.now() + CONFIRMATION_TTL_MS;
  pendingConfirmations.set(token, { tool, target, expiresAt });
  setTimeout(() => pendingConfirmations.delete(token), CONFIRMATION_TTL_MS + 1000);
  return {
    ok: false,
    errorCode: "CONFIRMATION_REQUIRED",
    message: `Destructive action requires confirmation. Repeat the call with confirmationToken="${token}" within ${CONFIRMATION_TTL_MS / 1000}s.`,
    confirmation: { token, expiresAt, details: { tool, ...details } },
  };
}

function isValidToken(token: string, tool: string, target: string): boolean {
  const entry = pendingConfirmations.get(token);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) {
    pendingConfirmations.delete(token);
    return false;
  }
  const valid = entry.tool === tool && entry.target === target;
  if (valid) pendingConfirmations.delete(token);
  return valid;
}

function canonicalTarget(tool: string, details: Record<string, unknown>): string {
  if (tool === "bulk_delete_bookmarks" && Array.isArray(details.instanceIds)) {
    return JSON.stringify({ ...details, instanceIds: Array.from(new Set(details.instanceIds as string[])).sort() });
  }
  return JSON.stringify(details);
}

function randomHex(bytes: number): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).slice(2).repeat(bytes);
}
