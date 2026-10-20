export interface RadialSlot {
  rootIndex: number;
  angle: number;
}

/** Full radial layout for `weights.length` roots (fixed ring order) with `clickedIndex` landing at
 * `landingAngle` (CSS `rotate()` convention: 0 = top, clockwise; 90 = right, this wheel's
 * confirmed landing direction). Every root gets an arc proportional to its own `weights` entry
 * (its subtree's node count) rather than an equal `360/rootCount` share — a root with more nodes
 * occupies proportionally more of the circle. Ring order is unchanged: roots are still laid out
 * in order starting at the clicked root, walking the ring from `clickedIndex`. Each root's angle
 * is the center of its own proportionally-sized arc, so the clicked root's arc is centered exactly
 * on `landingAngle`, matching the even-spacing case's guarantee that the clicked root's own angle
 * equals `landingAngle`. Every root is fully developed. Returns one entry per ring index
 * (0..weights.length-1), indexable by the same index groupNodesByRoot's output uses. Empty for
 * `weights.length <= 0`. Every weight must be positive (a root's own weight is its subtree's node
 * count, which always includes the root itself, so a zero/negative weight indicates invalid
 * input rather than a real, reachable state) — throws otherwise rather than silently coercing it. */
export function computeRadialLayout(weights: number[], clickedIndex: number, landingAngle: number): RadialSlot[] {
  const rootCount = weights.length;
  if (rootCount <= 0) return [];

  if (weights.some((weight) => weight <= 0)) {
    throw new Error("computeRadialLayout: every root weight (node count) must be positive");
  }

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const orderedWidths = weights.map((_, i) => (weights[(clickedIndex + i) % rootCount] / total) * 360);

  const slots: RadialSlot[] = new Array(rootCount);
  let boundary = landingAngle - orderedWidths[0] / 2;
  for (let i = 0; i < rootCount; i++) {
    const width = orderedWidths[i];
    const rootIndex = (clickedIndex + i) % rootCount;
    slots[rootIndex] = { rootIndex, angle: (((boundary + width / 2) % 360) + 360) % 360 };
    boundary += width;
  }

  return slots;
}

/** Each root's true angular sector width in degrees, proportional to its own `weights` entry out
 * of the total — the same per-root share `computeRadialLayout` uses internally to place chips, but
 * exposed directly so callers reconstructing a root's sector bounds (dividers, colored wash, wedge
 * caps) can derive them from the actual weights instead of bisecting neighboring roots' angles
 * (which only approximates the true bounds, and badly so when neighbors' weights differ a lot from
 * the root's own — see computeSectorBounds). */
export function computeSectorWidths(weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => (weight / total) * 360);
}

/** Splits a wedge (centered on `wedgeCenterDeg`, spanning `wedgeSpanDeg`) into `weights.length`
 * sub-wedges, each proportional to its own weight — same proportional-width logic as
 * `computeSectorWidths`, applied within a wedge instead of the full 360deg circle. A wedge, unlike
 * the full ring, never wraps past 360, so sub-wedges are simply laid out left to right from the
 * wedge's own start angle. Returns each sub-wedge's own center angle and span, in the same order
 * as `weights`. Empty for `weights.length <= 0`. */
export function subdivideWedge(
  wedgeCenterDeg: number,
  wedgeSpanDeg: number,
  weights: number[],
): { centerDeg: number; spanDeg: number }[] {
  if (weights.length <= 0) return [];

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const spans = weights.map((weight) => (weight / total) * wedgeSpanDeg);

  const slices: { centerDeg: number; spanDeg: number }[] = [];
  let boundary = wedgeCenterDeg - wedgeSpanDeg / 2;
  for (const spanDeg of spans) {
    slices.push({ centerDeg: boundary + spanDeg / 2, spanDeg });
    boundary += spanDeg;
  }
  return slices;
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

/** Widest symmetric wedge, centered on the root's own angle (`continuousAngles[index]`), that still
 * fits entirely within that root's actual angular sector (see `computeSectorBounds`) — twice the
 * smaller of the two distances from the root's own angle to each of its sector's bounds. A sector
 * isn't generally symmetric around the root's own angle (neighbors can sit at uneven angular
 * distances, e.g. when `computeRadialLayout` gives roots weight-proportional arc widths), so capping
 * a symmetric wedge at the raw sector width (`end - start`) lets the wider side spill past its
 * boundary into the neighboring sector even though the narrower side has no slack to give. */
export function computeSectorSymmetricSpan(continuousAngles: number[], index: number): number {
  const mine = continuousAngles[index];
  const { start, end } = computeSectorBounds(continuousAngles, index);
  return 2 * Math.min(mine - start, end - mine);
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

/** Smallest radius ≥ `floorRadius` at which `angleNeededAt(radius)` (rad, non-increasing in
 * radius) fits the full circle — binary-searched since what a ring needs depends on its radius. */
export function solveRingRadius(angleNeededAt: (radius: number) => number, floorRadius: number): number {
  const fits = (radius: number) => angleNeededAt(radius) <= 2 * Math.PI;
  if (fits(floorRadius)) return floorRadius;
  let lo = floorRadius;
  let hi = floorRadius * 2;
  while (!fits(hi)) {
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LabelCullItem {
  id: string;
  /** Candidate label boxes, in preference order. */
  labels: Box[];
  dot: Box;
  priority: number;
  /** Drawn even when no candidate is free: falls back to the first one and still blocks later labels. */
  forced?: boolean;
}

const boxesOverlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const GRID_CELL = 64;

/** Uniform-grid index over boxes: `some` only visits boxes sharing a cell with the query box. */
function createBoxGrid<T>() {
  const cells = new Map<string, { box: Box; value: T }[]>();
  const cellRange = (box: Box) => ({
    cx0: Math.floor(box.x0 / GRID_CELL),
    cx1: Math.floor(box.x1 / GRID_CELL),
    cy0: Math.floor(box.y0 / GRID_CELL),
    cy1: Math.floor(box.y1 / GRID_CELL),
  });
  return {
    insert(box: Box, value: T) {
      const { cx0, cx1, cy0, cy1 } = cellRange(box);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const key = `${cx},${cy}`;
          const bucket = cells.get(key);
          if (bucket) bucket.push({ box, value });
          else cells.set(key, [{ box, value }]);
        }
      }
    },
    some(box: Box, predicate: (value: T) => boolean) {
      const { cx0, cx1, cy0, cy1 } = cellRange(box);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          if (cells.get(`${cx},${cy}`)?.some((entry) => boxesOverlap(box, entry.box) && predicate(entry.value))) {
            return true;
          }
        }
      }
      return false;
    },
  };
}

