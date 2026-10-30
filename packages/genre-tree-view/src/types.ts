import type { ReactNode } from "react";

export interface GenreTreeNode {
  id: string;
  parentId: string | null;
  name: string;
  /** Subtree total: this node's own items plus all its descendants'. Parents must already include
   * their children's counts — the library displays and sizes by this value as-is, never summing. */
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
  /** A grouping node that no item is filed under directly. Read by InfoPanel (badge), GenreTreeOutline
   * and the stacked/wheel node labels (italic); the pop-core labels ignore it. */
  umbrella?: boolean;
  /** Which scene a genre belongs to. GenreTreeWheelRadialPopCore draws an "underground" node and its
   * descendants in a darker shade of their usual color, over a darker background slice. */
  scene?: "commercial" | "underground";
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

/** When the floating zoom in / zoom out / fit buttons show — see `GenreTreeProps.showZoomControls`. */
export type ZoomControlsVisibility = "auto" | "always" | "never";

/** The pan/zoom view as the content-space point shown at the viewport's center plus the scale —
 * independent of the container's pixel size, so a saved view lands on the same spot in any window. */
export interface GenreTreeViewport {
  x: number;
  y: number;
  zoom: number;
}

/** The info panel's built-in sections, handed to `renderInfoPanelBody` for placement. Each is
 * `null` when it has nothing to show. */
export interface InfoPanelSections {
  /** The node's action toolbar — null when `showToolbar` is off or a reparent is in progress. */
  toolbar: ReactNode;
  /** Ancestor chips, root-first — null for a root. */
  ancestors: ReactNode;
  /** Parent, node and children mini tree. */
  family: ReactNode;
  /** The `itemCountLabel` row. */
  itemCount: ReactNode;
}

/** The info panel body a `renderInfoPanelBody` returns. */
export interface InfoPanelBody {
  /** The wide column when expanded; on top when compact. */
  primary: ReactNode;
  /** The narrow left column when expanded; below `primary` when compact. Omit (or null) for a
   * single column. */
  aside?: ReactNode;
}

export interface GenreTreeProps {
  nodes: GenreTreeNode[];
  /** Label for the info panel's `itemCount` row (e.g. "Song count"); the library can't know what unit is counted. */
  itemCountLabel: string;
  /** Optional total for the current itemCount metric. When provided, node sizes use a fixed
   * logarithmic domain from zero to this total, so filtering recalculates each node's size against
   * the filtered total. The total must use the same metric as GenreTreeNode.itemCount. */
  itemCountScaleMax?: number;
  /** Full node count used to adapt maximum node/card/dot size to visualization density. Defaults
   * to nodes.length; wheel renderers pass their complete dataset to their selected subtree. */
  nodeCountForSizing?: number;
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
  /** "auto" (the default) hides the zoom in / zoom out / fit buttons on touch screens
   * (`pointer: coarse`), where pinch and pan replace them; "always" and "never" force them. The
   * `floatingControlsLeading` content stays visible either way. */
  showZoomControls?: ZoomControlsVisibility;
  /** Host content rendered in the floating controls box, beside the zoom buttons ("horizontal")
   * or above them ("vertical"); stacked above them in narrow containers. */
  floatingControlsLeading?: ReactNode;
  /** Shows a small spinner beside the zoom buttons (after a short delay, so fast operations don't
   * flash) and marks the tree `aria-busy`. Use it while the host is updating the tree in place. */
  busy?: boolean;
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
  /** Composes the info panel body for the clicked node: places the built-in `sections` (any
   * omitted one is not rendered) among the consumer's own content — e.g. a consumer-fetched detail
   * like essential tracks. The library has no knowledge of what this renders (loading state, data
   * fetching, etc. are entirely the consumer's responsibility, mirroring `additionalActions`).
   * Omitted, the body is the built-in sections in one column. The panel frame (header, columns,
   * scrolling, edit-mode danger zone) stays the library's. */
  renderInfoPanelBody?: (node: GenreTreeNode, sections: InfoPanelSections) => InfoPanelBody;
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
   * search bar floated over the header (see `--gtv-info-panel-header-inset`). Defaults to false. */
  hideInfoPanelTitle?: boolean;
  /** Keeps `renderDangerZone` inactive. Defaults to false. */
  readOnly?: boolean;
  /** Rendered at the bottom of the info panel unless `readOnly`. */
  renderDangerZone?: (node: GenreTreeNode) => ReactNode;
  /** Whether the info panel fills the tree container (controlled), splitting into a narrow left
   * column (the body's `aside`, then the danger zone) and a wide right one (its `primary`). Selecting
   * another node from the panel keeps it expanded. Defaults to false. */
  expanded?: boolean;
  /** When set, the info panel header shows an expand/collapse toggle firing this with the
   * requested state, and Escape fires it with `false` while expanded (unless focus is in an
   * input/textarea/select or a dialog is open). */
  onExpandedChange?: (on: boolean) => void;
  /** Slides the info panel out of view and makes it inert, keeping it mounted. Defaults to false. */
  collapsed?: boolean;
  /** Drops the header's expand/collapse toggle when the host draws its own control for it. */
  hideExpandButton?: boolean;
  /** Consumer content shown over the tree independent of node selection — at the expanded info
   * panel's size (e.g. an About page), or as an expandable info-panel peer when it sets
   * `onExpandedChange` (e.g. an artist). Its header ✕ and Escape (same exceptions as
   * `onExpandedChange`) fire `onClose`; Escape collapses an expanded panel first. Showing it
   * alongside the info panel is the consumer's call — close one before opening the other to keep
   * them exclusive. */
  overlayPanel?: GenreTreeOverlayPanel;
  /** Seeds the pan/zoom on mount, replacing the initial fit-to-frame and the centering on an
   * initial `selectedNodeId`. Read once; later changes are ignored. Ignored when `interactive` is
   * false and by `GenreTreeOutline`. */
  defaultViewport?: GenreTreeViewport;
  /** Fired once a user-driven pan/zoom settles (drag, wheel, pinch, zoom/fit buttons, centering on
   * a clicked node) — not for the initial fit or for applying `defaultViewport`. */
  onViewportChange?: (viewport: GenreTreeViewport) => void;
}

export interface GenreTreeOverlayPanel {
  title: string;
  /** Its top-level children (and `extraContent`'s) are separated by a divider, as is `extraContent`
   * from `content` when stacked — blocks must not draw their own. */
  content: ReactNode;
  onClose: () => void;
  /** With `onExpandedChange`, the panel behaves like the info panel: compact in its left slot,
   * expanding to its expanded size (controlled). Without it, the panel always covers the center
   * column at the expanded size, with no toggle. */
  expanded?: boolean;
  /** Adds the header's expand/collapse toggle; Escape fires it with `false` while expanded. */
  onExpandedChange?: (on: boolean) => void;
  /** Stacked below `content` when compact, the right column when expanded — same as the info
   * panel body's `primary`. */
  extraContent?: ReactNode;
  /** See GenreTreeProps.collapsed. */
  collapsed?: boolean;
  /** See GenreTreeProps.hideExpandButton. */
  hideExpandButton?: boolean;
  /** See GenreTreeProps.hideInfoPanelTitle. */
  hideTitle?: boolean;
  /** See GenreTreeProps.hideInfoPanelClose; Escape still closes. */
  hideClose?: boolean;
}
