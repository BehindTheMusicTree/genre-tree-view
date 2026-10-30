import { describe, expect, it } from "vitest";
import {
  getGenreTreeColor,
  getGenreNodeColor,
  calculateNodeDimensions,
  calculateNodeDotRadius,
  calculateSelectedNodeBorderWidth,
  SELECTED_BORDER_TO_RADIUS_RATIO,
  calculateLabelFontSizeAtZoom,
  calculateNodeFontSize,
  isLabelRankedForZoom,
  calculateLabelRank,
  calculateRootLabelFontSize,
  ROOT_LABEL_MIN_SCREEN_PX,
  LABEL_SCREEN_MAX_PX,
  LABEL_SCREEN_MIN_PX,
  ZOOM_FOCUS_SCALE,
  ZOOM_MIN_SCALE,
  NODE_DOT_MIN_RADIUS,
  NODE_DOT_MAX_RADIUS,
  calculateLinkWidth,
  LINK_TO_NODE_HEIGHT_RATIO,
  calculateNodeBorderWidth,
  NODE_MIN_BORDER_WIDTH,
  NODE_MAX_BORDER_WIDTH,
  SELECTED_BORDER_WIDTH_RATIO,
  getItemCountRange,
  ROOT_GENRE_COLORS,
  FALLBACK_ROOT_COLOR,
  MIN_NODE_WIDTH,
  MAX_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  MAX_NODE_HEIGHT,
  getGenreNodeStyle,
  CENTER_NODE_NAME,
  tintSurface,
  shadeSurface,
  POP_SECTOR_TINT_RATIO,
  TEXT_COLOR,
  ACCENT_TEXT_COLOR,
} from "../constants";
import { buildTreeIndex } from "../tree-index";

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

describe("calculateNodeBorderWidth", () => {
  it("spans min to max border width over the range, scaled up when selected", () => {
    const range = { min: 10, max: 10000 };
    expect(calculateNodeBorderWidth(10, range)).toBe(NODE_MIN_BORDER_WIDTH);
    expect(calculateNodeBorderWidth(10000, range)).toBe(NODE_MAX_BORDER_WIDTH);
    expect(calculateNodeBorderWidth(500, range)).toBeGreaterThan(NODE_MIN_BORDER_WIDTH);
    expect(calculateNodeBorderWidth(500, range)).toBeLessThan(NODE_MAX_BORDER_WIDTH);
    expect(calculateNodeBorderWidth(10, range, true)).toBe(NODE_MIN_BORDER_WIDTH * SELECTED_BORDER_WIDTH_RATIO);
  });
});

