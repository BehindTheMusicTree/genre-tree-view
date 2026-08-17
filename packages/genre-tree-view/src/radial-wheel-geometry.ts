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

/** Full radial layout for `rootCount` roots (fixed ring order) with `clickedIndex` landing at
 * `landingAngle` (CSS `rotate()` convention: 0 = top, clockwise; 90 = right, this wheel's
 * confirmed landing direction). Up to 4 cardinal roots sit at landingAngle + {0,90,180,270} and
 * are developed; any remaining roots space evenly within the arc between their two bounding
 * cardinals and are not developed. Returns one entry per ring index (0..rootCount-1), indexable
 * by the same index groupNodesByRoot's output uses. Empty for rootCount <= 0. */
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
      for (let k = 0; k < count; k++) {
        const rootIndex = (clickedIndex + start + 1 + k) % rootCount;
        const relAngle = i * 90 + ((k + 1) * 90) / (count + 1);
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
