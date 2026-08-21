import { useSizeSettings } from "@anori/utils/compact";
import type { GridDimensions, GridItemSize, GridPixelPosition } from "@anori/utils/grid/types";
import type { Mapping } from "@anori/utils/types";
import type { Folder, WidgetInFolderWithMeta } from "@anori/utils/user-data/types";
import { m } from "motion/react";
import { type CSSProperties, type Ref, useEffect, useState } from "react";
import { css, cx } from "styled-system/css";
import { DashboardHeader } from "./DashboardHeader/DashboardHeader";
import { type LayoutChange, WidgetsGrid } from "./WidgetsGrid/WidgetsGrid";

type FolderContentProps = {
  folder: Folder;
  animationDirection: "up" | "down" | "left" | "right" | null;
  isEditing: boolean;
  widgets: WidgetInFolderWithMeta[];
  gridDimensions: GridDimensions & {
    position: GridPixelPosition;
    pixelSize: GridItemSize;
    isMeasured: boolean;
  };
  gridRef: Ref<HTMLDivElement>;
  scrollAreaRef: Ref<HTMLDivElement>;
  onLayoutUpdate: (changes: LayoutChange[]) => void;
  onEditWidget: (widget: WidgetInFolderWithMeta) => void;
  onUpdateWidgetConfig: (instanceId: string, config: Partial<Mapping>) => void;
  showOnboarding: boolean;
};

const variants = {
  visible: {
    translateY: "0%",
    translateX: "0%",
    opacity: 1,
  },
  initial: (custom: "up" | "down" | "left" | "right") => {
    if (custom === "up") {
      return {
        translateY: "-35%",
        opacity: 0,
      };
    }
    if (custom === "down") {
      return {
        translateY: "35%",
        opacity: 0,
      };
    }
    if (custom === "left") {
      return {
        translateX: "-35%",
        opacity: 0,
      };
    }
    if (custom === "right") {
      return {
        translateX: "35%",
        opacity: 0,
      };
    }
    return {
      opacity: 0,
    };
  },
};

const folderChangeTransition = { type: "spring", duration: 0.4, bounce: 0.17 } as const;

const rootClass = css({
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-start",
  alignItems: "stretch",
  gap: "1",
  flexGrow: 1,
  alignSelf: "stretch",
  maxHeight: "100%",
  paddingInline: "4",
  backgroundImage:
    "radial-gradient(ellipse 60% 40% at 50% 0%, color-mix(in srgb, var(--ds-accent) 3%, transparent) 0%, transparent 60%)",
});

const gridWrapper = css({
  display: "flex",
  flexDirection: "column",
  flexGrow: 1,
  justifyContent: "center",
  alignItems: "center",
  minHeight: 0,
});

export const FolderContent = ({
  folder,
  animationDirection,
  isEditing,
  widgets,
  gridDimensions,
  gridRef,
  scrollAreaRef,
  onLayoutUpdate,
  onEditWidget,
  onUpdateWidgetConfig,
  showOnboarding,
}: FolderContentProps) => {
  const { blockSize, minBlockSize, gapSize } = useSizeSettings();
  const [entranceReady, setEntranceReady] = useState(() => window.__anoriEntranceReady === undefined);

  useEffect(() => {
    let cancelled = false;
    if (window.__anoriEntranceReady) {
      window.__anoriEntranceReady.then(() => {
        if (!cancelled) setEntranceReady(true);
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const deferWidgets = animationDirection === null && !entranceReady;
  const animateEntrance = animationDirection === null && entranceReady;

  return (
    <m.div
      key={`FolderContent-${folder.id}`}
      data-folder-id={folder.id}
      className={cx(rootClass, "FolderContent")}
      transition={animationDirection ? folderChangeTransition : { duration: 0 }}
      variants={variants}
      initial={animationDirection ? "initial" : false}
      animate="visible"
      custom={animationDirection}
      style={
        {
          "--widget-box-size": gridDimensions.boxSize,
          "--widget-box-size-px": `${gridDimensions.boxSize}px`,
          "--widget-box-percent": (gridDimensions.boxSize - minBlockSize) / (blockSize - minBlockSize),
        } as CSSProperties
      }
    >
      {!isEditing && !showOnboarding && <DashboardHeader folderName={folder.name} isHome={folder.id === "home"} />}
      <div className={gridWrapper}>
        <WidgetsGrid
          gridRef={gridRef}
          scrollAreaRef={scrollAreaRef}
          isEditing={isEditing}
          gapSize={gapSize}
          layout={widgets}
          gridDimensions={gridDimensions}
          onEditWidget={onEditWidget}
          onUpdateWidgetConfig={onUpdateWidgetConfig}
          onLayoutUpdate={onLayoutUpdate}
          animateEntrance={animateEntrance}
          deferWidgets={deferWidgets}
          showOnboarding={showOnboarding}
        />
      </div>
    </m.div>
  );
};
