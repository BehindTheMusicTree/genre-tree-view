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
