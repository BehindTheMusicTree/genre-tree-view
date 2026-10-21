import * as d3 from "d3";

import { createDeferredClick } from "./defer-click";
import { GenreTreeAction, GenreTreeNode, GenreTreePlayState } from "./types";
import {
  addReparentTargetOverlay,
  buildTreeHierarchyStructure,
} from "./NodeHelper";
import {
  ACCENT_COLOR,
  ItemCountRange,
  MAX_NODE_WIDTH,
  NODE_DOT_LABEL_GAP,
  NODE_DOT_MAX_RADIUS,
  POP_SECTOR_TINT_RATIO,
  POP_TREE_DEPTH_RADIAL_SPACING,
  RADIAL_CORE_LINK_TINT_RATIO,
  RADIAL_POP_LINK_TINT_RATIO,
  SURFACE_BORDER_COLOR,
  TEXT_COLOR,
  calculateRootLabelFontSize,
  TEXT_MUTED_COLOR,
  calculateLinkWidth,
  calculateNodeBorderWidth,
  calculateNodeDotRadius,
  calculateLabelFontSizeAtZoom,
  calculateLabelRank,
  calculateNodeFontSize,
  isLabelRankedForZoom,
  tintSurface,
} from "./constants";
import {
  Box,
  placeLabels,
} from "./radial-wheel-geometry";

type D3Node = d3.HierarchyNode<GenreTreeNode>;
type D3Selection = d3.Selection<SVGGElement, unknown, null, undefined>;

// Angular width of the wedge a pop subtree fans out into, centered on its own root's direction —
// narrower than the root's own full sector so it never touches a neighboring root's wedge,
// matching the gutter every other radial-wheel element keeps from its neighbors.
export const POP_WEDGE_SPAN_DEGREES = 80;

// Margin (px) added past a pop subtree's deepest node's own half-width, so its rendered card
// never sits flush against the wheel's own circle edge.
export const POP_SUBTREE_OUTER_MARGIN = 24;

// A pop hierarchy (per buildPopHierarchy/splitRootGroupBySide) is rooted at the pop child, which
// is always the ring root's direct child — i.e. always absolute depth 1 in the whole tree,
// regardless of which root it belongs to.
const POP_HIERARCHY_ROOT_ABSOLUTE_DEPTH = 1;

/** The radius (px, from the wheel's true center) for a node at `depth` steps below the ring roots'
 * own circle (`coreRootCircleRadius`) — the single formula every radial depth (ring roots, their
 * pop branches, and the center "Mainstream Pop" subtree) shares, so that any two nodes at the same
 * absolute depth always land on the same circle regardless of which branch/subtree they belong to. */
export function getRadialDepthRadius(
  depth: number,
  coreRootCircleRadius: number,
  depthSpacing: number,
): number {
  return coreRootCircleRadius + depth * depthSpacing;
}

/** Builds the pop subtree's hierarchy, rooted at the pop child (root not included) — thin wrapper
 * over buildTreeHierarchyStructure so callers of this module don't need to import NodeHelper
 * directly just for this one call. */
// splitRootGroupBySide (pop-core-split.ts) returns the pop subtree rooted at the pop child, whose
// own parentId still points at the (excluded) root — d3.stratify requires every parentId to
// either be null or resolve within the given set, so that dangling reference is normalized to
// null here, making the pop child stratify's root. Each resulting hierarchy node's `.data` is then
// restored to its original (un-normalized) node so the real parentId still reaches
// renderers/click handlers/the info panel.
export function buildPopHierarchy(
  d3Lib: typeof import("d3"),
  popNodes: GenreTreeNode[],
): D3Node {
  const ids = new Set(popNodes.map((node) => node.id));
  const byId = new Map(popNodes.map((node) => [node.id, node]));
  const normalized = popNodes.map((node) =>
    node.parentId !== null && !ids.has(node.parentId)
      ? { ...node, parentId: null }
      : node,
  );
  const hierarchy = buildTreeHierarchyStructure(d3Lib, normalized);
  hierarchy.each((d) => {
    d.data = byId.get(d.data.id) ?? d.data;
  });
  return hierarchy;
}

/** The outer radius (px, from `coreRootCircleRadius`) a pop subtree needs to render without
 * overlapping the wheel's own edge — driven by its deepest node's ring (absolute depth
 * `POP_HIERARCHY_ROOT_ABSOLUTE_DEPTH + height`) plus that node's own half-width and a fixed outer
 * margin. Used to grow the wheel's circle to fit whichever developed root's pop subtree
 * reaches furthest.
 *
 * `coreRootCircleRadius` shifts the whole subtree outward by that amount, mirroring
 * `computePopRadialLayout`'s own base radius — pass 0 to get the extent as a delta past the ring
 * roots' own circle (e.g. when that circle's own size is still being determined from this delta),
 * or the wheel's actual `coreRootCircleRadius` to get the subtree's true outer radius. */
