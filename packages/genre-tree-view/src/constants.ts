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

interface Dimensions {
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
export const ITEM_COUNT_SCALING_FACTOR = 0.8; // How much width increases per item

// Reserved space to a node's right/top/bottom for its toolbar icon row and overflow menu,
// so the tree layout leaves room for them instead of packing nodes edge-to-edge. Width covers
// the overflow menu's own width plus the gap the toolbar renders it at (see the `+ 4` x-offset
// in addToolbarActions), since the menu is wider than the icon row itself.
export const TOOLBAR_MENU_X_GAP = 4;
export const ACTIONS_OVERLAY_WIDTH = MENU_WIDTH + TOOLBAR_MENU_X_GAP;
export const ACTIONS_OVERLAY_HEIGHT = RECT_BASE_DIMENSIONS.HEIGHT * 7;

export const NODE_DIMENSIONS: Dimensions = {
  WIDTH: RECT_BASE_DIMENSIONS.WIDTH + ACTIONS_OVERLAY_WIDTH,
  HEIGHT: RECT_BASE_DIMENSIONS.HEIGHT,
};

export const HORIZONTAL_SEPARATION_BETWEEN_RECTANGLES = 5;
export const VERTICAL_SEPARATION_BETWEEN_RECTANGLES = 20;
export const HORIZONTAL_SEPARATION_BETWEEN_NODES =
  NODE_DIMENSIONS.WIDTH + HORIZONTAL_SEPARATION_BETWEEN_RECTANGLES;
export const VERTICAL_SEPARATION_BETWEEN_NODES = NODE_DIMENSIONS.HEIGHT + VERTICAL_SEPARATION_BETWEEN_RECTANGLES;

// Utility functions for dynamic node sizing
export function calculateNodeDimensions(itemCount: number): Dimensions {
  const logItemCount = Math.log(Math.max(1, itemCount));
  const widthScale = Math.min(logItemCount * ITEM_COUNT_SCALING_FACTOR, MAX_NODE_WIDTH - MIN_NODE_WIDTH);
  const width = Math.max(MIN_NODE_WIDTH, MIN_NODE_WIDTH + widthScale);

  const heightScale = Math.min(itemCount * 0.5, MAX_NODE_HEIGHT - MIN_NODE_HEIGHT);
  const height = Math.max(MIN_NODE_HEIGHT, MIN_NODE_HEIGHT + heightScale);

  return {
    WIDTH: Math.round(width),
    HEIGHT: Math.round(height),
  };
}

export function getMaxNodeDimensions(nodes: Array<{ itemCount: number }>): Dimensions {
  const maxItems = Math.max(...nodes.map((node) => node.itemCount), 0);
  return calculateNodeDimensions(maxItems);
}

// GenreTreeWheel tokens. Chips sit a fixed angular pitch apart (see WHEEL_CHIP_ANGLE_STEP_DEGREES
// in wheel-geometry.ts); radius and visible-arc-height are tuned together so a handful of
// neighbors on either side of the selected chip stay within the visible strip — a radius much
// larger than the arc height (as an absolute wheel-diameter/viewport ratio might suggest) would
// push even the nearest neighbor's vertical drop past the visible edge, leaving only the
// selected chip on screen.
export const WHEEL_RADIUS = 260;
export const WHEEL_VISIBLE_ARC_HEIGHT = 200;

export const WHEEL_CHIP_HEIGHT = 40;
export const WHEEL_CHIP_HEIGHT_SELECTED = 48;
export const WHEEL_CHIP_MIN_WIDTH = 90;
export const WHEEL_CHIP_MAX_WIDTH = 220;

export const WHEEL_ROTATION_TRANSITION_MS = 500;
export const WHEEL_ROTATION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
