import type { z } from "zod";

export type ExtensionPermission =
  | "commands.register"
  | "tools.register"
  | "bookmarks.read"
  | "bookmarks.write"
  | "bookmarks.delete"
  | "workspace.read"
  | "events.read";

export type ExtensionManifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
  engines?: {
    anori?: string;
  };
  permissions?: ExtensionPermission[];
};

export type SdkCommandContext = {
  selection?: {
    type: "bookmark" | "group";
    instanceId?: string;
    pluginId?: string;
    widgetId?: string;
  } | null;
};

export type SdkCommandResult = {
  success: boolean;
  error?: string;
};

export type SdkCommand = {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  keywords?: string[];
  when?: (context: SdkCommandContext) => boolean;
  execute: (context: SdkCommandContext) => void | SdkCommandResult | Promise<void | SdkCommandResult>;
};

export type ToolPermission = "read" | "write" | "destructive";

export type ToolResult = {
  ok: boolean;
  content: unknown;
  error?: string;
};

export type ToolExecutionContext = {
  folderId: string;
  selection: SdkCommandContext["selection"];
};

export type SdkTool<TInput = unknown> = {
  name: string;
  description: string;
  permission: ToolPermission;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput, context: ToolExecutionContext) => ToolResult | Promise<ToolResult>;
};

export type Disposable = {
  dispose: () => void;
};

export type ExtensionLogger = {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
};

export type WorkspaceFolder = {
  id: string;
  name: string;
};

export type WorkspaceSnapshot = {
  activeFolder: WorkspaceFolder;
  folders: WorkspaceFolder[];
};

export type Bookmark = {
  instanceId: string;
  title: string;
  url: string;
  x: number;
  y: number;
  folderId: string;
};

export type BookmarkGroup = {
  instanceId: string;
  title: string;
  urls: string[];
  x: number;
  y: number;
  folderId: string;
};

export type BookmarkSearchResult = {
  bookmarks: Bookmark[];
  groups: BookmarkGroup[];
};

export type AnoriEventMap = {
  "bookmark.created": { bookmark: Bookmark };
  "bookmark.updated": { bookmark: Pick<Bookmark, "instanceId" | "folderId"> & Partial<Bookmark> };
  "bookmark.deleted": { instanceId: string; folderId: string };
  "group.created": { group: BookmarkGroup };
  "group.updated": { group: Pick<BookmarkGroup, "instanceId" | "folderId"> & Partial<BookmarkGroup> };
  "group.deleted": { instanceId: string; folderId: string };
  "workspace.changed": { folderId: string };
  "command.executed": { commandId: string };
};

export type AnoriEventName = keyof AnoriEventMap;

export type EventListener<K extends AnoriEventName> = (payload: AnoriEventMap[K]) => void;

export type ExtensionContext = {
  commands: {
    register: (command: SdkCommand) => Disposable;
  };
  tools: {
    register: (tool: SdkTool) => Disposable;
  };
  events: {
    on: <K extends AnoriEventName>(name: K, listener: EventListener<K>) => Disposable;
  };
  workspace: {
    current: () => Promise<WorkspaceSnapshot>;
    list: () => Promise<WorkspaceFolder[]>;
    get: (folderId: string) => Promise<WorkspaceFolder | undefined>;
  };
  bookmarks: {
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
  logger: ExtensionLogger;
};

export type AnoriExtension = {
  manifest: ExtensionManifest;
  activate: (context: ExtensionContext) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
};