export function calculatePopSubtreeRadialExtent(
  hierarchy: D3Node,
  coreRootCircleRadius = 0,
): number {
  return (
    getRadialDepthRadius(
      POP_HIERARCHY_ROOT_ABSOLUTE_DEPTH + hierarchy.height,
      coreRootCircleRadius,
      POP_TREE_DEPTH_RADIAL_SPACING,
    ) +
    MAX_NODE_WIDTH / 2 +
    POP_SUBTREE_OUTER_MARGIN
  );
}

/**
 * Lays a pop subtree's hierarchy out in polar coordinates within a wedge centered on
 * `wedgeCenterAngleDegrees` (CSS `rotate()` convention: 0 = top, clockwise — same convention as
 * radial-wheel-geometry.ts's angles), then projects each node onto cartesian (x, y) relative to
 * the wheel's own center — writes the result directly onto each node's `.x`/`.y`, mirroring how
 * tree-renderer.ts's setupTreeLayout overwrites a d3 hierarchy's laid-out coordinates in place.
 *
 * Angle spread across siblings/cousins uses d3's tidy-tree balancing (`d3.tree()`), with each
 * neighbour gap measured from the two dots' real arc length on their ring (see `measureWedge`). Radius is NOT taken from that layout's own y — every node's radius climbs INWARD from
 * `coreRootCircleRadius` (the ring roots' own circle, where this branch's ring root chip sits) by
 * `POP_TREE_DEPTH_RADIAL_SPACING` per depth step, so the branch's own root (absolute depth
 * `POP_HIERARCHY_ROOT_ABSOLUTE_DEPTH`) always lands exactly one depth step inside that circle
 * regardless of how deep the branch grows — anchoring outward from the mainstream circle instead
 * would leave shallower branches stranded partway to the ring roots' circle while only the single
 * deepest developed branch actually reached it. Any slack this leaves between the branch's own
 * deepest node and the mainstream circle is absorbed there, not by moving the branch's own root
 * off the ring roots' circle.
 *
 * `wedgeSpanDegrees` defaults to `POP_WEDGE_SPAN_DEGREES`; the wheel passes each branch's slice of
 * its root's sector, sized from `measureWedge`; the layout fills it up to `MAX_WEDGE_STRETCH` (see layoutWedge).
 *
 * `depthSpacing` defaults to `POP_TREE_DEPTH_RADIAL_SPACING` — kept constant per depth step
 * regardless of how far out the wheel's own outer circle ends up sitting; it's the outer circle's
 * own radius (`coreRootCircleRadius`, sized off the deepest developed pop branch's reach — see
 * `popReachRequiredRadius` in the wheel component) that adapts to fit the pop branches, not the
 * spacing between their depths. */
export function computePopRadialLayout(
  d3Lib: typeof import("d3"),
  hierarchy: D3Node,
  wedgeCenterAngleDegrees: number,
  coreRootCircleRadius: number,
  wedgeSpanDegrees: number = POP_WEDGE_SPAN_DEGREES,
  depthSpacing: number = POP_TREE_DEPTH_RADIAL_SPACING,
  itemCountRange?: ItemCountRange,
): D3Node {
  return layoutWedge(
    d3Lib,
    hierarchy,
    wedgeCenterAngleDegrees,
    wedgeSpanDegrees,
    popRadiusOfDepth(coreRootCircleRadius, depthSpacing),
    itemCountRange,
  );
}

export const MIN_DOT_GAP = 5.6;

/** Radius of a pop hierarchy's node at `depth`, climbing inward from the ring roots' circle. */
export function popRadiusOfDepth(coreRootCircleRadius: number, depthSpacing: number) {
  return (depth: number) =>
    getRadialDepthRadius(-(POP_HIERARCHY_ROOT_ABSOLUTE_DEPTH + depth), coreRootCircleRadius, depthSpacing);
}

/** Radius of a core hierarchy's node at `depth`, fanning outward from the ring roots' circle. */
export function coreRadiusOfDepth(coreRootCircleRadius: number, depthSpacing: number) {
  return (depth: number) => getRadialDepthRadius(depth + 1, coreRootCircleRadius, depthSpacing);
}

type ContourEdge = { x: number; dotRadius: number };
type Contour = { left: ContourEdge; right: ContourEdge }[];

