/** Fixed angular pitch between adjacent chips. A fixed step (rather than spreading chips to
 * fill the full 360° regardless of count) keeps neighbors close to the top for any root
 * count — spacing chips by `360 / totalCount` instead would put e.g. two roots 180° apart,
 * permanently on opposite sides of the wheel with neither reachable from the other. */
export const WHEEL_CHIP_ANGLE_STEP_DEGREES = 32;

/** The static angle (CSS `rotate()` convention: 0° = top, clockwise) of the `index`-th chip,
 * evenly spaced around the wheel by a fixed pitch, before any wheel rotation is applied. */
export function getChipAngle(index: number): number {
  return index * WHEEL_CHIP_ANGLE_STEP_DEGREES;
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
