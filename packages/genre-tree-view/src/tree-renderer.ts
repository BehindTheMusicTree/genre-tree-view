import * as d3 from "d3";

import { GenreTreeNode, GenreTreePlayState, TreeOrientation } from "./types";
import {
  HORIZONTAL_SEPARATION_BETWEEN_NODES,
  VERTICAL_SEPARATION_BETWEEN_NODES,
  SIBLING_SEPARATION_BETWEEN_NODES,
  ACTIONS_OVERLAY_WIDTH,
  ACTIONS_OVERLAY_HEIGHT,
  SURFACE_FILL,
  SURFACE_BORDER_COLOR,
  SURFACE_BORDER_WIDTH,
  ROOT_BORDER_WIDTH,
  CORNER_RADIUS,
  ELEVATION,
  TEXT_COLOR,
  TEXT_MUTED_COLOR,
  PER_TREE_ACCENT_DOT,
  ACCENT_DOT_SIZE,
  calculateNodeDimensions,
  getMaxNodeDimensions,
} from "./constants";
import { addGrid } from "./d3-helper/d3-grid-helper";
import { appendPaths } from "./d3-helper/d3-path-helper";
import { addReparentTargetOverlay, addToolbarActions } from "./NodeHelper";

type D3Selection = d3.Selection<SVGGElement, unknown, null, undefined>;
type D3Node = d3.HierarchyNode<GenreTreeNode>;

interface SvgDimensions {
  svgWidth: number;
  svgHeight: number;
  highestVerticalCoordinate: number;
}

