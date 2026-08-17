// Visual theme tokens. All render code (tree-renderer.ts, d3-path-helper.ts,
// NodeHelper.tsx) reads exclusively from this block, so the tree's whole look can be
// swapped by editing only these values.
export const SURFACE_FILL = "#FFFFFF";
export const SURFACE_BORDER_COLOR = "#E4E4E7";
export const SURFACE_BORDER_WIDTH = 1;
export const ROOT_BORDER_WIDTH = 1;
export const CORNER_RADIUS = 8;
export const ELEVATION = true;

export const CONNECTOR_COLOR = "#D4D4D8";
export const CONNECTOR_WIDTH = 1.5;
export const CONNECTOR_OPACITY = 1;

export const TEXT_COLOR = "#18181B";
export const TEXT_MUTED_COLOR = "#A1A1AA";

export const ACCENT_COLOR = "#4F46E5";
export const ACCENT_TEXT_COLOR = "#FFFFFF";

// Tokens for the toolbar's inline icon row and its overflow menu — reuse the surface/text/
// accent tokens above so both read as part of the same light, neutral card language.
export const DANGER_COLOR = "#DC2626";
export const MENU_ROW_HOVER_FILL = "#F4F4F5";
export const DANGER_ROW_HOVER_FILL = "rgba(220, 38, 38, 0.08)";
export const ACCENT_TINT_FILL = "rgba(79, 70, 229, 0.08)";

export const TOOLBAR_BUTTON_SIZE = 26;
export const TOOLBAR_GAP = 2;

export const MENU_ROW_HEIGHT = 30;
export const MENU_WIDTH = 130;

// <1 darkens on hover (light surfaces), >1 lightens on hover (dark surfaces).
export const HOVER_BRIGHTNESS = 0.97;

export const PER_TREE_ACCENT_DOT = true;
export const ACCENT_DOT_SIZE = 4;

// Portion of a tree's root color mixed into SURFACE_FILL for its nodes' background tint (see
// tintSurface) — matches ACCENT_TINT_FILL's 0.08 alpha above so both read as the same "subtle
// wash" strength.
export const ROOT_TINT_RATIO = 0.08;

export const DEFAULT_NODE_COLOR = "#4F46E5";

// Per-tree accent-dot palette (only rendered when PER_TREE_ACCENT_DOT is true) used to
// derive a consistent per-tree color from a seed string (see getGenreTreeColor).
export const TREE_COLORS = [
  "#4F46E5", // Indigo
  "#0D9488", // Teal
  "#D97706", // Amber
  "#E11D48", // Rose
  "#7C3AED", // Violet
  "#0891B2", // Cyan
  "#059669", // Emerald
  "#EA580C", // Orange
];

/** Blends `hex` into SURFACE_FILL at `ratio` (0-1) and returns an opaque hex color — used for a
 * node's root-color background tint. Opaque (rather than an rgba fill) so the tint reads the
 * same regardless of what the host page renders behind the tree. */
