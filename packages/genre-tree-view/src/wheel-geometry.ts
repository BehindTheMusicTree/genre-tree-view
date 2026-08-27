/** The static angle (CSS `rotate()` convention: 0° = top, clockwise) of the `index`-th of
 * `totalCount` chips, evenly spaced around the full circle before any wheel rotation is
 * applied. Every chip stays reachable regardless of spacing — the whole circle is always
 * on screen and any chip can be brought to the top by rotating the wheel. */
export function getChipAngle(index: number, totalCount: number): number {
  return index * (360 / totalCount);
}

/** Angle (CSS `rotate()` convention) of the boundary between the `index`-th chip and its next
 * neighbor clockwise, for `totalCount` evenly-spaced chips — the midpoint of their spacing, used
 * to draw a radial divider separating the two. */
export function getWheelDividerAngle(index: number, totalCount: number): number {
  return getChipAngle(index, totalCount) + 180 / totalCount;
}

/** CSS `conic-gradient(...)` value tinting each of `totalCount` evenly-spaced chips' angular
 * span with its own color (see ROOT_SECTOR_FILL_OPACITY / hexToRgba in constants.ts for producing
 * a translucent entry) — `colors[i]` must correspond to the chip at `getChipAngle(i, totalCount)`.
 * Hard stops (not a smooth blend) at each getWheelDividerAngle boundary, so a sector's fill lines
 * up exactly with its bounding divider lines. A single static gradient works here (unlike the
 * radial wheel variants) because this wheel's chips are evenly spaced and the whole `.gtv-wheel`
 * box rotates as one unit — nesting this inside that box lets it rotate for free instead of
 * needing its own per-sector rotation. Empty string (no fill) below 2 colors, matching the "no
 * dividers for 1 root" rule. */
export function buildWheelSectorGradient(colors: string[]): string {
  const n = colors.length;
  if (n < 2) return "";
  const span = 360 / n;
  // Starts the gradient at chip 0's own leading boundary so the first hard stop lands exactly on
  // a divider instead of splitting chip 0's own sector across the gradient's 0deg seam.
  const startAngle = getWheelDividerAngle(n - 1, n);
  const stops = colors.map((color, i) => `${color} ${i * span}deg ${(i + 1) * span}deg`).join(", ");
  return `conic-gradient(from ${startAngle}deg, ${stops})`;
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
