import { Onboarding } from "@anori/components/Onboarding";
import { WidgetCard } from "@anori/components/WidgetCard/WidgetCard";
import { MotionScrollArea } from "@anori/design-system/components/ScrollArea/ScrollArea";
import type { GridDimensions, GridItemSize, GridPosition } from "@anori/utils/grid/types";
import { canPlaceItemInGrid, positionToPixelPosition } from "@anori/utils/grid/utils";
import type { Mapping } from "@anori/utils/types";
import type { WidgetInFolderWithMeta } from "@anori/utils/user-data/types";
import { AnimatePresence, m } from "motion/react";
import { memo, type Ref, useState } from "react";
import { css, cva } from "styled-system/css";
import { computeDisplacedMoves, resizePushDirection } from "./displacement";
import { useDragSnapPosition } from "./use-drag-snap-position";

const grid = css({ flexGrow: 1, alignSelf: "stretch", position: "relative", display: "flex" });
const gridViewport = css({
  display: "flex",
  flexGrow: 1,
  "& > div": { display: "flex", flexGrow: 1, alignItems: "stretch" },
});
const relativeWrapper = cva({
  base: { position: "relative", flexGrow: 1 },
  variants: { onboarding: { true: { display: "flex", justifyContent: "center", alignItems: "center" } } },
});

const ghostRect = css({
  position: "absolute",
  top: 0,
  left: 0,
  background: "frosted.strong",
  borderRadius: "lg",
  userSelect: "none",
  pointerEvents: "none",
});

const ghostSpring = { type: "spring", duration: 0.25, bounce: 0.1 } as const;

export type LayoutChange =
  | {
      type: "change-position";
      instanceId: string;
      newPosition: GridPosition;
    }
  | {
      type: "move-to-folder";
      instanceId: string;
      folderId: string;
    }
  | {
      type: "remove";
      instanceId: string;
    }
  | {
      type: "resize";
      instanceId: string;
      width: number;
      height: number;
      position?: GridPosition;
    };

export type WidgetsGridProps = {
  gridDimensions: GridDimensions & { isMeasured: boolean };
  gapSize: number;
  layout: WidgetInFolderWithMeta[];
  onEditWidget: (w: WidgetInFolderWithMeta) => void;
  onUpdateWidgetConfig: (instaceId: string, config: Partial<Mapping>) => void;
  onLayoutUpdate?: (changes: LayoutChange[]) => void;
  showOnboarding?: boolean;
  animateEntrance?: boolean;
  deferWidgets?: boolean;
  gridRef?: Ref<HTMLDivElement>;
  scrollAreaRef?: Ref<HTMLDivElement>;
};

