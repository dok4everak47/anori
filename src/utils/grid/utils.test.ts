import { describe, expect, it } from "vitest";
import type { GridDimensions } from "./types";
import { canPlaceItemInGrid, findPositionForItemInGrid } from "./utils";

const grid = (columns: number, rows = 10): GridDimensions => ({
  boxSize: 100,
  columns,
  rows,
  minColumns: columns,
  minRows: rows,
});

describe("canPlaceItemInGrid", () => {
  it("accepts in-bounds empty cells", () => {
    expect(
      canPlaceItemInGrid({ grid: grid(12), layout: [], item: { width: 2, height: 1 }, position: { x: 2, y: 0 } }),
    ).toBe(true);
  });

  it("rejects out-of-bounds positions", () => {
    expect(
      canPlaceItemInGrid({ grid: grid(12), layout: [], item: { width: 3, height: 1 }, position: { x: 10, y: 0 } }),
    ).toBe(false);
  });

  it("rejects overlap with other widgets", () => {
    const layout = [{ x: 0, y: 0, width: 2, height: 1 }];
    expect(
      canPlaceItemInGrid({ grid: grid(12), layout, item: { width: 2, height: 1 }, position: { x: 1, y: 0 } }),
    ).toBe(false);
  });
});

describe("findPositionForItemInGrid", () => {
  it("returns the first free cell", () => {
    expect(findPositionForItemInGrid({ grid: grid(12), layout: [], item: { width: 2, height: 1 } })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("finds space after existing widgets", () => {
    const layout = Array.from({ length: 36 }, (_, idx) => ({
      x: (idx % 3) * 2,
      y: Math.floor(idx / 3),
      width: 2,
      height: 1,
    }));
    const position = findPositionForItemInGrid({ grid: grid(12), layout, item: { width: 2, height: 1 } });
    expect(position).toEqual({ x: 6, y: 0 });
  });

  it("returns false when no cell fits", () => {
    const layout = [{ x: 0, y: 0, width: 12, height: 10 }];
    expect(findPositionForItemInGrid({ grid: grid(12), layout, item: { width: 1, height: 1 } })).toBe(false);
  });
});
