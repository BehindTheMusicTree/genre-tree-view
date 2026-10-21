import type { ReactNode } from "react";

export interface GenreTreeNode {
  id: string;
  parentId: string | null;
  name: string;
  itemCount: number;
  /** Whether add-child, rename, delete and reparent actions apply to this node. Defaults to true. */
  actionable?: boolean;
  /** Meaningful only for a root's direct children: "core" (default when unset) marks the
   * required non-pop branch, "pop" marks the optional pop/crossover branch. Ignored everywhere
   * else. Only interpreted by GenreTreeWheelRadialPopCore. */
  side?: "core" | "pop";
  /** A root kept apart from the tree (e.g. an uncategorized bucket). Only interpreted by
   * GenreTreeOutline, which lists it in its own section after the tree. */
  detached?: boolean;
  /** Stable genre key (a wikidata QID or a synthetic "LOCAL:" key). Read on root nodes only, to
   * pick the root's fixed color (see getGenreTreeColor). */
  wikidataId?: string | null;
}

export type GenreTreePlayState = "playing" | "paused" | "loading";

/** "stacked" is the linear/card tree (GenreTree); "wheel"/"pop-core" are the radial layouts
 * (GenreTreeWheel* family); "outline" is the nested-list text view (GenreTreeOutline). Shared by
 * GenreTreeViewSkeleton so a consumer's loading state can match whichever real layout it's about
 * to render. */
export type GenreTreeViewMode = "stacked" | "wheel" | "pop-core" | "outline";

/** "horizontal" grows children rightward from a left root (default). "vertical" grows children
 * upward from a bottom-anchored root — used by GenreTreeWheel. "horizontal-anchored" grows
 * rightward like "horizontal" but anchors the root at a fixed local coordinate
 * (0, svgHeight / 2) regardless of tree shape, instead of "horizontal"'s unanchored top-aligned
 * bounding box — used by GenreTreeWheelRight. "vertical-flipped" mirrors "vertical": children
 * grow downward from a top-anchored root. "horizontal-anchored-flipped" mirrors
 * "horizontal-anchored": children grow leftward from a root anchored at (svgWidth, svgHeight / 2).
 * The four anchored/mirrored variants are used by GenreTreeWheelRadial's top/right/bottom/left
 * cardinals respectively (vertical / horizontal-anchored / vertical-flipped /
 * horizontal-anchored-flipped). */
export type TreeOrientation =
  | "horizontal"
  | "vertical"
  | "horizontal-anchored"
  | "vertical-flipped"
  | "horizontal-anchored-flipped";

/** True for the two orientations whose depth axis is Y (root-to-leaf grows vertically) rather
 * than X. */
export function isVerticalOrientation(orientation: TreeOrientation): boolean {
  return orientation === "vertical" || orientation === "vertical-flipped";
}

/** +1 if depth increases in the positive direction of its axis (down for "vertical-flipped",
 * right for "horizontal"/"horizontal-anchored"); -1 if it increases in the negative direction (up
 * for "vertical", left for "horizontal-anchored-flipped"). Determines which side of a card is
 * "toward the leaves" so the hover toolbar/hit-rect always extends that way, never toward the
 * parent. */
export function depthAxisSign(orientation: TreeOrientation): 1 | -1 {
  if (orientation === "vertical" || orientation === "horizontal-anchored-flipped") return -1;
  return 1;
}

export interface GenreTreeAction {
  key: string;
  icon: (node: GenreTreeNode) => ReactNode;
  label: (node: GenreTreeNode) => string;
  onClick: (event: React.MouseEvent, node: GenreTreeNode) => void;
  enabled?: (node: GenreTreeNode) => boolean;
  danger?: boolean;
  /** "primary" = inline icon-row action (old upload slot); "overflow" = kebab-menu action
   * (old rename/delete slot). Defaults to "overflow". */
  placement?: "primary" | "overflow";
}

/** How the mouse wheel drives an interactive renderer's pan/zoom viewport — see
 * `GenreTreeProps.wheelZoom`. */
