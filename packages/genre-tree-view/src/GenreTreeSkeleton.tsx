"use client";

import { useId } from "react";

// These values approximate the real GenreTree's visual tokens (card corner radius, surface
// and connector colors) rather than importing them, since the @behindthemusictree/genre-tree-view
// package only publicly exports GenreTree, getGenreTreeColor, and types — not its internal
// dimension/style constants.
const CARD_FILL = "#F4F4F5";
const CARD_BORDER_COLOR = "#E4E4E7";
const CONNECTOR_COLOR = "#D4D4D8";
const CORNER_RADIUS = 8;
const SHIMMER_HIGHLIGHT_COLOR = "#FFFFFF";

// A real genre tree can run several levels deep and fan out into dozens of subgenres, so the
// skeleton mirrors that with 6 columns (root through 5 descendant levels) and a tapering node
// count per level, rather than a token 1-3-2 shape, to read as "a big tree is loading" instead
// of "a few items are loading".
const LEVEL_COUNTS = [1, 6, 13, 15, 20, 25];
const LEVEL_WIDTHS = [200, 180, 165, 150, 140, 130];
const LEVEL_HEIGHTS = [36, 26, 20, 17, 15, 14];

const LEAF_ROW_HEIGHT = 20;
const GROUP_GAP = 12;
const COLUMN_GAP = 120;
const PADDING_X = 16;
const PADDING_Y = 20;

const SHIMMER_BAND_WIDTH = 160;

type Card = { x: number; y: number; width: number; height: number };
type Range = { start: number; end: number };

function cardCenterY(card: Card) {
  return card.y + card.height / 2;
}

// Spreads `childCount` nodes as evenly as possible across `parentCount` parents (remainder
// distributed to the first parents), so level sizes that don't divide evenly (e.g. 13 into 6)
// still produce a contiguous, evenly-ordered range of children per parent.
function distributeChildren(parentCount: number, childCount: number): Range[] {
  const base = Math.floor(childCount / parentCount);
  const remainder = childCount % parentCount;
  const ranges: Range[] = [];
  let cursor = 0;
  for (let p = 0; p < parentCount; p++) {
    const count = base + (p < remainder ? 1 : 0);
    ranges.push({ start: cursor, end: cursor + count - 1 });
    cursor += count;
  }
  return ranges;
}

// CHILD_RANGES[i][n] gives the range of level (i+1) node indices that are children of the n-th
// node at level i.
const CHILD_RANGES: Range[][] = [];
for (let i = 0; i < LEVEL_COUNTS.length - 1; i++) {
  CHILD_RANGES.push(distributeChildren(LEVEL_COUNTS[i], LEVEL_COUNTS[i + 1]));
}

const LEVEL_X: number[] = [];
{
  let x = PADDING_X;
  for (let i = 0; i < LEVEL_COUNTS.length; i++) {
    LEVEL_X.push(x);
    x += LEVEL_WIDTHS[i] + COLUMN_GAP;
  }
}

const LAST_LEVEL = LEVEL_COUNTS.length - 1;
const LEVEL_CARDS: Card[][] = new Array(LEVEL_COUNTS.length);
let VIEWBOX_HEIGHT: number;

// Leaf level is laid out first (top to bottom, with an extra gap between sibling groups), then
// every level above it is positioned from the vertical midpoint of its children, walking up to
// the root.
{
  const leafCards: Card[] = [];
  let cursorY = PADDING_Y;
  for (const range of CHILD_RANGES[LAST_LEVEL - 1]) {
    for (let i = range.start; i <= range.end; i++) {
      leafCards.push({
        x: LEVEL_X[LAST_LEVEL],
        y: cursorY,
        width: LEVEL_WIDTHS[LAST_LEVEL],
        height: LEVEL_HEIGHTS[LAST_LEVEL],
      });
      cursorY += LEAF_ROW_HEIGHT;
    }
    cursorY += GROUP_GAP;
  }
  LEVEL_CARDS[LAST_LEVEL] = leafCards;
  VIEWBOX_HEIGHT = cursorY - GROUP_GAP + PADDING_Y;
}

for (let i = LAST_LEVEL - 1; i >= 0; i--) {
  const childCards = LEVEL_CARDS[i + 1];
  LEVEL_CARDS[i] = CHILD_RANGES[i].map(({ start, end }) => {
    const centerY =
      (cardCenterY(childCards[start]) + cardCenterY(childCards[end])) / 2;
    return {
      x: LEVEL_X[i],
      y: centerY - LEVEL_HEIGHTS[i] / 2,
      width: LEVEL_WIDTHS[i],
      height: LEVEL_HEIGHTS[i],
    };
  });
}

const ALL_CARDS: { card: Card; rootAccent?: boolean }[] = LEVEL_CARDS.flatMap(
  (cards, level) =>
    cards.map((card) => ({ card, rootAccent: level === 0 })),
);

