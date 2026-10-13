"use client";

import { WheelRadialPopCoreCore } from "./GenreTreeWheelRadialPopCoreBase";
import { GenreTreeNode, GenreTreeProps } from "./types";

export interface GenreTreeWheelRadialPopCoreProps extends Omit<GenreTreeProps, "nodes" | "rootColor" | "orientation"> {
  nodes: GenreTreeNode[];
  /** Fired whenever the top (just-clicked) root changes — on mount with the default selection,
   * and on every chip click. */
  onRootSelect?: (rootId: string) => void;
  /** When false, clicking a chip still fires `onRootSelect`, but the ring stays at its current
   * rotation instead of bringing the clicked root to the landing angle. Defaults to true. */
  allowWheelRotation?: boolean;
  /** Renders this node's subtree as its own wheel instead of the whole tree — its single pop
   * child (if any) becomes the center disc, its other children the ring roots. */
  focusNodeId?: string | null;
  /** Fired with the node to zoom into from a ring root's info panel, or with the focus node's
   * parent (null for the whole tree) from the back button. Omit to hide both controls. */
  onFocusChange?: (id: string | null) => void;
}

/**
 * `GenreTreeWheelRadial`, but each developed root's outward subtree is only its core (non-pop)
 * branch — if that root also has a `side: "pop"` child, that pop subtree renders as a full
 * interactive tree fanned out inside the wheel's own circle instead. The wheel's pivot point
 * renders `nodes`' root named "Pop" (which must exist and have no children) as a full interactive
 * chip, styled the same as the ring's own root chips, instead of a plain label, and that root is
 * excluded from the ring's own chips.
 */
export function GenreTreeWheelRadialPopCore(props: GenreTreeWheelRadialPopCoreProps) {
  return <WheelRadialPopCoreCore {...props} />;
}
