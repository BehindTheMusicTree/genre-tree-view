"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { NODE_DOT_MIN_RADIUS, TREE_COLORS } from "./constants";

// Neutral grays rather than the real wheel's per-root tints, so the loading state reads as a
// placeholder — see GenreTreeSkeleton's comment on why these are approximated, not imported.
const SHAPE_COLOR = "#D4D4D8";
const SECTOR_FILL_OPACITY = 0.22;
const INNER_TINT_OPACITY = 0.55;
const POP_LINK_OPACITY = 0.6;
const CANVAS_PADDING = 20;

const N_ROOTS = 9;

// Radii (from the wheel's center) mirror the real pop/core wheel: a small mainstream subtree at
// the center, the ring roots on the circle bounding the white "pop" region, each root's pop
// branch reaching inward and its core branch outward.
const MAINSTREAM_RADIUS = 70;
const RING_RADIUS = 300;
const POP_RADII = [245, 195, 145];
const CORE_RADII = [375, 445, 515, 575];

const ROOT_DOT_RADIUS_RANGE = 8;
const LEVEL1_DOT_RADIUS_RANGE = 3;
const LINK_WIDTH = 1;
const LEAF_LINK_WIDTH = 0.75;

// Angles use the real wheel's convention (0 = top, clockwise), so the sector gradient below
// lines up with the dots without any translation.
type Point = { x: number; y: number };
type Polar = { angle: number; radius: number; point: Point };
type Dot = { point: Point; r: number };
type Link = { d: string; width: number; opacity: number };

// Math.sin/Math.cos aren't specified to the ULP by ECMAScript, so raw trig output can differ in
// the last float digit between server (Node) and client (browser) V8. Rounding well below that
// noise floor makes every coordinate byte-identical across environments, so this can safely SSR.
const COORDINATE_PRECISION = 1000;

function round(value: number): number {
  return Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION;
}

function pointOnCircle(angleDeg: number, radius: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: round(radius * Math.sin(rad)), y: round(-radius * Math.cos(rad)) };
}

// Deterministic (not Math.random()) so server and client renders stay identical.
function unitRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return round(x - Math.floor(x));
}

function randomCount(seed: number, min: number, max: number): number {
  return Math.min(max, min + Math.floor(unitRandom(seed) * (max - min + 1)));
}

function fanAngles(center: number, spread: number, count: number): number[] {
  if (count <= 1) return [center];
  const step = spread / (count - 1);
  return Array.from({ length: count }, (_, i) => center - spread / 2 + i * step);
}

// Same shape as d3.linkRadial: a cubic whose control points sit at the mid radius on each end's
// own angle, so branches curve along the wheel's rings instead of cutting chords across them.
function linkPath(from: Polar, to: Polar): string {
  const midRadius = (from.radius + to.radius) / 2;
  const c0 = pointOnCircle(from.angle, midRadius);
  const c1 = pointOnCircle(to.angle, midRadius);
  return `M${from.point.x},${from.point.y} C${c0.x},${c0.y} ${c1.x},${c1.y} ${to.point.x},${to.point.y}`;
}

const DOTS: Dot[] = [];
const LINKS: Link[] = [];

function addNode(angle: number, radius: number, dotRadius: number): Polar {
  const point = pointOnCircle(angle, radius);
  DOTS.push({ point, r: dotRadius });
  return { angle, radius, point };
}

function addLink(from: Polar, to: Polar, width: number, opacity = 1) {
  LINKS.push({ d: linkPath(from, to), width, opacity });
}

// Roots share the circle unevenly, like the real wheel's weight-proportional sectors; each root
// sits at the middle of its own span and its branches fan within it.
const ROOT_WEIGHTS = Array.from({ length: N_ROOTS }, (_, i) => 0.25 + 0.75 * unitRandom(i * 17 + 3));
const TOTAL_WEIGHT = ROOT_WEIGHTS.reduce((sum, weight) => sum + weight, 0);

type Sector = { startAngle: number; endAngle: number; color: string };
const SECTORS: Sector[] = [];
{
  let cursor = (-360 * ROOT_WEIGHTS[0]) / TOTAL_WEIGHT / 2;
  ROOT_WEIGHTS.forEach((weight, i) => {
    const span = (360 * weight) / TOTAL_WEIGHT;
    SECTORS.push({ startAngle: cursor, endAngle: cursor + span, color: TREE_COLORS[i % TREE_COLORS.length] });
    cursor += span;
  });
}

