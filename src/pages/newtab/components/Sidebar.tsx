import { FolderButton } from "@anori/components/FolderButton/FolderButton";
import { SidebarButton } from "@anori/components/SidebarButton/SidebarButton";
import { builtinIcons } from "@anori/design-system/components/Icon/builtin-icons";
import { Icon } from "@anori/design-system/components/Icon/Icon";
import { ScrollArea } from "@anori/design-system/components/ScrollArea/ScrollArea";
import { TooltipProvider } from "@anori/design-system/components/Tooltip/Tooltip";
import { useWidgetDragActive } from "@anori/utils/dnd";
import { anoriSchema } from "@anori/utils/storage";
import { useStorageValue } from "@anori/utils/storage-lib";
import type { Folder } from "@anori/utils/user-data/types";
import { useDroppable } from "@dnd-kit/react";
import type { Ref } from "react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { css, cva, cx } from "styled-system/css";

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

/* ── Glass sidebar container ───────────────────────────────────────*/

const sidebarContainer = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    width: "15rem",
    height: "100%",
    zIndex: 10,
    background: "glass.base",
    backdropFilter: "blur(12px) saturate(180%)",
    borderRight: "1px solid var(--ds-glass-border)",
    boxShadow: "2px 0 12px rgba(0,0,0,0.08)",
    overflow: "hidden",
    transition: "width 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
    position: "relative",
    "@media (max-width: 1023px)": {
      width: "3.5rem",
      boxShadow: "2px 0 8px rgba(0,0,0,0.06)",
    },
    "@media (max-width: 767px)": {
      display: "none",
    },
  },
  variants: {
    autohide: {
      true: {
        width: "0!important",
        paddingInline: "0!important",
        boxShadow: "none!important",
        "@media (max-width: 1023px)": {
          width: "0!important",
        },
        "&:hover": {
          width: "15rem!important",
          paddingInline: "",
          boxShadow: "2px 0 12px rgba(0,0,0,0.08)",
          "@media (max-width: 1023px)": {
            width: "3.5rem!important",
          },
        },
      },
    },
  },
});

const sidebarInner = css({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  width: "15rem",
  minWidth: "15rem",
  overflow: "hidden",
});

/* ── Header section ────────────────────────────────────────────────*/

const sidebarHeader = css({
  display: "flex",
  alignItems: "center",
  height: "12",
  paddingInline: "3",
  paddingBlock: "3",
  flexShrink: 0,
  borderBottom: "1px solid var(--ds-glass-border-strong)",
});

const sidebarTitle = css({
  display: "block",
  fontSize: "sm",
  fontWeight: "semibold",
  color: "text.primary",
  letterSpacing: "tight",
  paddingLeft: "2",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "@media (max-width: 1023px)": {
    display: "none",
  },
});

/* ── Navigation area ───────────────────────────────────────────────*/

const navSection = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  padding: "3",
});

const navLabel = css({
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "@media (max-width: 1023px)": {
    display: "none",
  },
});

/* ── Navigation item (expanded) ────────────────────────────────────*/

const navItem = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "3",
    width: "100%",
    padding: "2.5",
    borderRadius: "md",
    color: "text.subtle",
    cursor: "pointer",
    userSelect: "none",
    transition: "background 0.1s ease-in-out, color 0.1s ease-in-out",
    textDecoration: "none",
    border: "none",
    background: "transparent",
    fontFamily: "inherit",
    fontSize: "sm",
    textAlign: "left",
    letterSpacing: "tight",
    lineHeight: "1.2",
    _hover: {
      background: "surface-hover",
      color: "text.primary",
    },
    _active: {
      background: "surface-active",
    },
    _focusVisible: {
      outline: "2px solid var(--ds-focus-ring)",
      outlineOffset: "2px",
    },
  },
  variants: {
    active: {
      true: {
        background: "selected",
        color: "accent",
        _hover: {
          background: "selected",
          color: "accent",
        },
        _active: {
          background: "selected",
        },
      },
    },
    isDropTarget: {
      true: {
        borderColor: "color-mix(in srgb, var(--ds-text-primary) 25%, transparent)!",
        zIndex: "docked!",
      },
    },
    highlight: {
      true: {
        background: "color-mix(in srgb, var(--ds-text-primary) 25%, transparent)!",
      },
    },
  },
});

/* ── Divider ────────────────────────────────────────────────────────*/

const divider = css({
  height: "1px",
  background: "divider",
  marginInline: "3",
  marginBlock: "1",
});

/* ── Spacer ─────────────────────────────────────────────────────────*/

const spacer = css({ flexGrow: 1 });

/* ── Folder nav item (with DnD) ────────────────────────────────────*/

type FolderNavItemProps = {
  folder: Folder;
  active: boolean;
  onClick: () => void;
};

const FolderNavItem = memo(function FolderNavItem({ folder, active, onClick }: FolderNavItemProps) {
  const widgetDragActive = useWidgetDragActive();
  const { ref: dropRef, isDropTarget } = useDroppable({
    id: folder.id,
    type: "folder",
    accept: "widget",
  });

  return (
    <button
      type="button"
      ref={dropRef as Ref<HTMLButtonElement>}
      className={cx(
        navItem({
          active,
          isDropTarget: widgetDragActive && isDropTarget,
          highlight: isDropTarget && !widgetDragActive,
        }),
      )}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      data-folder-id={folder.id}
    >
      <Icon icon={folder.icon} width={18} height={18} />
      <span className={navLabel}>{folder.name}</span>
    </button>
  );
});

