"use client";

import { WheelCore } from "./GenreTreeWheelBase";
import { GenreTreeNode, GenreTreeProps } from "./types";

export interface GenreTreeWheelProps extends Omit<GenreTreeProps, "nodes" | "rootColor" | "orientation"> {
  nodes: GenreTreeNode[];
  /** Fired whenever the selected root changes — on mount with the default selection, and on every chip click. */
  onRootSelect?: (rootId: string) => void;
  /** Optional label centered on the wheel's pivot point, e.g. a brand name. Stays upright and
   * fixed regardless of the wheel's rotation. */
  centerLabel?: string;
  /** When false, clicking a chip still selects its root and swaps in its subtree, but the wheel
   * itself stays at its current rotation instead of spinning the selected chip to the anchor.
   * Defaults to true. */
  allowWheelRotation?: boolean;
}

/**
 * All root genres distributed evenly around a wheel hugging the bottom of its container.
 * Clicking a chip rotates the wheel so that root lands at the top-center, and swaps in its
 * subtree — rendered as a single vertical `<GenreTree>` growing upward from that anchor.
 * Only the selected root's subtree is ever mounted.
 */
export function GenreTreeWheel(props: GenreTreeWheelProps) {
  return <WheelCore {...props} direction="bottom" />;
}