describe("calculateSelectedNodeBorderWidth", () => {
  it("is proportional to the radius", () => {
    expect(calculateSelectedNodeBorderWidth(50)).toBe(50 * SELECTED_BORDER_TO_RADIUS_RATIO);
    expect(calculateSelectedNodeBorderWidth(10)).toBe(2 * SELECTED_BORDER_TO_RADIUS_RATIO * 5);
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

  it("grows the dot in step with the label font size", () => {
    const counts = [0, 3, 20, 100, 400];
    const radii = counts.map((count) => calculateNodeDotRadius(count, range));
    const fonts = counts.map((count) => calculateNodeFontSize(count, range));
    expect(radii[4]).toBe(NODE_DOT_MAX_RADIUS);
    for (let i = 1; i < counts.length; i++) {
      expect(radii[i]).toBeGreaterThan(radii[i - 1]);
      expect(fonts[i]).toBeGreaterThanOrEqual(fonts[i - 1]);
    }
  });

  it("floors near-empty genres at the minimum radius", () => {
    expect(calculateNodeDotRadius(0, range)).toBe(NODE_DOT_MIN_RADIUS);
    expect(calculateNodeDotRadius(0, { min: 0, max: 0 })).toBe(NODE_DOT_MIN_RADIUS);
  });
});

describe("calculateLabelFontSizeAtZoom", () => {
  it("keeps labels at their fixed on-screen size whatever the zoom", () => {
    const range = { min: 1, max: 100 };
    for (const zoom of [0.05, 0.2, 3]) {
      expect(calculateLabelFontSizeAtZoom(1, range, zoom) * zoom).toBeCloseTo(LABEL_SCREEN_MIN_PX);
      expect(calculateLabelFontSizeAtZoom(100, range, zoom) * zoom).toBeCloseTo(LABEL_SCREEN_MAX_PX);
    }
  });
});

describe("isLabelRankedForZoom", () => {
  const range = { min: 1, max: 1000 };

  it("names the first level from the focus zoom, deeper levels only further in", () => {
    expect(isLabelRankedForZoom(0, ZOOM_FOCUS_SCALE)).toBe(true);
    expect(isLabelRankedForZoom(-0.5, 3)).toBe(true);
  });

  it("names only the main genres fully zoomed out", () => {
    expect(isLabelRankedForZoom(calculateLabelRank(5, range, 1), ZOOM_MIN_SCALE)).toBe(false);
    expect(isLabelRankedForZoom(calculateLabelRank(1000, range, 1), ZOOM_MIN_SCALE / 2)).toBe(true);
  });

  it("ranks a deeper genre below a same-size shallower one", () => {
    expect(calculateLabelRank(1, range, 3)).toBeLessThan(calculateLabelRank(1, range, 1));
    expect(isLabelRankedForZoom(calculateLabelRank(1, range, 3), ZOOM_FOCUS_SCALE)).toBe(false);
    expect(isLabelRankedForZoom(calculateLabelRank(1, range, 3), 3)).toBe(true);
  });
});

describe("calculateRootLabelFontSize", () => {
  it("floors a root label at ROOT_LABEL_MIN_SCREEN_PX on screen", () => {
    expect(calculateRootLabelFontSize(14, ZOOM_MIN_SCALE) * ZOOM_MIN_SCALE).toBeCloseTo(ROOT_LABEL_MIN_SCREEN_PX);
    expect(calculateRootLabelFontSize(14, 3)).toBe(14);
  });
});

describe("getGenreNodeColor", () => {
  const node = (id: string, parentId: string | null, wikidataId: string | null = null) => ({
    id,
    parentId,
    wikidataId,
    name: id,
  });
  const nodes = [node("root", null, "Q9778"), node("a", "root"), node("b", "root"), node("c", "root"), node("a1", "a")];
  const childrenByParentId = new Map<string, ReturnType<typeof node>[]>();
  nodes.forEach((n) => {
    if (n.parentId) childrenByParentId.set(n.parentId, [...(childrenByParentId.get(n.parentId) ?? []), n]);
  });
  const index = {
    byId: new Map(nodes.map((n) => [n.id, n])),
    childrenByParentId,
  } as unknown as Parameters<typeof getGenreNodeColor>[0];

  it("keeps a top-level root's fixed color", () => {
    expect(getGenreNodeColor(index, "root")).toBe(getGenreTreeColor("Q9778"));
  });

  it("gives siblings distinct variations of the parent color, and their children variations of those", () => {
    const [a, b, c] = ["a", "b", "c"].map((id) => getGenreNodeColor(index, id));
    expect(new Set([a, b, c, getGenreTreeColor("Q9778")]).size).toBe(4);
    expect(getGenreNodeColor(index, "a1")).not.toBe(a);
  });

  it("falls back for an unknown node", () => {
    expect(getGenreNodeColor(index, "missing")).toBe(FALLBACK_ROOT_COLOR);
  });
});

describe("getGenreNodeStyle", () => {
  const index = buildTreeIndex([
    { id: "rock", parentId: null, name: "Rock", itemCount: 1, wikidataId: "Q11399" },
    { id: "hard-rock", parentId: "rock", name: "Hard Rock", itemCount: 1 },
    { id: "pop-rock", parentId: "rock", name: "Pop Rock", itemCount: 1, side: "pop" },
    { id: "power-pop", parentId: "pop-rock", name: "Power Pop", itemCount: 1 },
    { id: "pop", parentId: null, name: CENTER_NODE_NAME, itemCount: 1 },
    { id: "dance-pop", parentId: "pop", name: "Dance Pop", itemCount: 1 },
  ]);
  const mainstreamStyle = { fill: tintSurface("#ffffff", POP_SECTOR_TINT_RATIO), textColor: TEXT_COLOR };

  it("paints a top-level root and its core descendants their own solid genre color", () => {
    expect(getGenreNodeStyle(index, "rock")).toEqual({ fill: getGenreTreeColor("Q11399"), textColor: ACCENT_TEXT_COLOR });
    expect(getGenreNodeStyle(index, "hard-rock")).toEqual({
      fill: getGenreNodeColor(index, "hard-rock"),
      textColor: ACCENT_TEXT_COLOR,
    });
  });

  it("tints a pop branch and everything below it", () => {
    for (const id of ["pop-rock", "power-pop"]) {
      expect(getGenreNodeStyle(index, id)).toEqual({
        fill: tintSurface(getGenreNodeColor(index, id), POP_SECTOR_TINT_RATIO),
        textColor: ACCENT_TEXT_COLOR,
      });
    }
  });

  it("paints the Mainstream Pop lineage a white tint with dark text", () => {
    expect(getGenreNodeStyle(index, "pop")).toEqual(mainstreamStyle);
    expect(getGenreNodeStyle(index, "dance-pop")).toEqual(mainstreamStyle);
  });
});

describe("shadeSurface", () => {
  it("mixes a color toward black by the given ratio", () => {
    expect(shadeSurface("#ffffff", 0.5)).toBe("#808080");
    expect(shadeSurface("#102030", 1)).toBe("#102030");
    expect(shadeSurface("#ff8000", 0)).toBe("#000000");
  });
});

describe("density-aware item count sizing", () => {
  it("uses the supplied total as a shared domain for filtered counts", () => {
    const range = getItemCountRange([{ itemCount: 10 }, { itemCount: 50 }], { itemCountScaleMax: 100 });
    expect(range.min).toBe(0);
    expect(range.max).toBe(100);
    expect(calculateNodeDotRadius(50, range)).toBeLessThan(calculateNodeDotRadius(100, range));
  });

  it("reduces maximum sizes for denser trees while keeping a usable floor", () => {
    const nodes = [{ itemCount: 0 }, { itemCount: 100 }];
    const sparse = getItemCountRange(nodes, { nodeCountForSizing: 10 });
    const dense = getItemCountRange(nodes, { nodeCountForSizing: 10000 });
    expect(calculateNodeDotRadius(100, sparse)).toBeGreaterThan(calculateNodeDotRadius(100, dense));
    expect(calculateNodeDotRadius(100, dense)).toBeGreaterThan(NODE_DOT_MIN_RADIUS);
    expect(calculateNodeDimensions(100, dense).WIDTH).toBeLessThan(calculateNodeDimensions(100, sparse).WIDTH);
  });

  it("falls back to observed counts for invalid totals", () => {
    expect(getItemCountRange([{ itemCount: 4 }, { itemCount: 8 }], { itemCountScaleMax: -1 })).toEqual({ min: 4, max: 8 });
  });
});
