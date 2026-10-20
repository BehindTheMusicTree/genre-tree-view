import { hsl } from "d3";
import type { TreeIndex } from "./tree-index";

// Visual theme tokens. All render code (tree-renderer.ts, d3-path-helper.ts,
// NodeHelper.tsx) reads exclusively from this block, so the tree's whole look can be
// swapped by editing only these values.
export const SURFACE_FILL = "#FFFFFF";
export const SURFACE_BORDER_COLOR = "#E4E4E7";
export const CORNER_RADIUS = 8;
export const ELEVATION = false;

export const CONNECTOR_COLOR = "#D4D4D8";
export const CONNECTOR_OPACITY = 1;

// Radial wheel subtree links (renderPopSubtree) take a muted tintSurface of their root's color;
// pop links are lighter than core ones, matching the pop/core node fill contrast. The white
// Mainstream Pop center uses TEXT_MUTED_COLOR instead.
export const RADIAL_CORE_LINK_TINT_RATIO = 0.5;
export const RADIAL_POP_LINK_TINT_RATIO = 0.3;

export const TEXT_COLOR = "#18181B";
export const TEXT_MUTED_COLOR = "#A1A1AA";

export const ACCENT_COLOR = "#4F46E5";
export const ACCENT_TEXT_COLOR = "#FFFFFF";

// The selected node (the one whose info panel is open) gets a heavier accent-colored border,
// while every other node dims (see .gtv-node--dimmed in styles.css) — reuses ACCENT_COLOR
// rather than a separate color so the highlight reads as the same "accent" language as the
// reparent-target overlay (NodeHelper.tsx).
export const SELECTED_BORDER_WIDTH_RATIO = 2.5;

// Tokens for the toolbar's inline icon row and its overflow menu — reuse the surface/text/
// accent tokens above so both read as part of the same light, neutral card language.
export const DANGER_COLOR = "#DC2626";
export const MENU_ROW_HOVER_FILL = "#F4F4F5";
export const DANGER_ROW_HOVER_FILL = "rgba(220, 38, 38, 0.08)";
export const ACCENT_TINT_FILL = "rgba(79, 70, 229, 0.08)";

export const TOOLBAR_GAP = 2;

export const MENU_WIDTH = 130;

export const PER_TREE_ACCENT_DOT = true;
export const ACCENT_DOT_SIZE = 4;

// Portion of a tree's root color mixed into SURFACE_FILL for its nodes' background tint (see
// tintSurface) — matches ACCENT_TINT_FILL's 0.08 alpha above so both read as the same "subtle
// wash" strength.
export const ROOT_TINT_RATIO = 0.08;

// Tint ratio for a radial wheel's pop-sector nodes (see renderPopSubtree in
// pop-core-radial-layout.ts) — stronger than ROOT_TINT_RATIO so pop nodes read as a lighter
// shade of their root's own color rather than the near-white wash the toolbar/card surfaces use.
export const POP_SECTOR_TINT_RATIO = 0.8;

export const DEFAULT_NODE_COLOR = "#4F46E5";

// The pop-core renderers (GenreTreeWheelRadialPopCore's wheel pivot, GenreTreeOutline's first
// entry) single out this specific root by name and throw if it's missing.
export const CENTER_NODE_NAME = "Mainstream Pop";

// Placeholder palette cycled where no real root exists (GenreTreeWheelSkeleton); real roots use
// ROOT_GENRE_COLORS.
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

// Opacity of a wheel view's per-root background sector fill (see buildWheelSectorGradient /
// buildSectorClipPathPolygon) — light enough to read as a wash behind chips/dividers/subtrees
// rather than competing with them for attention.
export const ROOT_SECTOR_FILL_OPACITY = 0.15;

/** Converts an opaque "#RRGGBB" color (e.g. a ROOT_GENRE_COLORS entry) to an "rgba()" string at
 * `opacity` (0-1) — unlike tintSurface, which stays opaque by blending toward a fixed background,
 * this produces a true transparent fill for layering over arbitrary content (e.g. a wheel's
 * sector-fill wash, which sits behind chips/dividers/subtrees of varying color). */
