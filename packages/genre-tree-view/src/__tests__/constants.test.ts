import { describe, expect, it } from "vitest";
import {
  getGenreTreeColor,
  calculateNodeDimensions,
  getItemCountRange,
  TREE_COLORS,
  MIN_NODE_WIDTH,
  MAX_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  MAX_NODE_HEIGHT,
} from "../constants";

describe("getGenreTreeColor", () => {
  it("returns the same color for the same seed", () => {
    expect(getGenreTreeColor("rock")).toBe(getGenreTreeColor("rock"));
  });

  it("returns a color from the palette", () => {
    expect(TREE_COLORS).toContain(getGenreTreeColor("jazz"));
  });

  it("handles an empty seed", () => {
    expect(TREE_COLORS).toContain(getGenreTreeColor(""));
  });

  it("can pick different colors for different seeds", () => {
    const colors = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((s) => getGenreTreeColor(s)));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("getItemCountRange", () => {
  it("returns the min and max itemCount across the nodes", () => {
    const nodes = [{ itemCount: 5 }, { itemCount: 1 }, { itemCount: 10 }];
    expect(getItemCountRange(nodes)).toEqual({ min: 1, max: 10 });
  });

  it("falls back to a zero/zero range for an empty node list", () => {
    expect(getItemCountRange([])).toEqual({ min: 0, max: 0 });
  });
});

describe("calculateNodeDimensions", () => {
  it("renders the lowest itemCount in range at the minimum size", () => {
    const range = { min: 0, max: 50 };
    const dims = calculateNodeDimensions(0, range);
    expect(dims.WIDTH).toBe(MIN_NODE_WIDTH);
    expect(dims.HEIGHT).toBe(MIN_NODE_HEIGHT);
  });

  it("renders the highest itemCount in range at the maximum size", () => {
    const range = { min: 0, max: 50 };
    const dims = calculateNodeDimensions(50, range);
    expect(dims.WIDTH).toBe(MAX_NODE_WIDTH);
    expect(dims.HEIGHT).toBe(MAX_NODE_HEIGHT);
  });

  it("grows width and height with item count between the range's min and max", () => {
    const range = { min: 0, max: 50 };
    const small = calculateNodeDimensions(1, range);
    const large = calculateNodeDimensions(40, range);
    expect(large.WIDTH).toBeGreaterThan(small.WIDTH);
    expect(large.HEIGHT).toBeGreaterThan(small.HEIGHT);
  });

  it("falls back to the minimum size when every node in range shares the same itemCount", () => {
    const range = { min: 7, max: 7 };
    const dims = calculateNodeDimensions(7, range);
    expect(dims.WIDTH).toBe(MIN_NODE_WIDTH);
    expect(dims.HEIGHT).toBe(MIN_NODE_HEIGHT);
  });

  it("is independent of the range's absolute magnitude — only relative position matters", () => {
    const small = calculateNodeDimensions(5, { min: 0, max: 10 });
    const large = calculateNodeDimensions(500, { min: 0, max: 1000 });
    expect(small).toEqual(large);
  });
});
