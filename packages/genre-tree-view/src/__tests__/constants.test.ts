import { describe, expect, it } from "vitest";
import {
  getGenreTreeColor,
  calculateNodeDimensions,
  getMaxNodeDimensions,
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

describe("calculateNodeDimensions", () => {
  it("clamps width and height to the minimum for a zero item count", () => {
    const dims = calculateNodeDimensions(0);
    expect(dims.WIDTH).toBe(MIN_NODE_WIDTH);
    expect(dims.HEIGHT).toBe(MIN_NODE_HEIGHT);
  });

  it("grows width and height with item count", () => {
    const small = calculateNodeDimensions(1);
    const large = calculateNodeDimensions(50);
    expect(large.WIDTH).toBeGreaterThanOrEqual(small.WIDTH);
    expect(large.HEIGHT).toBeGreaterThan(small.HEIGHT);
  });

  it("clamps width and height to the maximum for an astronomically large item count", () => {
    const dims = calculateNodeDimensions(1e100);
    expect(dims.WIDTH).toBe(MAX_NODE_WIDTH);
    expect(dims.HEIGHT).toBe(MAX_NODE_HEIGHT);
  });
});

describe("getMaxNodeDimensions", () => {
  it("picks the dimensions of the node with the largest item count", () => {
    const nodes = [{ itemCount: 1 }, { itemCount: 100 }, { itemCount: 10 }];
    expect(getMaxNodeDimensions(nodes)).toEqual(calculateNodeDimensions(100));
  });

  it("falls back to zero item count for an empty node list", () => {
    expect(getMaxNodeDimensions([])).toEqual(calculateNodeDimensions(0));
  });
});
