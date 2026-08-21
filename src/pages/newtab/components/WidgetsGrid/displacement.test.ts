import type { GridDimensions } from "@anori/utils/grid/types";
import type { WidgetInFolderWithMeta } from "@anori/utils/user-data/types";
import { describe, expect, it } from "vitest";
import { computeDisplacedMoves } from "./displacement";

const grid = (columns: number, rows = 10, restrictedBand?: { colStart: number; colEnd: number }): GridDimensions => ({
  boxSize: 100,
  columns,
  rows,
  minColumns: columns,
  minRows: rows,
  restrictedBand,
});

const widget = (instanceId: string, x: number, y: number, width = 2, height = 1): WidgetInFolderWithMeta =>
  ({ instanceId, x, y, width, height }) as WidgetInFolderWithMeta;

describe("computeDisplacedMoves with restricted band", () => {
  const bandedGrid = grid(12, 10, { colStart: 3, colEnd: 9 });

  it("refuses a drag whose target overlaps the band", () => {
    const moves = computeDisplacedMoves(bandedGrid, [], widget("a", 0, 0), { x: 2, y: 0 });
    expect(moves).toBeNull();
  });

  it("allows a drag to a side lane", () => {
    const moves = computeDisplacedMoves(bandedGrid, [], widget("a", 0, 0), { x: 9, y: 0 });
    expect(moves).toEqual([]);
  });

  it("never pushes displaced widgets into the band", () => {
    const layout = [widget("a", 9, 0), widget("b", 9, 1), widget("c", 0, 0), widget("d", 0, 2)];
    const moves = computeDisplacedMoves(bandedGrid, layout, widget("mover", 0, 1), { x: 0, y: 0 });
    for (const move of moves ?? []) {
      const item = layout.find((w) => w.instanceId === move.instanceId);
      if (!item) continue;
      const overlapsBand = move.position.x < 9 && move.position.x + item.width > 3;
      expect(overlapsBand).toBe(false);
    }
  });

  it("behaves like before when no band is set", () => {
    const plainGrid = grid(12, 10);
    const moves = computeDisplacedMoves(plainGrid, [], widget("a", 0, 0), { x: 4, y: 0 });
    expect(moves).toEqual([]);
  });
});
