import * as d3 from "d3";

import { GenreTreeAction, GenreTreeNode, GenreTreePlayState } from "./types";
import {
  addHoverNameLabel,
  addReparentTargetOverlay,
  addToolbarActions,
  buildTreeHierarchyStructure,
} from "./NodeHelper";
import { openBottomBorderPath, roundedRectPath } from "./d3-helper/d3-path-helper";
import {
  ACCENT_TEXT_COLOR,
  CORNER_RADIUS,
  ItemCountRange,
  MAX_NODE_WIDTH,
  POP_SECTOR_TINT_RATIO,
  POP_TREE_DEPTH_RADIAL_SPACING,
  RADIAL_LINK_COLOR,
  RADIAL_LINK_WIDTH,
  ROOT_BORDER_WIDTH,
  SURFACE_BORDER_COLOR,
  SURFACE_BORDER_WIDTH,
  TEXT_COLOR,
  WHEEL_RADIUS,
  calculateNodeDimensions,
  calculateNodeFontSize,
  tintSurface,
} from "./constants";

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
export function getRadialDepthRadius(depth: number, coreRootCircleRadius: number, depthSpacing: number): number {
  return coreRootCircleRadius + depth * depthSpacing;
}

/** Builds the pop subtree's hierarchy, rooted at the pop child (root not included) — thin wrapper
 * over buildTreeHierarchyStructure so callers of this module don't need to import NodeHelper
 * directly just for this one call. */
