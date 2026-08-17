"use client";

import { WheelRadialCore } from "./GenreTreeWheelRadialBase";
import { GenreTreeNode, GenreTreeProps } from "./types";

export interface GenreTreeWheelRadialProps extends Omit<GenreTreeProps, "nodes" | "rootColor" | "orientation"> {
  nodes: GenreTreeNode[];
  /** Fired whenever the top (just-clicked) root changes — on mount with the default selection,
   * and on every chip click. */
  onRootSelect?: (rootId: string) => void;
  /** Optional label centered on the wheel's pivot point, e.g. a brand name. */
  centerLabel?: string;
}

/**
 * All root genres distributed evenly around a full circle centered in its container, with up to 4
 * roots — one per cardinal direction — developed as full subtrees simultaneously. Clicking any
 * chip re-lays-out the ring so that root lands on the right, recalculating the other 3 cardinals.
 */
export function GenreTreeWheelRadial(props: GenreTreeWheelRadialProps) {
  return <WheelRadialCore {...props} />;
}
