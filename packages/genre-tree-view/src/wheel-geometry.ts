/** The static angle (CSS `rotate()` convention: 0° = top, clockwise) of the `index`-th of
 * `totalCount` chips, evenly spaced around the full circle before any wheel rotation is
 * applied. Every chip stays reachable regardless of spacing — the whole circle is always
 * on screen and any chip can be brought to the top by rotating the wheel. */
export function getChipAngle(index: number, totalCount: number): number {
  return index * (360 / totalCount);
}

/** Minimum wheel radius so adjacent chips — each up to `maxChipWidth` wide in the worst case —
 * don't overlap. The chord between two adjacent chip anchor points on the circle
 * (2 * radius * sin(pi / rootCount)) must be at least `maxChipWidth` plus a small gap; solving
 * for radius gives the minimum that keeps every pair of neighbors clear. Falls back to
 * `baseRadius` when that's already big enough, or when there's only one chip and so no neighbor
 * to overlap. */
export function calculateWheelRadius(rootCount: number, maxChipWidth: number, baseRadius: number): number {
  if (rootCount <= 1) return baseRadius;
  const CHIP_GAP = 16;
  const requiredRadius = (maxChipWidth + CHIP_GAP) / (2 * Math.sin(Math.PI / rootCount));
  return Math.max(baseRadius, requiredRadius);
}

function mod360(value: number): number {
  return ((value % 360) + 360) % 360;
}

/**
 * Computes the wheel rotation (degrees) that brings the chip at `targetAngle` to `landingAngle`
 * (default 0, the top — used by the bottom-hugging wheel; 270, the left, lands a chip at the
 * right — used by the left-hugging wheel), taking the shortest path from `currentRotationDeg`.
 * The wheel's own rotation composes with each chip's static angle, so bringing `targetAngle` to
 * `landingAngle` requires a rotation congruent to `landingAngle - targetAngle` (mod 360).
 *
 * The result is never renormalized into [0, 360) — it keeps accumulating so a CSS
 * `transition: transform` never has to jump across a 359°→0° wraparound.
 */
export function computeRotationForSelection(
  currentRotationDeg: number,
  targetAngle: number,
  landingAngle = 0,
): number {
  const targetMod = mod360(landingAngle - targetAngle);
  const delta = targetMod - mod360(currentRotationDeg);
  const shortestDelta = delta - 360 * Math.round(delta / 360);
  return currentRotationDeg + shortestDelta;
}
