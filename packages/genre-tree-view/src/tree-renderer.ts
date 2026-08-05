import * as d3 from "d3";

import { GenreTreeNode, GenreTreePlayState } from "./types";
import {
  HORIZONTAL_SEPARATION_BETWEEN_NODES,
  VERTICAL_SEPARATION_BETWEEN_NODES,
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

export function calculateSvgDimensions(d3Lib: typeof import("d3"), treeData: D3Node): SvgDimensions {
  const nodes = treeData.descendants();
  const maxNodeDimensions = getMaxNodeDimensions(nodes.map((d) => d.data));

  const highestNodeVerticalCoordinate = d3Lib.min(nodes, (d) => d.x)!;
  const highestVerticalCoordinate =
    highestNodeVerticalCoordinate + maxNodeDimensions.HEIGHT / 2 - ACTIONS_OVERLAY_HEIGHT / 2;
  const lowestNodeVerticalCoordinate = d3Lib.max(nodes, (d) => d.x)!;
  const lowestVerticalCoordinate =
    lowestNodeVerticalCoordinate + maxNodeDimensions.HEIGHT / 2 + ACTIONS_OVERLAY_HEIGHT / 2;
  const svgHeight = lowestVerticalCoordinate - highestVerticalCoordinate;

  const maximumLevel = d3Lib.max(nodes, (d) => d.depth)!;
  const svgWidth = maximumLevel * HORIZONTAL_SEPARATION_BETWEEN_NODES + maxNodeDimensions.WIDTH + ACTIONS_OVERLAY_WIDTH;

  return { svgWidth, svgHeight, highestVerticalCoordinate };
}

export function setupTreeLayout(_d3Lib: typeof import("d3"), treeData: D3Node, highestVerticalCoordinate: number): D3Node {
  treeData.each(function (d) {
    const tempX = d.x!;
    d.x = d.y!;
    d.y = tempX - highestVerticalCoordinate;
  });
  return treeData;
}

export function createTreeLayout(d3Lib: typeof import("d3"), root: D3Node): D3Node {
  const treeLayout = d3Lib
    .tree<GenreTreeNode>()
    .nodeSize([VERTICAL_SEPARATION_BETWEEN_NODES, HORIZONTAL_SEPARATION_BETWEEN_NODES]);
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

  appendPaths(d3Lib, svg, treeData);

  const isForbidden = (d: D3Node) => reparentForbiddenIds.includes(d.data.id);

  const nodes = svg
    .selectAll<SVGGElement, D3Node>("g.node")
    .data(treeData.descendants())
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

    group.on("mouseenter", function () {
      if (reparentingNodeId && d.data.actionable !== false && !isForbidden(d)) {
        addReparentTargetOverlay(
          d3Lib,
          group as unknown as d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
          onReparentTargetSelect,
        );
      }
    });

    group.on("mouseleave", function () {
      setTimeout(() => {
        d3Lib.select<SVGGElement, unknown>("#toolbar-" + d.data.id).remove();
        // Click-opened popovers (#menu-/#overflow-menu-) are left alone here — they close via
        // their own outside-click listener from toggleLightActionsMenu, not on node mouseleave.
        d3Lib.select<SVGGElement, unknown>("#select-as-new-parent-group-" + d.data.id).remove();
      }, 100);
    });
  });

  return svg;
}
