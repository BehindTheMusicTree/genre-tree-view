"use client";

import { useId } from "react";
import { getGenreTreeColor } from "./constants";

// Card fill/border match the connector color (rather than GenreTreeSkeleton's lighter tokens) so
// wheel nodes stay visible against this skeleton's own light background — see that file's comment
// on why these are approximated rather than imported.
const CONNECTOR_COLOR = "#D4D4D8";
const CARD_FILL = CONNECTOR_COLOR;
const CARD_BORDER_COLOR = CONNECTOR_COLOR;
const RING_COLOR = "#E4E4E7";
const CORNER_RADIUS = 1;
const SHIMMER_HIGHLIGHT_COLOR = "#FFFFFF";
const SECTOR_FILL_OPACITY = 0.16;

const HUB_RADIUS = 46;
const WHEEL_RADIUS = 140;
const CANVAS_PADDING = 20;

// Mirrors the real wheel's root-chip ring: one chip per root, evenly spaced — see
// getCardinalRingOffsets/computeRadialLayout in the genre-tree-view package for the real layout
// this approximates. Every root gets the same deep 3-level radiating subtree (~30 nodes) so the
// loading state reads as "a handful of genres, each with dozens of tracks/subgenres" rather than a
// literal preview. Angles use the same CSS rotate() convention (0 = top, clockwise).
const N_CHIPS = 9;
const CHIP_ANGLES: { angle: number }[] = Array.from({ length: N_CHIPS }, (_, i) => ({
  angle: (360 / N_CHIPS) * i,
}));

const CHIP_WIDTH = 68;
const CHIP_HEIGHT = 22;

// Polar layout: every node's position is (angle, radius) with radius fixed per depth, so all
// nodes at the same depth sit on the same circle around the hub — fanning out to children only
// ever changes angle, never radius.
const BRANCH_LEVEL1_RADIUS = 245;
const BRANCH_LEVEL2_RADIUS = 305;
const BRANCH_LEVEL3_RADIUS = 365;
const BRANCH_LEVEL1_SIZE = { width: 48, height: 16 };
const BRANCH_LEVEL2_SIZE = { width: 32, height: 11 };
const BRANCH_LEVEL3_SIZE = { width: 20, height: 7 };
const BRANCH_LEVEL2_FAN_ANGLES = [-16, -9.6, -3.2, 3.2, 9.6, 16];
// Last-depth fan-out count varies per branch (2-6 children) rather than being fixed, so the wheel
// doesn't read as a uniform grid. The count is derived deterministically from each branch's
// position (not Math.random()) so server and client renders stay identical.
const BRANCH_LEVEL3_MIN_COUNT = 2;
const BRANCH_LEVEL3_MAX_COUNT = 6;
const BRANCH_LEVEL3_FAN_SPREAD = 6;

function pseudoRandomCount(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  const frac = round(x - Math.floor(x));
  return min + Math.floor(frac * (max - min + 1));
}

function evenFanOffsets(count: number, spread: number): number[] {
  if (count <= 1) return [0];
  const step = spread / (count - 1);
  return Array.from({ length: count }, (_, i) => -spread / 2 + i * step);
}

// All geometry below is computed around the origin (0,0); the SVG's viewBox is derived from the
// content's own bounding box afterward (see CANVAS below) instead of assuming a fixed square, so
// deep branches are never clipped regardless of how far their outermost level reaches.
type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

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

