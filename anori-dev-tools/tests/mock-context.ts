import type {
  Bookmark,
  BookmarkGroup,
  BookmarkSearchResult,
  ExtensionContext,
  SdkCommand,
  SdkTool,
  WorkspaceSnapshot,
} from "@anori/sdk";

export type MockBookmarkRecord = {
  instanceId: string;
  title: string;
  url: string;
  folderId: string;
};

export function makeMockContext(
  overrides: {
    bookmarks?: Array<Pick<Bookmark, "instanceId" | "title" | "url" | "folderId">>;
    groups?: Array<Pick<BookmarkGroup, "instanceId" | "title" | "urls" | "folderId">>;
    activeFolder?: { id: string; name: string };
    folders?: Array<{ id: string; name: string }>;
  } = {},
): {
  ctx: ExtensionContext;
  registeredCommands: SdkCommand[];
  registeredTools: SdkTool[];
  created: Array<{ url: string; title?: string; folderId?: string }>;
  logs: Array<{ level: "info" | "warn" | "error"; message: string }>;
} {
  const registeredCommands: SdkCommand[] = [];
  const registeredTools: SdkTool[] = [];
  const created: Array<{ url: string; title?: string; folderId?: string }> = [];
  const logs: Array<{ level: "info" | "warn" | "error"; message: string }> = [];

  const bookmarks = overrides.bookmarks ?? [];
  const groups = overrides.groups ?? [];
  const folders = overrides.folders ?? [
    overrides.activeFolder ?? { id: "home", name: "Home" },
    { id: "work", name: "Work" },
  ];
  const activeFolder = overrides.activeFolder ?? { id: "home", name: "Home" };

  const toResult = (b: (typeof bookmarks)[number], x: number, y: number): Bookmark => ({
    instanceId: b.instanceId,
    title: b.title,
    url: b.url,
    folderId: b.folderId,
    x,
    y,
  });
  const toGroup = (g: (typeof groups)[number], x: number, y: number): BookmarkGroup => ({
    instanceId: g.instanceId,
    title: g.title,
    urls: g.urls,
    folderId: g.folderId,
    x,
    y,
  });

  const ctx: ExtensionContext = {
    commands: {
      register(command: SdkCommand) {
        registeredCommands.push(command);
        return { dispose() {} };
      },
    },
    tools: {
      register(tool: SdkTool) {
        registeredTools.push(tool);
        return { dispose() {} };
      },
    },
    events: {
      on() {
        return { dispose() {} };
      },
    },
    workspace: {
      current: async (): Promise<WorkspaceSnapshot> => ({
        activeFolder: { id: activeFolder.id, name: activeFolder.name },
        folders: folders.map((f) => ({ id: f.id, name: f.name })),
      }),
      list: async () => folders.map((f) => ({ id: f.id, name: f.name })),
      get: async (id: string) => folders.find((f) => f.id === id),
    },
    bookmarks: {
      search: async (query: string): Promise<BookmarkSearchResult> => {
        const q = query.toLowerCase();
        return {
          bookmarks: bookmarks
            .filter((b) => !q || b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q))
            .map((b, i) => toResult(b, i, 0)),
          groups: groups.filter((g) => !q || g.title.toLowerCase().includes(q)).map((g, i) => toGroup(g, i, 0)),
        };
      },
      get: async () => undefined,
      create: async (input: { url: string; title?: string; folderId?: string }) => {
        created.push(input);
        return { bookmarkId: "new-id" };
      },
      update: async () => ({ bookmarkId: "x" }),
      delete: async () => ({ success: true, instanceId: "x" }),
      createGroup: async () => ({ groupId: "g" }),
      addToGroup: async () => ({ groupId: "g", totalUrls: 0, addedCount: 0 }),
      deleteGroup: async () => ({ success: true, groupInstanceId: "g" }),
    },
    logger: {
      info: (message: string) => logs.push({ level: "info", message: String(message) }),
      warn: (message: string) => logs.push({ level: "warn", message: String(message) }),
      error: (message: string) => logs.push({ level: "error", message: String(message) }),
    },
  };

  return { ctx, registeredCommands, registeredTools, created, logs };
}