/** Lays `hierarchy` out angularly with each pair of same-depth neighbours just far enough apart for
 * their dots not to overlap on their own ring — a deeper (pop) ring is smaller, so its nodes need
 * more angle each. Leaves each node's `.x` as its angle (rad) from the wedge's leading edge and
 * returns the wedge's minimal span (rad). Without `itemCountRange` every dot is assumed max size.
 *
 * Packs each node's children left to right, each one shifted just far enough to clear the
 * accumulated contour of its earlier siblings, parent centered over its first and last child. Not
 * d3.tree: its Reingold–Tilford pass spreads the push between two wide subtrees evenly across every
 * small sibling between them, which on deep rings leaves leaf siblings far apart. */
export function measureWedge(
  _d3Lib: typeof import("d3"),
  hierarchy: D3Node,
  radiusOfDepth: (depth: number) => number,
  itemCountRange?: ItemCountRange,
): number {
  const dotRadius = (d: D3Node) =>
    itemCountRange ? calculateNodeDotRadius(d.data.itemCount, itemCountRange) : NODE_DOT_MAX_RADIUS;
  const offsetFromParent = new Map<D3Node, number>();
  const shiftLevel = (level: Contour[number], by: number) => ({
    left: { ...level.left, x: level.left.x + by },
    right: { ...level.right, x: level.right.x + by },
  });

  const pack = (node: D3Node): Contour => {
    const own = { x: 0, dotRadius: dotRadius(node) };
    if (!node.children) return [{ left: own, right: own }];
    const below: Contour = [];
    const childOffsets: number[] = [];
    for (const child of node.children) {
      const contour = pack(child);
      let offset = 0;
      if (childOffsets.length > 0) {
        offset = -Infinity;
        for (let k = 0; k < Math.min(below.length, contour.length); k++) {
          const gap =
            (below[k].right.dotRadius + contour[k].left.dotRadius + MIN_DOT_GAP) / radiusOfDepth(child.depth + k);
          offset = Math.max(offset, below[k].right.x - contour[k].left.x + gap);
        }
      }
      childOffsets.push(offset);
      contour.forEach((level, k) => {
        const shifted = shiftLevel(level, offset);
        if (k < below.length) below[k].right = shifted.right;
        else below.push(shifted);
      });
    }
    const center = (childOffsets[0] + childOffsets[childOffsets.length - 1]) / 2;
    node.children.forEach((child, i) => offsetFromParent.set(child, childOffsets[i] - center));
    return [{ left: own, right: own }, ...below.map((level) => shiftLevel(level, -center))];
  };

  pack(hierarchy);
  hierarchy.eachBefore((d) => {
    d.x = d.parent ? d.parent.x! + offsetFromParent.get(d)! : 0;
  });
  let min = Infinity;
  let max = -Infinity;
  hierarchy.each((d) => {
    const inset = (dotRadius(d) + MIN_DOT_GAP / 2) / radiusOfDepth(d.depth);
    min = Math.min(min, d.x! - inset);
    max = Math.max(max, d.x! + inset);
  });
  hierarchy.each((d) => {
    d.x = d.x! - min;
  });
  return max - min;
}

// Cap on how far a wedge's measured layout may stretch to use slack in its slice: a uniform angular
// stretch grows outer rings' arc gaps with their radius, so stretching to fill pushes deep siblings
// far apart. Unused slack stays as empty gutter around the centered layout.
export const MAX_WEDGE_STRETCH = 1.42;

/** Measures `hierarchy` (see measureWedge), squeezes it to fit `wedgeSpanDegrees` or stretches it
 * by at most `MAX_WEDGE_STRETCH`, centered on `wedgeCenterAngleDegrees`, and projects each node to
 * cartesian x/y around the wheel's center at its depth's radius. */
export function layoutWedge(
  d3Lib: typeof import("d3"),
  hierarchy: D3Node,
  wedgeCenterAngleDegrees: number,
  wedgeSpanDegrees: number,
  radiusOfDepth: (depth: number) => number,
  itemCountRange?: ItemCountRange,
): D3Node {
  const neededRad = measureWedge(d3Lib, hierarchy, radiusOfDepth, itemCountRange);
  const wedgeSpanRad = (wedgeSpanDegrees * Math.PI) / 180;
  const scale = Math.min(MAX_WEDGE_STRETCH, wedgeSpanRad / neededRad);
  const wedgeStartRad = (wedgeCenterAngleDegrees * Math.PI) / 180 - (neededRad * scale) / 2;
  hierarchy.each((d) => {
    const angleRad = wedgeStartRad + d.x! * scale;
    const radius = radiusOfDepth(d.depth);
    d.x = radius * Math.sin(angleRad);
    d.y = -radius * Math.cos(angleRad);
  });
  return hierarchy;
}