export function tintSurface(hex: string, ratio: number = ROOT_TINT_RATIO): string {
  const channel = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  const mix = (value: number) => Math.round(value * ratio + 255 * (1 - ratio));
  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(mix(channel(1)))}${toHex(mix(channel(3)))}${toHex(mix(channel(5)))}`;
}

/** Deterministically maps a seed string (e.g. a root node id) to a color in the default palette. */
export function getGenreTreeColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const index = Math.abs(hash) % TREE_COLORS.length;
  return TREE_COLORS[index];
}

export interface Dimensions {
  WIDTH: number;
  HEIGHT: number;
}

export const RECT_BASE_DIMENSIONS: Dimensions = {
  WIDTH: 180,
  HEIGHT: 30,
};

// Dynamic sizing configuration
export const MIN_NODE_WIDTH = 180;
export const MAX_NODE_WIDTH = 350;
export const MIN_NODE_HEIGHT = 35;
export const MAX_NODE_HEIGHT = 60;
export const MIN_NODE_FONT_SIZE = 12;
export const MAX_NODE_FONT_SIZE = 18;

// Reserved space to a node's right/top/bottom for its toolbar icon row and overflow menu,
// so the tree layout leaves room for them instead of packing nodes edge-to-edge. Width covers
// the overflow menu's own width plus the gap the toolbar renders it at (see the `+ 4` x-offset
// in addToolbarActions), since the menu is wider than the icon row itself.
export const TOOLBAR_MENU_X_GAP = 4;
export const ACTIONS_OVERLAY_WIDTH = MENU_WIDTH + TOOLBAR_MENU_X_GAP;
export const ACTIONS_OVERLAY_HEIGHT = RECT_BASE_DIMENSIONS.HEIGHT * 7;

// Layout slot size, not a rendered node's actual size (see calculateNodeDimensions) — every
// node's slot has to fit the largest a node can render at, or a high-itemCount node overflows
// its neighbors' slots and overlaps them.
export const NODE_DIMENSIONS: Dimensions = {
  WIDTH: MAX_NODE_WIDTH + ACTIONS_OVERLAY_WIDTH,
  HEIGHT: MAX_NODE_HEIGHT,
};

export const HORIZONTAL_SEPARATION_BETWEEN_RECTANGLES = 5;
export const VERTICAL_SEPARATION_BETWEEN_RECTANGLES = 20;
// 0.8x: depth-axis spacing only (see HORIZONTAL_SEPARATION_BETWEEN_NODES and
// VERTICAL_ORIENTATION_DEPTH_SEPARATION below), tightened 20% at the consumer's request.
const DEPTH_AXIS_SPACING_FACTOR = 0.8;
export const HORIZONTAL_SEPARATION_BETWEEN_NODES =
  (NODE_DIMENSIONS.WIDTH + HORIZONTAL_SEPARATION_BETWEEN_RECTANGLES) * DEPTH_AXIS_SPACING_FACTOR;
export const VERTICAL_SEPARATION_BETWEEN_NODES = NODE_DIMENSIONS.HEIGHT + VERTICAL_SEPARATION_BETWEEN_RECTANGLES;

// The depth-axis step for a vertical-orientation tree (root-to-leaf growth). Kept distinct from
// VERTICAL_SEPARATION_BETWEEN_NODES, which horizontal-orientation trees also reuse as their
// breadth (sibling) axis step — doubling that constant directly would have also doubled sibling
// spacing in horizontal trees, not just the gap between depths.
export const VERTICAL_ORIENTATION_DEPTH_SEPARATION = VERTICAL_SEPARATION_BETWEEN_NODES * 2 * DEPTH_AXIS_SPACING_FACTOR;

// Same-depth siblings in a vertical-orientation tree sit side by side on-screen, so this axis
// doesn't need HORIZONTAL_SEPARATION_BETWEEN_NODES's baked-in toolbar/menu headroom — that's
// only for the depth axis, where a hovered node's toolbar pops into the space before the next
// generation. Reserving that much between every sibling pair made the wheel's tree read far
// more spread out than its cards actually are.
export const SIBLING_SEPARATION_BETWEEN_NODES = MAX_NODE_WIDTH + HORIZONTAL_SEPARATION_BETWEEN_RECTANGLES;

// Utility functions for dynamic node sizing
export interface ItemCountRange {
  min: number;
  max: number;
}

/** The min/max itemCount across a set of nodes — the reference points calculateNodeDimensions
 * scales every node's size against, so a node's size reflects its item count relative to its
 * peers rather than an absolute, arbitrarily-chosen scale. */
export function getItemCountRange(nodes: Array<{ itemCount: number }>): ItemCountRange {
  if (nodes.length === 0) return { min: 0, max: 0 };
  const counts = nodes.map((node) => node.itemCount);
  return { min: Math.min(...counts), max: Math.max(...counts) };
}

/** Log-scaled position of itemCount within `range`, normalized to [0, 1] — the node with the
 * lowest itemCount in range always sits at 0 and the highest always at 1, regardless of the
 * actual counts involved. A degenerate range (every node sharing one count) falls back to 0.
 * Real track counts commonly span tens to tens of thousands: a linear scale would flatten
 * nearly every node down near the minimum and let only the very largest stand out, so position
 * is computed on a log scale instead — equal *ratios* of item count grow a node by roughly
 * equal amounts, not equal absolute differences. log1p (not log) so an itemCount of 0 is finite. */
function logarithmicPosition(itemCount: number, range: ItemCountRange): number {
  const { min, max } = range;
  const logMin = Math.log1p(Math.max(min, 0));
  const logMax = Math.log1p(Math.max(max, 0));
  const logValue = Math.log1p(Math.max(itemCount, 0));
  return logMax > logMin ? (logValue - logMin) / (logMax - logMin) : 0;
}

/** Maps itemCount's log-scaled position within `range` onto [MIN_NODE_*, MAX_NODE_*]. */
export function calculateNodeDimensions(itemCount: number, range: ItemCountRange): Dimensions {
  const t = logarithmicPosition(itemCount, range);

  return {
    WIDTH: Math.round(MIN_NODE_WIDTH + t * (MAX_NODE_WIDTH - MIN_NODE_WIDTH)),
    HEIGHT: Math.round(MIN_NODE_HEIGHT + t * (MAX_NODE_HEIGHT - MIN_NODE_HEIGHT)),
  };
}

/** Same interpolation as calculateNodeDimensions, mapped onto [MIN_NODE_FONT_SIZE,
 * MAX_NODE_FONT_SIZE] instead — keeps the label's font size in step with its node's box size. */
export function calculateNodeFontSize(itemCount: number, range: ItemCountRange): number {
  const t = logarithmicPosition(itemCount, range);

  return Math.round(MIN_NODE_FONT_SIZE + t * (MAX_NODE_FONT_SIZE - MIN_NODE_FONT_SIZE));
}

// GenreTreeWheel tokens. Chips are spread evenly around the full circle (see getChipAngle in
// wheel-geometry.ts). The wheel's reserved bottom strip needs to fit more than just the bare
// circle (2 * WHEEL_RADIUS): a chip is centered *on* its point on that circle, so at the circle's
// lowest point a chip's own half-height still sticks out past the diameter. Reserving that extra
// half-height keeps every chip fully on screen, not just the ones nearest the top.
export const WHEEL_RADIUS = 260;
export const WHEEL_VIEWPORT_HEIGHT = WHEEL_RADIUS * 2 + MAX_NODE_HEIGHT / 2;

// Suggested height for the fixed-height ancestor GenreTreeWheel requires (see its own doc
// comment): enough room for a typically-deep tree above the wheel strip. Not derived from
// WHEEL_VIEWPORT_HEIGHT/WHEEL_RADIUS — those size the wheel-of-chips only, not the
// variable-depth tree growing above it.
export const WHEEL_DEFAULT_FRAME_HEIGHT = 600;

export const WHEEL_ROTATION_TRANSITION_MS = 500;
export const WHEEL_ROTATION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

// Zoom/pan tokens (see zoom-pan.ts). Bounds keep the tree from shrinking past legibility or
// growing so large that a single wheel tick jumps an unreasonable amount.
export const ZOOM_MIN_SCALE = 0.25;
export const ZOOM_MAX_SCALE = 3;
// Exponent multiplier applied to a wheel event's deltaY — small because deltaY is typically
// tens to hundreds of pixels per tick, and exp() amplifies fast.
export const ZOOM_WHEEL_SCALE_SPEED = 0.0015;
// Multiplicative step applied per click of the zoom in/out buttons — a fallback control for
// ctrl+scroll/pinch, which some trackpad/OS/browser combinations never translate into a
// ctrlKey wheel event at all.
export const ZOOM_BUTTON_SCALE_STEP = 1.2;
// Breathing room (px) kept around content when "fit to frame" computes a scale — content is
// never scaled to touch the viewport's edges exactly.
export const ZOOM_FIT_PADDING = 40;
