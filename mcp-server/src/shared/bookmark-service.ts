export type WidgetInFolderLike = {
  pluginId: string;
  widgetId: string;
  instanceId: string;
  configuration: Record<string, unknown>;
  width: number;
  height: number;
  x: number;
  y: number;
};

export type WidgetInFolderShape = WidgetInFolderLike;

export type BookmarkRecord = {
  instanceId: string;
  title: string;
  url: string;
  x: number;
  y: number;
  folderId: string;
};

export type GroupRecord = {
  instanceId: string;
  title: string;
  urls: string[];
  x: number;
  y: number;
  folderId: string;
};

export type FolderRecord = {
  id: string;
  name: string;
};

export type WorkspaceSnapshot = {
  activeFolder: { id: string; name: string };
  folders: FolderRecord[];
};

export type FolderStore = {
  getFolders: () => Promise<FolderRecord[]>;
  getWidgets: (folderId: string) => Promise<WidgetInFolderLike[]>;
  setWidgets: (folderId: string, widgets: WidgetInFolderLike[]) => Promise<void>;
};

export const BOOKMARK_PLUGIN_ID = "bookmark-plugin";
export const BOOKMARK_WIDGET_ID = "bookmark";
export const GROUP_WIDGET_ID = "bookmark-group";

export const DEFAULT_FOLDER_ID = "home";

export const MAX_BULK_ITEMS = 50;

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: { code: ToolErrorCode; message: string } };

export type ToolErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "CONFIRMATION_REQUIRED"
  | "CONFLICT"
  | "BULK_LIMIT"
  | "INTERNAL_ERROR";

export class ToolError extends Error {
  readonly code: ToolErrorCode;
  constructor(code: ToolErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ToolError";
  }
}

const cfg = (w: WidgetInFolderLike): Record<string, unknown> => w.configuration as Record<string, unknown>;

export function isBookmarkWidget(w: WidgetInFolderLike): boolean {
  return w.pluginId === BOOKMARK_PLUGIN_ID && w.widgetId === BOOKMARK_WIDGET_ID;
}

export function isGroupWidget(w: WidgetInFolderLike): boolean {
  return w.pluginId === BOOKMARK_PLUGIN_ID && w.widgetId === GROUP_WIDGET_ID;
}

export function toBookmarkRecord(w: WidgetInFolderLike, folderId: string): BookmarkRecord | null {
  if (!isBookmarkWidget(w)) return null;
  const c = cfg(w);
  if (typeof c.url !== "string") return null;
  return {
    instanceId: w.instanceId,
    title: typeof c.title === "string" ? c.title : c.url,
    url: c.url,
    x: w.x,
    y: w.y,
    folderId,
  };
}

export function toGroupRecord(w: WidgetInFolderLike, folderId: string): GroupRecord | null {
  if (!isGroupWidget(w)) return null;
  const c = cfg(w);
  return {
    instanceId: w.instanceId,
    title: typeof c.title === "string" ? c.title : "Group",
    urls: Array.isArray(c.urls) ? c.urls.filter((u): u is string => typeof u === "string") : [],
    x: w.x,
    y: w.y,
    folderId,
  };
}

