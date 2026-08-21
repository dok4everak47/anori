import type { FolderStore, WidgetInFolderLike } from "./shared/bookmark-service.js";
import { BOOKMARK_PLUGIN_ID, BOOKMARK_WIDGET_ID, GROUP_WIDGET_ID } from "./shared/bookmark-service.js";

export class InMemoryFolderStore implements FolderStore {
  private folders: Array<{ id: string; name: string }>;
  private widgets: Map<string, WidgetInFolderLike[]>;

  constructor(folders: Array<{ id: string; name: string }>, initial: Map<string, WidgetInFolderLike[]>) {
    this.folders = folders;
    this.widgets = initial;
  }

  static seeded(): InMemoryFolderStore {
    const folders = [
      { id: "home", name: "Home" },
      { id: "work", name: "Work" },
    ];
    const widgets = new Map<string, WidgetInFolderLike[]>();
    widgets.set("home", [
      bookmark("b1", "Example", "https://example.com", 0, 0),
      bookmark("b2", "Hacker News", "https://news.ycombinator.com", 1, 0),
      group("g1", "Reading", ["https://anori.app", "https://github.com"], 2, 0),
    ]);
    widgets.set("work", [bookmark("b3", "Linear", "https://linear.app", 0, 0)]);
    return new InMemoryFolderStore(folders, widgets);
  }

  async getFolders() {
    return this.folders.map((f) => ({ ...f }));
  }

  async getWidgets(folderId: string) {
    return (this.widgets.get(folderId) ?? []).map(clone);
  }

  async setWidgets(folderId: string, widgets: WidgetInFolderLike[]) {
    this.widgets.set(folderId, widgets.map(clone));
  }
}

let counter = 100;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

function bookmark(instanceId: string, title: string, url: string, x: number, y: number): WidgetInFolderLike {
  return {
    pluginId: BOOKMARK_PLUGIN_ID,
    widgetId: BOOKMARK_WIDGET_ID,
    instanceId,
    configuration: { url, title, icon: "default" },
    width: 1,
    height: 1,
    x,
    y,
  };
}

function group(instanceId: string, title: string, urls: string[], x: number, y: number): WidgetInFolderLike {
  return {
    pluginId: BOOKMARK_PLUGIN_ID,
    widgetId: GROUP_WIDGET_ID,
    instanceId,
    configuration: { title, icon: "default", openInTabGroup: false, urls },
    width: 1,
    height: 1,
    x,
    y,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function makeBookmark(title: string, url: string, x = 0, y = 0): WidgetInFolderLike {
  return bookmark(nextId("b"), title, url, x, y);
}