export const WidgetsGrid = memo(function WidgetsGrid({
  gridDimensions,
  gapSize,
  layout,
  onUpdateWidgetConfig,
  onEditWidget,
  showOnboarding,
  animateEntrance = false,
  deferWidgets = false,
  onLayoutUpdate = () => {},
  gridRef,
  scrollAreaRef,
}: WidgetsGridProps) {
  const tryRepositionWidget = (widget: WidgetInFolderWithMeta, position: GridPosition) => {
    const canPlaceThere = canPlaceItemInGrid({
      grid: gridDimensions,
      item: widget,
      layout: layout.filter((w) => w.instanceId !== widget.instanceId),
      position,
      allowOutOfBounds: false,
    });
    if (canPlaceThere) {
      onLayoutUpdate([{ type: "change-position", instanceId: widget.instanceId, newPosition: position }]);
    }
  };

  const clampResizeToGrid = (
    widget: WidgetInFolderWithMeta,
    size: GridItemSize,
    position?: GridPosition,
  ): GridItemSize & GridPosition => ({
    width: Math.min(size.width, gridDimensions.columns - (position?.x ?? widget.x)),
    height: Math.min(size.height, gridDimensions.rows - (position?.y ?? widget.y)),
    x: position?.x ?? widget.x,
    y: position?.y ?? widget.y,
  });

  const tryResizeWidget = (
    widget: WidgetInFolderWithMeta,
    widthInBoxes: number,
    heightInBoxes: number,
    positionInBoxes?: Partial<GridPosition>,
  ) => {
    const targetPosition = { x: positionInBoxes?.x ?? widget.x, y: positionInBoxes?.y ?? widget.y };
    const clamped = clampResizeToGrid(widget, { width: widthInBoxes, height: heightInBoxes }, targetPosition);
    const finalPosition = { x: clamped.x, y: clamped.y };
    widthInBoxes = clamped.width;
    heightInBoxes = clamped.height;

    if (
      widget.width === widthInBoxes &&
      widget.height === heightInBoxes &&
      widget.x === finalPosition.x &&
      widget.y === finalPosition.y
    ) {
      return false;
    }
    const moves = computeDisplacedMoves(
      gridDimensions,
      layout,
      { ...widget, width: widthInBoxes, height: heightInBoxes },
      finalPosition,
      resizePushDirection(widget, { width: widthInBoxes, height: heightInBoxes }),
    );
    if (!moves) return false;
    onLayoutUpdate([
      {
        type: "resize",
        instanceId: widget.instanceId,
        width: widthInBoxes,
        height: heightInBoxes,
        position: finalPosition,
      },
      ...moves.map((move) => ({
        type: "change-position" as const,
        instanceId: move.instanceId,
        newPosition: move.position,
      })),
    ]);
    return true;
  };

  const convertUnitsToPixels = (unit: number) => unit * gridDimensions.boxSize - gapSize * 2;

  const snap = useDragSnapPosition(gridDimensions, layout, (moves) => {
    onLayoutUpdate(
      moves.map((move) => ({ type: "change-position", instanceId: move.instanceId, newPosition: move.position })),
    );
  });
  const [resizePreview, setResizePreview] = useState<
    ({ instanceId: string } & GridItemSize & Partial<GridPosition>) | null
  >(null);
  const resizeItem = resizePreview ? layout.find((w) => w.instanceId === resizePreview.instanceId) : undefined;
  const resizeMoves =
    resizePreview && resizeItem
      ? computeDisplacedMoves(
          gridDimensions,
          layout,
          { ...resizeItem, width: resizePreview.width, height: resizePreview.height },
          { x: resizePreview.x ?? resizeItem.x, y: resizePreview.y ?? resizeItem.y },
          resizePushDirection(resizeItem, resizePreview),
        )
      : null;

  const snapOverrideFor = (instanceId: string): GridPosition | undefined => {
    if (snap) {
      if (snap.instanceId === instanceId) return snap.position;
      const displaced = snap.displaced.find((m) => m.instanceId === instanceId);
      if (displaced) return displaced.position;
    }
    return resizeMoves?.find((m) => m.instanceId === instanceId)?.position;
  };
  const draggedItem = snap ? layout.find((w) => w.instanceId === snap.instanceId) : undefined;

  const ghost =
    snap && draggedItem
      ? { position: snap.position, width: draggedItem.width, height: draggedItem.height }
      : resizePreview && resizeItem
        ? {
            position: { x: resizePreview.x ?? resizeItem.x, y: resizePreview.y ?? resizeItem.y },
            width: resizePreview.width,
            height: resizePreview.height,
          }
        : null;

  const maxWidthPx = convertUnitsToPixels(gridDimensions.columns) + gapSize * 2;
  const maxHeightPx = convertUnitsToPixels(gridDimensions.rows) + gapSize * 2;

  return (
    <MotionScrollArea
      className={grid}
      viewportClassName={gridViewport}
      layout
      layoutRoot
      layoutScroll
      direction="both"
      type="hover"
      color="translucent"
      viewportRef={scrollAreaRef}
    >
      <div className={relativeWrapper({ onboarding: showOnboarding })} ref={gridRef}>
        <AnimatePresence initial={false}>
          <div
            style={{
              width: maxWidthPx,
              height: maxHeightPx,
              background: "wheat",
              pointerEvents: "none",
              opacity: 0,
            }}
          />
          {gridDimensions.isMeasured &&
            !deferWidgets &&
            layout.map((w) => {
              const entranceDelay = animateEntrance ? Math.min((w.x + w.y) * 0.06, 0.6) : undefined;
              return (
                <WidgetCard
                  type="widget"
                  widget={w.widget}
                  plugin={w.plugin}
                  instanceId={w.instanceId}
                  config={w.configuration}
                  key={w.instanceId}
                  size={w}
                  position={w}
                  entranceDelay={entranceDelay}
                  onUpdateConfig={onUpdateWidgetConfig}
                  onRemove={() => onLayoutUpdate([{ type: "remove", instanceId: w.instanceId }])}
                  onEdit={w.widget.configurationScreen ? () => onEditWidget(w) : undefined}
                  onResize={(width, height, newPosition) => tryResizeWidget(w, width, height, newPosition)}
                  onResizePreview={(previewSize) =>
                    setResizePreview(
                      previewSize
                        ? {
                            instanceId: w.instanceId,
                            ...clampResizeToGrid(w, previewSize, {
                              x: previewSize.x ?? w.x,
                              y: previewSize.y ?? w.y,
                            }),
                          }
                        : null,
                    )
                  }
                  onMoveToFolder={(folderId) =>
                    onLayoutUpdate([{ type: "move-to-folder", instanceId: w.instanceId, folderId: folderId }])
                  }
                  onPositionChange={(p) => tryRepositionWidget(w, p)}
                  dragSnapPosition={
                    snap && snap.instanceId === w.instanceId ? undefined : snapOverrideFor(w.instanceId)
                  }
                />
              );
            })}
        </AnimatePresence>

        {ghost && (
          <m.div
            className={ghostRect}
            initial={false}
            animate={{
              x: positionToPixelPosition({ grid: gridDimensions, position: ghost.position }).x,
              y: positionToPixelPosition({ grid: gridDimensions, position: ghost.position }).y,
              width: convertUnitsToPixels(ghost.width),
              height: convertUnitsToPixels(ghost.height),
            }}
            transition={ghostSpring}
            style={{ margin: gapSize }}
          />
        )}

        {showOnboarding && <Onboarding gridDimensions={gridDimensions} />}
      </div>
    </MotionScrollArea>
  );
});