function buildMainstream() {
  const center = addNode(0, 0, NODE_DOT_MIN_RADIUS * 2);
  const level1Count = 6;
  fanAngles(0, 360 - 360 / level1Count, level1Count).forEach((angle, i) => {
    const level1 = addNode(angle, 26, NODE_DOT_MIN_RADIUS * 0.8);
    addLink(center, level1, LINK_WIDTH);
    const leafCount = randomCount(i * 5 + 101, 2, 3);
    fanAngles(angle, 40, leafCount).forEach((leafAngle) => {
      addLink(level1, addNode(leafAngle, 50, NODE_DOT_MIN_RADIUS * 0.5), LEAF_LINK_WIDTH);
    });
  });
}

function buildRoot(index: number) {
  const { startAngle, endAngle } = SECTORS[index];
  const angle = (startAngle + endAngle) / 2;
  const usable = (endAngle - startAngle) * 0.8;
  const weight = ROOT_WEIGHTS[index];
  const leafDotRadius = NODE_DOT_MIN_RADIUS * 0.6;

  const root = addNode(angle, RING_RADIUS, NODE_DOT_MIN_RADIUS + weight * ROOT_DOT_RADIUS_RANGE);

  const popLevel1 = addNode(angle, POP_RADII[0], NODE_DOT_MIN_RADIUS + weight * LEVEL1_DOT_RADIUS_RANGE * 0.6);
  addLink(root, popLevel1, LINK_WIDTH, POP_LINK_OPACITY);
  const popLevel2Count = 2 + Math.round(weight * 2);
  fanAngles(angle, usable * 0.5, popLevel2Count).forEach((level2Angle, i) => {
    const popLevel2 = addNode(level2Angle, POP_RADII[1], NODE_DOT_MIN_RADIUS * 0.8);
    addLink(popLevel1, popLevel2, LINK_WIDTH, POP_LINK_OPACITY);
    const leafCount = randomCount(index * 31 + i * 7 + 211, 2, 3);
    fanAngles(level2Angle, (usable * 0.5) / popLevel2Count, leafCount).forEach((leafAngle) => {
      addLink(popLevel2, addNode(leafAngle, POP_RADII[2], leafDotRadius), LEAF_LINK_WIDTH, POP_LINK_OPACITY);
    });
  });

  const coreLevel1 = addNode(angle, CORE_RADII[0], NODE_DOT_MIN_RADIUS + weight * LEVEL1_DOT_RADIUS_RANGE);
  addLink(root, coreLevel1, LINK_WIDTH);
  const coreLevel2Count = 2 + Math.round(weight * 5);
  const coreLevel2Spread = usable * 0.75;
  const level2Slot = coreLevel2Spread / coreLevel2Count;
  fanAngles(angle, coreLevel2Spread, coreLevel2Count).forEach((level2Angle, i) => {
    const coreLevel2 = addNode(level2Angle, CORE_RADII[1], NODE_DOT_MIN_RADIUS * 0.9);
    addLink(coreLevel1, coreLevel2, LINK_WIDTH);
    const level3Count = randomCount(index * 31 + i * 7 + 1, 2, 5);
    fanAngles(level2Angle, level2Slot * 0.9, level3Count).forEach((level3Angle, j) => {
      const coreLevel3 = addNode(level3Angle, CORE_RADII[2], leafDotRadius);
      addLink(coreLevel2, coreLevel3, LEAF_LINK_WIDTH);
      if (weight < 0.75) return;
      const level4Count = randomCount(index * 131 + i * 17 + j * 3 + 401, 1, 2);
      fanAngles(level3Angle, (level2Slot * 0.9) / level3Count, level4Count).forEach((level4Angle) => {
        addLink(coreLevel3, addNode(level4Angle, CORE_RADII[3], leafDotRadius * 0.8), LEAF_LINK_WIDTH);
      });
    });
  });
}

buildMainstream();
for (let i = 0; i < N_ROOTS; i++) buildRoot(i);

// Square and centered on the wheel's pivot (like the real wheel) so the shimmer's rotation
// origin stays at the viewBox's own middle.
const CONTENT_RADIUS = Math.max(
  RING_RADIUS,
  ...DOTS.map((dot) => Math.hypot(dot.point.x, dot.point.y) + dot.r),
);
const CANVAS_SIZE = (CONTENT_RADIUS + CANVAS_PADDING) * 2;
const CANVAS_ORIGIN = -(CONTENT_RADIUS + CANVAS_PADDING);

