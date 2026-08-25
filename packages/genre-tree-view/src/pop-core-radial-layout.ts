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
  CORNER_RADIUS,
  MAX_NODE_WIDTH,
  POP_TREE_DEPTH_RADIAL_SPACING,
  ROOT_BORDER_WIDTH,
  SURFACE_BORDER_COLOR,
  SURFACE_BORDER_WIDTH,
  TEXT_COLOR,
  calculateNodeDimensions,
  calculateNodeFontSize,
  getItemCountRange,
  tintSurface,
} from "./constants";

type D3Node = d3.HierarchyNode<GenreTreeNode>;
type D3Selection = d3.Selection<SVGGElement, unknown, null, undefined>;

// Angular width of the wedge a pop subtree fans out into, centered on its cardinal's direction —
// narrower than the cardinal's own full 90deg quadrant so it never touches the neighboring
// quadrant's wedge, matching the gutter every other radial-wheel element keeps from its neighbors.
const POP_WEDGE_SPAN_DEGREES = 80;

// Margin (px) added past a pop subtree's deepest node's own half-width, so its rendered card
// never sits flush against the wheel's own circle edge.
const POP_SUBTREE_OUTER_MARGIN = 24;

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

/** The outer radius (px, from the wheel's center) a pop subtree needs to render without
 * overlapping the wheel's own edge — driven by its deepest node's ring plus that node's own
 * half-width and a fixed outer margin. Used to grow the wheel's circle to fit whichever developed
 * cardinal's pop subtree reaches furthest.
 *
 * `innerRadiusFloor` shifts the whole subtree outward by that amount (mirroring
 * `computePopRadialLayout`'s own offset) so the returned extent still reflects where the subtree's
 * outermost node actually lands once it's been pushed clear of the middle circle. */
