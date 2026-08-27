export interface RadialSlot {
  rootIndex: number;
  angle: number;
  isCardinal: boolean;
}

/** Ring offsets (0 = the clicked root itself) of the up to min(rootCount, 4) cardinal roots, in
 * clockwise ring order starting at the clicked root. Divides the ring into up to 4 arcs of
 * as-equal-as-possible root COUNT (not angle) — offsets[i] = round(i * rootCount / 4). offsets[0]
 * is always 0. When rootCount <= 4, every root is a cardinal, so this reduces to [0..rootCount-1]. */
export function getCardinalRingOffsets(rootCount: number): number[] {
  if (rootCount <= 0) return [];
  const cardinalCount = Math.min(rootCount, 4);
  const offsets: number[] = [];
  for (let i = 0; i < cardinalCount; i++) {
    offsets.push(Math.round((i * rootCount) / 4));
  }
  return offsets;
}

/** Non-cardinal roots within an arc are pulled slightly toward whichever end of that arc sits on
 * the circle's horizontal diameter (screen angle 90 or 270), rather than spaced purely evenly —
 * keeps filler chips/mini-trees a bit further from the vertical (top/bottom) extremes of the ring,
 * where they'd otherwise crowd the frame edge. >1 = bias toward the horizontal end; 1 = even
 * spacing (no bias). */
const HORIZONTAL_BIAS_EXPONENT = 1.35;

/** True when `angle` (CSS `rotate()` convention, 0 = top, clockwise) sits on the circle's
 * horizontal diameter (90 = right or 270 = left) rather than its vertical one (0 = top or
 * 180 = bottom). This is a screen-space property of the fixed circle, independent of landingAngle
 * (which only chooses which root occupies which angle, not where the circle's own axes are). */
function isHorizontalAngle(angle: number): boolean {
  return ((angle % 180) + 180) % 180 === 90;
}

/** Full radial layout for `rootCount` roots (fixed ring order) with `clickedIndex` landing at
 * `landingAngle` (CSS `rotate()` convention: 0 = top, clockwise; 90 = right, this wheel's
 * confirmed landing direction). Up to 4 cardinal roots sit at landingAngle + {0,90,180,270} and
 * are developed; any remaining roots space within the arc between their two bounding cardinals,
 * biased slightly toward whichever end of that arc is horizontal (see HORIZONTAL_BIAS_EXPONENT),
 * and are not developed. Returns one entry per ring index (0..rootCount-1), indexable by the same
 * index groupNodesByRoot's output uses. Empty for rootCount <= 0. */
export function computeRadialLayout(rootCount: number, clickedIndex: number, landingAngle: number): RadialSlot[] {
  if (rootCount <= 0) return [];

  const offsets = getCardinalRingOffsets(rootCount);
  const cardinalCount = offsets.length;
  const slots: RadialSlot[] = new Array(rootCount);

  for (let i = 0; i < cardinalCount; i++) {
    const rootIndex = (clickedIndex + offsets[i]) % rootCount;
    slots[rootIndex] = { rootIndex, angle: (i * 90 + landingAngle) % 360, isCardinal: true };
  }

  if (cardinalCount === 4) {
    for (let i = 0; i < 4; i++) {
      const start = offsets[i];
      const end = i < 3 ? offsets[i + 1] : rootCount;
      const count = end - start - 1;
      const horizontalAtArcStart = isHorizontalAngle((i * 90 + landingAngle) % 360);
      for (let k = 0; k < count; k++) {
        const rootIndex = (clickedIndex + start + 1 + k) % rootCount;
        const t = (k + 1) / (count + 1);
        const biasedT = horizontalAtArcStart
          ? Math.pow(t, HORIZONTAL_BIAS_EXPONENT)
          : 1 - Math.pow(1 - t, HORIZONTAL_BIAS_EXPONENT);
        const relAngle = i * 90 + biasedT * 90;
        slots[rootIndex] = { rootIndex, angle: (relAngle + landingAngle) % 360, isCardinal: false };
      }
    }
  }

  return slots;
}

/** Midpoint angle between two chip angles that may be continuous/unwrapped (e.g. from
 * computeContinuousAngles), taking the shorter arc between them rather than always going the
 * increasing-angle way — brings `b` within 180 degrees of `a` before averaging, so the divider
 * sits between the two chips visually instead of on the far side of the circle. Used to place a
 * radial divider on the boundary between two angularly-adjacent roots. */
