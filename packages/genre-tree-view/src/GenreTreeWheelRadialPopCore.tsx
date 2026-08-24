"use client";

import { WheelRadialPopCoreCore } from "./GenreTreeWheelRadialPopCoreBase";
import { GenreTreeNode, GenreTreeProps } from "./types";

export interface GenreTreeWheelRadialPopCoreProps extends Omit<GenreTreeProps, "nodes" | "rootColor" | "orientation"> {
  nodes: GenreTreeNode[];
  /** Fired whenever the top (just-clicked) root changes — on mount with the default selection,
   * and on every chip click. */
  onRootSelect?: (rootId: string) => void;
  /** Optional label centered on the wheel's pivot point, e.g. a brand name. */
  centerLabel?: string;
}

/**
 * `GenreTreeWheelRadial`, but each developed cardinal's outward subtree is only its core (non-pop)
 * branch — if that root also has a `side: "pop"` child, that pop subtree renders as a full
 * interactive tree fanned out inside the wheel's own circle instead.
 */
export function GenreTreeWheelRadialPopCore(props: GenreTreeWheelRadialPopCoreProps) {
  return <WheelRadialPopCoreCore {...props} />;
}