export function calculatePopSubtreeRadialExtent(hierarchy: D3Node, innerRadiusFloor = 0): number {
  const maxDepth = hierarchy.height;
  return innerRadiusFloor + (maxDepth + 1) * POP_TREE_DEPTH_RADIAL_SPACING + MAX_NODE_WIDTH / 2 + POP_SUBTREE_OUTER_MARGIN;
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
 * one. Radius is NOT taken from that layout's own y — it's fixed per depth, counting down from the
 * subtree's own deepest ring (`(height + 1) * POP_TREE_DEPTH_RADIAL_SPACING`) as depth increases,
 * so the pop child (depth 0) lands right at that outer ring — next to the cardinal root chip it
 * branches from — and each generation below it steps inward, toward the wheel's own center.
 *
 * `innerRadiusFloor` shifts the entire subtree outward so its deepest node never crosses into the
 * center Mainstream Pop node's own circle — every generation keeps its normal
 * `POP_TREE_DEPTH_RADIAL_SPACING` gap from its neighbors, just measured from that floor instead of
 * from the wheel's true center. Callers must grow the wheel radius to match (see
 * `calculatePopSubtreeRadialExtent`'s own `innerRadiusFloor` param) so the shifted-out subtree still
 * fits inside the wheel's edge.
 */
export function computePopRadialLayout(
  d3Lib: typeof import("d3"),
  hierarchy: D3Node,
  wedgeCenterAngleDegrees: number,
  innerRadiusFloor = 0,
): D3Node {
  const wedgeSpanRad = (POP_WEDGE_SPAN_DEGREES * Math.PI) / 180;
  const wedgeCenterRad = (wedgeCenterAngleDegrees * Math.PI) / 180;
  const maxDepth = hierarchy.height;

  const treeLayout = d3Lib
    .tree<GenreTreeNode>()
    .size([wedgeSpanRad, 1])
    .separation(() => 1);
  treeLayout(hierarchy);

  hierarchy.each((d) => {
    const angleRad = wedgeCenterRad - wedgeSpanRad / 2 + d.x!;
    const radius = innerRadiusFloor + (maxDepth - d.depth + 1) * POP_TREE_DEPTH_RADIAL_SPACING;
    d.x = radius * Math.sin(angleRad);
    d.y = -radius * Math.cos(angleRad);
  });

  return hierarchy;
}

/**
 * Lays out the center "Mainstream Pop" node's own subtree in polar coordinates, full-circle
 * (unlike `computePopRadialLayout`'s 80deg wedge — the center node has no single cardinal
 * direction to anchor to). `hierarchy` must be rooted at the center node itself: depth 0 (the
 * center node) is pinned to the wheel's true origin and excluded from angular layout; depth 1
 * (its direct children) land on the `mainstreamPopRootCircleRadius` ring — the "mainstream pop
 * root circle" — spread around the full circle proportional to each child's own subtree size
 * (d3.tree's default separation, unlike the wedge layout's forced-equal `.separation(() => 1)`);
 * each deeper generation steps outward by `depthSpacing`.
 */
export function computeCenterRadialLayout(
  d3Lib: typeof import("d3"),
  hierarchy: D3Node,
  mainstreamPopRootCircleRadius: number,
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
    const radius = mainstreamPopRootCircleRadius + (d.depth - 1) * depthSpacing;
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
  mainstreamPopRootCircleRadius: number,
  depthSpacing: number,
): number {
  return (
    mainstreamPopRootCircleRadius + (hierarchy.height - 1) * depthSpacing + MAX_NODE_WIDTH / 2 + POP_SUBTREE_OUTER_MARGIN
  );
}

export interface RenderPopSubtreeCallbacks {
  onPlayPause?: (nodeId: string) => void;
  onAddChild?: (parentId: string) => void;
  onRenameRequest?: (node: GenreTreeNode) => void;
  onDeleteRequest?: (node: GenreTreeNode) => void;
  onReparentRequest?: (node: GenreTreeNode) => void;
  onReparentTargetSelect: (newParentId: string) => void;
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
 * only the positioning math and link shape (straight lines fanning from the wheel's center, not
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
  skipRootNode = false,
): void {
  const { onPlayPause, onAddChild, onRenameRequest, onDeleteRequest, onReparentTargetSelect } = callbacks;
  const itemCountRange = getItemCountRange(hierarchy.descendants().map((d) => d.data));
  const isForbidden = (d: D3Node) => reparentForbiddenIds.includes(d.data.id);
  // skipRootNode omits the hierarchy's own depth-0 node from the drawn cards — used for the center
  // "Pop" node's subtree, whose depth-0 node already renders as its own dedicated wheel chip.
  // Links are untouched: hierarchy.links() only ever contains depth0→depth1+ edges (a hierarchy
  // root has no incoming link), and the link from the center out to each depth-1 child is still
  // wanted.
  const drawnNodes = skipRootNode ? hierarchy.descendants().filter((d) => d.depth > 0) : hierarchy.descendants();

  svg
    .selectAll("path.gtv-link")
    .data(hierarchy.links())
    .enter()
    .append("path")
    .attr("class", "gtv-link")
    .attr("d", (d) => `M ${d.source.x} ${d.source.y} L ${d.target.x} ${d.target.y}`)
    .style("fill", "none")
    .style("stroke", SURFACE_BORDER_COLOR)
    .style("stroke-width", SURFACE_BORDER_WIDTH)
    .style("stroke-linecap", "round");

  const nodes = svg
    .selectAll<SVGGElement, D3Node>("g.node")
    .data(drawnNodes)
    .enter()
    .append("g")
    .attr("class", (d) => "node" + (isForbidden(d) ? " gtv-node--forbidden" : ""))
    .attr("id", (d) => "group-" + d.data.id)
    .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
    .style("--gtv-node-fill", tintSurface(rootColor));

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
    .attr("fill", tintSurface(rootColor));

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
    .attr("stroke-width", (d) => (d.depth === 0 ? ROOT_BORDER_WIDTH : SURFACE_BORDER_WIDTH));

  nodes
    .append("foreignObject")
    .attr("width", (d) => calculateNodeDimensions(d.data.itemCount, itemCountRange).WIDTH)
    .attr("height", (d) => calculateNodeDimensions(d.data.itemCount, itemCountRange).HEIGHT)
    .attr("x", (d) => -calculateNodeDimensions(d.data.itemCount, itemCountRange).WIDTH / 2)
    .attr("y", (d) => -calculateNodeDimensions(d.data.itemCount, itemCountRange).HEIGHT / 2)
    .html((d) => {
      const fontSize = calculateNodeFontSize(d.data.itemCount, itemCountRange);
      return `<div class="gtv-node-label" style="color:${TEXT_COLOR};font-size:${fontSize}px">${d.data.name}</div>`;
    })
    .on("mouseover", function (_event, d) {
      if (reparentingNodeId || isForbidden(d)) return;

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

      addHoverNameLabel(d3Lib, d.data, group, itemCountRange);

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
  });
}
