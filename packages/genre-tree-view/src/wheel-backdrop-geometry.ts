import type { PanZoomView } from "./use-pan-zoom";

/** Slack on `farRadius` so antialiased edges and sub-pixel pan between two view updates never show
 * the backdrop's own end. */
const FAR_RADIUS_MARGIN = 1.05;

/** Radius (stage px) a polar shape centered on the pivot must reach to cover the whole viewport at
 * `view`. The pivot's screen position is `view.{x,y} + view.k * pivot`; the answer is the farthest
 * viewport corner from it, in stage units. Exact for the current view, so it needs no knowledge of
 * the pan clamp or the minimum zoom. */
export function farRadius(
  view: PanZoomView,
  viewportSize: { width: number; height: number },
  pivot: { x: number; y: number },
): number {
  if (!(view.k > 0)) throw new Error("farRadius: view.k must be positive");
  const px = view.x + view.k * pivot.x;
  const py = view.y + view.k * pivot.y;
  const reach = Math.max(
    Math.hypot(px, py),
    Math.hypot(viewportSize.width - px, py),
    Math.hypot(px, viewportSize.height - py),
    Math.hypot(viewportSize.width - px, viewportSize.height - py),
  );
  return (reach / view.k) * FAR_RADIUS_MARGIN;
}

function polar(angleDeg: number, radius: number): [number, number] {
  const theta = (angleDeg * Math.PI) / 180;
  return [radius * Math.sin(theta), -radius * Math.cos(theta)];
}

const fmt = (n: number) => Number(n.toFixed(3)).toString();

/** SVG path `d` of the annular sector between `innerRadius` and `outerRadius`, spanning
 * `startDeg`..`endDeg` clockwise, in CSS `rotate()` convention (0° = up) around the origin.
 * `innerRadius` 0 gives a plain pie slice. A sweep of 360° or more is drawn as a full ring/disc;
 * a non-positive sweep as an empty path. */
export function annularSectorPath(
  startDeg: number,
  endDeg: number,
  innerRadius: number,
  outerRadius: number,
): string {
  const sweep = endDeg - startDeg;
  if (!(sweep > 0) || !(outerRadius > innerRadius)) return "";
  if (sweep >= 360) {
    const ring = (r: number, sweepFlag: 0 | 1) =>
      `M0 ${fmt(-r)}A${fmt(r)} ${fmt(r)} 0 1 ${sweepFlag} 0 ${fmt(r)}A${fmt(r)} ${fmt(r)} 0 1 ${sweepFlag} 0 ${fmt(-r)}Z`;
    return innerRadius > 0 ? ring(outerRadius, 1) + ring(innerRadius, 0) : ring(outerRadius, 1);
  }
  const largeArc = sweep > 180 ? 1 : 0;
  const [ox0, oy0] = polar(startDeg, outerRadius);
  const [ox1, oy1] = polar(endDeg, outerRadius);
  const outer = `M${fmt(ox0)} ${fmt(oy0)}A${fmt(outerRadius)} ${fmt(outerRadius)} 0 ${largeArc} 1 ${fmt(ox1)} ${fmt(oy1)}`;
  if (innerRadius <= 0) return `${outer}L0 0Z`;
  const [ix1, iy1] = polar(endDeg, innerRadius);
  const [ix0, iy0] = polar(startDeg, innerRadius);
  return `${outer}L${fmt(ix1)} ${fmt(iy1)}A${fmt(innerRadius)} ${fmt(innerRadius)} 0 ${largeArc} 0 ${fmt(ix0)} ${fmt(iy0)}Z`;
}

/** End point (x2, y2) of the radial line from the origin at `angleDeg` (CSS `rotate()` convention). */
export function dividerEnd(angleDeg: number, radius: number): { x2: number; y2: number } {
  const [x2, y2] = polar(angleDeg, radius);
  return { x2: Number(fmt(x2)), y2: Number(fmt(y2)) };
}

/** Brings the angular span `span` into the frame of `sector` (the two may differ by a multiple of
 * 360°) and clamps it to the sector; null when nothing of it lies inside. Keeps a hole cut from the
 * sector's path inside it, which the evenodd fill rule needs. */
export function clampSpanToSector(
  span: { startDeg: number; endDeg: number },
  sector: { startDeg: number; endDeg: number },
): { startDeg: number; endDeg: number } | null {
  const turns = Math.round(
    ((sector.startDeg + sector.endDeg) / 2 - (span.startDeg + span.endDeg) / 2) / 360,
  );
  const startDeg = Math.max(span.startDeg + turns * 360, sector.startDeg);
  const endDeg = Math.min(span.endDeg + turns * 360, sector.endDeg);
  return endDeg > startDeg ? { startDeg, endDeg } : null;
}
