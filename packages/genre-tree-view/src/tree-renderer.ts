import * as d3 from "d3";

import {
  depthAxisSign,
  GenreTreeAction,
  GenreTreeNode,
  GenreTreePlayState,
  isVerticalOrientation,
  TreeOrientation,
} from "./types";
import {
  HORIZONTAL_SEPARATION_BETWEEN_NODES,
  VERTICAL_SEPARATION_BETWEEN_NODES,
  VERTICAL_ORIENTATION_DEPTH_SEPARATION,
  SIBLING_SEPARATION_BETWEEN_NODES,
  ACTIONS_OVERLAY_WIDTH,
  ACTIONS_OVERLAY_HEIGHT,
  SURFACE_BORDER_COLOR,
  SURFACE_BORDER_WIDTH,
  ROOT_BORDER_WIDTH,
  CORNER_RADIUS,
  ELEVATION,
  TEXT_COLOR,
  TEXT_MUTED_COLOR,
  ACCENT_TEXT_COLOR,
  MAX_NODE_WIDTH,
  MAX_NODE_HEIGHT,
  calculateNodeDimensions,
  calculateNodeFontSize,
  getItemCountRange,
  tintSurface,
} from "./constants";
import { addGrid } from "./d3-helper/d3-grid-helper";
import { appendPaths, openBottomBorderPath, roundedRectPath } from "./d3-helper/d3-path-helper";
import { addHoverNameLabel, addReparentTargetOverlay, addToolbarActions } from "./NodeHelper";

type D3Selection = d3.Selection<SVGGElement, unknown, null, undefined>;
type D3Node = d3.HierarchyNode<GenreTreeNode>;

interface SvgDimensions {
  svgWidth: number;
  svgHeight: number;
  highestVerticalCoordinate: number;
  rootDepthOffset: number;
}

