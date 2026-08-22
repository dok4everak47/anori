import type { GridDimensions } from "@anori/utils/grid/types";
import type { WidgetInFolderWithMeta } from "@anori/utils/user-data/types";
import { describe, expect, it } from "vitest";
import { computeDisplacedMoves } from "./displacement";

const grid = (columns: number, rows = 10): GridDimensions => ({
  boxSize: 100,
  columns,
  rows,
  minColumns: columns,
  minRows: rows,
});

const widget = (instanceId: string, x: number, y: number, width = 2, height = 1): WidgetInFolderWithMeta =>
  ({ instanceId, x, y, width, height }) as WidgetInFolderWithMeta;

describe("computeDisplacedMoves", () => {
  it("returns no moves for an empty destination", () => {
    const moves = computeDisplacedMoves(grid(12), [], widget("a", 0, 0), { x: 4, y: 0 });
    expect(moves).toEqual([]);
  });

  it("pushes overlapped widgets downward during resize", () => {
    const layout = [widget("a", 4, 0, 2, 1), widget("b", 4, 1, 2, 1)];
    const moves = computeDisplacedMoves(grid(12), layout, widget("mover", 4, 0, 2, 2), { x: 4, y: 0 });
    expect(moves).toContainEqual({ instanceId: "a", position: { x: 4, y: 2 } });
    expect(moves).toContainEqual({ instanceId: "b", position: { x: 4, y: 3 } });
  });

  it("does not create duplicate destination positions", () => {
    const layout = [widget("a", 4, 0), widget("b", 5, 0)];
    const moves = computeDisplacedMoves(grid(12), layout, widget("mover", 0, 0), { x: 4, y: 0 });
    const positions = new Set(moves?.map((move) => `${move.position.x}:${move.position.y}`));
    expect(positions.size).toBe(moves?.length);
  });
});
