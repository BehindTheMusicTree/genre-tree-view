"use client";

import { WheelRadialPopCoreCore } from "./GenreTreeWheelRadialPopCoreBase";
import { GenreTreeNode, GenreTreeProps } from "./types";

export interface GenreTreeWheelRadialPopCoreProps extends Omit<GenreTreeProps, "nodes" | "rootColor" | "orientation"> {
  nodes: GenreTreeNode[];
  /** Fired whenever the top (just-clicked) root changes — on mount with the default selection,
   * and on every chip click. */
  onRootSelect?: (rootId: string) => void;
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
