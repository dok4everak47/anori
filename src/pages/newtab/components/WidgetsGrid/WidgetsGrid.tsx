import { Onboarding } from "@anori/components/Onboarding";
import { WidgetCard } from "@anori/components/WidgetCard/WidgetCard";
import { MotionScrollArea } from "@anori/design-system/components/ScrollArea/ScrollArea";
import type { GridDimensions, GridItemSize, GridPosition } from "@anori/utils/grid/types";
import { canPlaceItemInGrid, GRID_DRAG_EXTEND_SLOTS, positionToPixelPosition } from "@anori/utils/grid/utils";
import { useWidgetSelection } from "@anori/utils/selection";
import type { Mapping } from "@anori/utils/types";
import type { WidgetInFolderWithMeta } from "@anori/utils/user-data/types";
import { AnimatePresence, m } from "motion/react";
import { type KeyboardEventHandler, memo, type Ref, useCallback, useEffect, useRef, useState } from "react";
import { css, cva } from "styled-system/css";
import { ContextMenu, type ContextMenuAction } from "../ContextMenu/ContextMenu";
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

const restrictedBandVisual = css({
  position: "absolute",
  top: 0,
  pointerEvents: "none",
  background: "frosted",
  borderInline: "1px dashed",
  borderColor: "accent",
  opacity: 0.7,
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
    };

export type WidgetsGridProps = {
  isEditing: boolean;
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
  isEditing,
}: WidgetsGridProps) {
  const { focusIndex, setFocusIndex, select, clear } = useWidgetSelection();
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const [contextMenu, setContextMenu] = useState<{
    widget: WidgetInFolderWithMeta;
    position: { x: number; y: number };
  } | null>(null);

  const _handleContextMenu = useCallback((w: WidgetInFolderWithMeta) => {
    return (e: { x: number; y: number }) => {
      setContextMenu({ widget: w, position: e });
    };
  }, []);

  const getContextMenuActions = useCallback(
    (w: WidgetInFolderWithMeta): ContextMenuAction[] => {
      const actions: ContextMenuAction[] = [];
      actions.push({
        id: "open",
        label: "Open",
        action: () => {
          const link = w.configuration?.url ?? w.configuration?.link;
          if (typeof link === "string") {
            window.open(link, "_self");
          }
        },
      });
      actions.push({
        id: "open-new-tab",
        label: "Open in New Tab",
        action: () => {
          const link = w.configuration?.url ?? w.configuration?.link;
          if (typeof link === "string") {
            window.open(link, "_blank");
          }
        },
      });
      actions.push({ id: "divider-1", label: "", divider: true, action: () => {} });
      actions.push({
        id: "copy-url",
        label: "Copy URL",
        action: () => {
          const link = w.configuration?.url ?? w.configuration?.link;
          if (typeof link === "string") {
            navigator.clipboard.writeText(link);
          }
        },
      });
      if (w.widget.configurationScreen) {
        actions.push({
          id: "edit",
          label: "Edit",
          action: () => onEditWidget(w),
        });
      }
      actions.push({ id: "divider-2", label: "", divider: true, action: () => {} });
      actions.push({
        id: "remove",
        label: "Delete",
        action: () => onLayoutUpdate([{ type: "remove", instanceId: w.instanceId }]),
      });
      return actions;
    },
    [onEditWidget, onLayoutUpdate],
  );

  const tryRepositionWidget = (widget: WidgetInFolderWithMeta, position: GridPosition) => {
    const canPlaceThere = canPlaceItemInGrid({
      grid: gridDimensions,
      item: widget,
      layout: layout.filter((w) => w.instanceId !== widget.instanceId),
      position,
      allowOutOfBounds: true,
    });
    if (canPlaceThere) {
      onLayoutUpdate([{ type: "change-position", instanceId: widget.instanceId, newPosition: position }]);
    }
  };

  const clampSizeToExtendedGrid = (widget: WidgetInFolderWithMeta, size: GridItemSize): GridItemSize => {
    const band = gridDimensions.restrictedBand;
    const maxWidth = Math.min(size.width, gridDimensions.columns + GRID_DRAG_EXTEND_SLOTS - widget.x);
    return {
      width: band && widget.x < band.colStart ? Math.min(maxWidth, band.colStart - widget.x) : maxWidth,
      height: Math.min(size.height, gridDimensions.rows + GRID_DRAG_EXTEND_SLOTS - widget.y),
    };
  };

  const tryResizeWidget = (widget: WidgetInFolderWithMeta, widthInBoxes: number, heightInBoxes: number) => {
    ({ width: widthInBoxes, height: heightInBoxes } = clampSizeToExtendedGrid(widget, {
      width: widthInBoxes,
      height: heightInBoxes,
    }));

    if (widget.width === widthInBoxes && widget.height === heightInBoxes) {
      return false;
    }
    const moves = computeDisplacedMoves(
      gridDimensions,
      layout,
      { ...widget, width: widthInBoxes, height: heightInBoxes },
      { x: widget.x, y: widget.y },
      resizePushDirection(widget, { width: widthInBoxes, height: heightInBoxes }),
    );
    if (!moves) return false;
    onLayoutUpdate([
      {
        type: "resize",
        instanceId: widget.instanceId,
        width: widthInBoxes,
        height: heightInBoxes,
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
  const [resizePreview, setResizePreview] = useState<{ instanceId: string; width: number; height: number } | null>(
    null,
  );
  const resizeItem = resizePreview ? layout.find((w) => w.instanceId === resizePreview.instanceId) : undefined;
  const resizeMoves =
    resizePreview && resizeItem
      ? computeDisplacedMoves(
          gridDimensions,
          layout,
          { ...resizeItem, width: resizePreview.width, height: resizePreview.height },
          { x: resizeItem.x, y: resizeItem.y },
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
  const effectivePosition = (w: WidgetInFolderWithMeta): GridPosition => snapOverrideFor(w.instanceId) ?? w;
  const effectiveSize = (w: WidgetInFolderWithMeta): GridItemSize =>
    resizePreview && resizePreview.instanceId === w.instanceId ? resizePreview : w;
  const draggedItem = snap ? layout.find((w) => w.instanceId === snap.instanceId) : undefined;

  const ghost =
    snap && draggedItem
      ? { position: snap.position, width: draggedItem.width, height: draggedItem.height }
      : resizePreview && resizeItem
        ? { position: { x: resizeItem.x, y: resizeItem.y }, width: resizePreview.width, height: resizePreview.height }
        : null;

  const handleKeyDown: KeyboardEventHandler = useCallback(
    (e) => {
      if (contextMenu) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusIndex(Math.min(focusIndex + 1, layout.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusIndex(Math.max(focusIndex - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          const w = layout[focusIndex];
          if (w) {
            const link = w.configuration?.url ?? w.configuration?.link;
            if (typeof link === "string") {
              window.open(link, "_self");
            }
          }
          break;
        }
        case "Escape":
          if (focusIndex >= 0) {
            e.preventDefault();
            setFocusIndex(-1);
            clear();
          }
          break;
      }
    },
    [contextMenu, focusIndex, layout, setFocusIndex, clear],
  );

  useEffect(() => {
    if (focusIndex >= 0 && focusIndex < layout.length) {
      const el = gridContainerRef.current?.querySelector(`[data-focus-index="${focusIndex}"]`);
      if (el instanceof HTMLElement) {
        el.focus();
      }
    }
  }, [focusIndex, layout.length]);

  const maxWidthPx =
    convertUnitsToPixels(
      Math.max(0, ...layout.map((w) => Math.max(w.x + w.width, effectivePosition(w).x + effectiveSize(w).width))),
    ) +
    gapSize * 2;
  const maxHeightPx =
    convertUnitsToPixels(
      Math.max(0, ...layout.map((w) => Math.max(w.y + w.height, effectivePosition(w).y + effectiveSize(w).height))),
    ) +
    gapSize * 2;

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
      ref={scrollAreaRef}
    >
      <div
        role="grid"
        className={relativeWrapper({ onboarding: showOnboarding })}
        ref={gridRef}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
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
            layout.map((w, idx) => {
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
                  tabIndex={0}
                  data-focus-index={idx}
                  onFocus={() => {
                    setFocusIndex(idx);
                    select({
                      instanceId: w.instanceId,
                      widgetId: w.widget.id,
                      pluginId: w.plugin.id,
                    });
                  }}
                  onUpdateConfig={onUpdateWidgetConfig}
                  onRemove={() => onLayoutUpdate([{ type: "remove", instanceId: w.instanceId }])}
                  onEdit={w.widget.configurationScreen ? () => onEditWidget(w) : undefined}
                  onResize={(width, height) => tryResizeWidget(w, width, height)}
                  onResizePreview={(previewSize) =>
                    setResizePreview(
                      previewSize ? { instanceId: w.instanceId, ...clampSizeToExtendedGrid(w, previewSize) } : null,
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

        {gridDimensions.isMeasured && gridDimensions.restrictedBand && isEditing && (
          <div
            className={restrictedBandVisual}
            style={{
              left: gridDimensions.restrictedBand.colStart * gridDimensions.boxSize,
              width:
                (gridDimensions.restrictedBand.colEnd - gridDimensions.restrictedBand.colStart) *
                gridDimensions.boxSize,
              height: gridDimensions.rows * gridDimensions.boxSize,
            }}
          />
        )}

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

        {contextMenu && (
          <ContextMenu
            actions={getContextMenuActions(contextMenu.widget)}
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </MotionScrollArea>
  );
});
