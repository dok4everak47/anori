import { ShortcutsHelp } from "@anori/components/ShortcutsHelp";
import { builtinIcons } from "@anori/design-system/components/Icon/builtin-icons";
import { Modal } from "@anori/design-system/components/Modal/Modal";
import { appCommandRegistry, startExtensionRuntime } from "@anori/sdk/app-runtime";
import { exampleExtension } from "@anori/sdk/bundled/example-extension";
import type { Command, CommandContext } from "@anori/utils/commands/types";
import { useSizeSettings } from "@anori/utils/compact";
import { FolderContentContext } from "@anori/utils/FolderContentContext";
import { useGridDimensions } from "@anori/utils/grid/useGridDimensions";
import { findPositionForItemInGrid } from "@anori/utils/grid/utils";
import { useHotkeys } from "@anori/utils/hooks";
import { useOverlayLayers } from "@anori/utils/overlay-layers";
import { WidgetSelectionProvider } from "@anori/utils/selection";
import { anoriSchema } from "@anori/utils/storage";
import { useStorageValue } from "@anori/utils/storage-lib";
import { tryMoveWidgetToFolder, useFolderWidgets } from "@anori/utils/user-data/hooks";
import type { Folder, WidgetInFolderWithMeta } from "@anori/utils/user-data/types";
import { useWallpaperOrientation } from "@anori/utils/user-data/use-wallpaper-orientation";
import { AnimatePresence, m } from "motion/react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import useMeasure from "react-use-motion-measure";
import { css, cva } from "styled-system/css";
import browser from "webextension-polyfill";
import { NewWidgetWizard, SettingsModal } from "../../lazy-components";
import type { SettingScreen } from "../../settings/Settings";
import { AIPanel } from "../AIPanel/AIPanel";
import { AppShell } from "../AppShell/AppShell";
import { CommandPalette } from "../CommandPalette/CommandPalette";
import { EditModeToolbar } from "../EditModeToolbar/EditModeToolbar";
import { EditWidgetModal } from "../EditWidgetModal";
import { FolderContent } from "../FolderContent";
import { Sidebar } from "../Sidebar";
import { TopBar } from "../TopBar/TopBar";
import type { LayoutChange } from "../WidgetsGrid/WidgetsGrid";

const CHANGELOG_URL = "https://github.com/dok4everak47/anori/blob/master/CHANGELOG.md";

type WorkspaceProps = {
  folders: Folder[];
  activeFolder: Folder;
  orientation: "vertical" | "horizontal";
  bookmarksBarVisible?: boolean;
  animationDirection: "up" | "down" | "left" | "right" | null;
  onFolderClick: (folder: Folder) => void;
};

