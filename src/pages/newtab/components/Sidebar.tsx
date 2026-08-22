import { FolderButton } from "@anori/components/FolderButton/FolderButton";
import { SidebarButton } from "@anori/components/SidebarButton/SidebarButton";
import { builtinIcons } from "@anori/design-system/components/Icon/builtin-icons";
import { ScrollArea } from "@anori/design-system/components/ScrollArea/ScrollArea";
import { TooltipProvider } from "@anori/design-system/components/Tooltip/Tooltip";
import type { Folder } from "@anori/utils/user-data/types";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { css, cva } from "styled-system/css";

export type SidebarProps = {
  folders: Folder[];
  activeFolder: Folder;
  orientation: "vertical" | "horizontal";
  bookmarksBarVisible?: boolean;
  hasUnreadReleaseNotes?: boolean;
  onFolderClick: (folder: Folder) => void;
  onToggleEditMode: () => void;
  onOpenWhatsNew: () => void;
  onOpenSettings: () => void;
};

const sidebarWrapper = cva({
  base: {
    position: "relative",
    alignSelf: "stretch",
    zIndex: "base",
    "--sidebar-display": "none",
    "&:hover": { zIndex: "dropdown", "--sidebar-display": "flex" },
  },
  variants: {
    orientation: {
      vertical: { paddingBlock: "7", paddingInline: "4" },
      horizontal: { paddingBlock: "4", paddingInline: "6" },
    },
    bookmarksBar: { true: {} },
  },
  compoundVariants: [{ orientation: "vertical", bookmarksBar: true, css: { paddingTop: "2!" } }],
});

const sidebar = cva({
  base: {
    position: "absolute!",
    display: "var(--sidebar-display, none) !important",
    background: "white",
    borderRadius: "xl",
    boxShadow: "popover",
  },
  variants: {
    orientation: {
      vertical: { insetBlock: "7", insetInlineStart: "4" },
      horizontal: { insetBlockEnd: "4", insetInline: "6" },
    },
    bookmarksBar: { true: {} },
  },
  compoundVariants: [{ orientation: "vertical", bookmarksBar: true, css: { insetBlockStart: "2!" } }],
});

const sidebarViewport = css({ flexGrow: 1, display: "flex", flexDirection: "column" });
const sidebarContentSlot = cva({
  base: { flexGrow: 1, height: "100%", minHeight: "100%", display: "flex" },
  variants: {
    orientation: {
      vertical: {},
      horizontal: { flexDirection: "column" },
    },
  },
});

const sidebarContent = cva({
  base: { display: "flex !important", gap: "8" },
  variants: {
    orientation: {
      vertical: { flexDirection: "column", paddingBlock: "3", paddingInline: "3" },
      horizontal: { flexDirection: "row", padding: "3" },
    },
  },
});

const spacer = css({ flexGrow: 1 });

export const Sidebar = memo(function Sidebar({
  folders,
  activeFolder,
  orientation,
  bookmarksBarVisible,
  hasUnreadReleaseNotes,
  onFolderClick,
  onToggleEditMode,
  onOpenWhatsNew,
  onOpenSettings,
}: SidebarProps) {
  const { t } = useTranslation();

  return (
    <div className={sidebarWrapper({ orientation, bookmarksBar: bookmarksBarVisible ?? false })}>
      <ScrollArea
        className={sidebar({ orientation, bookmarksBar: bookmarksBarVisible ?? false })}
        viewportClassName={sidebarViewport}
        contentClassName={sidebarContentSlot({ orientation })}
        type="hover"
        direction={orientation}
        mirrorVerticalScrollToHorizontal
      >
        <div className={sidebarContent({ orientation })}>
          <TooltipProvider delay={50} closeDelay={50}>
            {folders.map((f) => {
              return (
                <FolderButton
                  key={f.id}
                  folder={f}
                  sidebarOrientation={orientation}
                  active={activeFolder === f}
                  onClick={() => {
                    onFolderClick(f);
                  }}
                />
              );
            })}
            <div className={spacer} />
            <SidebarButton
              sidebarOrientation={orientation}
              layoutId="whats-new"
              icon={builtinIcons.newspaper}
              name={t("whatsNew")}
              withRedDot={hasUnreadReleaseNotes ?? false}
              onClick={onOpenWhatsNew}
            />
            <SidebarButton
              sidebarOrientation={orientation}
              layoutId="edit-folder"
              icon={builtinIcons.pencil}
              name={t("editFolder")}
              onClick={onToggleEditMode}
            />
            <SidebarButton
              sidebarOrientation={orientation}
              layoutId="settings"
              icon={builtinIcons.settings}
              name={t("settings.title")}
              onClick={onOpenSettings}
            />
          </TooltipProvider>
        </div>
      </ScrollArea>
    </div>
  );
});
