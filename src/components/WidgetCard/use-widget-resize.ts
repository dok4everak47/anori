import { useSizeSettings } from "@anori/utils/compact";
import { useParentFolder } from "@anori/utils/FolderContentContext";
import type { GridItemSize, GridPosition } from "@anori/utils/grid/types";
import { useMirrorStateToRef, useOnChangeLayoutEffect } from "@anori/utils/hooks";
import { minmax } from "@anori/utils/misc";
import { useDerivedMotionValue } from "@anori/utils/motion/derived-motion.value";
import type { SomeWidget } from "@anori/utils/plugins/types";
import { useMotionValue } from "motion/react";
import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef, useState } from "react";

const AUTOSCROLL_ZONE_PX = 80;
const AUTOSCROLL_MAX_SPEED_PX_PER_FRAME = 12;

export type ResizeCorner = "nw" | "ne" | "sw" | "se";
export type ResizePreview = GridItemSize & Partial<GridPosition>;

const autoscrollVelocity = (pos: number, start: number, end: number) => {
  if (pos < start + AUTOSCROLL_ZONE_PX) {
    return -AUTOSCROLL_MAX_SPEED_PX_PER_FRAME * minmax((start + AUTOSCROLL_ZONE_PX - pos) / AUTOSCROLL_ZONE_PX, 0, 1);
  }
  if (pos > end - AUTOSCROLL_ZONE_PX) {
    return AUTOSCROLL_MAX_SPEED_PX_PER_FRAME * minmax((pos - (end - AUTOSCROLL_ZONE_PX)) / AUTOSCROLL_ZONE_PX, 0, 1);
  }
  return 0;
};

const findScrollContainer = (el: HTMLElement | null): HTMLElement | null => {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if (/auto|scroll/.test(overflowX + overflowY)) return node;
  }
  return null;
};

export type UseWidgetResizeOptions = {
  resizable: SomeWidget["appearance"]["resizable"];
  size: GridItemSize;
  position?: GridPosition;
  cardRef: RefObject<HTMLDivElement | null>;
  onResize?: (newWidth: number, newHeight: number, newPosition?: Partial<GridPosition>) => boolean | undefined;
  onResizePreview?: (size: ResizePreview | null) => void;
};

