import { describe, expect, it } from "vitest";
import type { GridDimensions } from "./types";
import { canPlaceItemInGrid, findFallbackPosition, findPositionForItemInGrid, overlapsRestrictedBand } from "./utils";

const gridWithBand = (columns: number, band: { colStart: number; colEnd: number }): GridDimensions => ({
  boxSize: 100,
  columns,
  rows: 10,
  minColumns: columns,
  minRows: 10,
  restrictedBand: band,
});

describe("overlapsRestrictedBand", () => {
  const band = { colStart: 3, colEnd: 9 };

  it("rejects items spanning the band", () => {
    expect(overlapsRestrictedBand(band, { x: 2, y: 0 }, { width: 2, height: 1 })).toBe(true);
    expect(overlapsRestrictedBand(band, { x: 8, y: 5 }, { width: 2, height: 1 })).toBe(true);
    expect(overlapsRestrictedBand(band, { x: 3, y: 0 }, { width: 1, height: 1 })).toBe(true);
  });

  it("accepts items fully inside a side lane", () => {
    expect(overlapsRestrictedBand(band, { x: 0, y: 0 }, { width: 3, height: 2 })).toBe(false);
    expect(overlapsRestrictedBand(band, { x: 9, y: 0 }, { width: 3, height: 2 })).toBe(false);
  });

  it("returns false without a band", () => {
    expect(overlapsRestrictedBand(undefined, { x: 4, y: 0 }, { width: 2, height: 1 })).toBe(false);
  });
});

describe("canPlaceItemInGrid with restricted band", () => {
  const grid = gridWithBand(12, { colStart: 3, colEnd: 9 });

  it("rejects positions overlapping the band", () => {
    expect(canPlaceItemInGrid({ grid, layout: [], item: { width: 2, height: 1 }, position: { x: 2, y: 0 } })).toBe(
      false,
    );
    expect(canPlaceItemInGrid({ grid, layout: [], item: { width: 1, height: 1 }, position: { x: 5, y: 0 } })).toBe(
      false,
    );
    expect(canPlaceItemInGrid({ grid, layout: [], item: { width: 2, height: 1 }, position: { x: 8, y: 0 } })).toBe(
      false,
    );
  });

  it("accepts positions inside a side lane", () => {
    expect(canPlaceItemInGrid({ grid, layout: [], item: { width: 3, height: 1 }, position: { x: 0, y: 0 } })).toBe(
      true,
    );
    expect(canPlaceItemInGrid({ grid, layout: [], item: { width: 3, height: 1 }, position: { x: 9, y: 0 } })).toBe(
      true,
    );
  });

  it("still rejects item overlap with other widgets", () => {
    const layout = [{ x: 0, y: 0, width: 2, height: 1 }];
    expect(canPlaceItemInGrid({ grid, layout, item: { width: 2, height: 1 }, position: { x: 1, y: 0 } })).toBe(false);
  });
});

describe("findPositionForItemInGrid with restricted band", () => {
  it("returns the first free cell in the left lane", () => {
    const grid = gridWithBand(12, { colStart: 3, colEnd: 9 });
    expect(findPositionForItemInGrid({ grid, layout: [], item: { width: 2, height: 1 } })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("moves to the right lane once the left lane is full", () => {
    const grid = gridWithBand(12, { colStart: 3, colEnd: 9 });
    const layout = Array.from({ length: 30 }, (_, idx) => ({
      x: idx % 3,
      y: Math.floor(idx / 3),
      width: 1,
      height: 1,
    }));
    const position = findPositionForItemInGrid({ grid, layout, item: { width: 1, height: 1 } });
    expect(position).toEqual({ x: 9, y: 0 });
  });

  it("falls back to the right lane once the left lane is full", () => {
    const grid = gridWithBand(12, { colStart: 3, colEnd: 9 });
    const layout = [
      { x: 0, y: 0, width: 3, height: 10 },
      { x: 9, y: 0, width: 3, height: 10 },
    ];
    const position = findPositionForItemInGrid({ grid, layout, item: { width: 1, height: 1 } });
    expect(position).toBe(false);
  });

  it("does not restrict placement without a band", () => {
    const grid = gridWithBand(12, { colStart: 3, colEnd: 9 });
    delete grid.restrictedBand;
    expect(findPositionForItemInGrid({ grid, layout: [], item: { width: 1, height: 1 } })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("findFallbackPosition", () => {
  it("appends past the rightmost widget without a band", () => {
    const grid = gridWithBand(12, { colStart: 3, colEnd: 9 });
    delete grid.restrictedBand;
    const layout = [{ x: 0, y: 0, width: 2, height: 1 }];
    expect(findFallbackPosition({ grid, layout })).toEqual({ x: 2, y: 0 });
  });

  it("starts at column 0 for an empty grid without a band", () => {
    const grid = gridWithBand(12, { colStart: 3, colEnd: 9 });
    delete grid.restrictedBand;
    expect(findFallbackPosition({ grid, layout: [] })).toEqual({ x: 0, y: 0 });
  });

  it("jumps past the band when widgets only sit left of it", () => {
    const grid = gridWithBand(12, { colStart: 3, colEnd: 9 });
    const layout = [{ x: 0, y: 0, width: 3, height: 10 }];
    expect(findFallbackPosition({ grid, layout })).toEqual({ x: 9, y: 0 });
  });

  it("stays past the rightmost widget when it already clears the band", () => {
    const grid = gridWithBand(12, { colStart: 3, colEnd: 9 });
    const layout = [{ x: 9, y: 0, width: 3, height: 10 }];
    expect(findFallbackPosition({ grid, layout })).toEqual({ x: 12, y: 0 });
  });

  it("lands past the band on an empty grid", () => {
    const grid = gridWithBand(12, { colStart: 3, colEnd: 9 });
    expect(findFallbackPosition({ grid, layout: [] })).toEqual({ x: 9, y: 0 });
  });
});