export function bisectAngles(a: number, b: number): number {
  const diff = b - a;
  const adjustedB = diff > 180 ? b - 360 : diff < -180 ? b + 360 : b;
  return (a + adjustedB) / 2;
}

/** `clip-path: polygon(...)` value for a filled circular-sector fan spanning `[0, sweepDeg]`,
 * measured clockwise from local "up" (CSS `rotate()` convention) — meant for a huge square element
 * centered on the wheel's pivot (same oversized-element + `.gtv-wheel-container` overflow: hidden
 * clipping trick as `.gtv-wheel-divider`), then rotated to its sector's own start angle via
 * `transform: rotate()`, same as a divider line. Interpolates a point every `stepDeg` (default 10)
 * around the arc rather than just the two end rays: a naive 3-point triangle (center + two far
 * points) chord-clips away the middle of any sector wider than ~180 degrees, which every root gets
 * when there are only 2. Radius 50% (of the element's own box) reaches that huge element's edge,
 * same as the box being exactly 2x oversized in every direction from center. Empty string (no
 * shape / nothing rendered) for a non-positive sweep. */
export function buildSectorClipPathPolygon(sweepDeg: number, stepDeg = 10): string {
  if (sweepDeg <= 0) return "";
  const points: string[] = ["50% 50%"];
  const steps = Math.max(1, Math.ceil(sweepDeg / stepDeg));
  for (let i = 0; i <= steps; i++) {
    const theta = (Math.min(i * stepDeg, sweepDeg) * Math.PI) / 180;
    const x = 50 + 50 * Math.sin(theta);
    const y = 50 - 50 * Math.cos(theta);
    points.push(`${x}% ${y}%`);
  }
  return `polygon(${points.join(", ")})`;
}

/** Start/end angle (continuous, CSS `rotate()` convention — may exceed 360 or go negative, same as
 * `continuousAngleByRootId`) of the sector belonging to the root at `index` in `continuousAngles`
 * (ring order). Both bounds are computed anchored on that root's own continuous angle (`bisectAngles(mine, neighbor)`,
 * not the reverse) so they land in the same unwrapped frame as each other regardless of how far
 * `continuousAngleByRootId` has wound up over prior re-layouts — `end - start` is always the
 * sector's true sweep instead of an arbitrary multiple of 360 off, unlike naively differencing two
 * independently-anchored `dividerAngles` entries.
 *
 * n === 2 is special-cased: with only one other root, `prev` and `next` are the same root, so the
 * general formula above degenerates to a zero-width sector (both bounds land on the same
 * shortest-arc bisection). There, the single boundary between the two roots and its opposite point
 * (+/- 180) are each root's two bounds — same as the two (coincident) entries dividerAngles
 * produces for n === 2, just split into the two 180-degree halves they actually imply. */
export function computeSectorBounds(
  continuousAngles: number[],
  index: number,
): { start: number; end: number } {
  const n = continuousAngles.length;
  const mine = continuousAngles[index];

  if (n === 2) {
    const other = continuousAngles[(index + 1) % 2];
    const boundary = bisectAngles(mine, other);
    return mine < boundary ? { start: boundary - 180, end: boundary } : { start: boundary, end: boundary + 180 };
  }

  const prev = continuousAngles[(index - 1 + n) % n];
  const next = continuousAngles[(index + 1) % n];
  return { start: bisectAngles(mine, prev), end: bisectAngles(mine, next) };
}

/** Generalizes calculateWheelRadius's chord-overlap guarantee (see wheel-geometry.ts) to
 * non-uniformly-spaced angles: the ring only needs to grow enough to clear the SMALLEST adjacent
 * gap actually present (including the wraparound gap from the last angle back to the first), not
 * a uniform 360/n gap. Falls back to baseRadius when there are fewer than 2 angles, since a
 * single chip has no neighbor to overlap. */
export function calculateWheelRadiusForAngles(angles: number[], maxChipWidth: number, baseRadius: number): number {
  if (angles.length < 2) return baseRadius;

  const sorted = [...angles].sort((a, b) => a - b);
  let minGapDeg = 360;
  for (let i = 0; i < sorted.length; i++) {
    const next = i < sorted.length - 1 ? sorted[i + 1] : sorted[0] + 360;
    minGapDeg = Math.min(minGapDeg, next - sorted[i]);
  }
  if (minGapDeg <= 0) return baseRadius;

  const CHIP_GAP = 16;
  const requiredRadius = (maxChipWidth + CHIP_GAP) / (2 * Math.sin((minGapDeg * Math.PI) / 360));
  return Math.max(baseRadius, requiredRadius);
}
