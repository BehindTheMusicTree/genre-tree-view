export interface GenreTreeNode {
  id: string;
  parentId: string | null;
  name: string;
  itemCount: number;
  /** Whether add-child, rename, delete and reparent actions apply to this node. Defaults to true. */
  actionable?: boolean;
}

export type GenreTreePlayState = "playing" | "paused" | "loading";

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
  onUploadFiles?: (nodeId: string, files: File[]) => void;
  /** When true (the default), GenreTree owns its own pan/zoom viewport, zoom buttons, and
   * wheel/drag listeners. Set to false to render just the bare SVG at its natural size with none
   * of that — used by GenreTreeWheel, which applies one shared pan/zoom transform to the tree and
   * its wheel together instead of giving the tree its own independent one. */
  interactive?: boolean;
  /** Multiplies the spacing between depth levels along the tree's growth axis. Defaults to 1
   * (no change). Used by GenreTreeWheelRadial to spread out its filler-root mini-tree previews. */
  depthSpacingScale?: number;
}
