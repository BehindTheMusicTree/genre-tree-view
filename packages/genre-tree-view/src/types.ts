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
 * upward from a bottom-anchored root — used by GenreTreeWheel. */
export type TreeOrientation = "horizontal" | "vertical";

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
}
