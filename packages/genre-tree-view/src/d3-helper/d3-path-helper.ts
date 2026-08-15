import * as d3 from "d3";

import { GenreTreeNode, TreeOrientation } from "../types";
import { CONNECTOR_COLOR, CONNECTOR_OPACITY, CONNECTOR_WIDTH, calculateNodeDimensions, ItemCountRange } from "../constants";

type D3Selection = d3.Selection<SVGGElement, unknown, null, undefined>;
type D3Node = d3.HierarchyNode<GenreTreeNode>;
type D3Link = d3.HierarchyLink<GenreTreeNode>;

export function appendPaths(
  d3Lib: typeof import("d3"),
  svg: D3Selection,
  treeData: D3Node,
  itemCountRange: ItemCountRange,
  orientation: TreeOrientation = "horizontal",
) {
  const x = (d: D3Node) => d.x! + calculateNodeDimensions(d.data.itemCount, itemCountRange).WIDTH / 2;
  const y = (d: D3Node) => d.y! + calculateNodeDimensions(d.data.itemCount, itemCountRange).HEIGHT / 2;

  const linkGenerator =
    orientation === "vertical"
      ? d3Lib.linkVertical<D3Link, D3Node>().x(x).y(y)
      : d3Lib.linkHorizontal<D3Link, D3Node>().x(x).y(y);

  svg
    .selectAll("path.gtv-link")
    .data(treeData.links())
    .enter()
    .append("path")
    .attr("class", "gtv-link")
    .attr("d", linkGenerator)
    .style("fill", "none")
    .style("stroke", CONNECTOR_COLOR)
    .style("stroke-width", CONNECTOR_WIDTH)
    .style("stroke-opacity", CONNECTOR_OPACITY)
    .style("stroke-linecap", "round");
}