/* ── Action nav item ───────────────────────────────────────────────*/

type ActionNavItemProps = {
  icon: string;
  label: string;
  onClick: () => void;
  withRedDot?: boolean;
};

const ActionNavItem = memo(function ActionNavItem({ icon: iconName, label, onClick, withRedDot }: ActionNavItemProps) {
  return (
    <button type="button" className={navItem()} onClick={onClick} aria-label={label}>
      <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon icon={iconName} width={18} height={18} />
        {withRedDot && (
          <span
            className={css({
              position: "absolute",
              top: "-2px",
              right: "-2px",
              width: "6px",
              height: "6px",
              background: "notification",
              borderRadius: "xs",
            })}
          />
        )}
      </span>
      <span className={navLabel}>{label}</span>
    </button>
  );
});

/* ── Sidebar component ─────────────────────────────────────────────*/

export const Sidebar = memo(function Sidebar({
  folders,
  activeFolder,
  orientation: _orientation,
  hasUnreadReleaseNotes,
  onFolderClick,
  onToggleEditMode,
  onOpenWhatsNew,
  onOpenSettings,
}: SidebarProps) {
  const { t } = useTranslation();
  const [autoHideSidebar] = useStorageValue(anoriSchema.autoHideSidebar);

  /* Expanded desktop layout with labeled nav items */
  const expandedSidebar = (
    <div className={sidebarInner}>
      <div className={sidebarHeader}>
        <Icon icon={builtinIcons.home} width={18} height={18} />
        <span className={sidebarTitle}>Workspace</span>
      </div>

      <ScrollArea
        className={css({ flexGrow: 1, overflow: "hidden" })}
        viewportClassName={css({ display: "flex", flexDirection: "column" })}
        contentClassName={css({ display: "flex", flexDirection: "column" })}
        type="hover"
        direction="vertical"
      >
        <div className={navSection}>
          {folders.map((f) => (
            <FolderNavItem key={f.id} folder={f} active={activeFolder.id === f.id} onClick={() => onFolderClick(f)} />
          ))}
        </div>

        <div className={divider} />

        <div className={navSection}>
          <ActionNavItem
            icon={builtinIcons.newspaper}
            label={t("whatsNew")}
            withRedDot={hasUnreadReleaseNotes ?? false}
            onClick={onOpenWhatsNew}
          />
          <ActionNavItem icon={builtinIcons.pencil} label={t("editFolder")} onClick={onToggleEditMode} />
        </div>

        <div className={spacer} />

        <div className={navSection}>
          <ActionNavItem icon={builtinIcons.settings} label={t("settings.title")} onClick={onOpenSettings} />
        </div>
      </ScrollArea>
    </div>
  );

  /* Collapsed / tablet layout: icon-only buttons */
  const collapsedSidebar = (
    <ScrollArea
      className={css({
        flexGrow: 0,
        flexShrink: 0,
        maxHeight: "100%",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        paddingBlock: "3",
        paddingInline: "1.5",
      })}
      viewportClassName={css({ flexGrow: 1, display: "flex", flexDirection: "column" })}
      contentClassName={css({ flexGrow: 1, height: "100%", minHeight: "100%", display: "flex" })}
      type="hover"
      direction="vertical"
    >
      <div className={css({ display: "flex", flexDirection: "column", gap: "1", padding: "1" })}>
        <TooltipProvider delay={50} closeDelay={50}>
          {folders.map((f) => (
            <FolderButton
              key={f.id}
              folder={f}
              sidebarOrientation="vertical"
              active={activeFolder.id === f.id}
              onClick={() => onFolderClick(f)}
            />
          ))}
          <div className={spacer} />
          <SidebarButton
            sidebarOrientation="vertical"
            layoutId="whats-new"
            icon={builtinIcons.newspaper}
            name={t("whatsNew")}
            withRedDot={hasUnreadReleaseNotes ?? false}
            onClick={onOpenWhatsNew}
          />
          <SidebarButton
            sidebarOrientation="vertical"
            layoutId="edit-folder"
            icon={builtinIcons.pencil}
            name={t("editFolder")}
            onClick={onToggleEditMode}
          />
          <SidebarButton
            sidebarOrientation="vertical"
            layoutId="settings"
            icon={builtinIcons.settings}
            name={t("settings.title")}
            onClick={onOpenSettings}
          />
        </TooltipProvider>
      </div>
    </ScrollArea>
  );

  return (
    <aside
      className={sidebarContainer({ autohide: autoHideSidebar ?? false })}
      role="navigation"
      aria-label={t("sidebar")}
    >
      {/* Expanded layout (desktop) — visible above 1024px */}
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "hidden",
          "@media (max-width: 1023px)": { display: "none" },
        })}
      >
        {expandedSidebar}
      </div>

      {/* Collapsed layout (tablet) — visible at 768-1023px */}
      <div
        className={css({
          display: "none",
          "@media (min-width: 768px) and (max-width: 1023px)": { display: "flex" },
          flexDirection: "column",
          flex: 1,
          overflow: "hidden",
        })}
      >
        {collapsedSidebar}
      </div>
    </aside>
  );
});
