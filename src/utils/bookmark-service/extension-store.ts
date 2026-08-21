import type { FolderStore, WidgetInFolderLike } from "@anori/utils/bookmark-service/bookmark-service";
import { DEFAULT_FOLDER_ID } from "@anori/utils/bookmark-service/bookmark-service";
import { findPositionForItemInGrid } from "@anori/utils/grid/utils";
import { anoriSchema, getAnoriStorage } from "@anori/utils/storage";
import type { WidgetInFolder } from "@anori/utils/user-data/types";

export async function createExtensionFolderStore(): Promise<FolderStore> {
  const storage = await getAnoriStorage();

  return {
    async getFolders() {
      const folders = storage.get(anoriSchema.folders) ?? [];
      return [{ id: DEFAULT_FOLDER_ID, name: "Home" }, ...folders.map((f) => ({ id: f.id, name: f.name }))];
    },

    async getWidgets(folderId: string) {
      const details = storage.get(anoriSchema.folderDetails.folder.byId(folderId));
      return ((details?.widgets ?? []) as WidgetInFolder[]).map(toLike);
    },

    async setWidgets(folderId: string, widgets: WidgetInFolderLike[]) {
      const existing = (storage.get(anoriSchema.folderDetails.folder.byId(folderId))?.widgets ??
        []) as WidgetInFolder[];
      const byId = new Map(existing.map((w) => [w.instanceId, w]));
      const merged = widgets.map((w) =>
        byId.get(w.instanceId) ? { ...byId.get(w.instanceId), ...w } : (w as WidgetInFolder),
      );
      await storage.set(anoriSchema.folderDetails.folder.byId(folderId), { widgets: merged });
    },
  };
}

export function extensionLocatePosition(widgets: WidgetInFolderLike[]): { x: number; y: number } {
  const grid = { columns: 8, rows: 1000 };
  const position = findPositionForItemInGrid({ grid, layout: widgets, item: { width: 1, height: 1 } });
  if (position) return position;
  const maxX = widgets.reduce((m, w) => Math.max(m, w.x + w.width), 0);
  return { x: maxX, y: 0 };
}

function toLike(w: WidgetInFolder): WidgetInFolderLike {
  return {
    pluginId: w.pluginId,
    widgetId: w.widgetId,
    instanceId: w.instanceId,
    configuration: w.configuration as Record<string, unknown>,
    width: w.width,
    height: w.height,
    x: w.x,
    y: w.y,
  };
}