/** Index of each item's chosen label candidate, or -1 when it must be hidden: greedily, by
 * descending priority, takes each item's first candidate that overlaps no already-placed label and
 * no other node's dot (a `forced` item falls back to its first candidate instead of hiding). */
export function placeLabels(items: LabelCullItem[]): Map<string, number> {
  const placement = new Map<string, number>();
  const keptGrid = createBoxGrid<true>();
  const dotGrid = createBoxGrid<string>();
  for (const item of items) dotGrid.insert(item.dot, item.id);
  for (const item of [...items].sort((a, b) => b.priority - a.priority)) {
    let index = item.labels.findIndex(
      (label) => !keptGrid.some(label, () => true) && !dotGrid.some(label, (id) => id !== item.id),
    );
    if (index < 0 && item.forced && item.labels.length > 0) index = 0;
    placement.set(item.id, index);
    if (index >= 0) keptGrid.insert(item.labels[index], true);
  }
  return placement;
}

/** Id of the sector (degrees, `center ± span / 2`, any winding) containing `angle`, or null. */
export function findSectorAtAngle(
  angle: number,
  sectors: { id: string; center: number; span: number }[],
): string | null {
  const sector = sectors.find(
    ({ center, span }) => Math.abs(((((angle - center) % 360) + 540) % 360) - 180) <= span / 2,
  );
  return sector?.id ?? null;
}

const boxGap = (a: Box, b: Box) =>
  Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));

/** Center of a `width` x `height` box inside `area` that overlaps no obstacle, sampled on a grid:
 * spots passing `prefer` first, then the widest gap to the nearest obstacle (capped at `height`, so
 * "clear enough" ties), then the one closest to the area's center. Null when every spot is blocked. */
// ponytail: fixed 9x9 sampling grid, sample finer if labels visibly miss obvious gaps.
export function pickEmptyLabelSpot(
  area: Box,
  width: number,
  height: number,
  obstacles: Box[],
  prefer: (x: number, y: number) => boolean = () => true,
): { x: number; y: number } | null {
  const STEPS = 9;
  const spanX = area.x1 - area.x0 - width;
  const spanY = area.y1 - area.y0 - height;
  if (spanX < 0 || spanY < 0) return null;
  const centerX = (area.x0 + area.x1) / 2;
  const centerY = (area.y0 + area.y1) / 2;
  let best: { x: number; y: number; score: [number, number, number] } | null = null;
  for (let i = 0; i < STEPS; i++) {
    for (let j = 0; j < STEPS; j++) {
      const x = area.x0 + width / 2 + (spanX * i) / (STEPS - 1);
      const y = area.y0 + height / 2 + (spanY * j) / (STEPS - 1);
      const box = { x0: x - width / 2, x1: x + width / 2, y0: y - height / 2, y1: y + height / 2 };
      if (obstacles.some((obstacle) => boxesOverlap(box, obstacle))) continue;
      const gap = Math.min(height, ...obstacles.map((obstacle) => boxGap(box, obstacle)));
      const score: [number, number, number] = [
        prefer(x, y) ? 1 : 0,
        gap,
        -Math.hypot(x - centerX, y - centerY),
      ];
      const k = best ? score.findIndex((value, index) => value !== best!.score[index]) : 0;
      if (!best || (k >= 0 && score[k] > best.score[k])) best = { x, y, score };
    }
  }
  return best && { x: best.x, y: best.y };
}
