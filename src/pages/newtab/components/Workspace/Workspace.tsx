import { ShortcutsHelp } from "@anori/components/ShortcutsHelp";
import { Modal } from "@anori/design-system/components/Modal/Modal";
import { useSizeSettings } from "@anori/utils/compact";
import { FolderContentContext } from "@anori/utils/FolderContentContext";
import type { GridPosition } from "@anori/utils/grid/types";
import { useGridDimensions } from "@anori/utils/grid/useGridDimensions";
import { findPositionForItemInGrid } from "@anori/utils/grid/utils";
import { useHotkeys } from "@anori/utils/hooks";
import { useOverlayLayers } from "@anori/utils/overlay-layers";
import { anoriSchema } from "@anori/utils/storage";
import { useStorageValue } from "@anori/utils/storage-lib";
import { tryMoveWidgetToFolder, useFolderWidgets } from "@anori/utils/user-data/hooks";
import type { Folder, WidgetInFolderWithMeta } from "@anori/utils/user-data/types";
import { AnimatePresence, m } from "motion/react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import useMeasure from "react-use-motion-measure";
import { css, cva } from "styled-system/css";
import browser from "webextension-polyfill";
import { NewWidgetWizard, SettingsModal } from "../../lazy-components";
import type { SettingScreen } from "../../settings/Settings";
import { Dock } from "../Dock/Dock";
import { EditModeToolbar } from "../EditModeToolbar/EditModeToolbar";
import { EditWidgetModal } from "../EditWidgetModal";
import { FolderContent } from "../FolderContent";
import type { LayoutChange } from "../WidgetsGrid/WidgetsGrid";

const CHANGELOG_URL = "https://github.com/dok4everak47/anori/blob/master/CHANGELOG.md";

type WorkspaceProps = {
  folders: Folder[];
  activeFolder: Folder;
  bookmarksBarVisible?: boolean;
  animationDirection: "left" | "right" | null;
  onFolderClick: (folder: Folder) => void;
};

const startPageContent = css({ display: "flex", flex: 1, overflow: "hidden" });

const widgetsArea = cva({
  base: {
    position: "relative",
    flex: 1,
    zIndex: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    marginBlockStart: "8",
    marginBlockEnd: "8",
    marginInline: "8",
  },
  variants: {
    bookmarksBar: { true: { marginBlockStart: "1!" } },
  },
});

// A "spotlight" scrim: sized to the folder panel, its huge spread box-shadow dims everything *around*
// the panel while its own rect stays transparent — so the translucent panel isn't darkened from behind.
const editingScrim = css({
  position: "fixed",
  zIndex: "docked",
  pointerEvents: "none",
  borderRadius: "xl",
  boxShadow: "0 0 0 100vmax rgba(0, 0, 0, 0.5)",
});