/**
 * Lays out the center "Mainstream Pop" node's own subtree in polar coordinates, full-circle
 * (unlike `computePopRadialLayout`'s 80deg wedge — the center node has no single ring-root
 * direction to anchor to). `hierarchy` must be rooted at the center node itself: depth 0 (the
 * center node) is pinned to the wheel's true origin and excluded from angular layout; depth 1 (its
 * direct children) land exactly one `depthSpacing` step past `coreRootCircleRadius` — the same
 * circle every ring root's pop hierarchy's absolute-depth-1 node lands on too, so the center
 * subtree's rings coincide with the ring roots' own absolute depth circles — spread around the
 * full circle proportional to each child's own subtree size (d3.tree's default separation, unlike
 * the wedge layout's measured one); each deeper generation steps outward by
 * `depthSpacing`.
 */
export function computeCenterRadialLayout(
  d3Lib: typeof import("d3"),
  hierarchy: D3Node,
  coreRootCircleRadius: number,
  depthSpacing: number,
): D3Node {
  const treeLayout = d3Lib.tree<GenreTreeNode>().size([2 * Math.PI, 1]);
  treeLayout(hierarchy);

  hierarchy.each((d) => {
    if (d.depth === 0) {
      d.x = 0;
      d.y = 0;
      return;
    }
    const angleRad = d.x!;
    const radius = getRadialDepthRadius(
      d.depth,
      coreRootCircleRadius,
      depthSpacing,
    );
    d.x = radius * Math.sin(angleRad);
    d.y = -radius * Math.cos(angleRad);
  });

  return hierarchy;
}

/** The "mainstream pop outer circle" radius (px, from the wheel's center) the center "Mainstream
 * Pop" node's own subtree needs to render without overlapping the wheel's own edge (the "core
 * root circle") — driven by its deepest node's ring plus that node's own half-width and a fixed
 * outer margin. Only meaningful when the center node actually has children (`hierarchy.height >=
 * 1`). */
export function calculateMainstreamPopOuterCircleRadius(
  hierarchy: D3Node,
  coreRootCircleRadius: number,
  depthSpacing: number,
): number {
  return (
    getRadialDepthRadius(hierarchy.height, coreRootCircleRadius, depthSpacing) +
    MAX_NODE_WIDTH / 2 +
    POP_SUBTREE_OUTER_MARGIN
  );
}

/** Cartesian (x, y) position on the circle of the given radius, at the given angle in the CSS
 * `rotate()` convention (0 = top, clockwise) — the same convention `computePopRadialLayout` and
 * `computeCoreRadialLayout` project their own nodes with, and the one `.gtv-wheel-slot`'s
 * `rotate(...) translateY(-radius)` (styles.css) positions the root's own JSX-rendered chip with.
 * Used to find where that chip sits in the D3 hierarchy's coordinate space, so the root->depth1
 * link can be drawn even though the root itself isn't part of the hierarchy. */
export function getRadialPointOnCircle(
  angleDegrees: number,
  radius: number,
): { x: number; y: number } {
  const angleRad = (angleDegrees * Math.PI) / 180;
  return { x: radius * Math.sin(angleRad), y: -radius * Math.cos(angleRad) };
}

// Average glyph advance as a fraction of font size — a DOM-free label width estimate, so layout
// and collision culling stay deterministic (happy-dom has no getBBox).
export const LABEL_CHAR_WIDTH_RATIO = 0.6;

export interface DotLabelCandidate {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  box: Box;
}

/** A radial dot node's label placement and boxes, local to the node's own center. `candidates` are
 * the label's possible spots in preference order (see hideCollidingLabels): beside the dot facing
 * away from the wheel's vertical axis (right of the dot when `x >= 0`, left otherwise, so it never
 * reads across the wheel's center), then the other side, then centered above, then below.
 * `labelX`/`anchor`/`label` are the first candidate. With `zoomScale`, the font size is the one that
 * renders at the label's fixed on-screen size under that zoom (see calculateLabelFontSizeAtZoom). */
export function getDotLabelGeometry(
  x: number,
  name: string,
  itemCount: number,
  itemCountRange: ItemCountRange,
  zoomScale?: number,
): {
  dotRadius: number;
  fontSize: number;
  labelX: number;
  anchor: "start" | "end";
  label: Box;
  dot: Box;
  hitArea: Box;
  candidates: DotLabelCandidate[];
} {
  const dotRadius = calculateNodeDotRadius(itemCount, itemCountRange);
  const fontSize =
    zoomScale === undefined
      ? calculateNodeFontSize(itemCount, itemCountRange)
      : calculateLabelFontSizeAtZoom(itemCount, itemCountRange, zoomScale);
  const candidates = getLabelCandidates(x, name, dotRadius, fontSize);
  const { x: labelX, box: label } = candidates[0];
  const dot = { x0: -dotRadius, x1: dotRadius, y0: -dotRadius, y1: dotRadius };
  const halfHeight = Math.max(dotRadius, fontSize / 2);
  return {
    dotRadius,
    fontSize,
    labelX,
    anchor: x >= 0 ? "start" : "end",
    label,
    dot,
    hitArea: {
      x0: Math.min(dot.x0, label.x0),
      x1: Math.max(dot.x1, label.x1),
      y0: -halfHeight,
      y1: halfHeight,
    },
    candidates,
  };
}

