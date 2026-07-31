import * as d3 from "d3";

import { GenreTreeNode } from "../types";
import { calculateNodeDimensions } from "../constants";

type D3Selection = d3.Selection<SVGGElement, unknown, null, undefined>;
type D3Node = d3.HierarchyNode<GenreTreeNode>;
type D3Link = d3.HierarchyLink<GenreTreeNode>;

export function appendPaths(d3Lib: typeof import("d3"), svg: D3Selection, treeData: D3Node) {
  const linkGenerator = d3Lib
    .linkHorizontal<D3Link, D3Node>()
    .x((d: D3Node) => {
      const dimensions = calculateNodeDimensions(d.data.itemCount);
      return d.x! + dimensions.WIDTH / 2;
    })
    .y((d: D3Node) => {
      const dimensions = calculateNodeDimensions(d.data.itemCount);
      return d.y! + dimensions.HEIGHT / 2;
    });

  svg
    .selectAll("path.link")
    .data(treeData.links())
    .enter()
    .append("path")
    .attr("d", linkGenerator)
    .style("fill", "none")
    .style("stroke", "black")
    .style("stroke-opacity", 1)
    .style("stroke-width", 2);
}
