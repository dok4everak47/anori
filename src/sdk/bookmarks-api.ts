import type { BookmarkToolService } from "@anori/utils/bookmark-service/bookmark-service";
import { ConfirmationManager } from "./confirmation";
import { requirePermission } from "./permissions";
import type {
  Bookmark,
  BookmarkGroup,
  BookmarkSearchResult,
  ExtensionManifest,
  WorkspaceFolder,
  WorkspaceSnapshot,
} from "./types";

type DeleteTarget = { kind: "bookmark" | "group"; instanceId: string; folderId?: string };

export function createBookmarksApi(
  manifest: ExtensionManifest,
  service: BookmarkToolService,
): {
  workspace: ExtensionContext_workspace;
  bookmarks: ExtensionContext_bookmarks;
} {
  const confirmations = new ConfirmationManager<DeleteTarget>();

  const workspace: ExtensionContext_workspace = {
    async current() {
      requirePermission(manifest, "workspace.read");
      const r = await service.getWorkspace();
      if (!r.ok) throw new Error(r.error.message);
      return r.data;
    },
    async list() {
      requirePermission(manifest, "workspace.read");
      const snapshot = await service.getWorkspace();
      if (!snapshot.ok) throw new Error(snapshot.error.message);
      return snapshot.data.folders;
    },
    async get(folderId: string) {
      requirePermission(manifest, "workspace.read");
      const folders = (await workspace.list()) as WorkspaceFolder[];
      return folders.find((f) => f.id === folderId);
    },
  };

  const bookmarks: ExtensionContext_bookmarks = {
    async search(query: string, folderId?: string): Promise<BookmarkSearchResult> {
      requirePermission(manifest, "bookmarks.read");
      const r = await service.searchBookmarks({ query, folderId });
      if (!r.ok) throw new Error(r.error.message);
      return r.data;
    },

    async get(instanceId: string, folderId?: string): Promise<Bookmark | BookmarkGroup | undefined> {
      requirePermission(manifest, "bookmarks.read");
      const r = await service.getBookmark({ instanceId, folderId });
      if (!r.ok) {
        if (r.error.code === "NOT_FOUND") return undefined;
        throw new Error(r.error.message);
      }
      if ("bookmark" in r.data) return r.data.bookmark as Bookmark;
      if ("group" in r.data) return r.data.group as BookmarkGroup;
      return undefined;
    },

    async create(input) {
      requirePermission(manifest, "bookmarks.write");
      const r = await service.createBookmark(input);
      if (!r.ok) throw new Error(r.error.message);
      return { bookmarkId: r.data.bookmarkId };
    },

    async update(input) {
      requirePermission(manifest, "bookmarks.write");
      const r = await service.updateBookmark(input);
      if (!r.ok) throw new Error(r.error.message);
      return { bookmarkId: r.data.bookmarkId };
    },

    async delete(input) {
      requirePermission(manifest, "bookmarks.delete");
      const key = `delete:bookmark:${input.instanceId}:${input.folderId ?? ""}`;
      if (!input.confirmationToken) {
        const confirmation = confirmations.request(key, {
          kind: "bookmark",
          instanceId: input.instanceId,
          folderId: input.folderId,
        });
        return { success: false, error: "Destructive action requires confirmation.", confirmation };
      }
      const valid = confirmations.consume(input.confirmationToken, key);
      if (!valid || valid.instanceId !== input.instanceId) {
        return { success: false, error: "Invalid or mismatched confirmation token." };
      }
      const r = await service.deleteBookmark({ instanceId: input.instanceId, folderId: input.folderId });
      if (!r.ok) return { success: false, error: r.error.message };
      return { success: true, instanceId: input.instanceId };
    },

    async createGroup(input) {
      requirePermission(manifest, "bookmarks.write");
      const r = await service.createGroup(input);
      if (!r.ok) throw new Error(r.error.message);
      return { groupId: r.data.groupId };
    },

    async addToGroup(input) {
      requirePermission(manifest, "bookmarks.write");
      const r = await service.addToGroup(input);
      if (!r.ok) throw new Error(r.error.message);
      return { groupId: r.data.groupId, totalUrls: r.data.totalUrls, addedCount: r.data.addedCount };
    },

    async deleteGroup(input) {
      requirePermission(manifest, "bookmarks.delete");
      const key = `delete:group:${input.groupInstanceId}:${input.folderId ?? ""}`;
      if (!input.confirmationToken) {
        const confirmation = confirmations.request(key, {
          kind: "group",
          instanceId: input.groupInstanceId,
          folderId: input.folderId,
        });
        return { success: false, error: "Destructive action requires confirmation.", confirmation };
      }
      const valid = confirmations.consume(input.confirmationToken, key);
      if (!valid || valid.instanceId !== input.groupInstanceId) {
        return { success: false, error: "Invalid or mismatched confirmation token." };
      }
      const r = await service.deleteGroup({ groupInstanceId: input.groupInstanceId, folderId: input.folderId });
      if (!r.ok) return { success: false, error: r.error.message };
      return { success: true, groupInstanceId: input.groupInstanceId };
    },
  };

  return { workspace, bookmarks };
}

type ExtensionContext_workspace = {
  current: () => Promise<WorkspaceSnapshot>;
  list: () => Promise<WorkspaceFolder[]>;
  get: (folderId: string) => Promise<WorkspaceFolder | undefined>;
};

type ExtensionContext_bookmarks = {
  search: (query: string, folderId?: string) => Promise<BookmarkSearchResult>;
  get: (instanceId: string, folderId?: string) => Promise<Bookmark | BookmarkGroup | undefined>;
  create: (input: { url: string; title?: string; folderId?: string }) => Promise<{ bookmarkId: string }>;
  update: (input: {
    instanceId: string;
    title?: string;
    url?: string;
    folderId?: string;
  }) => Promise<{ bookmarkId: string }>;
  delete: (input: {
    instanceId: string;
    folderId?: string;
    confirmationToken?: string;
  }) => Promise<
    | { success: true; instanceId: string }
    | { success: false; error: string; confirmation?: { token: string; expiresAt: number } }
  >;
  createGroup: (input: { title: string; urls?: string[]; folderId?: string }) => Promise<{ groupId: string }>;
  addToGroup: (input: {
    groupInstanceId: string;
    urls: string[];
    folderId?: string;
  }) => Promise<{ groupId: string; totalUrls: number; addedCount: number }>;
  deleteGroup: (input: {
    groupInstanceId: string;
    folderId?: string;
    confirmationToken?: string;
  }) => Promise<
    | { success: true; groupInstanceId: string }
    | { success: false; error: string; confirmation?: { token: string; expiresAt: number } }
  >;
};