export interface RenderTreeCallbacks {
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

export function calculateSvgDimensions(
  d3Lib: typeof import("d3"),
  treeData: D3Node,
  orientation: TreeOrientation = "horizontal",
  hideRoot = false,
  depthSpacingScale = 1,
): SvgDimensions {
  const nodes = treeData.descendants();
  const itemCountRange = getItemCountRange(nodes.map((d) => d.data));
  // The node with the highest itemCount in range always scales to exactly MAX_NODE_*
  // (see calculateNodeDimensions), so the layout budget can use those constants directly.
  const maxNodeDimensions = { WIDTH: MAX_NODE_WIDTH, HEIGHT: MAX_NODE_HEIGHT };
  const maximumLevel = d3Lib.max(nodes, (d) => d.depth)!;
  const depthSeparation = VERTICAL_ORIENTATION_DEPTH_SEPARATION * depthSpacingScale;
  const depthSeparationHorizontal = HORIZONTAL_SEPARATION_BETWEEN_NODES * depthSpacingScale;

  if (isVerticalOrientation(orientation)) {
    // Root sits at the bottom edge ("vertical") or top edge ("vertical-flipped"), so only that
    // one side needs toolbar/menu clearance — the
    // horizontal branch below reserves the same ACTIONS_OVERLAY_HEIGHT split in half across its
    // two ends (top and bottom margins), so match that per-side amount rather than the full budget.
    // A hidden root renders no card and no toolbar, so it needs neither its own height nor that
    // clearance — the svg's bottom edge instead lands exactly on the root's anchor point.
    const svgHeight = hideRoot
      ? maximumLevel * depthSeparation
      : maximumLevel * depthSeparation + maxNodeDimensions.HEIGHT + ACTIONS_OVERLAY_HEIGHT / 2;

    // Root is centered over its children (Reingold–Tilford), so anchoring the whole svg on the
    // root's own breadth coordinate — rather than the bounding box's midpoint — keeps the root
    // exactly at svgWidth/2. The toolbar only ever renders to a node's right, so only the right
    // half needs its headroom (ACTIONS_OVERLAY_WIDTH); the left half doesn't.
    //
    // Every consumer of a node's x (link endpoints in appendPaths, the rendered card's own
    // center) treats `d.x + own width / 2` as that node's true visual position — d.x alone is
    // just its left edge. The root is no exception (hideRoot only skips drawing its card, not
    // this convention), so it has to be centered on that same point, not on the bare `d.x`.
    // Skipping the `+ width / 2` here left the root's card/chip sitting half its own width left
    // of where its children's links actually converge.
    const rootWidth = calculateNodeDimensions(treeData.data.itemCount, itemCountRange).WIDTH;
    const rootAnchorX = treeData.x! + rootWidth / 2;

    const leftmostBreadthCoordinate = d3Lib.min(nodes, (d) => d.x)!;
    const rightmostBreadthCoordinate = d3Lib.max(nodes, (d) => d.x)!;
    const leftHalfExtent = rootAnchorX - leftmostBreadthCoordinate + maxNodeDimensions.WIDTH / 2;
    const rightHalfExtent =
      rightmostBreadthCoordinate - rootAnchorX + maxNodeDimensions.WIDTH / 2 + ACTIONS_OVERLAY_WIDTH;
    const svgWidth = Math.max(leftHalfExtent, rightHalfExtent) * 2;

    // Reuses this slot to carry the root-centering offset applied in setupTreeLayout, rather
    // than a vertical coordinate — the two orientations need different single scalars out of
    // this function and the field isn't worth renaming just for that.
    const rootCenteringOffset = svgWidth / 2 - rootAnchorX;

    // "vertical": root sits at the depth axis's far end (y = svgHeight); the universal
    // `+ height / 2` rendering convention (see appendPaths/renderTree) then pulls a hidden root's
    // link-anchor point back toward y = svgHeight, i.e. toward the anchor it needs to coincide
    // with — no extra offset needed, same as "horizontal-anchored-flipped" below.
    // "vertical-flipped": root sits at the depth axis's near end (y = 0) instead, so that same
    // `+ height / 2` convention pushes a hidden root's anchor point *away* from y = 0 by exactly
    // one half-height — the mirror of "horizontal-anchored" needing `-rootWidth`, this needs an
    // analogous `-rootHeight` pulled back into the depth axis so the push lands exactly at y = 0.
    const rootHeight = calculateNodeDimensions(treeData.data.itemCount, itemCountRange).HEIGHT;
    const rootDepthOffset = hideRoot ? -rootHeight : 0;

    return { svgWidth, svgHeight, highestVerticalCoordinate: rootCenteringOffset, rootDepthOffset };
  }

  if (orientation === "horizontal-anchored" || orientation === "horizontal-anchored-flipped") {
    const svgWidth = maximumLevel * depthSeparationHorizontal + maxNodeDimensions.WIDTH + ACTIONS_OVERLAY_WIDTH;

    // Root is centered over its children (Reingold–Tilford), so anchoring the whole svg on the
    // root's own breadth coordinate keeps the root exactly at svgHeight/2 — same technique as the
    // vertical branch above, but on the Y (breadth) axis since depth grows along X here instead.
    const rootHeight = calculateNodeDimensions(treeData.data.itemCount, itemCountRange).HEIGHT;
    const rootAnchorY = treeData.x! + rootHeight / 2;

    const topmostBreadthCoordinate = d3Lib.min(nodes, (d) => d.x)!;
    const bottommostBreadthCoordinate = d3Lib.max(nodes, (d) => d.x)!;
    const topHalfExtent =
      rootAnchorY - topmostBreadthCoordinate + maxNodeDimensions.HEIGHT / 2 + ACTIONS_OVERLAY_HEIGHT / 2;
    const bottomHalfExtent =
      bottommostBreadthCoordinate - rootAnchorY + maxNodeDimensions.HEIGHT / 2 + ACTIONS_OVERLAY_HEIGHT / 2;
    const svgHeight = Math.max(topHalfExtent, bottomHalfExtent) * 2;

    // Reuses this slot to carry the root-centering offset applied in setupTreeLayout, same as
    // the vertical branch above.
    const rootCenteringOffset = svgHeight / 2 - rootAnchorY;

    // A hidden root's own width is otherwise baked into every consumer's `d.x + width / 2`
    // convention (see the comment on the vertical branch above) same as it is for a hidden root's
    // breadth position — except here that convention pushes the root's rendered center *away*
    // from the anchor (depth grows in +x, toward larger x) instead of into it, since the anchor
    // sits at this axis's near/zero end rather than its far end the way the vertical branch's
    // bottom-pinned anchor does. Pulling everything back by the root's own width before that
    // `+ width / 2` is applied lands the root's rendered center exactly one half-width *behind*
    // x=0 — i.e. inside the anchor's chip, matching the vertical branch's root landing inside its
    // chip too. setupTreeLayout applies this shift to every node, not just the root: shifting only
    // the root would leave the root→depth-1 link one rootWidth longer than every later
    // depth-to-depth link, since a per-depth offset cancels out of a distance calculation only
    // when it's the same on both ends.
    const rootWidth = calculateNodeDimensions(treeData.data.itemCount, itemCountRange).WIDTH;
    const rootDepthOffset = hideRoot ? -rootWidth : 0;

    return { svgWidth, svgHeight, highestVerticalCoordinate: rootCenteringOffset, rootDepthOffset };
  }

  const highestNodeVerticalCoordinate = d3Lib.min(nodes, (d) => d.x)!;
  const highestVerticalCoordinate =
    highestNodeVerticalCoordinate + maxNodeDimensions.HEIGHT / 2 - ACTIONS_OVERLAY_HEIGHT / 2;
  const lowestNodeVerticalCoordinate = d3Lib.max(nodes, (d) => d.x)!;
  const lowestVerticalCoordinate =
    lowestNodeVerticalCoordinate + maxNodeDimensions.HEIGHT / 2 + ACTIONS_OVERLAY_HEIGHT / 2;
  // When every node shares the same breadth coordinate (a single root, or a childless/straight
  // chain), the spread above collapses to just ACTIONS_OVERLAY_HEIGHT, dropping the node's own
  // height from the sum entirely. Floor at a single node's full footprint so the card always fits.
  const svgHeight = Math.max(
    lowestVerticalCoordinate - highestVerticalCoordinate,
    maxNodeDimensions.HEIGHT + ACTIONS_OVERLAY_HEIGHT,
  );

  const svgWidth = maximumLevel * depthSeparationHorizontal + maxNodeDimensions.WIDTH + ACTIONS_OVERLAY_WIDTH;

  return { svgWidth, svgHeight, highestVerticalCoordinate, rootDepthOffset: 0 };
}

export function setupTreeLayout(
  d3Lib: typeof import("d3"),
  treeData: D3Node,
  highestVerticalCoordinate: number,
  orientation: TreeOrientation = "horizontal",
  rootDepthOffset = 0,
  svgWidth = 0,
  depthSpacingScale = 1,
): D3Node {
  if (isVerticalOrientation(orientation)) {
    const maximumLevel = d3Lib.max(treeData.descendants(), (d) => d.depth)!;
    const depthSeparation = VERTICAL_ORIENTATION_DEPTH_SEPARATION * depthSpacingScale;
    treeData.each(function (d) {
      d.x = d.x! + highestVerticalCoordinate;
      // "vertical": root anchored at the bottom (depthAxisSign -1), depth grows toward y=0.
      // "vertical-flipped": root anchored at the top (depthAxisSign +1), depth grows toward
      // maximumLevel * SEPARATION.
      d.y =
        depthAxisSign(orientation) === -1
          ? (maximumLevel - d.depth) * depthSeparation
          : d.depth * depthSeparation + rootDepthOffset;
    });
    return treeData;
  }

  if (orientation === "horizontal-anchored" || orientation === "horizontal-anchored-flipped") {
    // Applied to every node, not just the root: a root-only offset would leave the
    // root→depth-1 gap one rootWidth wider than every later depth-to-depth gap, since it'd
    // shift only one end of that first link. Shifting the whole depth axis instead keeps every
    // gap the uniform HORIZONTAL_SEPARATION_BETWEEN_NODES, while still landing the root's own
    // rendered center on the anchor (see the comment on rootDepthOffset above).
    //
    // "horizontal-anchored-flipped" mirrors this around svgWidth instead of 0 — but unlike the
    // non-flipped case, rootDepthOffset must NOT be applied here at all. The `+ width / 2`
    // rendering convention (see renderTree) always shifts a node's center in the +x direction
    // regardless of growth direction, so for the non-flipped anchor (depth grows toward +x) that
    // convention pulls a hidden root's shifted position *back toward* the anchor, and
    // rootDepthOffset must overshoot past it to land half a width behind. For the flipped anchor
    // (depth grows toward -x), that same convention already pushes a hidden root's position
    // *away from* the anchor by exactly one half-width on its own — applying rootDepthOffset on
    // top double-counts that shift and pulls the root a full extra width off the anchor.
    treeData.each(function (d) {
      const tempX = d.x!;
      d.x = orientation === "horizontal-anchored" ? d.y! + rootDepthOffset : svgWidth - d.y!;
      d.y = tempX + highestVerticalCoordinate;
    });
    return treeData;
  }

  treeData.each(function (d) {
    const tempX = d.x!;
    d.x = d.y!;
    d.y = tempX - highestVerticalCoordinate;
  });
  return treeData;
}

export function createTreeLayout(
  d3Lib: typeof import("d3"),
  root: D3Node,
  orientation: TreeOrientation = "horizontal",
  depthSpacingScale = 1,
): D3Node {
  const nodeSize: [number, number] = isVerticalOrientation(orientation)
    ? [SIBLING_SEPARATION_BETWEEN_NODES, VERTICAL_ORIENTATION_DEPTH_SEPARATION * depthSpacingScale]
    : [VERTICAL_SEPARATION_BETWEEN_NODES, HORIZONTAL_SEPARATION_BETWEEN_NODES * depthSpacingScale];
  // d3's default separation() doubles the gap between same-depth nodes that don't share a
  // parent, which compounds up the tree for deeply-branching data and produces gaps several
  // times wider than the nodeSize slot itself. Every node already reserves its own slot via
  // nodeSize, so a flat 1 keeps that slot's spacing consistent regardless of parentage.
  const treeLayout = d3Lib.tree<GenreTreeNode>().nodeSize(nodeSize).separation(() => 1);
  return treeLayout(root);
}

export function renderTree(
  d3Lib: typeof import("d3"),
  svgRef: React.RefObject<SVGSVGElement>,
  treeData: D3Node,
  svgWidth: number,
  svgHeight: number,
  reparentingNodeId: string | null,
  reparentForbiddenIds: string[],
  rootColor: string,
  callbacks: RenderTreeCallbacks,
  orientation: TreeOrientation = "horizontal",
  hideRoot = false,
  showToolbar = true,
): D3Selection {
  const { onPlayPause, onAddChild, onRenameRequest, onDeleteRequest, onReparentTargetSelect } = callbacks;

  if (!svgRef.current) {
    throw new Error("SVG reference is null");
  }

  const itemCountRange = getItemCountRange(treeData.descendants().map((d) => d.data));

  const svg = d3Lib
    .select<SVGSVGElement, unknown>(svgRef.current)
    .append("svg")
    .attr("width", svgWidth)
    .attr("height", svgHeight)
    .style("overflow", "visible")
    .append("g") as unknown as D3Selection;

  // Card elevation shadow, scoped to this root's id so multiple <GenreTree> instances
  // on one page never collide. The id is sanitized since it's embedded into an SVG
  // `id`/`url(#...)` reference, which arbitrary GenreTreeNode.id strings are not safe for.
  const safeRootId = treeData.data.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const shadowFilterId = `gtv-card-shadow-${safeRootId}`;
  if (ELEVATION) {
    const defs = svg.append("defs");
    const filter = defs
      .append("filter")
      .attr("id", shadowFilterId)
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");
    filter
      .append("feDropShadow")
      .attr("dx", 0)
      .attr("dy", 0)
      .attr("stdDeviation", 1)
      .attr("flood-color", TEXT_COLOR)
      .attr("flood-opacity", 0.12);
  }

  addGrid(svg, svgWidth, svgHeight, true);

  appendPaths(d3Lib, svg, treeData, itemCountRange, orientation);

  const isForbidden = (d: D3Node) => reparentForbiddenIds.includes(d.data.id);

  // With the actual root hidden, the whole visible subtree grows directly out of the root chip —
  // styling every node the same way (solid root color, bold white label) reads as a continuation
  // of that chip instead of a visual gap into plain cards.
  const isSubtreeCore = (d: D3Node) => hideRoot && d.depth >= 1;

  // The hidden root still contributes its (x, y) as the anchor endpoint for appendPaths above —
  // only its own card/toolbar is skipped here, not its position.
  const visibleDescendants = hideRoot
    ? treeData.descendants().filter((d) => d.depth !== 0)
    : treeData.descendants();

  const nodes = svg
    .selectAll<SVGGElement, D3Node>("g.node")
    .data(visibleDescendants)
    .enter()
    .append("g")
    .attr("class", (d) => "node" + (isForbidden(d) ? " gtv-node--forbidden" : ""))
    .attr("id", (d) => "group-" + d.data.id)
    .attr("transform", function (d) {
      const dimensions = calculateNodeDimensions(d.data.itemCount, itemCountRange);
      const translateX = d.x! + dimensions.WIDTH / 2;
      const translateY = d.y! + dimensions.HEIGHT / 2;
      return `translate(${translateX}, ${translateY})`;
    })
    // Exposed so the toolbar foreignObject (which overlays the card on hover) can mask the
    // label beneath it with the card's own fill instead of a hardcoded color.
    .style("--gtv-node-fill", (d) => (isSubtreeCore(d) ? rootColor : tintSurface(rootColor)));

  // Invisible hit-region spanning the node body, appended before any visible content so painted
  // siblings (rect, label, toolbar) take pointer-event priority over it wherever they overlap
  // it. <g> itself paints nothing, so without this the group's mouseenter/mouseleave below would
  // be governed only by the union of whichever painted children currently exist.
  nodes
    .append("rect")
    .attr("class", "gtv-hover-hit-area")
    .attr("width", (d) => calculateNodeDimensions(d.data.itemCount, itemCountRange).WIDTH)
    .attr("height", (d) => calculateNodeDimensions(d.data.itemCount, itemCountRange).HEIGHT)
    .attr("x", (d) => -calculateNodeDimensions(d.data.itemCount, itemCountRange).WIDTH / 2)
    .attr("y", (d) => -calculateNodeDimensions(d.data.itemCount, itemCountRange).HEIGHT / 2)
    .attr("fill", "transparent")
    .attr("pointer-events", "all");

  // Fill and border are separate paths (rather than one path with both fill and stroke) so that
  // hovering a node can drop just its border's top edge (to merge visually with its hover tab
  // above, which already omits its own border-bottom) without needing a stroke API that can
  // fill without stroking. See the mouseover/mouseleave-timeout handlers below.
  //
  // The card path is wrapped in its own <g> so the elevation filter has a stable target: the
  // hover label is appended outside this group (see the mouseover handler below), so mounting or
  // unmounting it on hover never changes what the filter blurs — the card's shadow always looks
  // the same, hovered or not.
  const cardShadowGroups = nodes
    .append("g")
    .attr("class", "gtv-card-shadow-group")
    .attr("filter", ELEVATION ? `url(#${shadowFilterId})` : null);

  cardShadowGroups
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
    .attr("fill", (d) => (isSubtreeCore(d) ? rootColor : tintSurface(rootColor)));

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
      const rootClass = d.depth === 0 || isSubtreeCore(d) ? " gtv-node-label--root" : "";
      const color = isForbidden(d) ? TEXT_MUTED_COLOR : isSubtreeCore(d) ? ACCENT_TEXT_COLOR : TEXT_COLOR;
      const fontSize = calculateNodeFontSize(d.data.itemCount, itemCountRange);
      return `<div class="gtv-node-label${rootClass}" style="color:${color};font-size:${fontSize}px">${d.data.name}</div>`;
    })
    .on("mouseover", function (event, d) {
      if (reparentingNodeId || isForbidden(d) || !showToolbar) return;

      const group = d3Lib.select<SVGGElement, unknown>(this.parentNode as SVGGElement) as unknown as d3.Selection<
        SVGGElement,
        unknown,
        HTMLElement,
        unknown
      >;

      // Square off the top corners while the hover label sits on top of them — the label only
      // overlaps the card by HOVER_LABEL_CARD_OVERLAP px, far short of CORNER_RADIUS, so the
      // card's own rounded corners would otherwise show through beneath the label's straight
      // bottom edge.
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

      // Appended into this node <g> directly (not .gtv-card-shadow-group) so mounting the label
      // never changes the card's own filtered silhouette — the card's shadow must look identical
      // hovered or not.
      const labelColor = isSubtreeCore(d) ? ACCENT_TEXT_COLOR : TEXT_COLOR;
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
        orientation,
      );
    });

  nodes.each(function (d: D3Node) {
    const group = d3Lib.select<SVGGElement, unknown>(this);
    let leaveTimeoutId: ReturnType<typeof setTimeout> | null = null;

    group.on("mouseenter", function () {
      // A fast mouse movement between this node's own child shapes (e.g. from the label onto
      // the toolbar) can cross an unpainted gap between them, which the browser reports as
      // briefly leaving and re-entering this <g> (pointer-events only tracks painted areas, and
      // <g> itself paints nothing). Cancel any removal that blip scheduled, or a quick pass-through
      // would still delete the toolbar 100ms later even though the mouse is back on it.
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
        // Leave the toolbar in place while its own overflow menu is still open — the menu is
        // re-parented to the root layer (see toggleLightActionsMenu), so reaching it with the
        // mouse necessarily exits this node's <g> and fires this handler; removing the toolbar
        // here would delete the kebab that anchors the still-open menu.
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
        // Click-opened popovers (#menu-/#overflow-menu-) are left alone here — they close via
        // their own outside-click listener from toggleLightActionsMenu, not on node mouseleave.
        d3Lib.select<SVGGElement, unknown>("#select-as-new-parent-group-" + d.data.id).remove();
      }, 100);
    });
  });

  return svg;
}