export interface RenderTreeCallbacks {
  onPlayPause?: (nodeId: string) => void;
  onAddChild?: (parentId: string) => void;
  onRenameRequest?: (node: GenreTreeNode) => void;
  onDeleteRequest?: (node: GenreTreeNode) => void;
  onReparentRequest?: (node: GenreTreeNode) => void;
  onReparentTargetSelect: (newParentId: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  selectingFileNodeIdRef: React.MutableRefObject<string | null>;
  playingNodeId?: string | null;
  playState?: GenreTreePlayState;
}

export function calculateSvgDimensions(
  d3Lib: typeof import("d3"),
  treeData: D3Node,
  orientation: TreeOrientation = "horizontal",
  hideRoot = false,
): SvgDimensions {
  const nodes = treeData.descendants();
  const maxNodeDimensions = getMaxNodeDimensions(nodes.map((d) => d.data));
  const maximumLevel = d3Lib.max(nodes, (d) => d.depth)!;

  if (orientation === "vertical") {
    // Root sits at the bottom edge, so only that one side needs toolbar/menu clearance — the
    // horizontal branch below reserves the same ACTIONS_OVERLAY_HEIGHT split in half across its
    // two ends (top and bottom margins), so match that per-side amount rather than the full budget.
    // A hidden root renders no card and no toolbar, so it needs neither its own height nor that
    // clearance — the svg's bottom edge instead lands exactly on the root's anchor point.
    const svgHeight = hideRoot
      ? maximumLevel * VERTICAL_SEPARATION_BETWEEN_NODES
      : maximumLevel * VERTICAL_SEPARATION_BETWEEN_NODES + maxNodeDimensions.HEIGHT + ACTIONS_OVERLAY_HEIGHT / 2;

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
    const rootWidth = calculateNodeDimensions(treeData.data.itemCount).WIDTH;
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

    return { svgWidth, svgHeight, highestVerticalCoordinate: rootCenteringOffset };
  }

  const highestNodeVerticalCoordinate = d3Lib.min(nodes, (d) => d.x)!;
  const highestVerticalCoordinate =
    highestNodeVerticalCoordinate + maxNodeDimensions.HEIGHT / 2 - ACTIONS_OVERLAY_HEIGHT / 2;
  const lowestNodeVerticalCoordinate = d3Lib.max(nodes, (d) => d.x)!;
  const lowestVerticalCoordinate =
    lowestNodeVerticalCoordinate + maxNodeDimensions.HEIGHT / 2 + ACTIONS_OVERLAY_HEIGHT / 2;
  const svgHeight = lowestVerticalCoordinate - highestVerticalCoordinate;

  const svgWidth = maximumLevel * HORIZONTAL_SEPARATION_BETWEEN_NODES + maxNodeDimensions.WIDTH + ACTIONS_OVERLAY_WIDTH;

  return { svgWidth, svgHeight, highestVerticalCoordinate };
}

export function setupTreeLayout(
  d3Lib: typeof import("d3"),
  treeData: D3Node,
  highestVerticalCoordinate: number,
  orientation: TreeOrientation = "horizontal",
): D3Node {
  if (orientation === "vertical") {
    const maximumLevel = d3Lib.max(treeData.descendants(), (d) => d.depth)!;
    treeData.each(function (d) {
      d.x = d.x! + highestVerticalCoordinate;
      d.y = (maximumLevel - d.depth) * VERTICAL_SEPARATION_BETWEEN_NODES;
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
): D3Node {
  const nodeSize: [number, number] =
    orientation === "vertical"
      ? [SIBLING_SEPARATION_BETWEEN_NODES, VERTICAL_SEPARATION_BETWEEN_NODES]
      : [VERTICAL_SEPARATION_BETWEEN_NODES, HORIZONTAL_SEPARATION_BETWEEN_NODES];
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
): D3Selection {
  const { onPlayPause, onAddChild, onRenameRequest, onDeleteRequest, onReparentTargetSelect } = callbacks;

  if (!svgRef.current) {
    throw new Error("SVG reference is null");
  }

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
    const filter = svg
      .append("defs")
      .append("filter")
      .attr("id", shadowFilterId)
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");
    filter
      .append("feDropShadow")
      .attr("dx", 0)
      .attr("dy", 1)
      .attr("stdDeviation", 2)
      .attr("flood-color", TEXT_COLOR)
      .attr("flood-opacity", 0.12);
  }

  addGrid(svg, svgWidth, svgHeight, true);

  appendPaths(d3Lib, svg, treeData, orientation);

  const isForbidden = (d: D3Node) => reparentForbiddenIds.includes(d.data.id);

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
      const dimensions = calculateNodeDimensions(d.data.itemCount);
      const translateX = d.x! + dimensions.WIDTH / 2;
      const translateY = d.y! + dimensions.HEIGHT / 2;
      return `translate(${translateX}, ${translateY})`;
    });

  // Invisible hit-region spanning the node body plus the reserved toolbar/menu area to its
  // right, appended before any visible content so painted siblings (rect, label, toolbar)
  // take pointer-event priority over it wherever they overlap it. Without this, the group's
  // mouseenter/mouseleave below is governed only by the union of whichever painted children
  // currently exist — the ~4px unpainted gap between the node's rect and the toolbar's
  // foreignObject (TOOLBAR_MENU_X_GAP) sits right where a resting cursor tends to land, and
  // ordinary hand/trackpad jitter crossing that gap repeatedly toggles the group's hover
  // state, flickering the toolbar in and out as it gets removed and re-added. A static rect
  // that always covers the gap keeps the group continuously "hovered" so it can't toggle.
  nodes
    .append("rect")
    .attr("class", "gtv-hover-hit-area")
    .attr("width", (d) => calculateNodeDimensions(d.data.itemCount).WIDTH + ACTIONS_OVERLAY_WIDTH)
    .attr("height", (d) => calculateNodeDimensions(d.data.itemCount).HEIGHT)
    .attr("x", (d) => -calculateNodeDimensions(d.data.itemCount).WIDTH / 2)
    .attr("y", (d) => -calculateNodeDimensions(d.data.itemCount).HEIGHT / 2)
    .attr("fill", "transparent")
    .attr("pointer-events", "all");

  nodes
    .append("rect")
    .attr("class", "gtv-node-rect")
    .attr("width", (d) => calculateNodeDimensions(d.data.itemCount).WIDTH)
    .attr("height", (d) => calculateNodeDimensions(d.data.itemCount).HEIGHT)
    .attr("x", (d) => -calculateNodeDimensions(d.data.itemCount).WIDTH / 2)
    .attr("y", (d) => -calculateNodeDimensions(d.data.itemCount).HEIGHT / 2)
    .attr("rx", CORNER_RADIUS)
    .attr("ry", CORNER_RADIUS)
    .attr("fill", SURFACE_FILL)
    .attr("stroke", SURFACE_BORDER_COLOR)
    .attr("stroke-width", (d) => (d.depth === 0 ? ROOT_BORDER_WIDTH : SURFACE_BORDER_WIDTH))
    .attr("filter", ELEVATION ? `url(#${shadowFilterId})` : null);

  if (PER_TREE_ACCENT_DOT) {
    nodes
      .append("circle")
      .attr("cx", (d) => -calculateNodeDimensions(d.data.itemCount).WIDTH / 2 + 12)
      .attr("cy", 0)
      .attr("r", ACCENT_DOT_SIZE)
      .attr("fill", rootColor);
  }

  nodes
    .append("foreignObject")
    .attr("width", (d) => calculateNodeDimensions(d.data.itemCount).WIDTH)
    .attr("height", (d) => calculateNodeDimensions(d.data.itemCount).HEIGHT)
    .attr("x", (d) => -calculateNodeDimensions(d.data.itemCount).WIDTH / 2)
    .attr("y", (d) => -calculateNodeDimensions(d.data.itemCount).HEIGHT / 2)
    .html((d) => {
      const rootClass = d.depth === 0 ? " gtv-node-label--root" : "";
      const itemCountText = d.data.itemCount > 0 ? ` (${d.data.itemCount})` : "";
      const color = isForbidden(d) ? TEXT_MUTED_COLOR : TEXT_COLOR;
      return `<div class="gtv-node-label${rootClass}" style="color:${color}">${d.data.name}${itemCountText}</div>`;
    })
    .on("mouseover", function (event, d) {
      if (reparentingNodeId || isForbidden(d)) return;

      const group = d3Lib.select<SVGGElement, unknown>(this.parentNode as SVGGElement) as unknown as d3.Selection<
        SVGGElement,
        unknown,
        HTMLElement,
        unknown
      >;

      addToolbarActions(d3Lib, d.data, group, {
        onPlayPause,
        fileInputRef: callbacks.fileInputRef,
        selectingFileNodeIdRef: callbacks.selectingFileNodeIdRef,
        onAddChild,
        onRenameRequest,
        onDeleteRequest,
        onReparentRequest: callbacks.onReparentRequest,
        playingNodeId: callbacks.playingNodeId,
        playState: callbacks.playState,
      });
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
        }
        // Click-opened popovers (#menu-/#overflow-menu-) are left alone here — they close via
        // their own outside-click listener from toggleLightActionsMenu, not on node mouseleave.
        d3Lib.select<SVGGElement, unknown>("#select-as-new-parent-group-" + d.data.id).remove();
      }, 100);
    });
  });

  return svg;
}
