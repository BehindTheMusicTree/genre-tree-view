import * as d3 from "d3";

import { GenreTreeNode, GenreTreePlayState } from "./types";
import {
  HORIZONTAL_SEPARATION_BETWEEN_NODES,
  VERTICAL_SEPARATION_BETWEEN_NODES,
  MORE_ICON_WIDTH,
  ACTIONS_CONTAINER_DIMENSIONS_MAX,
  calculateNodeDimensions,
  getMaxNodeDimensions,
} from "./constants";
import { addGrid } from "./d3-helper/d3-grid-helper";
import { appendPaths } from "./d3-helper/d3-path-helper";
import { addMoreIconContainer, addActionsGroup, addReparentTargetOverlay } from "./NodeHelper";

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
    highestNodeVerticalCoordinate + maxNodeDimensions.HEIGHT / 2 - ACTIONS_CONTAINER_DIMENSIONS_MAX.HEIGHT / 2;
  const lowestNodeVerticalCoordinate = d3Lib.max(nodes, (d) => d.x)!;
  const lowestVerticalCoordinate =
    lowestNodeVerticalCoordinate + maxNodeDimensions.HEIGHT / 2 + ACTIONS_CONTAINER_DIMENSIONS_MAX.HEIGHT / 2;
  const svgHeight = lowestVerticalCoordinate - highestVerticalCoordinate;

  const maximumLevel = d3Lib.max(nodes, (d) => d.depth)!;
  const svgWidth =
    maximumLevel * HORIZONTAL_SEPARATION_BETWEEN_NODES +
    maxNodeDimensions.WIDTH +
    MORE_ICON_WIDTH +
    ACTIONS_CONTAINER_DIMENSIONS_MAX.WIDTH;

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
    .append("g") as unknown as D3Selection;

  addGrid(svg, svgWidth, svgHeight, true);

  appendPaths(d3Lib, svg, treeData);

  const isForbidden = (d: D3Node) => reparentForbiddenIds.includes(d.data.id);

  const nodes = svg
    .selectAll<SVGGElement, D3Node>("g.node")
    .data(treeData.descendants())
    .enter()
    .append("g")
    .attr("class", "node")
    .attr("id", (d) => "group-" + d.data.id)
    .attr("transform", function (d) {
      const dimensions = calculateNodeDimensions(d.data.itemCount);
      const translateX = d.x! + dimensions.WIDTH / 2;
      const translateY = d.y! + dimensions.HEIGHT / 2;
      return `translate(${translateX}, ${translateY})`;
    });

  nodes
    .append("rect")
    .attr("width", (d) => calculateNodeDimensions(d.data.itemCount).WIDTH)
    .attr("height", (d) => calculateNodeDimensions(d.data.itemCount).HEIGHT)
    .attr("x", (d) => -calculateNodeDimensions(d.data.itemCount).WIDTH / 2)
    .attr("y", (d) => -calculateNodeDimensions(d.data.itemCount).HEIGHT / 2)
    .attr("fill", (d) => (isForbidden(d) ? "#cccccc" : rootColor));

  const handleMoreActionEnterMouse = (event: MouseEvent, d: D3Node, node: GenreTreeNode) => {
    event.stopPropagation();

    const group = d3Lib.select<SVGGElement, unknown>("#group-" + node.id);
    const actionsContainer = group.select<SVGGElement>("#actions-container-" + node.id);

    if (actionsContainer.empty()) {
      addMoreIconContainer(d3Lib, node, group, handleMoreActionEnterMouse, rootColor);
      addActionsGroup(
        d3Lib,
        node,
        group,
        {
          handleMoreActionEnterMouse,
          onPlayPause,
          fileInputRef: callbacks.fileInputRef,
          selectingFileNodeIdRef: callbacks.selectingFileNodeIdRef,
          onAddChild,
          onRenameRequest,
          onDeleteRequest,
          onReparentRequest: callbacks.onReparentRequest,
          playingNodeId: callbacks.playingNodeId,
          playState: callbacks.playState,
        },
        rootColor,
      );
    }
  };

  nodes
    .append("foreignObject")
    .attr("width", (d) => calculateNodeDimensions(d.data.itemCount).WIDTH)
    .attr("height", (d) => calculateNodeDimensions(d.data.itemCount).HEIGHT)
    .attr("x", (d) => -calculateNodeDimensions(d.data.itemCount).WIDTH / 2)
    .attr("y", (d) => -calculateNodeDimensions(d.data.itemCount).HEIGHT / 2)
    .html((d) => {
      const forbiddenClass = isForbidden(d) ? " gtv-node-label--forbidden" : "";
      const itemCountText = d.data.itemCount > 0 ? ` (${d.data.itemCount})` : "";
      return `<div class="gtv-node-label${forbiddenClass}">${d.data.name}${itemCountText}</div>`;
    })
    .on("mouseover", function (event, d) {
      if (!reparentingNodeId && !isForbidden(d)) {
        addMoreIconContainer(
          d3Lib,
          d.data,
          d3Lib.select<SVGGElement, unknown>(this.parentNode as SVGGElement) as unknown as d3.Selection<
            SVGGElement,
            unknown,
            HTMLElement,
            unknown
          >,
          handleMoreActionEnterMouse,
          rootColor,
        );
      }
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
        const moreContainer = d3Lib.select<SVGGElement, unknown>("#more-icon-container-" + d.data.id);
        const actionsContainer = d3Lib.select<SVGGElement, unknown>("#actions-container-" + d.data.id);

        if (moreContainer.empty() && actionsContainer.empty()) {
          d3Lib.select<SVGGElement, unknown>("#select-as-new-parent-group-" + d.data.id).remove();
        } else {
          moreContainer.remove();
          actionsContainer.remove();
          d3Lib.select<SVGGElement, unknown>("#select-as-new-parent-group-" + d.data.id).remove();
        }
      }, 100);
    });
  });

  return svg;
}