function getLabelCandidates(x: number, name: string, dotRadius: number, fontSize: number): DotLabelCandidate[] {
  const width = name.length * fontSize * LABEL_CHAR_WIDTH_RATIO;
  const halfFont = fontSize / 2;
  const side = (right: boolean): DotLabelCandidate => {
    const labelX = (right ? 1 : -1) * (dotRadius + NODE_DOT_LABEL_GAP);
    return {
      x: labelX,
      y: 0,
      anchor: right ? "start" : "end",
      box: { x0: right ? labelX : labelX - width, x1: right ? labelX + width : labelX, y0: -halfFont, y1: halfFont },
    };
  };
  const stacked = (below: boolean): DotLabelCandidate => {
    const y = (below ? 1 : -1) * (dotRadius + NODE_DOT_LABEL_GAP + halfFont);
    return { x: 0, y, anchor: "middle", box: { x0: -width / 2, x1: width / 2, y0: y - halfFont, y1: y + halfFont } };
  };
  const right = x >= 0;
  return [side(right), side(!right), stacked(false), stacked(true)];
}

/** A root chip's label, drawn in the SVG (see renderRootLabels) so it shares the dot labels' look
 * and collision placement. `x`/`y` are the chip's center, `itemCount` its subtree total. */
export interface RootLabelDatum {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  itemCount: number;
  /** Named even when no candidate spot is free (the wheel's center); other roots hide like dot labels. */
  alwaysShown?: boolean;
}

export function renderRootLabels<E extends SVGElement>(
  container: d3.Selection<E, unknown, null, undefined>,
  roots: RootLabelDatum[],
): void {
  container
    .append("g")
    .attr("class", "gtv-wheel-root-labels")
    .selectAll<SVGGElement, RootLabelDatum>("g.gtv-root-label")
    .data(roots)
    .join("g")
    .attr("class", "gtv-root-label")
    .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
    .append("text")
    .attr("class", "gtv-node-label")
    .attr("dominant-baseline", "middle")
    .attr("fill", TEXT_COLOR)
    .text((d) => d.name);
}

export interface RenderPopSubtreeCallbacks {
  onPlayPause?: (nodeId: string) => void;
  onAddChild?: (parentId: string) => void;
  onRenameRequest?: (node: GenreTreeNode) => void;
  onDeleteRequest?: (node: GenreTreeNode) => void;
  onReparentRequest?: (node: GenreTreeNode) => void;
  onReparentTargetSelect: (newParentId: string) => void;
  onNodeClick?: (node: GenreTreeNode, event: MouseEvent, element: Element) => void;
  onNodeDoubleClick?: (node: GenreTreeNode) => void;
  onNodeHover?: (node: GenreTreeNode) => void;
  additionalActions?: (node: GenreTreeNode) => GenreTreeAction[];
  playingNodeId?: string | null;
  playState?: GenreTreePlayState;
}

/**
 * Renders an already polar-laid-out pop subtree (see computePopRadialLayout) into `svg`, a `<g>`
 * already translated to the wheel's own center — every node's `.x`/`.y` is that node's true
 * rendered center, unlike tree-renderer.ts's cartesian nodes (which are each node's top-left slot
 * corner, offset by `+ width / 2` at render time). Card drawing, hover toolbar, and reparent-target
 * overlay reuse the exact same NodeHelper/d3-path-helper building blocks tree-renderer.ts's
 * renderTree uses, so pop nodes look and behave identically to every other node in the package —
 * only the positioning math and link shape (radial curves following the wheel's own rings, not
 * tree-renderer's orthogonal links) are specific to this renderer.
 */
