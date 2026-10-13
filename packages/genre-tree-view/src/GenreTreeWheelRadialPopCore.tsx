"use client";

import { WheelRadialPopCoreCore, WheelRadialPopCoreProps } from "./GenreTreeWheelRadialPopCoreBase";

export type GenreTreeWheelRadialPopCoreProps = WheelRadialPopCoreProps;

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