function rectCentered(center: Point, width: number, height: number): Rect {
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

type Chip = { rect: Rect; angle: number };
type Branch = { chip: Chip; level1: Rect; level2: Rect[]; level3: Rect[][] };

const CHIPS: Chip[] = CHIP_ANGLES.map(({ angle }) => ({
  rect: rectCentered(pointOnCircle(angle, WHEEL_RADIUS), CHIP_WIDTH, CHIP_HEIGHT),
  angle,
}));

// Each child's angle is its parent's angle plus a fan offset; radius is fixed per depth, so
// same-depth nodes always land on the same circle regardless of which root they hang from.
const BRANCHES: Branch[] = CHIPS.map((chip, chipIndex) => {
  const level1 = rectCentered(
    pointOnCircle(chip.angle, BRANCH_LEVEL1_RADIUS),
    BRANCH_LEVEL1_SIZE.width,
    BRANCH_LEVEL1_SIZE.height,
  );

  const level2 = BRANCH_LEVEL2_FAN_ANGLES.map((offset) =>
    rectCentered(pointOnCircle(chip.angle + offset, BRANCH_LEVEL2_RADIUS), BRANCH_LEVEL2_SIZE.width, BRANCH_LEVEL2_SIZE.height),
  );

  const level3 = BRANCH_LEVEL2_FAN_ANGLES.map((parentOffset, level2Index) => {
    const count = pseudoRandomCount(chipIndex * 31 + level2Index * 7 + 1, BRANCH_LEVEL3_MIN_COUNT, BRANCH_LEVEL3_MAX_COUNT);
    return evenFanOffsets(count, BRANCH_LEVEL3_FAN_SPREAD).map((childOffset) =>
      rectCentered(
        pointOnCircle(chip.angle + parentOffset + childOffset, BRANCH_LEVEL3_RADIUS),
        BRANCH_LEVEL3_SIZE.width,
        BRANCH_LEVEL3_SIZE.height,
      ),
    );
  });

  return { chip, level1, level2, level3 };
});

function connectorPath(from: Point, to: Point) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  return `M${from.x},${from.y} Q${midX},${midY} ${to.x},${to.y}`;
}

const ALL_LINKS: { from: Point; to: Point }[] = [];
for (const branch of BRANCHES) {
  const chipCenter = rectCenter(branch.chip.rect);
  const level1Center = rectCenter(branch.level1);
  ALL_LINKS.push({ from: chipCenter, to: level1Center });
  branch.level2.forEach((level2Rect, i) => {
    const level2Center = rectCenter(level2Rect);
    ALL_LINKS.push({ from: level1Center, to: level2Center });
    for (const child of branch.level3[i]) {
      ALL_LINKS.push({ from: level2Center, to: rectCenter(child) });
    }
  });
}

const ALL_RECTS: Rect[] = [
  ...CHIPS.map((chip) => chip.rect),
  ...BRANCHES.flatMap((branch) => [branch.level1, ...branch.level2, ...branch.level3.flat()]),
];

// One color sector per chip, filling the background between the midpoints to its neighbors —
// mirrors the real wheel's per-root color (getGenreTreeColor(rootId)), seeded by ring position
// since the skeleton renders before any real genre id is known.
type Sector = { startAngle: number; endAngle: number; color: string };

const WHEEL_CONTENT_RADIUS = (() => {
  let maxAbs = HUB_RADIUS;
  for (const rect of ALL_RECTS) {
    for (const [x, y] of [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x, rect.y + rect.height],
      [rect.x + rect.width, rect.y + rect.height],
    ]) {
      maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y));
    }
  }
  return maxAbs;
})();