const ALL_LINKS: { from: Card; to: Card }[] = [];
for (let i = 0; i < LAST_LEVEL; i++) {
  const parentCards = LEVEL_CARDS[i];
  const childCards = LEVEL_CARDS[i + 1];
  CHILD_RANGES[i].forEach(({ start, end }, parentIndex) => {
    for (let c = start; c <= end; c++) {
      ALL_LINKS.push({ from: parentCards[parentIndex], to: childCards[c] });
    }
  });
}

const VIEWBOX_WIDTH = LEVEL_X[LAST_LEVEL] + LEVEL_WIDTHS[LAST_LEVEL] + PADDING_X;

function cardCenterLeft(card: Card) {
  return { x: card.x, y: card.y + card.height / 2 };
}

function cardCenterRight(card: Card) {
  return { x: card.x + card.width, y: card.y + card.height / 2 };
}

function connectorPath(from: Card, to: Card) {
  const start = cardCenterRight(from);
  const end = cardCenterLeft(to);
  const midX = (start.x + end.x) / 2;
  return `M${start.x},${start.y} C${midX},${start.y} ${midX},${end.y} ${end.x},${end.y}`;
}

function SkeletonCard({
  card,
  rootAccent,
}: {
  card: Card;
  rootAccent?: boolean;
}) {
  return (
    <>
      <rect
        x={card.x}
        y={card.y}
        width={card.width}
        height={card.height}
        rx={CORNER_RADIUS}
        ry={CORNER_RADIUS}
        fill={CARD_FILL}
        stroke={CARD_BORDER_COLOR}
        strokeWidth={rootAccent ? 1.5 : 1}
      />
      {rootAccent && (
        <circle
          cx={card.x + 18}
          cy={card.y + card.height / 2}
          r={5}
          fill={CONNECTOR_COLOR}
        />
      )}
    </>
  );
}

export function GenreTreeSkeleton() {
  // Unique per mount so multiple skeletons on one page don't collide on <defs> ids.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradientId = `genre-tree-skeleton-gradient-${uid}`;
  const maskId = `genre-tree-skeleton-mask-${uid}`;
  const animationName = `genre-tree-skeleton-sweep-${uid}`;
  const shimmerBandClass = `genre-tree-skeleton-shimmer-band-${uid}`;
  const sweepDistance = VIEWBOX_WIDTH + SHIMMER_BAND_WIDTH;

  return (
    <div className="mt-5 p-4">
      <span className="sr-only">Loading genre tree…</span>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        width={VIEWBOX_WIDTH}
        height={VIEWBOX_HEIGHT}
        className="max-w-full h-auto"
        aria-hidden="true"
      >
        <style>{`
          @keyframes ${animationName} {
            from { transform: translateX(0); }
            to { transform: translateX(${sweepDistance}px); }
          }
          .${shimmerBandClass} {
            animation: ${animationName} 1.5s linear infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .${shimmerBandClass} {
              animation: none;
            }
          }
        `}</style>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop
              offset="0%"
              stopColor={SHIMMER_HIGHLIGHT_COLOR}
              stopOpacity={0}
            />
            <stop
              offset="50%"
              stopColor={SHIMMER_HIGHLIGHT_COLOR}
              stopOpacity={0.9}
            />
            <stop
              offset="100%"
              stopColor={SHIMMER_HIGHLIGHT_COLOR}
              stopOpacity={0}
            />
          </linearGradient>
          {/* White = visible: masks the shimmer band to the tree's own silhouette so the sweep
              only lights up cards and connectors, never the empty space between them. */}
          <mask id={maskId}>
            {ALL_LINKS.map((link, i) => (
              <path
                key={`link-mask-${i}`}
                d={connectorPath(link.from, link.to)}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={1.25}
              />
            ))}
            {ALL_CARDS.map(({ card }, i) => (
              <rect
                key={`card-mask-${i}`}
                x={card.x}
                y={card.y}
                width={card.width}
                height={card.height}
                rx={CORNER_RADIUS}
                ry={CORNER_RADIUS}
                fill="#FFFFFF"
              />
            ))}
          </mask>
        </defs>

        {ALL_LINKS.map((link, i) => (
          <path
            key={`link-${i}`}
            d={connectorPath(link.from, link.to)}
            fill="none"
            stroke={CONNECTOR_COLOR}
            strokeWidth={1.25}
          />
        ))}
        {ALL_CARDS.map(({ card, rootAccent }, i) => (
          <SkeletonCard key={`card-${i}`} card={card} rootAccent={rootAccent} />
        ))}

        <g mask={`url(#${maskId})`}>
          <rect
            className={shimmerBandClass}
            x={-SHIMMER_BAND_WIDTH}
            y={0}
            width={SHIMMER_BAND_WIDTH}
            height={VIEWBOX_HEIGHT}
            fill={`url(#${gradientId})`}
          />
        </g>
      </svg>
    </div>
  );
}