export function renderPopSubtree(
  d3Lib: typeof import("d3"),
  svg: D3Selection,
  hierarchy: D3Node,
  rootColor: string,
  reparentingNodeId: string | null,
  reparentForbiddenIds: string[],
  callbacks: RenderPopSubtreeCallbacks,
  itemCountRange: ItemCountRange,
  options: {
    skipRootNode?: boolean;
    // Core nodes continue the root chip's own solid-color style (matches every other renderer's
    // treatment of a root); pop nodes keep the lighter tint that sets the pop wedge apart from core.
    isCoreSector?: boolean;
    // Where the hierarchy's own root (depth 0) connects to, when that root ISN'T part of the
    // hierarchy but instead rendered separately as its own JSX wheel chip (every per-root core/pop
    // subtree — buildCoreHierarchy/buildPopHierarchy both exclude the ring root itself, unlike the
    // center "Mainstream Pop" subtree, whose hierarchy still includes its own root at depth 0). When
    // given, one extra gtv-link is drawn per depth-0 node from this point to that node, since
    // hierarchy.links() has no edge for it (a hierarchy root has no incoming link).
    rootLinkOrigin?: { x: number; y: number };
    // The center "Mainstream Pop" subtree is white: it keeps dark label/toolbar text, grey links and
    // black dot borders; every other pop sector reads light against its tinted fill instead,
    // matching core sectors' solid-color treatment.
    isMainstreamSector?: boolean;
    // The node whose info panel is currently open (see use-node-info-panel.ts) — gets a heavier
    // accent-colored border while every other node in the subtree dims.
    selectedNodeId?: string | null;
    // Per-node fill overriding the sector-wide one derived from rootColor, for a caller whose node
    // colors must not depend on which sector they happen to render in.
    nodeFillOf?: (node: GenreTreeNode) => string;
  } = {},
): void {
  const {
    skipRootNode = false,
    isCoreSector = false,
    rootLinkOrigin,
    isMainstreamSector = false,
    selectedNodeId = null,
    nodeFillOf,
  } = options;
  const { onReparentTargetSelect, onNodeClick, onNodeDoubleClick, onNodeHover } = callbacks;
  const isForbidden = (d: D3Node) => reparentForbiddenIds.includes(d.data.id);
  const isSelected = (d: D3Node) => d.data.id === selectedNodeId;
  // A node is "related" to the selected node when it's the selected node's own parent or one of
  // its children — these dim less than the rest of the tree.
  const isRelatedNode = (d: D3Node) =>
    d.parent?.data.id === selectedNodeId ||
    (d.children ?? []).some((c) => c.data.id === selectedNodeId);
  const sectorFill = isCoreSector
    ? rootColor
    : tintSurface(rootColor, POP_SECTOR_TINT_RATIO);
  const nodeFill = (d: D3Node) => nodeFillOf?.(d.data) ?? sectorFill;
  // The center's white rootColor would tint its links and dot borders to white, invisible on the
  // white wheel.
  const linkColor = isMainstreamSector
    ? TEXT_MUTED_COLOR
    : tintSurface(
        rootColor,
        isCoreSector ? RADIAL_CORE_LINK_TINT_RATIO : RADIAL_POP_LINK_TINT_RATIO,
      );
  // skipRootNode omits the hierarchy's own depth-0 node from the drawn cards — used for the center
  // "Pop" node's subtree, whose depth-0 node already renders as its own dedicated wheel chip.
  const drawnNodes = skipRootNode
    ? hierarchy.descendants().filter((d) => d.depth > 0)
    : hierarchy.descendants();
  const rootLinks = rootLinkOrigin
    ? hierarchy
        .descendants()
        .filter((d) => d.depth === 0)
        .map((d) => ({
          source: rootLinkOrigin,
          target: { x: d.x!, y: d.y! },
          sourceId: null,
          targetId: d.data.id,
          targetItemCount: d.data.itemCount,
        }))
    : [];
  const links: {
    source: { x?: number; y?: number };
    target: { x?: number; y?: number };
    sourceId: string | null;
    targetId: string | null;
    targetItemCount: number;
  }[] = [
    ...hierarchy.links().map((d) => ({
      source: d.source,
      target: d.target,
      sourceId: d.source.data.id,
      targetId: d.target.data.id,
      targetItemCount: d.target.data.itemCount,
    })),
    ...rootLinks,
  ];
  // A link is "related" to the selected node when the selected node is one of its two endpoints
  // (its parent link, or a link to one of its children) — every other link in this subtree dims.
  const isRelatedLink = (d: (typeof links)[number]) =>
    d.sourceId === selectedNodeId || d.targetId === selectedNodeId;

  // Cartesian (x, y) here is always a point on a circle centered on the wheel's own center (see
  // computePopRadialLayout/computeCenterRadialLayout), so it's exactly invertible back to the
  // (angle, radius) polar pair d3.linkRadial expects — recovering that lets links curve smoothly
  // along the wheel's rings instead of cutting straight chords across them.
  const toPolar = (p: { x?: number; y?: number }) => {
    const x = p.x ?? 0;
    const y = p.y ?? 0;
    return { x: Math.atan2(x, -y), y: Math.hypot(x, y) };
  };
  const radialLinkGenerator = d3Lib
    .linkRadial<
      { source: { x: number; y: number }; target: { x: number; y: number } },
      { x: number; y: number }
    >()
    .angle((d) => d.x)
    .radius((d) => d.y);

  svg
    .selectAll("path.gtv-link")
    .data(links)
    .enter()
    .append("path")
    .attr(
      "class",
      (d) =>
        "gtv-link" +
        (selectedNodeId && !isRelatedLink(d) ? " gtv-link--dimmed" : ""),
    )
    .attr("d", (d) =>
      radialLinkGenerator({
        source: toPolar(d.source),
        target: toPolar(d.target),
      }),
    )
    .style("fill", "none")
    .style("stroke", linkColor)
    .style("stroke-width", (d) =>
      calculateLinkWidth(d.targetItemCount, itemCountRange),
    )
    .style("stroke-linecap", "round");

  const nodes = svg
    .selectAll<SVGGElement, D3Node>("g.node")
    .data(drawnNodes)
    .enter()
    .append("g")
    .attr(
      "class",
      (d) =>
        "node" +
        (isForbidden(d) ? " gtv-node--forbidden" : "") +
        (selectedNodeId && !isSelected(d)
          ? isRelatedNode(d)
            ? " gtv-node--dimmed-related"
            : " gtv-node--dimmed"
          : ""),
    )
    .attr("id", (d) => "group-" + d.data.id)
    // Levels below the nearest root chip (1 = its direct child), for hideCollidingLabels' ranking:
    // with skipRootNode, depth 0 is that chip itself.
    .attr("data-gtv-depth", (d) => d.depth + (skipRootNode ? 0 : 1))
    .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
    .style("--gtv-node-fill", nodeFill);

  nodes
    .append("rect")
    .attr("class", "gtv-hover-hit-area")
    .each(function (d) {
      const { hitArea } = getDotLabelGeometry(
        d.x!,
        d.data.name,
        d.data.itemCount,
        itemCountRange,
      );
      d3Lib
        .select(this)
        .attr("x", hitArea.x0)
        .attr("y", hitArea.y0)
        .attr("width", hitArea.x1 - hitArea.x0)
        .attr("height", hitArea.y1 - hitArea.y0);
    })
    .attr("fill", "transparent")
    .attr("pointer-events", "all");

  nodes
    .append("circle")
    .attr("class", "gtv-node-dot")
    .attr("r", (d) => calculateNodeDotRadius(d.data.itemCount, itemCountRange))
    .attr("fill", nodeFill)
    .attr("stroke", (d) =>
      isSelected(d)
        ? ACCENT_COLOR
        : isMainstreamSector
          ? TEXT_COLOR
          : SURFACE_BORDER_COLOR,
    )
    .attr("stroke-width", (d) =>
      calculateNodeBorderWidth(d.data.itemCount, itemCountRange, isSelected(d)),
    )
    .style("pointer-events", "none");

  nodes
    .append("text")
    .attr(
      "class",
      "gtv-node-label",
    )
    .each(function (d) {
      const { labelX, anchor, fontSize } = getDotLabelGeometry(
        d.x!,
        d.data.name,
        d.data.itemCount,
        itemCountRange,
      );
      d3Lib
        .select(this)
        .attr("x", labelX)
        .attr("text-anchor", anchor)
        .style("font-size", `${fontSize}px`);
    })
    .attr("dominant-baseline", "middle")
    .attr("fill", TEXT_COLOR)
    // Opts back in past .gtv-wheel-pop-layer's inherited pointer-events: none — the hit area is
    // sized for the label's initial spot, and hideCollidingLabels may move the label elsewhere.
    .attr("pointer-events", "all")
    .text((d) => d.data.name);

  nodes.each(function (d: D3Node) {
    const group = d3Lib.select<SVGGElement, unknown>(this);
    let leaveTimeoutId: ReturnType<typeof setTimeout> | null = null;

    group.on("mouseenter", function () {
      if (leaveTimeoutId !== null) {
        clearTimeout(leaveTimeoutId);
        leaveTimeoutId = null;
      }

      if (reparentingNodeId && d.data.actionable !== false && !isForbidden(d)) {
        addReparentTargetOverlay(
          d3Lib,
          group as unknown as d3.Selection<
            SVGGElement,
            unknown,
            HTMLElement,
            unknown
          >,
          onReparentTargetSelect,
          itemCountRange,
        );
      }
    });

    group.on("pointerenter", () => onNodeHover?.(d.data));

    group.on("mouseleave", function () {
      leaveTimeoutId = setTimeout(() => {
        leaveTimeoutId = null;
        d3Lib
          .select<
            SVGGElement,
            unknown
          >("#select-as-new-parent-group-" + d.data.id)
          .remove();
      }, 100);
    });

    // Toolbar/menu buttons stopPropagation, so this only fires for a click that actually landed
    // on the card body itself (the reparent-target overlay doesn't stopPropagation, but its click
    // only exists while reparentingNodeId is set, which the guard below already suppresses).
    // See tree-renderer.ts's identical handler.
    const deferredClick = createDeferredClick();
    group.on("click", (event: MouseEvent) => {
      if (reparentingNodeId) return;
      const element = event.currentTarget as Element;
      deferredClick.schedule(() => onNodeClick?.(d.data, event, element));
    });

    group.on("dblclick", () => {
      deferredClick.cancel();
      onNodeDoubleClick?.(d.data);
    });
  });
}