export type WheelZoomMode = "always" | "modifier";

/** Layout of the floating zoom/pop/fit controls — see `GenreTreeProps.controlsOrientation`. */
export type ControlsOrientation = "horizontal" | "vertical";

export interface GenreTreeProps {
  nodes: GenreTreeNode[];
  className?: string;
  rootColor?: string;
  orientation?: TreeOrientation;
  /** Omits the root node's own card (and its toolbar) from rendering, keeping only its
   * connecting paths to its children — used when the root is represented elsewhere, e.g.
   * GenreTreeWheel's chip. Defaults to false. */
  hideRoot?: boolean;
  playingNodeId?: string | null;
  playState?: GenreTreePlayState;
  /** Id of the node currently being reassigned to a new parent (owned by the consumer, since it can span multiple GenreTree instances). */
  reparentingNodeId?: string | null;
  onPlayPause?: (nodeId: string) => void;
  onAddChild?: (parentId: string) => void;
  onRenameRequest?: (node: GenreTreeNode) => void;
  onDeleteRequest?: (node: GenreTreeNode) => void;
  /** Fired when the user clicks "Change parent" on a node — the consumer should set `reparentingNodeId` to this node's id. */
  onReparentRequest?: (node: GenreTreeNode) => void;
  /** Fired when the user picks a target node while `reparentingNodeId` is set. */
  onReparent?: (nodeId: string, newParentId: string) => void | Promise<void>;
  /** Fired when the user clicks a node's body (its card, or its chip in the wheel renderers) —
   * anywhere but a toolbar/menu action or, while `reparentingNodeId` is set, the reparent-target
   * overlay. The library itself opens its own read-only info panel for the clicked node
   * alongside this callback; the consumer owns any additional selection state or highlighting. */
  onNodeClick?: (node: GenreTreeNode, event: MouseEvent) => void;
  /** Fired when the pointer enters a node (or, in `GenreTreeOutline`, its name receives focus) —
   * e.g. to prefetch whatever the consumer loads on click. Fired by `GenreTreeOutline` and
   * `GenreTreeWheelRadialPopCore`; accepted and ignored by the other renderers. */
  onNodeHover?: (node: GenreTreeNode) => void;
  /** Extra actions rendered alongside the built-in play/add-child/rename/delete/reparent set —
   * placement "primary" renders inline on the node (the upload slot from earlier versions used),
   * "overflow" (the default) renders in the kebab menu alongside rename/delete. */
  additionalActions?: (node: GenreTreeNode) => GenreTreeAction[];
  /** When true (the default), GenreTree owns its own pan/zoom viewport, zoom buttons, and
   * wheel/drag listeners. Set to false to render just the bare SVG at its natural size with none
   * of that — used by GenreTreeWheel, which applies one shared pan/zoom transform to the tree and
   * its wheel together instead of giving the tree its own independent one. */
  interactive?: boolean;
  /** "always" (the default): the viewport captures every wheel event — any wheel/pinch zooms at
   * the cursor, drag pans (Google Maps style) — and all touch input. "modifier": only Ctrl/Meta+wheel (or a
   * trackpad pinch) zooms; a plain wheel and one-finger vertical touch scroll the page instead,
   * for trees embedded in a scrolling list. Ignored when `interactive` is false. */
  wheelZoom?: WheelZoomMode;
  /** Stacks the floating zoom/pop/fit controls vertically ("vertical", the default) or lays them
   * out in a row ("horizontal"). */
  controlsOrientation?: ControlsOrientation;
  /** Multiplies the spacing between depth levels along the tree's growth axis. Defaults to 1
   * (no change). */
  depthSpacingScale?: number;
  /** When false, the info panel omits the node actions (play/pause, add-child, rename, reparent,
   * delete, extra actions). Defaults to true. */
  showToolbar?: boolean;
  /** Overrides which node is shown highlighted (with unrelated nodes/links dimmed) instead of
   * GenreTree's own internally-tracked clicked node — used by `interactive={false}` instances
   * (e.g. GenreTreeWheel's nested tree) whose own info panel, and thus own selection, is owned
   * by an ancestor rather than by this instance. On the top-level exported renderers
   * (`GenreTreeWheel`, `GenreTreeWheelRight`, `GenreTreeWheelRadial`,
   * `GenreTreeWheelRadialPopCore`, `GenreTree` itself), setting this also opens and centers the
   * info panel for that node — the same effect a direct click on it would have — swapping in its
   * owning root/sector first if needed. Leave unset to use the internal selection. */
  selectedNodeId?: string | null;
  /** Renders extra content into the built-in info panel for the clicked node, below its built-in
   * fields — e.g. a consumer-fetched detail like essential tracks. The library has no knowledge
   * of what this renders (loading state, data fetching, etc. are entirely the consumer's
   * responsibility, mirroring `additionalActions`); omit for no extra section. */
  renderExtraDetails?: (node: GenreTreeNode) => ReactNode;
  /** Fired when a user action changes the node shown in the info panel (a click on the tree, or on
   * a parent/child/ancestor chip in the panel), or with `null` when the user closes it (its header
   * ✕) — so a consumer driving `selectedNodeId` stays in sync. Not fired when re-selecting the node
   * already shown, when the panel follows the consumer's own `selectedNodeId`, nor when the
   * consumer clears `selectedNodeId` to `null`/`undefined` (which closes the panel). */
  onSelectedNodeChange?: (node: GenreTreeNode | null) => void;
  /** Hides the info panel header's close button — for a consumer that closes the panel itself
   * (by clearing `selectedNodeId`), e.g. from its own search bar. Defaults to false. */
  hideInfoPanelClose?: boolean;
  /** Hides the info panel header's node name — for a consumer that already shows it, e.g. in its own
   * search bar floated over the header (see `--gtv-info-panel-header-inset`). The title editor still
   * shows in edit mode. Defaults to false. */
  hideInfoPanelTitle?: boolean;
  /** Hides the info panel's Edit/Done toggle even when `onEditModeChange` is set, and keeps the
   * edit-mode slots below inactive. Defaults to false. */
  readOnly?: boolean;
  /** Whether the info panel is in edit mode (controlled) — only then are `renderTitleEditor`,
   * `renderParentsEditor` and `renderDangerZone` rendered. Defaults to false. */
  editMode?: boolean;
  /** When set (and `readOnly` is false), the info panel header shows an Edit/Done toggle firing
   * this with the requested mode. */
  onEditModeChange?: (on: boolean) => void;
  /** Edit mode only: replaces the info panel header's title, e.g. with an inline rename field. */
  renderTitleEditor?: (node: GenreTreeNode) => ReactNode;
  /** Edit mode only: replaces the info panel's Parent section. */
  renderParentsEditor?: (node: GenreTreeNode) => ReactNode;
  /** Edit mode only: rendered at the bottom of the info panel. */
  renderDangerZone?: (node: GenreTreeNode) => ReactNode;
  /** Whether the info panel fills the tree container (controlled), splitting into a left column
   * (fields, lists, toolbar, danger zone) and a right one (`renderExtraDetails`). Selecting
   * another node from the panel keeps it expanded. Defaults to false. */
  expanded?: boolean;
  /** When set, the info panel header shows an expand/collapse toggle firing this with the
   * requested state, and Escape fires it with `false` while expanded (unless focus is in an
   * input/textarea/select or a dialog is open). */
  onExpandedChange?: (on: boolean) => void;
  /** Consumer content shown over the tree at the expanded info panel's exact size, independent of
   * node selection (e.g. an About page). Its header ✕ and Escape (same exceptions as
   * `onExpandedChange`) fire `onClose`. Showing it alongside the info panel is the consumer's
   * call — close one before opening the other to keep them exclusive. */
  overlayPanel?: GenreTreeOverlayPanel;
}

export interface GenreTreeOverlayPanel {
  title: string;
  content: ReactNode;
  onClose: () => void;
}