const CANVAS = (() => {
  let minX = -WHEEL_CONTENT_RADIUS;
  let maxX = WHEEL_CONTENT_RADIUS;
  let minY = -WHEEL_CONTENT_RADIUS;
  let maxY = WHEEL_CONTENT_RADIUS;
  for (const rect of ALL_RECTS) {
    minX = Math.min(minX, rect.x);
    maxX = Math.max(maxX, rect.x + rect.width);
    minY = Math.min(minY, rect.y);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return {
    minX: minX - CANVAS_PADDING,
    minY: minY - CANVAS_PADDING,
    width: maxX - minX + CANVAS_PADDING * 2,
    height: maxY - minY + CANVAS_PADDING * 2,
  };
})();

const SECTORS: Sector[] = CHIP_ANGLES.map(({ angle }, i) => {
  const prevAngle = i === 0 ? CHIP_ANGLES[CHIP_ANGLES.length - 1].angle - 360 : CHIP_ANGLES[i - 1].angle;
  const nextAngle = i === CHIP_ANGLES.length - 1 ? CHIP_ANGLES[0].angle + 360 : CHIP_ANGLES[i + 1].angle;
  return {
    startAngle: (prevAngle + angle) / 2,
    endAngle: (angle + nextAngle) / 2,
    color: getGenreTreeColor(`wheel-skeleton-sector-${i}`),
  };
});

// Rendered as a CSS conic-gradient on a layer separate from the content SVG (see the component
// below) rather than as SVG wedge paths sharing the content's own viewBox: the content SVG uses
// `preserveAspectRatio="xMidYMid meet"` so the wheel itself is never cropped, but "meet" letterboxes
// a square viewBox inside a non-square container — a wedge drawn in that same coordinate space
// would letterbox too, leaving the container's corners uncolored. A CSS gradient instead covers
// `100% / 100%` of the container directly, independent of the content's aspect ratio.
// CSS conic-gradient's 0deg (12 o'clock, clockwise) matches this file's own angle convention
// (see pointOnCircle), so stops need only be shifted so the first one starts at 0deg.
const SECTOR_GRADIENT_ROTATION = SECTORS[0].startAngle;
const SECTOR_GRADIENT_CSS = `conic-gradient(from ${SECTOR_GRADIENT_ROTATION}deg, ${SECTORS.map(
  (sector) =>
    `${sector.color} ${sector.startAngle - SECTOR_GRADIENT_ROTATION}deg ${
      sector.endAngle - SECTOR_GRADIENT_ROTATION
    }deg`,
).join(", ")})`;

export function GenreTreeWheelSkeleton() {
  // Unique per mount so multiple skeletons on one page don't collide on <defs> ids.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradientId = `genre-tree-wheel-skeleton-gradient-${uid}`;
  const maskId = `genre-tree-wheel-skeleton-mask-${uid}`;
  const animationName = `genre-tree-wheel-skeleton-spin-${uid}`;
  const shimmerWedgeClass = `genre-tree-wheel-skeleton-shimmer-wedge-${uid}`;

  return (
    <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ background: SECTOR_GRADIENT_CSS, opacity: SECTOR_FILL_OPACITY }}
        aria-hidden="true"
      />
      <span className="sr-only">Loading genre tree…</span>
      <svg
        viewBox={`${CANVAS.minX} ${CANVAS.minY} ${CANVAS.width} ${CANVAS.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="relative w-full h-full max-w-full max-h-full"
        aria-hidden="true"
      >
        <style>{`
          @keyframes ${animationName} {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .${shimmerWedgeClass} {
            transform-origin: 0px 0px;
            animation: ${animationName} 2.4s linear infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .${shimmerWedgeClass} {
              animation: none;
            }
          }
        `}</style>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={SHIMMER_HIGHLIGHT_COLOR} stopOpacity={0} />
            <stop offset="50%" stopColor={SHIMMER_HIGHLIGHT_COLOR} stopOpacity={0.9} />
            <stop offset="100%" stopColor={SHIMMER_HIGHLIGHT_COLOR} stopOpacity={0} />
          </linearGradient>
          {/* White = visible: masks the shimmer wedge to the wheel's own silhouette so the sweep
              only lights up chips, branches, and connectors, never the empty space between them. */}
          <mask id={maskId}>
            <circle cx={0} cy={0} r={HUB_RADIUS} fill="#FFFFFF" />
            {ALL_LINKS.map((link, i) => (
              <path
                key={`link-mask-${i}`}
                d={connectorPath(link.from, link.to)}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={1.25}
              />
            ))}
            {ALL_RECTS.map((rect, i) => (
              <rect
                key={`rect-mask-${i}`}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                rx={CORNER_RADIUS}
                ry={CORNER_RADIUS}
                fill="#FFFFFF"
              />
            ))}
          </mask>
        </defs>

        <circle
          cx={0}
          cy={0}
          r={WHEEL_RADIUS}
          fill="none"
          stroke={RING_COLOR}
          strokeWidth={1}
          strokeDasharray="2 6"
        />

        {ALL_LINKS.map((link, i) => (
          <path key={`link-${i}`} d={connectorPath(link.from, link.to)} fill="none" stroke={CONNECTOR_COLOR} strokeWidth={1.25} />
        ))}

        {ALL_RECTS.map((rect, i) => (
          <rect
            key={`rect-${i}`}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            rx={CORNER_RADIUS}
            ry={CORNER_RADIUS}
            fill={CARD_FILL}
            stroke={CARD_BORDER_COLOR}
            strokeWidth={1}
          />
        ))}

        <circle cx={0} cy={0} r={HUB_RADIUS} fill={CARD_FILL} stroke={CARD_BORDER_COLOR} strokeWidth={1.5} />
        <circle cx={0} cy={0} r={5} fill={CONNECTOR_COLOR} />

        <g mask={`url(#${maskId})`}>
          <g className={shimmerWedgeClass}>
            <path
              d={`M0,0 L0,${-CANVAS.height} A${CANVAS.height},${CANVAS.height} 0 0 1 ${round(
                CANVAS.height * Math.sin((40 * Math.PI) / 180),
              )},${round(-CANVAS.height * Math.cos((40 * Math.PI) / 180))} Z`}
              fill={`url(#${gradientId})`}
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