const widgetsArea = cva({
  base: {
    position: "relative",
    flex: 1,
    zIndex: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  variants: {
    orientation: {
      vertical: { marginBlock: "8", marginInline: "8" },
      horizontal: { marginTop: "8", marginInline: "8", marginBottom: 0 },
    },
    bookmarksBar: { true: { marginTop: "1!" } },
  },
});

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
  orientation,
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
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [hasUnreadReleaseNotes, setHasUnreadReleaseNotes] = useStorageValue(anoriSchema.hasUnreadReleaseNotes);
  const [widgetBackgroundOpacity] = useStorageValue(anoriSchema.widgetBackgroundOpacity);
  const [colorScheme, setColorScheme] = useStorageValue(anoriSchema.colorScheme);
  const [widgetSelection, setWidgetSelection] = useState<CommandContext["selection"]>(null);
  const { blockSize, minBlockSize } = useSizeSettings();
  const backgroundInfo = useWallpaperOrientation();
  const mainRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isPortrait = backgroundInfo ? backgroundInfo.height > backgroundInfo.width : false;
  const gridDimensions = useGridDimensions(
    scrollAreaRef,
    blockSize,
    minBlockSize,
    widgets,
    isPortrait ? backgroundInfo : null,
  );
  const [panelRef, panelBounds] = useMeasure();

  const prevPortrait = useRef(false);

  useEffect(() => {
    if (!isPortrait) {
      prevPortrait.current = false;
      return;
    }
    if (prevPortrait.current) return;
    prevPortrait.current = true;

    const band = gridDimensions.restrictedBand;
    if (!band) return;

    const stuck = widgets.filter((w) => w.x < band.colEnd && w.x + w.width > band.colStart);
    if (stuck.length === 0) return;

    const pending = widgets.map((w) => ({ ...w }));
    for (const widget of stuck) {
      const remaining = pending.filter((p) => p.instanceId !== widget.instanceId);
      const position = findPositionForItemInGrid({ grid: gridDimensions, layout: remaining, item: widget });
      if (!position) continue;
      const target = pending.find((p) => p.instanceId === widget.instanceId);
      if (target) {
        target.x = position.x;
        target.y = position.y;
      }
      void moveWidget(widget.instanceId, position);
    }
  }, [isPortrait, gridDimensions, widgets, moveWidget]);

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
          resizeWidget(ch.instanceId, { width: ch.width, height: ch.height });
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
  useHotkeys("meta+k", () => setIsCommandPaletteOpen((v) => !v), { preventDefault: true });

  const [_extensionsReady, setExtensionsReady] = useState(false);
  const activeFolderRef = useRef(activeFolder);
  activeFolderRef.current = activeFolder;
  useEffect(() => {
    const extensions = X_MODE === "development" ? [exampleExtension] : [];
    let cancelled = false;
    void startExtensionRuntime(extensions, () => activeFolderRef.current.id).then(() => {
      if (!cancelled) setExtensionsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleCommand = useCallback(
    async (command: Command) => {
      const result = await command.execute({ selection: widgetSelection });
      if (result.success) {
        setWidgetSelection(null);
      } else {
        throw new Error(result.error ?? "Command failed");
      }
    },
    [widgetSelection],
  );

  const commands = useMemo<Command[]>(() => {
    const homeFolder = folders[0];
    const otherFolders = folders.slice(1);

    const navigationCommands: Command[] = [
      {
        id: "nav-home",
        title: homeFolder?.name ?? "Home",
        description: t("commandPalette.goToHome"),
        icon: builtinIcons.home,
        category: "navigation",
        source: "builtin",
        keywords: ["home", "workspace", "dashboard"],
        execute: () => {
          if (homeFolder) onFolderClick(homeFolder);
          return { success: true };
        },
      },
      ...otherFolders.map((folder) => ({
        id: `nav-folder-${folder.id}`,
        title: folder.name,
        description: folder.id === "home" ? t("commandPalette.goToHome") : t("commandPalette.switchFolder"),
        icon: builtinIcons.folder,
        category: "navigation" as const,
        source: "builtin" as const,
        execute: () => {
          onFolderClick(folder);
          return { success: true };
        },
      })),
    ];

    const systemCommands: Command[] = [
      {
        id: "ai.ask",
        title: t("ai.commandTitle"),
        description: t("ai.commandDescription"),
        icon: builtinIcons.compass,
        category: "system",
        source: "builtin",
        keywords: ["ai", "assistant", "organize", "chatgpt", "automate", "natural language"],
        execute: () => {
          setIsAIPanelOpen(true);
          return { success: true };
        },
      },
      {
        id: "sys-settings",
        title: t("settings.title"),
        description: t("commandPalette.openSettings"),
        icon: builtinIcons.settings,
        category: "system",
        source: "builtin",
        keywords: ["preferences", "config", "options"],
        execute: () => {
          setSettingsScreen("general");
          return { success: true };
        },
      },
      {
        id: "sys-theme",
        title: t("commandPalette.toggleTheme"),
        description: t("commandPalette.toggleThemeDesc"),
        icon: builtinIcons.palette,
        category: "system",
        source: "builtin",
        keywords: ["dark", "light", "appearance", "mode"],
        execute: () => {
          const next = colorScheme === "light" ? "dark" : colorScheme === "dark" ? "system" : "light";
          setColorScheme(next);
          return { success: true };
        },
      },
      {
        id: "sys-shortcuts",
        title: t("shortcuts.title"),
        description: t("commandPalette.showShortcuts"),
        icon: builtinIcons.key,
        category: "system",
        source: "builtin",
        keywords: ["hotkeys", "keyboard", "cheatsheet"],
        execute: () => {
          setShortcutsHelpVisible(true);
          return { success: true };
        },
      },
    ];

    const bookmarkCommands: Command[] = [
      {
        id: "bm-open",
        title: "Open Bookmark",
        icon: builtinIcons.globe,
        category: "bookmark",
        source: "builtin",
        when: (ctx) => ctx.selection?.type === "bookmark",
        execute: (ctx) => {
          const sel = ctx.selection;
          if (sel?.type === "bookmark") {
            const widget = widgets.find((w) => w.instanceId === sel.instanceId);
            const link = widget?.configuration?.url ?? widget?.configuration?.link;
            if (typeof link === "string") window.open(link, "_self");
          }
          return { success: true };
        },
      },
      {
        id: "bm-open-new-tab",
        title: "Open in New Tab",
        icon: builtinIcons.openOutline,
        category: "bookmark",
        source: "builtin",
        when: (ctx) => ctx.selection?.type === "bookmark",
        execute: (ctx) => {
          const sel = ctx.selection;
          if (sel?.type === "bookmark") {
            const widget = widgets.find((w) => w.instanceId === sel.instanceId);
            const link = widget?.configuration?.url ?? widget?.configuration?.link;
            if (typeof link === "string") window.open(link, "_blank");
          }
          return { success: true };
        },
      },
      {
        id: "bm-copy-url",
        title: "Copy URL",
        icon: builtinIcons.unlink,
        category: "bookmark",
        source: "builtin",
        when: (ctx) => ctx.selection?.type === "bookmark",
        execute: (ctx) => {
          const sel = ctx.selection;
          if (sel?.type === "bookmark") {
            const widget = widgets.find((w) => w.instanceId === sel.instanceId);
            const link = widget?.configuration?.url ?? widget?.configuration?.link;
            if (typeof link === "string") navigator.clipboard.writeText(link);
          }
          return { success: true };
        },
      },
      {
        id: "bm-edit",
        title: "Edit Bookmark",
        icon: builtinIcons.pencil,
        category: "bookmark",
        source: "builtin",
        when: (ctx) => ctx.selection?.type === "bookmark",
        execute: (ctx) => {
          const sel = ctx.selection;
          if (sel?.type === "bookmark") {
            const widget = widgets.find((w) => w.instanceId === sel.instanceId);
            if (widget?.widget.configurationScreen) {
              setEditingWidget(widget);
            }
          }
          return { success: true };
        },
      },
      {
        id: "bm-remove",
        title: "Delete Bookmark",
        icon: builtinIcons.trash,
        category: "bookmark",
        source: "builtin",
        when: (ctx) => ctx.selection?.type === "bookmark",
        execute: (ctx) => {
          const sel = ctx.selection;
          if (sel?.type === "bookmark") {
            if (sel.instanceId) removeWidget(sel.instanceId);
            setWidgetSelection(null);
          }
          return { success: true };
        },
      },
    ];

    return [
      ...navigationCommands,
      ...systemCommands,
      ...bookmarkCommands,
      ...appCommandRegistry.list().filter((c: { source: string }) => c.source === "extension"),
    ];
  }, [folders, onFolderClick, t, colorScheme, setColorScheme, widgets, removeWidget]);

  const parentFolderContext = useMemo(
    () => ({ activeFolder, isEditing, grid: gridDimensions, gridRef: mainRef }),
    [activeFolder, isEditing, gridDimensions],
  );

  const shouldShowOnboarding = widgets.length === 0 && !isEditing;

  return (
    <WidgetSelectionProvider>
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

      <AppShell
        sidebar={
          <Sidebar
            folders={folders}
            activeFolder={activeFolder}
            orientation={orientation}
            bookmarksBarVisible={bookmarksBarVisible}
            hasUnreadReleaseNotes={hasUnreadReleaseNotes ?? false}
            onFolderClick={onFolderClick}
            onToggleEditMode={handleToggleEditMode}
            onOpenWhatsNew={handleOpenWhatsNew}
            onOpenSettings={handleOpenSettings}
          />
        }
      >
        <TopBar title={activeFolder.name} onSearchClick={() => setIsCommandPaletteOpen(true)} />

        <div
          ref={panelRef}
          className={widgetsArea({ orientation, bookmarksBar: bookmarksBarVisible })}
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
              isEditing={isEditing}
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
        </div>
      </AppShell>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        commands={commands}
        onCommand={handleCommand}
        context={{ selection: widgetSelection }}
        onAskAI={(prompt) => {
          setAiPrompt(prompt);
          setIsAIPanelOpen(true);
        }}
      />

      <AIPanel
        isOpen={isAIPanelOpen}
        onClose={() => setIsAIPanelOpen(false)}
        initialPrompt={aiPrompt}
        context={{ folderId: activeFolder.id, selection: widgetSelection }}
      />

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
    </WidgetSelectionProvider>
  );
};