export const Workspace = ({
  folders,
  activeFolder,
  bookmarksBarVisible,
  animationDirection,
  onFolderClick,
}: WorkspaceProps) => {
  const { t } = useTranslation();
  const { widgets, removeWidget, moveWidget, resizeWidget, updateWidgetConfig } = useFolderWidgets(activeFolder);
  const [isEditing, setIsEditing] = useState(false);
  const [addWidgetWizardVisible, setAddWidgetWizardVisible] = useState(false);
  const [editingWidget, setEditingWidget] = useState<null | WidgetInFolderWithMeta>(null);
  const [settingsScreen, setSettingsScreen] = useState<SettingScreen | null>(null);
  const [shortcutsHelpVisible, setShortcutsHelpVisible] = useState(false);
  const [hasUnreadReleaseNotes, setHasUnreadReleaseNotes] = useStorageValue(anoriSchema.hasUnreadReleaseNotes);
  const [widgetBackgroundOpacity] = useStorageValue(anoriSchema.widgetBackgroundOpacity);
  const { blockSize, minBlockSize } = useSizeSettings();
  const mainRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const gridDimensions = useGridDimensions(scrollAreaRef, blockSize, minBlockSize);
  const [panelRef, panelBounds] = useMeasure();

  const prevGridDimsRef = useRef<{ columns: number; rows: number } | null>(null);
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!gridDimensions.isMeasured) return;

    const prev = prevGridDimsRef.current;
    const isFirst = prev === null;
    prevGridDimsRef.current = { columns: gridDimensions.columns, rows: gridDimensions.rows };

    if (isFirst) return;
    if (prev && prev.columns === gridDimensions.columns && prev.rows === gridDimensions.rows) return;

    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      const snapshot = widgetsRef.current;
      const moves: { instanceId: string; position: GridPosition }[] = [];
      const occupied = snapshot.map((w) => ({ ...w }));

      for (const widget of snapshot) {
        const inBounds =
          widget.x >= 0 &&
          widget.y >= 0 &&
          widget.x + widget.width <= gridDimensions.columns &&
          widget.y + widget.height <= gridDimensions.rows;
        if (inBounds) continue;

        const others = occupied.filter((w) => w.instanceId !== widget.instanceId);
        const position = findPositionForItemInGrid({
          grid: gridDimensions,
          layout: others,
          item: widget,
        });
        if (position && (position.x !== widget.x || position.y !== widget.y)) {
          const idx = occupied.findIndex((w) => w.instanceId === widget.instanceId);
          if (idx >= 0) occupied[idx] = { ...occupied[idx], ...position };
          moves.push({ instanceId: widget.instanceId, position });
          continue;
        }
        if (widget.width > gridDimensions.columns || widget.height > gridDimensions.rows) {
          void resizeWidget(widget.instanceId, {
            width: Math.min(widget.width, gridDimensions.columns),
            height: Math.min(widget.height, gridDimensions.rows),
          });
        }
      }

      moves.forEach((m) => void moveWidget(m.instanceId, m.position));
    }, 250);

    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, [gridDimensions, moveWidget, resizeWidget]);

  const handleLayoutUpdate = useCallback(
    (changes: LayoutChange[]) => {
      changes.forEach(async (ch) => {
        if (ch.type === "remove") {
          removeWidget(ch.instanceId);
        } else if (ch.type === "change-position") {
          moveWidget(ch.instanceId, ch.newPosition);
        } else if (ch.type === "move-to-folder") {
          tryMoveWidgetToFolder(activeFolder.id, ch.folderId, ch.instanceId, gridDimensions);
        } else if (ch.type === "resize") {
          resizeWidget(ch.instanceId, { width: ch.width, height: ch.height }, ch.position);
        }
      });
    },
    [activeFolder.id, gridDimensions, removeWidget, moveWidget, resizeWidget],
  );

  useHotkeys("alt+e", () => setIsEditing(true));
  useHotkeys("alt+a", () => {
    setIsEditing(true);
    setAddWidgetWizardVisible(true);
  });
  useHotkeys("alt+h", () => setShortcutsHelpVisible((v) => !v));
  useHotkeys("alt+s", () => setSettingsScreen((screen) => (screen ? null : "general")));

  const overlayLayers = useOverlayLayers();
  useHotkeys(
    "esc",
    () => {
      if (overlayLayers.hasActiveOverlay()) return;
      setIsEditing(false);
    },
    { enabled: isEditing },
  );

  const handleToggleEditMode = useCallback(() => setIsEditing((v) => !v), []);
  const handleDoneEditing = useCallback(() => setIsEditing(false), []);
  const handleAddWidget = useCallback(() => setAddWidgetWizardVisible(true), []);
  const handleOpenWhatsNew = useCallback(() => {
    setHasUnreadReleaseNotes(false);
    void browser.runtime.sendMessage({ type: "open-url", url: CHANGELOG_URL, inNewTab: true, active: true });
  }, [setHasUnreadReleaseNotes]);
  const handleOpenSettings = useCallback(() => setSettingsScreen("general"), []);

  const parentFolderContext = useMemo(
    () => ({ activeFolder, isEditing, grid: gridDimensions, gridRef: mainRef }),
    [activeFolder, isEditing, gridDimensions],
  );

  const shouldShowOnboarding = widgets.length === 0 && !isEditing;

  return (
    <>
      <AnimatePresence>
        {isEditing && (
          <m.div
            key="editing-scrim"
            className={editingScrim}
            style={{
              top: panelBounds.top,
              left: panelBounds.left,
              width: panelBounds.width,
              height: panelBounds.height,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      <div className={startPageContent}>
        <div
          ref={panelRef}
          className={widgetsArea({ bookmarksBar: bookmarksBarVisible })}
          style={
            {
              "--anori-widget-opacity": (widgetBackgroundOpacity ?? 100) / 100,
            } as CSSProperties
          }
        >
          <FolderContentContext.Provider value={parentFolderContext}>
            <FolderContent
              key={activeFolder.id}
              folder={activeFolder}
              animationDirection={animationDirection}
              widgets={widgets}
              gridDimensions={gridDimensions}
              gridRef={mainRef}
              scrollAreaRef={scrollAreaRef}
              onLayoutUpdate={handleLayoutUpdate}
              onEditWidget={setEditingWidget}
              onUpdateWidgetConfig={updateWidgetConfig}
              showOnboarding={shouldShowOnboarding}
            />
          </FolderContentContext.Provider>
          <EditModeToolbar visible={isEditing} onAddWidget={handleAddWidget} onDone={handleDoneEditing} />
          <Dock
            folders={folders}
            activeFolder={activeFolder}
            hasUnreadReleaseNotes={hasUnreadReleaseNotes ?? false}
            onFolderClick={onFolderClick}
            onToggleEditMode={handleToggleEditMode}
            onOpenWhatsNew={handleOpenWhatsNew}
            onOpenSettings={handleOpenSettings}
          />
        </div>
      </div>

      <AnimatePresence>
        {addWidgetWizardVisible && (
          <NewWidgetWizard
            folder={activeFolder}
            key="new-widget-wizard"
            onClose={() => setAddWidgetWizardVisible(false)}
            gridDimensions={gridDimensions}
            layout={widgets}
          />
        )}

        {!!editingWidget && (
          <EditWidgetModal
            key="edit-widget-modal"
            widget={editingWidget}
            onUpdateConfig={updateWidgetConfig}
            onClose={() => setEditingWidget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shortcutsHelpVisible && (
          <Modal title={t("shortcuts.title")} closable onClose={() => setShortcutsHelpVisible(false)}>
            <ShortcutsHelp />
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {settingsScreen && <SettingsModal initialScreen={settingsScreen} onClose={() => setSettingsScreen(null)} />}
      </AnimatePresence>
    </>
  );
};