/** Places every dot label under `container` (across all rendered subtrees, so labels of
 * neighboring branches/sectors are checked against each other) on its first candidate spot (see
 * getDotLabelGeometry) that overlaps no higher-ranked label (see calculateLabelRank) and no dot, else marks it
 * `gtv-node-label--hidden` (CSS reveals it again on hover). Labels below the zoom's importance
 * threshold (see isLabelRankedForZoom) are hidden outright. Labels are sized for `zoomScale`: zoomed
 * out they are bigger in layout units and collide more, so fewer of them show. */
export function hideCollidingLabels<E extends SVGElement>(
  d3Lib: typeof import("d3"),
  container: d3.Selection<E, unknown, null, undefined>,
  itemCountRange: ItemCountRange,
  zoomScale: number,
): void {
  const nodes = container.selectAll<SVGGElement, D3Node>("g.node");
  const offset = (box: Box, x: number, y: number): Box => ({
    x0: box.x0 + x,
    x1: box.x1 + x,
    y0: box.y0 + y,
    y1: box.y1 + y,
  });
  const geometryById = new Map(
    nodes
      .data()
      .map((d) => [
        d.data.id,
        getDotLabelGeometry(d.x!, d.data.name, d.data.itemCount, itemCountRange, zoomScale),
      ]),
  );
  const roots = container.selectAll<SVGGElement, RootLabelDatum>("g.gtv-root-label");
  const rootGeometryById = new Map(
    roots.data().map((d) => {
      const fontSize = calculateRootLabelFontSize(
        calculateLabelFontSizeAtZoom(d.itemCount, itemCountRange, zoomScale),
        zoomScale,
      );
      return [d.id, { fontSize, candidates: getLabelCandidates(d.x, d.name, d.radius, fontSize) }];
    }),
  );
  const placement = placeLabels([
    ...roots.data().map((d) => ({
      id: `root:${d.id}`,
      labels: rootGeometryById.get(d.id)!.candidates.map((candidate) => offset(candidate.box, d.x, d.y)),
      dot: { x0: d.x - d.radius, x1: d.x + d.radius, y0: d.y - d.radius, y1: d.y + d.radius },
      // Ring roots outrank every dot label (ranks are <= 1), bigger roots first.
      priority: d.alwaysShown ? Infinity : 1 + calculateLabelRank(d.itemCount, itemCountRange, 1),
      forced: d.alwaysShown,
    })),
    ...nodes.nodes().map((element) => {
      const d = d3Lib.select<SVGGElement, D3Node>(element).datum();
      const { candidates, dot } = geometryById.get(d.data.id)!;
      const rank = calculateLabelRank(d.data.itemCount, itemCountRange, Number(element.dataset.gtvDepth));
      return {
        id: d.data.id,
        // An unranked node still keeps its dot as an obstacle for every other label.
        labels: isLabelRankedForZoom(rank, zoomScale)
          ? candidates.map((candidate) => offset(candidate.box, d.x!, d.y!))
          : [],
        dot: offset(dot, d.x!, d.y!),
        priority: rank,
      };
    }),
  ]);
  roots.each(function (d) {
    const { candidates, fontSize } = rootGeometryById.get(d.id)!;
    const index = placement.get(`root:${d.id}`)!;
    const candidate = candidates[Math.max(index, 0)];
    d3Lib
      .select(this)
      .select(".gtv-node-label")
      .attr("x", candidate.x)
      .attr("y", candidate.y)
      .attr("text-anchor", candidate.anchor)
      .style("font-size", `${fontSize}px`)
      .classed("gtv-node-label--hidden", index < 0 && !d.alwaysShown);
  });
  nodes.each(function (d) {
    const { candidates, fontSize } = geometryById.get(d.data.id)!;
    const index = placement.get(d.data.id) ?? -1;
    const candidate = candidates[Math.max(index, 0)];
    d3Lib
      .select(this)
      .select(".gtv-node-label")
      .attr("x", candidate.x)
      .attr("y", candidate.y)
      .attr("text-anchor", candidate.anchor)
      .style("font-size", `${fontSize}px`)
      .classed("gtv-node-label--hidden", index < 0);
  });
}
