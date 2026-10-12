import { describe, expect, it } from "vitest";
import {
  getGenreTreeColor,
  calculateNodeDimensions,
  calculateNodeDotRadius,
  NODE_DOT_MIN_RADIUS,
  NODE_DOT_MAX_RADIUS,
  calculateLinkWidth,
  LINK_TO_NODE_HEIGHT_RATIO,
  getItemCountRange,
  ROOT_GENRE_COLORS,
  FALLBACK_ROOT_COLOR,
  MIN_NODE_WIDTH,
  MAX_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  MAX_NODE_HEIGHT,
} from "../constants";

describe("getGenreTreeColor", () => {
  it("returns the fixed color mapped to a root's wikidata id", () => {
    expect(getGenreTreeColor("LOCAL:disco-funk")).toBe(ROOT_GENRE_COLORS["LOCAL:disco-funk"]);
  });

  it("falls back for an unmapped or missing wikidata id", () => {
    expect(getGenreTreeColor("Q37073")).toBe(FALLBACK_ROOT_COLOR);
    expect(getGenreTreeColor(null)).toBe(FALLBACK_ROOT_COLOR);
    expect(getGenreTreeColor(undefined)).toBe(FALLBACK_ROOT_COLOR);
  });

  it("gives every mapped root a distinct color", () => {
    const colors = Object.values(ROOT_GENRE_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
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

describe("calculateLinkWidth", () => {
  it("is the target node's height × LINK_TO_NODE_HEIGHT_RATIO at the range's min, max, and for a degenerate range", () => {
    const range = { min: 10, max: 10000 };
    expect(calculateLinkWidth(10, range)).toBeCloseTo(MIN_NODE_HEIGHT * LINK_TO_NODE_HEIGHT_RATIO, 5);
    expect(calculateLinkWidth(10000, range)).toBeCloseTo(MAX_NODE_HEIGHT * LINK_TO_NODE_HEIGHT_RATIO, 5);
    expect(calculateLinkWidth(5, { min: 5, max: 5 })).toBeCloseTo(MIN_NODE_HEIGHT * LINK_TO_NODE_HEIGHT_RATIO, 5);
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

  it("scales logarithmically — equal ratios above the minimum grow size by roughly equal amounts", () => {
    // Under linear scaling a value just 10x above a realistic track-count minimum would render
    // barely above MIN_NODE_WIDTH in a [50, 10000] range. Log scaling keeps it well clear of MIN.
    const range = { min: 50, max: 10000 };
    const dims = calculateNodeDimensions(500, range);
    expect(dims.WIDTH).toBeGreaterThan(MIN_NODE_WIDTH + (MAX_NODE_WIDTH - MIN_NODE_WIDTH) * 0.3);
  });
});

describe("calculateNodeDotRadius", () => {
  const range = { min: 0, max: 400 };

  it("makes dot area proportional to track count", () => {
    const r100 = calculateNodeDotRadius(100, range);
    const r400 = calculateNodeDotRadius(400, range);
    expect(r400).toBe(NODE_DOT_MAX_RADIUS);
    expect((r400 / r100) ** 2).toBeCloseTo(4, 9);
  });

  it("floors near-empty genres at the minimum radius", () => {
    expect(calculateNodeDotRadius(0, range)).toBe(NODE_DOT_MIN_RADIUS);
    expect(calculateNodeDotRadius(0, { min: 0, max: 0 })).toBe(NODE_DOT_MIN_RADIUS);
  });
});
