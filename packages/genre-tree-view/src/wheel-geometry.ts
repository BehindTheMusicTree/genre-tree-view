/** The static angle (CSS `rotate()` convention: 0° = top, clockwise) of the `index`-th of
 * `totalCount` chips, evenly spaced around the full circle before any wheel rotation is
 * applied. Every chip stays reachable regardless of spacing — the whole circle is always
 * on screen and any chip can be brought to the top by rotating the wheel. */
export function getChipAngle(index: number, totalCount: number): number {
  return index * (360 / totalCount);
}

function mod360(value: number): number {
  return ((value % 360) + 360) % 360;
}

/**
 * Computes the wheel rotation (degrees) that brings the chip at `targetAngle` to the top,
 * taking the shortest path from `currentRotationDeg`. The wheel's own rotation composes with
 * each chip's static angle, so bringing `targetAngle` to 0° requires a rotation congruent to
 * `-targetAngle` (mod 360).
 *
 * The result is never renormalized into [0, 360) — it keeps accumulating so a CSS
 * `transition: transform` never has to jump across a 359°→0° wraparound.
 */
export function computeRotationForSelection(currentRotationDeg: number, targetAngle: number): number {
  const targetMod = mod360(-targetAngle);
  const delta = targetMod - mod360(currentRotationDeg);
  const shortestDelta = delta - 360 * Math.round(delta / 360);
  return currentRotationDeg + shortestDelta;
}
