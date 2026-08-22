import { FolderButton } from "@anori/components/FolderButton/FolderButton";
import { SidebarButton } from "@anori/components/SidebarButton/SidebarButton";
import { builtinIcons } from "@anori/design-system/components/Icon/builtin-icons";
import { TooltipProvider } from "@anori/design-system/components/Tooltip/Tooltip";
import type { Folder } from "@anori/utils/user-data/types";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";

export type DockProps = {
  folders: Folder[];
  activeFolder: Folder;
  hasUnreadReleaseNotes?: boolean;
  onFolderClick: (folder: Folder) => void;
  onToggleEditMode: () => void;
  onOpenWhatsNew: () => void;
  onOpenSettings: () => void;
};

const dock = css({
  position: "absolute",
  insetBlockEnd: "4",
  insetInlineStart: "4",
  zIndex: "docked",
  display: "flex",
  alignItems: "center",
  gap: "1",
  padding: "2",
  borderRadius: "full",
  bg: "frosted",
  backdropFilter: "blur(10px)",
  boxShadow: "{shadows.surface.edge}, {shadows.popover}",
});

const divider = css({
  width: "1px",
  alignSelf: "stretch",
  marginBlock: "1",
  bg: "surface.edge",
});

export const Dock = memo(function Dock({
  folders,
  activeFolder,
  hasUnreadReleaseNotes,
  onFolderClick,
  onToggleEditMode,
  onOpenWhatsNew,
  onOpenSettings,
}: DockProps) {
  const { t } = useTranslation();

  return (
    <div className={dock}>
      <TooltipProvider delay={50} closeDelay={50}>
        {folders.map((f) => {
          return (
            <FolderButton
              key={f.id}
              folder={f}
              sidebarOrientation="horizontal"
              active={activeFolder === f}
              onClick={() => {
                onFolderClick(f);
              }}
            />
          );
        })}
        <div className={divider} />
        <SidebarButton
          sidebarOrientation="horizontal"
          layoutId="whats-new"
          icon={builtinIcons.newspaper}
          name={t("whatsNew")}
          withRedDot={hasUnreadReleaseNotes ?? false}
          onClick={onOpenWhatsNew}
        />
        <SidebarButton
          sidebarOrientation="horizontal"
          layoutId="edit-folder"
          icon={builtinIcons.pencil}
          name={t("editFolder")}
          onClick={onToggleEditMode}
        />
        <SidebarButton
          sidebarOrientation="horizontal"
          layoutId="settings"
          icon={builtinIcons.settings}
          name={t("settings.title")}
          onClick={onOpenSettings}
        />
      </TooltipProvider>
    </div>
  );
});