// splitRootGroupBySide (pop-core-split.ts) returns the pop subtree rooted at the pop child, whose
// own parentId still points at the (excluded) root — d3.stratify requires every parentId to
// either be null or resolve within the given set, so that dangling reference is normalized to
// null here, making the pop child stratify's root.
export function buildPopHierarchy(d3Lib: typeof import("d3"), popNodes: GenreTreeNode[]): D3Node {
  const ids = new Set(popNodes.map((node) => node.id));
  const normalized = popNodes.map((node) =>
    node.parentId !== null && !ids.has(node.parentId) ? { ...node, parentId: null } : node,
  );
  return buildTreeHierarchyStructure(d3Lib, normalized);
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
export function calculatePopSubtreeRadialExtent(hierarchy: D3Node, coreRootCircleRadius = 0): number {
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
 * Angle spread across siblings/cousins uses d3's own tidy-tree balancing (`d3.tree()`), the same
 * technique the cartesian renderers rely on, just fed a 1-D angular size instead of a 2-D pixel
 * one. Radius is NOT taken from that layout's own y — every node's radius climbs INWARD from
 * `coreRootCircleRadius` (the ring roots' own circle, where this branch's ring root chip sits) by
 * `POP_TREE_DEPTH_RADIAL_SPACING` per depth step, so the branch's own root (absolute depth
 * `POP_HIERARCHY_ROOT_ABSOLUTE_DEPTH`) always lands exactly one depth step inside that circle
 * regardless of how deep the branch grows — anchoring outward from the mainstream circle instead
 * would leave shallower branches stranded partway to the ring roots' circle while only the single
 * deepest developed branch actually reached it. Any slack this leaves between the branch's own
 * deepest node and the mainstream circle is absorbed there, not by moving the branch's own root
 * off the ring roots' circle.
 *
 * `wedgeSpanDegrees` defaults to `POP_WEDGE_SPAN_DEGREES` but should be capped by the caller at the
 * root's own weight-proportional angular sector (see `computeSectorWidths`) when more ring roots
 * are present than that constant assumes — otherwise descendants near the wedge's edges can render
 * past the root's real sector, into a neighboring root's.
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
): D3Node {
  const wedgeSpanRad = (wedgeSpanDegrees * Math.PI) / 180;
  const wedgeCenterRad = (wedgeCenterAngleDegrees * Math.PI) / 180;

  const treeLayout = d3Lib
    .tree<GenreTreeNode>()
    .size([wedgeSpanRad, 1])
    .separation(() => 1);
  treeLayout(hierarchy);

  hierarchy.each((d) => {
    const angleRad = wedgeCenterRad - wedgeSpanRad / 2 + d.x!;
    // Negative depth walks getRadialDepthRadius inward from coreRootCircleRadius rather than
    // outward from it — deliberate, not a sign error.
    const depthStepsInwardFromCore = -(POP_HIERARCHY_ROOT_ABSOLUTE_DEPTH + d.depth);
    const radius = getRadialDepthRadius(depthStepsInwardFromCore, coreRootCircleRadius, depthSpacing);
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
 * the wedge layout's forced-equal `.separation(() => 1)`); each deeper generation steps outward by
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
    const radius = getRadialDepthRadius(d.depth, coreRootCircleRadius, depthSpacing);
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
  return getRadialDepthRadius(hierarchy.height, coreRootCircleRadius, depthSpacing) + MAX_NODE_WIDTH / 2 + POP_SUBTREE_OUTER_MARGIN;
}

/** Cartesian (x, y) position on the circle of the given radius, at the given angle in the CSS
 * `rotate()` convention (0 = top, clockwise) — the same convention `computePopRadialLayout` and
 * `computeCoreRadialLayout` project their own nodes with, and the one `.gtv-wheel-slot`'s
 * `rotate(...) translateY(-radius)` (styles.css) positions the root's own JSX-rendered chip with.
 * Used to find where that chip sits in the D3 hierarchy's coordinate space, so the root->depth1
 * link can be drawn even though the root itself isn't part of the hierarchy. */
export function getRadialPointOnCircle(angleDegrees: number, radius: number): { x: number; y: number } {
  const angleRad = (angleDegrees * Math.PI) / 180;
  return { x: radius * Math.sin(angleRad), y: -radius * Math.cos(angleRad) };
}

export interface RenderPopSubtreeCallbacks {
  onPlayPause?: (nodeId: string) => void;
  onAddChild?: (parentId: string) => void;
  onRenameRequest?: (node: GenreTreeNode) => void;
  onDeleteRequest?: (node: GenreTreeNode) => void;
  onReparentRequest?: (node: GenreTreeNode) => void;
  onReparentTargetSelect: (newParentId: string) => void;
  onNodeClick?: (node: GenreTreeNode, event: MouseEvent) => void;
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
    // The wheel's own radius at baseline WHEEL_RADIUS (260px). Once a wheel grows well past that
    // (many developed subtrees), the pan/zoom fit-to-frame shrinks the whole svg via a CSS transform
    // on an ancestor element to keep it inside the viewport — that transform scales down a fixed
    // stroke-width in SVG user-space to sub-pixel and invisible, while node chips stay visible
    // because their fill area is still large enough post-shrink. Scaling stroke-width up in the same
    // proportion the wheel has grown keeps links visible at roughly a constant on-screen width.
    radialReferenceRadius?: number;
    // Where the hierarchy's own root (depth 0) connects to, when that root ISN'T part of the
    // hierarchy but instead rendered separately as its own JSX wheel chip (every per-root core/pop
    // subtree — buildCoreHierarchy/buildPopHierarchy both exclude the ring root itself, unlike the
    // center "Mainstream Pop" subtree, whose hierarchy still includes its own root at depth 0). When
    // given, one extra gtv-link is drawn per depth-0 node from this point to that node, since
    // hierarchy.links() has no edge for it (a hierarchy root has no incoming link).
    rootLinkOrigin?: { x: number; y: number };
    // The center "Mainstream Pop" subtree keeps the dark label/toolbar text every pop sector used to
    // have; every other pop sector now reads light against its tinted fill instead, matching core
    // sectors' solid-color treatment.
    isMainstreamSector?: boolean;
    // When false, suppresses the hover toolbar and hover name-label on every node in this
    // subtree. Defaults to true.
    showToolbar?: boolean;
  } = {},
): void {
  const {
    skipRootNode = false,
    isCoreSector = false,
    radialReferenceRadius = WHEEL_RADIUS,
    rootLinkOrigin,
    isMainstreamSector = false,
    showToolbar = true,
  } = options;
  const { onPlayPause, onAddChild, onRenameRequest, onDeleteRequest, onReparentTargetSelect, onNodeClick } =
    callbacks;
  const isForbidden = (d: D3Node) => reparentForbiddenIds.includes(d.data.id);
  const nodeFill = isCoreSector ? rootColor : tintSurface(rootColor, POP_SECTOR_TINT_RATIO);
  // skipRootNode omits the hierarchy's own depth-0 node from the drawn cards — used for the center
  // "Pop" node's subtree, whose depth-0 node already renders as its own dedicated wheel chip.
  const drawnNodes = skipRootNode ? hierarchy.descendants().filter((d) => d.depth > 0) : hierarchy.descendants();
  const linkStrokeWidth = RADIAL_LINK_WIDTH * Math.max(1, radialReferenceRadius / WHEEL_RADIUS);
  const rootLinks = rootLinkOrigin
    ? hierarchy
        .descendants()
        .filter((d) => d.depth === 0)
        .map((d) => ({ source: rootLinkOrigin, target: { x: d.x!, y: d.y! } }))
    : [];
  const links: { source: { x?: number; y?: number }; target: { x?: number; y?: number } }[] = [
    ...hierarchy.links(),
    ...rootLinks,
  ];

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
    .linkRadial<{ source: { x: number; y: number }; target: { x: number; y: number } }, { x: number; y: number }>()
    .angle((d) => d.x)
    .radius((d) => d.y);

  svg
    .selectAll("path.gtv-link")
    .data(links)
    .enter()
    .append("path")
    .attr("class", "gtv-link")
    .attr("d", (d) => radialLinkGenerator({ source: toPolar(d.source), target: toPolar(d.target) }))
    .style("fill", "none")
    .style("stroke", RADIAL_LINK_COLOR)
    .style("stroke-width", linkStrokeWidth)
    .style("stroke-linecap", "round");

  const nodes = svg
    .selectAll<SVGGElement, D3Node>("g.node")
    .data(drawnNodes)
    .enter()
    .append("g")
    .attr("class", (d) => "node" + (isForbidden(d) ? " gtv-node--forbidden" : ""))
    .attr("id", (d) => "group-" + d.data.id)
    .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
    .style("--gtv-node-fill", nodeFill);

  nodes
    .append("rect")
    .attr("class", "gtv-hover-hit-area")
    .attr("width", (d) => calculateNodeDimensions(d.data.itemCount, itemCountRange).WIDTH)
    .attr("height", (d) => calculateNodeDimensions(d.data.itemCount, itemCountRange).HEIGHT)
    .attr("x", (d) => -calculateNodeDimensions(d.data.itemCount, itemCountRange).WIDTH / 2)
    .attr("y", (d) => -calculateNodeDimensions(d.data.itemCount, itemCountRange).HEIGHT / 2)
    .attr("fill", "transparent")
    .attr("pointer-events", "all");

  nodes
    .append("path")
    .attr("class", "gtv-node-rect")
    .attr("d", (d) => {
      const dimensions = calculateNodeDimensions(d.data.itemCount, itemCountRange);
      return roundedRectPath(-dimensions.WIDTH / 2, -dimensions.HEIGHT / 2, dimensions.WIDTH, dimensions.HEIGHT, {
        tl: CORNER_RADIUS,
        tr: CORNER_RADIUS,
        br: CORNER_RADIUS,
        bl: CORNER_RADIUS,
      });
    })
    .attr("fill", nodeFill);

  nodes
    .append("path")
    .attr("class", "gtv-node-border")
    .attr("d", (d) => {
      const dimensions = calculateNodeDimensions(d.data.itemCount, itemCountRange);
      return roundedRectPath(-dimensions.WIDTH / 2, -dimensions.HEIGHT / 2, dimensions.WIDTH, dimensions.HEIGHT, {
        tl: CORNER_RADIUS,
        tr: CORNER_RADIUS,
        br: CORNER_RADIUS,
        bl: CORNER_RADIUS,
      });
    })
    .attr("fill", "none")
    .attr("stroke", SURFACE_BORDER_COLOR)
    .attr("stroke-width", (d) => (d.depth === 0 || isCoreSector ? ROOT_BORDER_WIDTH : SURFACE_BORDER_WIDTH));

  nodes
    .append("foreignObject")
    .attr("width", (d) => calculateNodeDimensions(d.data.itemCount, itemCountRange).WIDTH)
    .attr("height", (d) => calculateNodeDimensions(d.data.itemCount, itemCountRange).HEIGHT)
    .attr("x", (d) => -calculateNodeDimensions(d.data.itemCount, itemCountRange).WIDTH / 2)
    .attr("y", (d) => -calculateNodeDimensions(d.data.itemCount, itemCountRange).HEIGHT / 2)
    .html((d) => {
      const fontSize = calculateNodeFontSize(d.data.itemCount, itemCountRange);
      const rootClass = isCoreSector ? " gtv-node-label--root" : "";
      const color = isMainstreamSector ? TEXT_COLOR : ACCENT_TEXT_COLOR;
      return `<div class="gtv-node-label${rootClass}" style="color:${color};font-size:${fontSize}px">${d.data.name}</div>`;
    })
    .on("mouseover", function (_event, d) {
      if (reparentingNodeId || isForbidden(d) || !showToolbar) return;

      const group = d3Lib.select<SVGGElement, unknown>(this.parentNode as SVGGElement) as unknown as d3.Selection<
        SVGGElement,
        unknown,
        HTMLElement,
        unknown
      >;

      const dimensions = calculateNodeDimensions(d.data.itemCount, itemCountRange);
      group
        .select<SVGPathElement>(".gtv-node-rect")
        .attr(
          "d",
          roundedRectPath(-dimensions.WIDTH / 2, -dimensions.HEIGHT / 2, dimensions.WIDTH, dimensions.HEIGHT, {
            tl: 0,
            tr: 0,
            br: CORNER_RADIUS,
            bl: CORNER_RADIUS,
          }),
        );
      group
        .select<SVGPathElement>(".gtv-node-border")
        .attr(
          "d",
          openBottomBorderPath(-dimensions.WIDTH / 2, -dimensions.HEIGHT / 2, dimensions.WIDTH, dimensions.HEIGHT, {
            br: CORNER_RADIUS,
            bl: CORNER_RADIUS,
          }),
        );

      const labelColor = isMainstreamSector ? TEXT_COLOR : ACCENT_TEXT_COLOR;
      addHoverNameLabel(d3Lib, d.data, group, itemCountRange, labelColor);

      addToolbarActions(
        d3Lib,
        d.data,
        group,
        {
          onPlayPause,
          additionalActions: callbacks.additionalActions,
          onAddChild,
          onRenameRequest,
          onDeleteRequest,
          onReparentRequest: callbacks.onReparentRequest,
          playingNodeId: callbacks.playingNodeId,
          playState: callbacks.playState,
        },
        itemCountRange,
        labelColor,
        "horizontal",
      );
    });

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
          group as unknown as d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
          onReparentTargetSelect,
          itemCountRange,
        );
      }
    });

    group.on("mouseleave", function () {
      leaveTimeoutId = setTimeout(() => {
        leaveTimeoutId = null;
        if (d3Lib.select<SVGGElement, unknown>("#overflow-menu-" + d.data.id).empty()) {
          d3Lib.select<SVGGElement, unknown>("#toolbar-" + d.data.id).remove();
          d3Lib.select<SVGGElement, unknown>("#hover-label-" + d.data.id).remove();

          const dimensions = calculateNodeDimensions(d.data.itemCount, itemCountRange);
          const fullyRounded = roundedRectPath(
            -dimensions.WIDTH / 2,
            -dimensions.HEIGHT / 2,
            dimensions.WIDTH,
            dimensions.HEIGHT,
            { tl: CORNER_RADIUS, tr: CORNER_RADIUS, br: CORNER_RADIUS, bl: CORNER_RADIUS },
          );
          group.select<SVGPathElement>(".gtv-node-rect").attr("d", fullyRounded);
          group.select<SVGPathElement>(".gtv-node-border").attr("d", fullyRounded);
        }
        d3Lib.select<SVGGElement, unknown>("#select-as-new-parent-group-" + d.data.id).remove();
      }, 100);
    });

    // Toolbar/menu buttons stopPropagation, so this only fires for a click that actually landed
    // on the card body itself (the reparent-target overlay doesn't stopPropagation, but its click
    // only exists while reparentingNodeId is set, which the guard below already suppresses).
    // See tree-renderer.ts's identical handler.
    group.on("click", function (event: MouseEvent) {
      if (reparentingNodeId) return;
      onNodeClick?.(d.data, event);
    });
  });
}