function sanitizeText(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional stripping of control characters from untrusted input
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function safeUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function listAll(
  store: FolderStore,
  folderId: string,
): Promise<{ bookmarks: BookmarkRecord[]; groups: GroupRecord[] }> {
  const widgets = await store.getWidgets(folderId);
  return {
    bookmarks: widgets.map((w) => toBookmarkRecord(w, folderId)).filter((b): b is BookmarkRecord => b !== null),
    groups: widgets.map((w) => toGroupRecord(w, folderId)).filter((g): g is GroupRecord => g !== null),
  };
}

async function resolveFolder(store: FolderStore, folderId: string | undefined): Promise<string> {
  if (folderId && folderId !== DEFAULT_FOLDER_ID) {
    const folders = await store.getFolders();
    const exists = folders.some((f) => f.id === folderId);
    if (!exists) throw new ToolError("NOT_FOUND", `Folder "${folderId}" not found.`);
    return folderId;
  }
  return folderId ?? DEFAULT_FOLDER_ID;
}

type CreateId = () => string;
type LocatePosition = (widgets: WidgetInFolderLike[]) => { x: number; y: number };

export type BookmarkServiceEvent =
  | { type: "bookmark.created"; folderId: string; bookmark: BookmarkRecord }
  | {
      type: "bookmark.updated";
      folderId: string;
      bookmark: Pick<BookmarkRecord, "instanceId" | "folderId"> & Partial<BookmarkRecord>;
    }
  | { type: "bookmark.deleted"; folderId: string; instanceId: string }
  | { type: "group.created"; folderId: string; group: GroupRecord }
  | {
      type: "group.updated";
      folderId: string;
      group: Pick<GroupRecord, "instanceId" | "folderId"> & Partial<GroupRecord>;
    }
  | { type: "group.deleted"; folderId: string; instanceId: string };

export type BookmarkServiceEventListener = (event: BookmarkServiceEvent) => void;

export class BookmarkToolService {
  private readonly store: FolderStore;
  private readonly createId: CreateId;
  private readonly locate: LocatePosition;
  private readonly listeners: BookmarkServiceEventListener[] = [];

  constructor(
    store: FolderStore,
    options: { createId?: CreateId; locatePosition?: LocatePosition; onEvent?: BookmarkServiceEventListener } = {},
  ) {
    this.store = store;
    this.createId = options.createId ?? (() => cryptoRandomId());
    this.locate = options.locatePosition ?? defaultPosition;
    if (options.onEvent) this.listeners.push(options.onEvent);
  }

  private emit(event: BookmarkServiceEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        //
      }
    }
  }

  subscribe(listener: BookmarkServiceEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  async getWorkspace(input: { folderId?: string } = {}): Promise<ServiceResult<WorkspaceSnapshot>> {
    try {
      const folderId = await resolveFolder(this.store, input.folderId);
      const folders = await this.store.getFolders();
      const active = folders.find((f) => f.id === folderId);
      return {
        ok: true,
        data: {
          activeFolder: { id: folderId, name: active?.name ?? folderId },
          folders: folders.map((f) => ({ id: f.id, name: f.name })),
        },
      };
    } catch (e) {
      return errorResult(e);
    }
  }

  async listBookmarks(
    input: { folderId?: string } = {},
  ): Promise<ServiceResult<{ bookmarks: BookmarkRecord[]; groups: GroupRecord[] }>> {
    try {
      const folderId = await resolveFolder(this.store, input.folderId);
      return { ok: true, data: await listAll(this.store, folderId) };
    } catch (e) {
      return errorResult(e);
    }
  }

  async listGroups(input: { folderId?: string } = {}): Promise<ServiceResult<{ groups: GroupRecord[] }>> {
    try {
      const folderId = await resolveFolder(this.store, input.folderId);
      const { groups } = await listAll(this.store, folderId);
      return { ok: true, data: { groups } };
    } catch (e) {
      return errorResult(e);
    }
  }

  async searchBookmarks(input: {
    query: string;
    folderId?: string;
  }): Promise<ServiceResult<{ bookmarks: BookmarkRecord[]; groups: GroupRecord[] }>> {
    try {
      const folderId = await resolveFolder(this.store, input.folderId);
      const q = sanitizeText(input.query).toLowerCase();
      if (!q) throw new ToolError("INVALID_INPUT", "Query must not be empty.");
      const { bookmarks, groups } = await listAll(this.store, folderId);
      return {
        ok: true,
        data: {
          bookmarks: bookmarks.filter((b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)),
          groups: groups.filter(
            (g) => g.title.toLowerCase().includes(q) || g.urls.some((u) => u.toLowerCase().includes(q)),
          ),
        },
      };
    } catch (e) {
      return errorResult(e);
    }
  }

  async getBookmark(input: {
    instanceId: string;
    folderId?: string;
  }): Promise<ServiceResult<{ bookmark: BookmarkRecord } | { group: GroupRecord }>> {
    try {
      const folderId = await resolveFolder(this.store, input.folderId);
      const widgets = await this.store.getWidgets(folderId);
      const w = widgets.find((x) => x.instanceId === input.instanceId);
      if (!w) throw new ToolError("NOT_FOUND", `Bookmark or group "${input.instanceId}" not found.`);
      const bookmark = toBookmarkRecord(w, folderId);
      if (bookmark) return { ok: true, data: { bookmark } };
      const group = toGroupRecord(w, folderId);
      if (group) return { ok: true, data: { group } };
      throw new ToolError("NOT_FOUND", `Bookmark or group "${input.instanceId}" not found.`);
    } catch (e) {
      return errorResult(e);
    }
  }

  async createBookmark(input: {
    url: string;
    title?: string;
    folderId?: string;
  }): Promise<ServiceResult<{ bookmarkId: string; title: string; url: string }>> {
    try {
      const folderId = await resolveFolder(this.store, input.folderId);
      const url = safeUrl(input.url);
      if (!url) throw new ToolError("INVALID_INPUT", "url must be a valid http(s) URL.");
      const widgets = await this.store.getWidgets(folderId);
      const title = sanitizeText(input.title ?? "").slice(0, 200) || url;
      const widget: WidgetInFolderLike = {
        pluginId: BOOKMARK_PLUGIN_ID,
        widgetId: BOOKMARK_WIDGET_ID,
        instanceId: this.createId(),
        configuration: { url, title, icon: "default" },
        width: 1,
        height: 1,
        ...this.locate(widgets),
      };
      await this.store.setWidgets(folderId, [...widgets, widget]);
      const created = toBookmarkRecord(widget, folderId);
      if (created) this.emit({ type: "bookmark.created", folderId, bookmark: created });
      return { ok: true, data: { bookmarkId: widget.instanceId, title, url } };
    } catch (e) {
      return errorResult(e);
    }
  }

  async updateBookmark(input: {
    instanceId: string;
    title?: string;
    url?: string;
    folderId?: string;
  }): Promise<ServiceResult<{ bookmarkId: string }>> {
    try {
      const folderId = await resolveFolder(this.store, input.folderId);
      let url: string | null | undefined;
      if (input.url !== undefined) {
        url = safeUrl(input.url);
        if (!url) throw new ToolError("INVALID_INPUT", "url must be a valid http(s) URL.");
      }
      const widgets = await this.store.getWidgets(folderId);
      const widget = widgets.find((w) => w.instanceId === input.instanceId);
      if (!widget || !isBookmarkWidget(widget))
        throw new ToolError("NOT_FOUND", `Bookmark "${input.instanceId}" not found.`);
      const config = { ...cfg(widget) };
      if (input.title !== undefined) config.title = sanitizeText(input.title).slice(0, 200);
      if (url !== undefined) config.url = url;
      widget.configuration = config;
      await this.store.setWidgets(folderId, widgets);
      const updated = toBookmarkRecord(widget, folderId);
      if (updated)
        this.emit({
          type: "bookmark.updated",
          folderId,
          bookmark: { instanceId: updated.instanceId, folderId, title: updated.title, url: updated.url },
        });
      return { ok: true, data: { bookmarkId: input.instanceId } };
    } catch (e) {
      return errorResult(e);
    }
  }

  async moveBookmark(input: {
    instanceId: string;
    toFolderId: string;
    fromFolderId?: string;
  }): Promise<ServiceResult<{ bookmarkId: string; folderId: string }>> {
    try {
      const fromFolderId = await resolveFolder(this.store, input.fromFolderId);
      const toFolderId = await resolveFolder(this.store, input.toFolderId);
      if (fromFolderId === toFolderId)
        return { ok: true, data: { bookmarkId: input.instanceId, folderId: toFolderId } };

      const fromWidgets = await this.store.getWidgets(fromFolderId);
      const idx = fromWidgets.findIndex((w) => w.instanceId === input.instanceId);
      if (idx === -1)
        throw new ToolError("NOT_FOUND", `Bookmark "${input.instanceId}" not found in folder "${fromFolderId}".`);
      const [moved] = fromWidgets.splice(idx, 1);
      const toWidgets = await this.store.getWidgets(toFolderId);
      const pos = this.locate(toWidgets);
      const placed: WidgetInFolderLike = { ...moved, ...pos };
      await this.store.setWidgets(fromFolderId, fromWidgets);
      await this.store.setWidgets(toFolderId, [...toWidgets, placed]);
      const movedRecord = toBookmarkRecord(placed, toFolderId);
      if (movedRecord) this.emit({ type: "bookmark.created", folderId: toFolderId, bookmark: movedRecord });
      this.emit({ type: "bookmark.deleted", folderId: fromFolderId, instanceId: input.instanceId });
      return { ok: true, data: { bookmarkId: input.instanceId, folderId: toFolderId } };
    } catch (e) {
      return errorResult(e);
    }
  }

  async deleteBookmark(input: {
    instanceId: string;
    folderId?: string;
  }): Promise<ServiceResult<{ bookmarkId: string }>> {
    try {
      const folderId = await resolveFolder(this.store, input.folderId);
      const widgets = await this.store.getWidgets(folderId);
      const next = widgets.filter((w) => w.instanceId !== input.instanceId);
      if (next.length === widgets.length) throw new ToolError("NOT_FOUND", `Bookmark "${input.instanceId}" not found.`);
      await this.store.setWidgets(folderId, next);
      this.emit({ type: "bookmark.deleted", folderId, instanceId: input.instanceId });
      return { ok: true, data: { bookmarkId: input.instanceId } };
    } catch (e) {
      return errorResult(e);
    }
  }

  async bulkDeleteBookmarks(input: {
    instanceIds: string[];
    folderId?: string;
  }): Promise<ServiceResult<{ deletedIds: string[]; notFoundIds: string[] }>> {
    try {
      if (!Array.isArray(input.instanceIds)) throw new ToolError("INVALID_INPUT", "instanceIds must be an array.");
      const ids = Array.from(new Set(input.instanceIds));
      if (ids.length === 0) throw new ToolError("INVALID_INPUT", "instanceIds must not be empty.");
      if (ids.length > MAX_BULK_ITEMS)
        throw new ToolError("BULK_LIMIT", `Cannot delete more than ${MAX_BULK_ITEMS} items in one request.`);
      const folderId = await resolveFolder(this.store, input.folderId);
      const widgets = await this.store.getWidgets(folderId);
      const idSet = new Set(ids);
      const kept: WidgetInFolderLike[] = [];
      const deletedIds: string[] = [];
      for (const w of widgets) {
        if (idSet.has(w.instanceId)) deletedIds.push(w.instanceId);
        else kept.push(w);
      }
      const notFoundIds = ids.filter((id) => !deletedIds.includes(id));
      await this.store.setWidgets(folderId, kept);
      for (const id of deletedIds) this.emit({ type: "bookmark.deleted", folderId, instanceId: id });
      return { ok: true, data: { deletedIds, notFoundIds } };
    } catch (e) {
      return errorResult(e);
    }
  }

  async createGroup(input: {
    title: string;
    urls?: string[];
    folderId?: string;
  }): Promise<ServiceResult<{ groupId: string; title: string; urlCount: number }>> {
    try {
      const folderId = await resolveFolder(this.store, input.folderId);
      const title = sanitizeText(input.title).slice(0, 200);
      if (!title) throw new ToolError("INVALID_INPUT", "title is required.");
      const rawUrls = input.urls ?? [];
      if (rawUrls.length > MAX_BULK_ITEMS)
        throw new ToolError("BULK_LIMIT", `A group cannot contain more than ${MAX_BULK_ITEMS} URLs.`);
      const urls: string[] = [];
      for (const raw of rawUrls) {
        const u = safeUrl(raw);
        if (!u) throw new ToolError("INVALID_INPUT", `Invalid url "${raw}".`);
        urls.push(u);
      }
      const widgets = await this.store.getWidgets(folderId);
      const widget: WidgetInFolderLike = {
        pluginId: BOOKMARK_PLUGIN_ID,
        widgetId: GROUP_WIDGET_ID,
        instanceId: this.createId(),
        configuration: { title, icon: "default", openInTabGroup: false, urls },
        width: 1,
        height: 1,
        ...this.locate(widgets),
      };
      await this.store.setWidgets(folderId, [...widgets, widget]);
      const createdGroup = toGroupRecord(widget, folderId);
      if (createdGroup) this.emit({ type: "group.created", folderId, group: createdGroup });
      return { ok: true, data: { groupId: widget.instanceId, title, urlCount: urls.length } };
    } catch (e) {
      return errorResult(e);
    }
  }

  async addToGroup(input: {
    groupInstanceId: string;
    urls: string[];
    folderId?: string;
  }): Promise<ServiceResult<{ groupId: string; totalUrls: number; addedCount: number }>> {
    try {
      const folderId = await resolveFolder(this.store, input.folderId);
      if (!Array.isArray(input.urls) || input.urls.length === 0)
        throw new ToolError("INVALID_INPUT", "urls must be a non-empty array.");
      if (input.urls.length > MAX_BULK_ITEMS)
        throw new ToolError("BULK_LIMIT", `Cannot add more than ${MAX_BULK_ITEMS} URLs at once.`);
      const widgets = await this.store.getWidgets(folderId);
      const widget = widgets.find((w) => w.instanceId === input.groupInstanceId);
      if (!widget || !isGroupWidget(widget))
        throw new ToolError("NOT_FOUND", `Group "${input.groupInstanceId}" not found.`);
      const validated: string[] = [];
      for (const raw of input.urls) {
        const u = safeUrl(raw);
        if (!u) throw new ToolError("INVALID_INPUT", `Invalid url "${raw}".`);
        validated.push(u);
      }
      const c = cfg(widget);
      const existing = Array.isArray(c.urls) ? c.urls.filter((u): u is string => typeof u === "string") : [];
      const before = existing.length;
      const merged = Array.from(new Set([...existing, ...validated]));
      widget.configuration = { ...widget.configuration, urls: merged };
      await this.store.setWidgets(folderId, widgets);
      this.emit({
        type: "group.updated",
        folderId,
        group: { instanceId: input.groupInstanceId, folderId, urls: merged },
      });
      return {
        ok: true,
        data: { groupId: input.groupInstanceId, totalUrls: merged.length, addedCount: merged.length - before },
      };
    } catch (e) {
      return errorResult(e);
    }
  }

  async deleteGroup(input: {
    groupInstanceId: string;
    folderId?: string;
  }): Promise<ServiceResult<{ groupId: string }>> {
    try {
      const folderId = await resolveFolder(this.store, input.folderId);
      const widgets = await this.store.getWidgets(folderId);
      const next = widgets.filter((w) => w.instanceId !== input.groupInstanceId);
      if (next.length === widgets.length)
        throw new ToolError("NOT_FOUND", `Group "${input.groupInstanceId}" not found.`);
      await this.store.setWidgets(folderId, next);
      this.emit({ type: "group.deleted", folderId, instanceId: input.groupInstanceId });
      return { ok: true, data: { groupId: input.groupInstanceId } };
    } catch (e) {
      return errorResult(e);
    }
  }
}

function errorResult<T>(e: unknown): ServiceResult<T> {
  if (e instanceof ToolError) return { ok: false, error: { code: e.code, message: e.message } };
  const message = e instanceof Error ? e.message : "Internal error";
  return { ok: false, error: { code: "INTERNAL_ERROR", message } };
}

function defaultPosition(widgets: WidgetInFolderLike[]): { x: number; y: number } {
  const maxX = widgets.reduce((m, w) => Math.max(m, w.x + w.width), 0);
  return { x: maxX, y: 0 };
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