export function hexToRgba(hex: string, opacity: number): string {
  const channel = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${opacity})`;
}

// Fixed per-root colors keyed by the root's wikidata id (a QID or a synthetic "LOCAL:" key), so a
// genre keeps its color across environments and renames. Mainstream Pop (Q37073) is deliberately
// absent: the pop-core layouts render it white at the center.
export const ROOT_GENRE_COLORS: Readonly<Record<string, string>> = {
  "LOCAL:blues-rock": "#DC2626", // Red
  "LOCAL:reggae-dub": "#16A34A", // Green
  "LOCAL:disco-funk": "#7C3AED", // Violet
  Q11401: "#B8860B", // Hip-hop, deep gold
  Q9778: "#2563EB", // Electronic, blue
  Q1583807: "#92400E", // Art music (classical), brown
  Q8341: "#CA8A04", // Jazz, mustard
  Q45981: "#4F46E5", // Rhythm and blues, indigo
  Q43343: "#0D9488", // Folk, teal
  Q54365: "#0891B2", // Ska, cyan
  Q1640319: "#475569", // Experimental, slate
};

export const FALLBACK_ROOT_COLOR = "#6B7280";

/** Maps a root node's wikidata id to its fixed color, or FALLBACK_ROOT_COLOR when unmapped/absent. */
export function getGenreTreeColor(wikidataId: string | null | undefined): string {
  return (wikidataId && ROOT_GENRE_COLORS[wikidataId]) || FALLBACK_ROOT_COLOR;
}

// A zoomed view's ring roots are descendants of a top-level root, so they take a variation of the
// color of the sector they were zoomed from: hue spread across +-this many degrees over siblings.
const CHILD_HUE_SPREAD_DEG = 30;
const CHILD_LIGHTNESS_STEP = 0.06;
const CHILD_MIN_LIGHTNESS = 0.25;
const CHILD_MAX_LIGHTNESS = 0.6;

/** Color of `nodeId`: a top-level root's fixed color, otherwise a variation of its parent's color
 * (hue spread and alternating lightness by position among its non-pop siblings). A pure function of
 * the full tree, so a genre keeps its color at every zoom depth. */
export function getGenreNodeColor(index: Pick<TreeIndex, "byId" | "childrenByParentId">, nodeId: string): string {
  const node = index.byId.get(nodeId);
  if (!node) return FALLBACK_ROOT_COLOR;
  if (node.parentId === null) return getGenreTreeColor(node.wikidataId);
  const siblings = (index.childrenByParentId.get(node.parentId) ?? []).filter((sibling) => sibling.side !== "pop");
  const position = Math.max(0, siblings.findIndex((sibling) => sibling.id === nodeId));
  const base = hsl(getGenreNodeColor(index, node.parentId));
  const hueOffset =
    siblings.length > 1 ? -CHILD_HUE_SPREAD_DEG + (2 * CHILD_HUE_SPREAD_DEG * position) / (siblings.length - 1) : 0;
  const lightness = base.l + (position % 2 === 0 ? -CHILD_LIGHTNESS_STEP : CHILD_LIGHTNESS_STEP);
  return hsl(
    base.h + hueOffset,
    base.s,
    Math.min(CHILD_MAX_LIGHTNESS, Math.max(CHILD_MIN_LIGHTNESS, lightness)),
  ).formatHex();
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
export const MAX_NODE_WIDTH = 700;
export const MIN_NODE_HEIGHT = 35;
export const MAX_NODE_HEIGHT = 120;

// Reserved space to a node's right/top/bottom for its toolbar icon row and overflow menu,
// so the tree layout leaves room for them instead of packing nodes edge-to-edge. Width covers
// the overflow menu's own width plus the gap the toolbar renders it at (see the `+ 4` x-offset
// by the former hover toolbar), since the menu is wider than the icon row itself.
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
export function logarithmicPosition(itemCount: number, range: ItemCountRange): number {
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

export const NODE_MIN_BORDER_WIDTH = 1;
export const NODE_MAX_BORDER_WIDTH = 4;

/** Border width of a node (card or dot), on the same log scale as its size; the selected node's
 * is SELECTED_BORDER_WIDTH_RATIO times its own width, so a selected small node can still be
 * thinner than an unselected large one. */
export function calculateNodeBorderWidth(itemCount: number, range: ItemCountRange, selected = false): number {
  const width =
    NODE_MIN_BORDER_WIDTH + logarithmicPosition(itemCount, range) * (NODE_MAX_BORDER_WIDTH - NODE_MIN_BORDER_WIDTH);
  return selected ? width * SELECTED_BORDER_WIDTH_RATIO : width;
}

export const LINK_TO_NODE_HEIGHT_RATIO = 1 / 6;

/** Stroke width of the link leading to a node: a fixed fraction of that node's rendered height,
 * so a branch stays the same order of magnitude as the chip it leads to. */
export function calculateLinkWidth(itemCount: number, range: ItemCountRange): number {
  return calculateNodeDimensions(itemCount, range).HEIGHT * LINK_TO_NODE_HEIGHT_RATIO;
}

// The node-height fraction its font size renders at, interpolated by the same log-scaled t as
// calculateNodeDimensions — small nodes get a smaller fraction of their (already small) height so
// their label doesn't dominate the card, while the largest nodes reach a full half.
const MIN_NODE_FONT_HEIGHT_RATIO = 0.3;
const MAX_NODE_FONT_HEIGHT_RATIO = 0.5;

/** A fraction of the node's own box height — keeps the label's font size proportional to its
 * node's rendered size, rather than interpolated separately over its own min/max range. */
export function calculateNodeFontSize(itemCount: number, range: ItemCountRange): number {
  const t = logarithmicPosition(itemCount, range);
  const { HEIGHT } = calculateNodeDimensions(itemCount, range);
  const ratio = MIN_NODE_FONT_HEIGHT_RATIO + t * (MAX_NODE_FONT_HEIGHT_RATIO - MIN_NODE_FONT_HEIGHT_RATIO);

  return Math.round(HEIGHT * ratio);
}

/** Layout-unit font size that renders a dot label at its on-screen size (LABEL_SCREEN_*_PX, log
 * scale like calculateNodeFontSize) under `zoomScale`. */
export function calculateLabelFontSizeAtZoom(itemCount: number, range: ItemCountRange, zoomScale: number): number {
  const t = logarithmicPosition(itemCount, range);
  return (LABEL_SCREEN_MIN_PX + t * (LABEL_SCREEN_MAX_PX - LABEL_SCREEN_MIN_PX)) / zoomScale;
}

/** A dot label's map-style importance: its log-scaled itemCount, lowered by
 * LABEL_DEPTH_RANK_PENALTY per level below the first under its root (`depth` 1), so a level is
 * named before the levels under it unless a deeper genre is much bigger. */
export function calculateLabelRank(itemCount: number, range: ItemCountRange, depth: number): number {
  return logarithmicPosition(itemCount, range) - Math.max(0, depth - 1) * LABEL_DEPTH_RANK_PENALTY;
}

/** Whether a label of `rank` (see calculateLabelRank) is named at `zoomScale` (see
 * LABEL_MIN_RANK_AT_MIN_ZOOM); the threshold falls linearly in log-zoom from ZOOM_MIN_SCALE to
 * ZOOM_FOCUS_SCALE, and below 0 past it so deep levels keep appearing while zooming further in. */
export function isLabelRankedForZoom(rank: number, zoomScale: number): boolean {
  const zoomOut = Math.log(ZOOM_FOCUS_SCALE / zoomScale) / Math.log(ZOOM_FOCUS_SCALE / ZOOM_MIN_SCALE);
  return rank >= Math.min(1, zoomOut) * LABEL_MIN_RANK_AT_MIN_ZOOM;
}

/** Root chip label size: its own layout size, floored so it never renders below
 * ROOT_LABEL_MIN_SCREEN_PX on screen — every root stays named at any zoom. */
export function calculateRootLabelFontSize(layoutFontSize: number, zoomScale: number): number {
  return Math.max(layoutFontSize, ROOT_LABEL_MIN_SCREEN_PX / zoomScale);
}

export const NODE_DOT_MIN_RADIUS = 3;
export const NODE_DOT_MAX_RADIUS = 50;
export const NODE_DOT_LABEL_GAP = 6;

/** Radius of a radial-wheel subgenre dot, on the same log scale as its label's font size
 * (calculateNodeFontSize) so a bigger label always sits on a bigger dot. */
export function calculateNodeDotRadius(itemCount: number, range: ItemCountRange): number {
  return NODE_DOT_MIN_RADIUS + logarithmicPosition(itemCount, range) * (NODE_DOT_MAX_RADIUS - NODE_DOT_MIN_RADIUS);
}

// GenreTreeWheel tokens. Chips are spread evenly around the full circle (see getChipAngle in
// wheel-geometry.ts). The wheel's reserved bottom strip needs to fit more than just the bare
// circle (2 * WHEEL_RADIUS): a chip is centered *on* its point on that circle, so at the circle's
// lowest point a chip's own half-height still sticks out past the diameter. Reserving that extra
// half-height keeps every chip fully on screen, not just the ones nearest the top.
export const WHEEL_RADIUS = 260;
export const WHEEL_VIEWPORT_HEIGHT = WHEEL_RADIUS * 2 + MAX_NODE_HEIGHT / 2;

// GenreTreeWheelRadialPopCore tokens. This renderer's circle must fit a full interactive pop
// subtree inside it (not just chip clearance like the plain wheel), so it starts from a bigger
// base floor than WHEEL_RADIUS even when no root has a pop side — leaving room to grow
// further per calculatePopSubtreeRadialExtent (pop-core-radial-layout.ts) once one does.
export const WHEEL_POP_CORE_RADIUS = 945;

// Radial (depth-axis) step for a pop subtree's polar layout — analogous to
// VERTICAL_ORIENTATION_DEPTH_SEPARATION for the cartesian renderers, but expressed directly as a
// radius increment per depth since pop-core-radial-layout.ts positions nodes in polar coordinates.
export const POP_TREE_DEPTH_RADIAL_SPACING = NODE_DIMENSIONS.WIDTH * 0.35;

// Suggested size for the fixed-size ancestor any GenreTree/GenreTreeWheel variant requires (see
// GenreTreeWheel's own doc comment): enough room for a typically-deep tree, or the wheel's chip
// strip plus a typically-deep tree above it. Not derived from WHEEL_VIEWPORT_HEIGHT/WHEEL_RADIUS
// — those size the wheel-of-chips only, not the variable-depth tree growing above it.
export const DEFAULT_FRAME_WIDTH = 1200;
export const DEFAULT_FRAME_HEIGHT = 750;

export const WHEEL_ROTATION_TRANSITION_MS = 500;
export const WHEEL_ROTATION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

// Zoom/pan tokens (see zoom-pan.ts). Bounds keep the tree from shrinking past legibility or
// growing so large that a single wheel tick jumps an unreasonable amount.
export const ZOOM_MIN_SCALE = 0.05;
export const ZOOM_MAX_SCALE = 3;
// Exponent multiplier applied to a trackpad ctrl+wheel/pinch event's deltaY (see
// classifyWheelEvent in zoom-pan.ts — physical mouse wheel notches use ZOOM_BUTTON_SCALE_STEP
// instead) — small because deltaY is typically tens to hundreds of pixels per tick, and exp()
// amplifies fast. Raised repeatedly (0.0015 -> 0.003 -> 0.006 -> 0.012 -> 0.03): even with the
// per-event animation delay removed, trackpad zoom still felt less sensitive than Google Maps'.
export const ZOOM_WHEEL_SCALE_SPEED = 0.03;
// Caps the exponent (currentScale's multiplier is exp(this)) any single wheel/trackpad event can
// apply, regardless of ZOOM_WHEEL_SCALE_SPEED. Researched d3-zoom's own wheel handling (the
// library this project is built on) and Mapbox GL's scroll-zoom: both scale multiplicatively per
// event exactly like computeZoomScale does, with no special curve to counter it — "a faster swipe
// zooms more" is inherent to any proportional response, not a bug, since deltaY already grows with
// gesture speed. What those implementations don't hit is an occasional very fast swipe producing a
// runaway multiplicative jump in one single event; this cap bounds that per-event ratio to
// exp(0.5) ≈ 1.65x without touching the feel of normal-speed gestures (which stay well under it).
export const ZOOM_WHEEL_MAX_EXPONENT = 0.5;
// Multiplicative step applied per click of the zoom in/out buttons — a fallback control for
// ctrl+scroll/pinch, which some trackpad/OS/browser combinations never translate into a
// ctrlKey wheel event at all.
export const ZOOM_BUTTON_SCALE_STEP = 1.2;
// Exponent applied to a touch pinch gesture's finger-distance ratio, amplifying the scale change
// per unit of finger travel — touch pinch reaches JS as raw pointer events (see use-pan-zoom.ts),
// with no OS-level amplification like trackpad pinch gets, so a 1:1 ratio feels sluggish. Lowered
// from 1.5: on Android touchscreens that amplification made pinch-zoom feel too fast/twitchy.
export const ZOOM_PINCH_SCALE_SPEED = 1;
// Duration (ms) of the eased glide between physical-mouse-wheel notches (see classifyWheelEvent
// in zoom-pan.ts) — mirrors Google Maps' smooth zoom-and-settle for that chunky, low-frequency
// input. Trackpad ctrl+wheel/pinch is applied instantly instead (see handleWheel in
// use-pan-zoom.ts): it's already a continuous, high-frequency stream, so easing each event would
// only stack added latency behind it rather than smooth anything.
export const ZOOM_ANIMATION_DURATION_MS = 220;
// Breathing room (px) kept around content when "fit to frame" computes a scale — content is
// never scaled to touch the viewport's edges exactly.
export const ZOOM_FIT_PADDING = 40;
// Scale a clicked node is zoomed/centered to (see usePanZoom's centerOnElement) — a fixed,
// comfortable reading scale applied consistently regardless of the scale the user was already at,
// so clicking always reads as "focus on this node" rather than an unpredictable relative zoom.
// 0.2 (not 1): full scale read as "too zoomed in" once clicked, cropping most of the surrounding tree.
export const ZOOM_FOCUS_SCALE = 0.2;
// On-screen font size (px) of radial dot labels, smallest to biggest genre: labels keep this size
// at every zoom like place names on a map, so zooming out hides small labels (bigger in layout
// units, they collide more) and zooming in brings them back.
export const LABEL_SCREEN_MIN_PX = 11;
export const LABEL_SCREEN_MAX_PX = 22;
// Minimum log-scaled itemCount position (0 = smallest genre, 1 = biggest) a label needs to be shown
// at ZOOM_MIN_SCALE, easing to 0 at ZOOM_FOCUS_SCALE: like a map, a far-out view names only the
// main genres even where smaller labels would fit.
export const LABEL_MIN_RANK_AT_MIN_ZOOM = 0.6;
// Rank (see calculateLabelRank) a label loses per hierarchy level below its root's direct children.
export const LABEL_DEPTH_RANK_PENALTY = 0.15;
export const ROOT_LABEL_MIN_SCREEN_PX = 15;
// Quiet time (ms) after the last zoom change before dot labels are re-placed for the new scale.
export const LABEL_RELAYOUT_DEBOUNCE_MS = 120;
// On-screen font size (px) of the zoomed-in root's region label: placed at TARGET, re-placed once
// zooming drifts it outside [MIN, MAX] (see WheelRadialPopCoreCore).
export const REGION_LABEL_TARGET_PX = 28;
export const REGION_LABEL_MIN_PX = 16;
export const REGION_LABEL_MAX_PX = 48;
// Duration (ms) of the eased pan+zoom glide centerOnElement flies to a clicked node with — longer
// than ZOOM_ANIMATION_DURATION_MS's wheel-notch glide since this one also covers a pan distance,
// not just a scale change, and should read as one deliberate "fly to" (Google Maps' own
// click-to-center glide) rather than an instant jump.
export const CENTER_ON_ELEMENT_DURATION_MS = 450;
// How long a single click waits for a second one before acting (see defer-click.ts).
export const DOUBLE_CLICK_DELAY_MS = 250;
// Minimum content (px) usePanZoom's pan clamp always keeps on-screen along each axis — dragging
// or wheel-panning can bring the tree to this close to sliding fully out of the viewport, but no
// closer, so the user can never lose it entirely and have no visible edge to drag back from.
export const PAN_MIN_VISIBLE_PX = 80;

// Idle time after the last wheel/drag/pinch event before usePanZoom commits its imperatively
// tracked pan/zoom into React state (re-rendering and re-running the zoom-dependent label effects).
export const PAN_ZOOM_SETTLE_MS = 100;

// Fixed width (px) of the node info panel (see InfoPanel.tsx) — also the collision threshold
// resolveInfoPanelSide compares a clicked node's screen rect against, so the panel never renders
// directly on top of the node that opened it.
export const INFO_PANEL_WIDTH = 280;