// Rendered as a CSS conic-gradient on a layer separate from the content SVG (see the component
// below) rather than as SVG wedge paths sharing the content's own viewBox: the content SVG uses
// `preserveAspectRatio="xMidYMid meet"` so the wheel itself is never cropped, but "meet" letterboxes
// a square viewBox inside a non-square container — a wedge drawn in that same coordinate space
// would letterbox too, leaving the container's corners uncolored. A CSS gradient instead covers
// `100% / 100%` of the container directly, independent of the content's aspect ratio.
// CSS conic-gradient's 0deg (12 o'clock, clockwise) matches this file's own angle convention, so
// stops need only be shifted so the first one starts at 0deg.
const SECTOR_GRADIENT_ROTATION = SECTORS[0].startAngle;
const SECTOR_GRADIENT_CSS = `conic-gradient(from ${SECTOR_GRADIENT_ROTATION}deg, ${SECTORS.map(
  (sector) =>
    `${sector.color} ${sector.startAngle - SECTOR_GRADIENT_ROTATION}deg ${
      sector.endAngle - SECTOR_GRADIENT_ROTATION
    }deg`,
).join(", ")})`;

// The sweep is an HTML layer (rotating on the compositor) clipped by a static mask, instead of
// an SVG <mask> re-rasterized every frame: SVG children can't be composited, so animating a wedge
// under an SVG mask repaints hundreds of shapes per frame on the main thread, which is busiest
// exactly while the skeleton is shown. The mask ships as wheel-skeleton-mask.svg (referenced from
// styles.css, snapshot-tested against this function) so it applies from the first paint.
export function buildMaskSvgMarkup(): string {
  const links = LINKS.map(
    (link) =>
      `<path d="${link.d}" fill="none" stroke="#fff" stroke-width="${link.width}" stroke-opacity="${link.opacity}" stroke-linecap="round"/>`,
  ).join("");
  const dots = DOTS.map((dot) => `<circle cx="${dot.point.x}" cy="${dot.point.y}" r="${dot.r}" fill="#fff"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CANVAS_ORIGIN} ${CANVAS_ORIGIN} ${CANVAS_SIZE} ${CANVAS_SIZE}">${links}${dots}</svg>`;
}

// Start time of the first skeleton's spin, shared so every later remount (one per loading stage)
// continues at the same angle instead of restarting from 0deg.
let sharedStartTime: CSSNumberish | null = null;

export function GenreTreeWheelSkeleton() {
  // Unique per mount so multiple skeletons on one page don't collide on <defs> ids.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const shapesId = `genre-tree-wheel-skeleton-shapes-${uid}`;
  const mainstreamId = `genre-tree-wheel-skeleton-mainstream-${uid}`;
  const wedgeRef = useRef<HTMLDivElement>(null);

  // The mask and the spin come from CSS so the server-rendered skeleton is already correct before
  // hydration; this only syncs the phase. No animation means reduced motion or no WAAPI.
  useLayoutEffect(() => {
    const [animation] = wedgeRef.current?.getAnimations?.() ?? [];
    if (!animation) return;
    sharedStartTime ??= animation.startTime ?? document.timeline.currentTime;
    animation.startTime = sharedStartTime;
  }, []);

  return (
    <div className="gtv-wheel-skeleton">
      <div
        className="gtv-wheel-skeleton-sector-layer"
        style={{ background: SECTOR_GRADIENT_CSS, opacity: SECTOR_FILL_OPACITY }}
        aria-hidden="true"
      />
      <span className="gtv-skeleton-sr-only">Loading genre tree…</span>
      <svg
        viewBox={`${CANVAS_ORIGIN} ${CANVAS_ORIGIN} ${CANVAS_SIZE} ${CANVAS_SIZE}`}
        preserveAspectRatio="xMidYMid meet"
        className="gtv-wheel-skeleton-svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={mainstreamId}>
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.45} />
            <stop offset="65%" stopColor="#FFFFFF" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
          </radialGradient>
          <g id={shapesId}>
            {LINKS.map((link, i) => (
              <path
                key={`link-${i}`}
                d={link.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={link.width}
                strokeOpacity={link.opacity}
                strokeLinecap="round"
              />
            ))}
            {DOTS.map((dot, i) => (
              <circle key={`dot-${i}`} cx={dot.point.x} cy={dot.point.y} r={dot.r} fill="currentColor" />
            ))}
          </g>
        </defs>

        <circle cx={0} cy={0} r={RING_RADIUS} fill="#FFFFFF" fillOpacity={INNER_TINT_OPACITY} />
        <circle cx={0} cy={0} r={MAINSTREAM_RADIUS} fill={`url(#${mainstreamId})`} />

        <use href={`#${shapesId}`} color={SHAPE_COLOR} />
      </svg>
      <div className="gtv-wheel-skeleton-shimmer" aria-hidden="true">
        <div ref={wedgeRef} className="gtv-wheel-skeleton-shimmer-wedge" />
      </div>
    </div>
  );
}
