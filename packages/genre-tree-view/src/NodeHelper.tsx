import ReactDOMServer from "react-dom/server";
import { PiGraphFill } from "react-icons/pi";
import * as d3 from "d3";

import { GenreTreeNode } from "./types";
import {
  ACCENT_COLOR,
  ACCENT_TEXT_COLOR,
  CORNER_RADIUS,
  calculateNodeDimensions,
  Dimensions,
  getItemCountRange,
  ItemCountRange,
} from "./constants";

type D3Node = d3.HierarchyNode<GenreTreeNode>;

/** Builds the hierarchical tree structure from a flat node list. Each node's `itemCount` is
 * already its subtree total (see `GenreTreeNode.itemCount`), so it is used as-is, never summed. */
export function buildTreeHierarchyStructure(d3Lib: typeof import("d3"), nodes: GenreTreeNode[]) {
  return d3Lib
    .stratify<GenreTreeNode>()
    .id((d) => d.id)
    .parentId((d) => d.parentId)(nodes);
}

/** A subtree root's count is the total of the whole subtree, so it's always that
 * subtree's own local maximum — meaning tree-renderer always sizes a hidden root against its own
 * subtree's item-count range, never the range a caller might be using to compare that root
 * against sibling roots elsewhere (e.g. a wheel's cross-root chip-sizing scale). Callers that need
 * to predict a hidden root's rendered width/height — to reserve matching clearance for it — must
 * mirror this same local-range computation rather than reusing their own cross-root
 * scale. */
export function calculateLocalRootDimensions(d3Lib: typeof import("d3"), nodes: GenreTreeNode[]): Dimensions {
  const root = buildTreeHierarchyStructure(d3Lib, nodes);
  const range = getItemCountRange(root.descendants().map((d) => d.data));
  return calculateNodeDimensions(root.data.itemCount, range);
}

/** A wheel's tree-anchor clearance along one axis: how far past its own wheel-anchor point a
 * hidden root's mounted subtree needs to be pushed so its root->depth1 links stop at the visible
 * chip's outer edge instead of drawing across it. Two half-extents stack, not one — the hidden
 * root's own local half-extent (its link endpoint sits at its own invisible box's *center*, per
 * appendPaths' `d.x + WIDTH/2` convention, so clearing the box at all takes a full local
 * half-extent) plus the visible chip's own cross-root display half-extent (clearing the box only
 * reaches the chip's *center*, since that's where the anchor and the chip are both pinned — a
 * second half-extent, this time the chip's own displayed size, is what reaches its actual edge). */
export function calculateRootAnchorClearance(
  d3Lib: typeof import("d3"),
  nodes: GenreTreeNode[],
  rootItemCount: number,
  rootItemCountRange: ItemCountRange,
  axis: keyof Dimensions,
): number {
  const localExtent = calculateLocalRootDimensions(d3Lib, nodes)[axis];
  const displayExtent = calculateNodeDimensions(rootItemCount, rootItemCountRange)[axis];
  return (localExtent + displayExtent) / 2;
}

/** Adds the "select as new parent" overlay to a node while a reparent is in progress. */
export function addReparentTargetOverlay(
  d3Lib: typeof import("d3"),
  parentNode: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  onReparentTargetSelect: (newParentId: string) => void,
  itemCountRange: ItemCountRange,
) {
  const nodeId = (parentNode.datum() as D3Node).data.id;
  const nodeData = (parentNode.datum() as D3Node).data;
  const dimensions = calculateNodeDimensions(nodeData.itemCount, itemCountRange);

  let overlayGroup = parentNode.select<SVGGElement>("#select-as-new-parent-group-" + nodeId);
  if (overlayGroup.empty()) {
    overlayGroup = parentNode
      .append("g")
      .attr("id", "select-as-new-parent-group-" + nodeId)
      .style("cursor", "pointer")
      .on("mouseleave", function () {
        d3Lib.select(this).remove();
      });

    overlayGroup
      .append("rect")
      .attr("width", dimensions.WIDTH)
      .attr("height", dimensions.HEIGHT)
      .attr("x", -dimensions.WIDTH / 2)
      .attr("y", -dimensions.HEIGHT / 2)
      .attr("rx", CORNER_RADIUS)
      .attr("ry", CORNER_RADIUS)
      .attr("fill", ACCENT_COLOR);

    overlayGroup
      .append("foreignObject")
      .attr("width", dimensions.WIDTH)
      .attr("height", dimensions.HEIGHT)
      .attr("x", -dimensions.WIDTH / 2)
      .attr("y", -dimensions.HEIGHT / 2)
      .html(() =>
        ReactDOMServer.renderToString(
          <div className="gtv-reparent-target">
            <PiGraphFill size={20} color={ACCENT_TEXT_COLOR} />
            <div className="gtv-reparent-target-label" style={{ color: ACCENT_TEXT_COLOR }}>
              Select as new parent
            </div>
          </div>,
        ),
      )
      .on("click", function (_event: MouseEvent, d: unknown) {
        onReparentTargetSelect((d as D3Node).data.id);
      });
  }

  return overlayGroup;
}
