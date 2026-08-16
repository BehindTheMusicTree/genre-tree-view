"use client";

import { WheelCore } from "./GenreTreeWheelBase";
import { GenreTreeNode, GenreTreeProps } from "./types";

export interface GenreTreeWheelRightProps extends Omit<GenreTreeProps, "nodes" | "rootColor" | "orientation"> {
  nodes: GenreTreeNode[];
  /** Fired whenever the selected root changes — on mount with the default selection, and on every chip click. */
  onRootSelect?: (rootId: string) => void;
  /** Optional label centered on the wheel's pivot point, e.g. a brand name. Stays upright and
   * fixed regardless of the wheel's rotation. */
  centerLabel?: string;
}

/**
 * All root genres distributed evenly around a wheel hugging the left edge of its container.
 * Clicking a chip rotates the wheel so that root lands at the right-center, and swaps in its
 * subtree — rendered as a single `<GenreTree>` growing rightward from that anchor.
 * Only the selected root's subtree is ever mounted.
 */
export function GenreTreeWheelRight(props: GenreTreeWheelRightProps) {
  return <WheelCore {...props} direction="left" />;
}