export const useWidgetResize = ({
  resizable,
  size,
  position,
  cardRef,
  onResize,
  onResizePreview,
}: UseWidgetResizeOptions) => {
  const { grid } = useParentFolder();
  const { gapSize } = useSizeSettings();

  const convertUnitsToPixels = (unit: number) => unit * grid.boxSize - gapSize * 2;

  const startResize = (corner: ResizeCorner) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeActive.current = true;
    resizeCorner.current = corner;
    resizeStartPointer.current = { x: e.clientX, y: e.clientY };
    resizePointer.current = { x: e.clientX, y: e.clientY };
    resizeStartRect.current = {
      left: (position?.x ?? 0) * grid.boxSize + gapSize,
      top: (position?.y ?? 0) * grid.boxSize + gapSize,
      right: ((position?.x ?? 0) + size.width) * grid.boxSize - gapSize,
      bottom: ((position?.y ?? 0) + size.height) * grid.boxSize - gapSize,
    };
    resizeScrollContainer.current = findScrollContainer(cardRef.current);
    resizeScrollStart.current = {
      left: resizeScrollContainer.current?.scrollLeft ?? 0,
      top: resizeScrollContainer.current?.scrollTop ?? 0,
    };
    startResizeAutoscroll();
    setIsResizing(true);
    setActiveCorner(corner);
    onResizePreview?.({ width: size.width, height: size.height, x: position?.x, y: position?.y });
  };

  const startResizeAutoscroll = () => {
    const step = () => {
      if (!resizeActive.current) {
        autoscrollFrame.current = null;
        return;
      }
      const container = resizeScrollContainer.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const vx = autoscrollVelocity(resizePointer.current.x, rect.left, rect.right);
        const vy = autoscrollVelocity(resizePointer.current.y, rect.top, rect.bottom);
        if (vx !== 0 || vy !== 0) {
          container.scrollLeft += vx;
          container.scrollTop += vy;
          applyResizeRef.current();
        }
      }
      autoscrollFrame.current = requestAnimationFrame(step);
    };
    autoscrollFrame.current = requestAnimationFrame(step);
  };

  const updateResize = (e: ReactPointerEvent<HTMLButtonElement>) => {
    resizePointer.current = { x: e.clientX, y: e.clientY };
    applyResize();
  };

  const applyResize = () => {
    if (!resizeActive.current || !resizable || !position) return;
    const minWidth = resizable === true ? 1 : (resizable.min?.width ?? 1);
    const minHeight = resizable === true ? 1 : (resizable.min?.height ?? 1);
    const minWidthPx = convertUnitsToPixels(minWidth);
    const minHeightPx = convertUnitsToPixels(minHeight);
    const scrollDriftX = (resizeScrollContainer.current?.scrollLeft ?? 0) - resizeScrollStart.current.left;
    const scrollDriftY = (resizeScrollContainer.current?.scrollTop ?? 0) - resizeScrollStart.current.top;
    const deltaX = resizePointer.current.x - resizeStartPointer.current.x + scrollDriftX;
    const deltaY = resizePointer.current.y - resizeStartPointer.current.y + scrollDriftY;
    const corner = resizeCorner.current;
    let left = resizeStartRect.current.left;
    let top = resizeStartRect.current.top;
    let right = resizeStartRect.current.right;
    let bottom = resizeStartRect.current.bottom;

    if (corner === "nw" || corner === "ne") top = resizeStartRect.current.top + deltaY;
    if (corner === "sw" || corner === "se") bottom = resizeStartRect.current.bottom + deltaY;
    if (corner === "nw" || corner === "sw") left = resizeStartRect.current.left + deltaX;
    if (corner === "ne" || corner === "se") right = resizeStartRect.current.right + deltaX;

    if (right - left < minWidthPx) {
      if (corner === "nw" || corner === "sw") left = right - minWidthPx;
      else right = left + minWidthPx;
    }
    if (bottom - top < minHeightPx) {
      if (corner === "nw" || corner === "ne") top = bottom - minHeightPx;
      else bottom = top + minHeightPx;
    }

    const minEdge = gapSize;
    const maxRight = grid.columns * grid.boxSize - gapSize;
    const maxBottom = grid.rows * grid.boxSize - gapSize;
    left = minmax(left, minEdge, right - minWidthPx);
    top = minmax(top, minEdge, bottom - minHeightPx);
    right = minmax(right, left + minWidthPx, maxRight);
    bottom = minmax(bottom, top + minHeightPx, maxBottom);

    const xUnits = minmax(Math.round((left - gapSize) / grid.boxSize), 0, grid.columns - minWidth);
    const yUnits = minmax(Math.round((top - gapSize) / grid.boxSize), 0, grid.rows - minHeight);
    const rightUnits = Math.min(grid.columns, Math.round((right - gapSize) / grid.boxSize));
    const bottomUnits = Math.min(grid.rows, Math.round((bottom - gapSize) / grid.boxSize));
    const newWidthUnits = minmax(rightUnits - xUnits, minWidth, grid.columns - xUnits);
    const newHeightUnits = minmax(bottomUnits - yUnits, minHeight, grid.rows - yUnits);
    const newX = corner === "nw" || corner === "sw" ? xUnits : position.x;
    const newY = corner === "nw" || corner === "ne" ? yUnits : position.y;

    if (xUnits !== positionXUnits) setPositionXUnits(xUnits);
    if (yUnits !== positionYUnits) setPositionYUnits(yUnits);
    if (widthUnits !== newWidthUnits) setWidthUnits(newWidthUnits);
    if (heightUnits !== newHeightUnits) setHeightUnits(newHeightUnits);
    if (
      xUnits !== positionXUnits ||
      yUnits !== positionYUnits ||
      widthUnits !== newWidthUnits ||
      heightUnits !== newHeightUnits
    ) {
      onResizePreview?.({
        width: newWidthUnits,
        height: newHeightUnits,
        ...((corner === "nw" || corner === "sw") && { x: newX }),
        ...((corner === "nw" || corner === "ne") && { y: newY }),
      });
    }
    resizeX.set(left);
    resizeY.set(top);
    resizeWidth.set(right - left);
    resizeHeight.set(bottom - top);
  };

  const finishResize = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!resizeActive.current) return;
    const corner = resizeCorner.current;
    resizeActive.current = false;
    if (autoscrollFrame.current !== null) {
      cancelAnimationFrame(autoscrollFrame.current);
      autoscrollFrame.current = null;
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsResizing(false);
    setActiveCorner(null);
    onResizePreview?.(null);
    let shouldReset = true;
    const finalPosition = position
      ? {
          ...(corner === "nw" || corner === "sw" ? { x: positionXUnits } : {}),
          ...(corner === "nw" || corner === "ne" ? { y: positionYUnits } : {}),
        }
      : undefined;
    if (onResize) {
      shouldReset = !onResize(
        widthUnits,
        heightUnits,
        Object.keys(finalPosition ?? {}).length ? finalPosition : undefined,
      );
    }
    if (shouldReset) {
      resizeX.set(position ? position.x * grid.boxSize + gapSize : 0);
      resizeY.set(position ? position.y * grid.boxSize + gapSize : 0);
      resizeWidth.set(convertUnitsToPixels(size.width));
      resizeHeight.set(convertUnitsToPixels(size.height));
      setPositionXUnits(position?.x ?? 0);
      setPositionYUnits(position?.y ?? 0);
      setWidthUnits(size.width);
      setHeightUnits(size.height);
    }
  };

  const resizeActive = useRef(false);
  const resizeCorner = useRef<ResizeCorner>("se");
  const resizePointer = useRef({ x: 0, y: 0 });
  const resizeStartPointer = useRef({ x: 0, y: 0 });
  const resizeStartRect = useRef({ left: 0, top: 0, right: 0, bottom: 0 });
  const resizeScrollContainer = useRef<HTMLElement | null>(null);
  const resizeScrollStart = useRef({ left: 0, top: 0 });
  const autoscrollFrame = useRef<number | null>(null);
  const applyResizeRef = useMirrorStateToRef(applyResize);

  useEffect(() => {
    return () => {
      if (autoscrollFrame.current !== null) cancelAnimationFrame(autoscrollFrame.current);
    };
  }, []);

  const resizeX = useMotionValue(position ? position.x * grid.boxSize : 0);
  const resizeY = useMotionValue(position ? position.y * grid.boxSize : 0);
  const resizeWidth = useMotionValue(convertUnitsToPixels(size.width));
  const resizeHeight = useMotionValue(convertUnitsToPixels(size.height));
  const x = useDerivedMotionValue(resizeX, (v) => v);
  const y = useDerivedMotionValue(resizeY, (v) => v);
  const width = useDerivedMotionValue(resizeWidth, (v) => v);
  const height = useDerivedMotionValue(resizeHeight, (v) => v);
  const [isResizing, setIsResizing] = useState(false);
  const [activeCorner, setActiveCorner] = useState<ResizeCorner | null>(null);
  const [positionXUnits, setPositionXUnits] = useState(position?.x ?? 0);
  const [positionYUnits, setPositionYUnits] = useState(position?.y ?? 0);
  const [widthUnits, setWidthUnits] = useState(size.width);
  const [heightUnits, setHeightUnits] = useState(size.height);

  useOnChangeLayoutEffect(() => {
    resizeX.set(position ? position.x * grid.boxSize + gapSize : 0);
    resizeY.set(position ? position.y * grid.boxSize + gapSize : 0);
    resizeWidth.set(convertUnitsToPixels(size.width));
    resizeHeight.set(convertUnitsToPixels(size.height));
    setPositionXUnits(position?.x ?? 0);
    setPositionYUnits(position?.y ?? 0);
    setWidthUnits(size.width);
    setHeightUnits(size.height);
    setIsResizing(false);
    setActiveCorner(null);
  }, [size.width, size.height, position?.x, position?.y, grid.boxSize, gapSize]);

  const createHandleProps = (corner: ResizeCorner) => ({
    onPointerDown: startResize(corner),
    onPointerMove: updateResize,
    onPointerUp: finishResize,
  });

  return {
    isResizing,
    activeCorner,
    x,
    y,
    width,
    height,
    xUnits: positionXUnits,
    yUnits: positionYUnits,
    widthUnits,
    heightUnits,
    handleProps: {
      nw: createHandleProps("nw"),
      ne: createHandleProps("ne"),
      sw: createHandleProps("sw"),
      se: createHandleProps("se"),
    },
  };
};
