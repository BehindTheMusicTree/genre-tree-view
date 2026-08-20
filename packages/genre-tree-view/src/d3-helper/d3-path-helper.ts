import * as d3 from "d3";

import { GenreTreeNode, isVerticalOrientation, TreeOrientation } from "../types";
import { CONNECTOR_COLOR, CONNECTOR_OPACITY, CONNECTOR_WIDTH, calculateNodeDimensions, ItemCountRange } from "../constants";

type D3Selection = d3.Selection<SVGGElement, unknown, null, undefined>;
type D3Node = d3.HierarchyNode<GenreTreeNode>;
type D3Link = d3.HierarchyLink<GenreTreeNode>;

export interface RoundedRectCorners {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

// SVG <rect> only takes one uniform rx/ry pair, so a node card needs a <path> instead to square
// off just its top corners while its hover tab is attached (see tree-renderer.ts's mouseover/
// mouseleave-timeout handlers), and stay fully rounded otherwise.
export function roundedRectPath(x: number, y: number, width: number, height: number, corners: RoundedRectCorners) {
  const { tl, tr, br, bl } = corners;
  return [
    `M ${x + tl} ${y}`,
    `H ${x + width - tr}`,
    tr ? `A ${tr} ${tr} 0 0 1 ${x + width} ${y + tr}` : "",
    `V ${y + height - br}`,
    br ? `A ${br} ${br} 0 0 1 ${x + width - br} ${y + height}` : "",
    `H ${x + bl}`,
    bl ? `A ${bl} ${bl} 0 0 1 ${x} ${y + height - bl}` : "",
    `V ${y + tl}`,
    tl ? `A ${tl} ${tl} 0 0 1 ${x + tl} ${y}` : "",
    "Z",
  ]
    .filter(Boolean)
    .join(" ");
}

// Traces only the right, bottom, and left edges of a rect (skipping the top edge entirely,
// unclosed) so a node card's border can merge with its hover tab above it instead of drawing a
// visible line across the seam. Assumes the top corners are already square (radius 0) — see the
// mouseover/mouseleave-timeout handlers in tree-renderer.ts, which only swap to this path once
// the fill path's top corners are squared too.
export function openBottomBorderPath(
  x: number,
  y: number,
  width: number,
  height: number,
  corners: Pick<RoundedRectCorners, "br" | "bl">,
) {
  const { br, bl } = corners;
  return [
    `M ${x + width} ${y}`,
    `V ${y + height - br}`,
    br ? `A ${br} ${br} 0 0 1 ${x + width - br} ${y + height}` : "",
    `H ${x + bl}`,
    bl ? `A ${bl} ${bl} 0 0 1 ${x} ${y + height - bl}` : "",
    `V ${y}`,
  ]
    .filter(Boolean)
    .join(" ");
}

// Traces only the left and right edges of a rect, as two independent open subpaths, so a node
// card's border can merge with hover tabs above *and* below it at once instead of drawing visible
// lines across either seam. Assumes all four corners are already square (radius 0) — see the
// mouseover/mouseleave-timeout handlers in tree-renderer.ts, which square every corner once both
// the name and count hover labels are attached.
export function openTopAndBottomBorderPath(x: number, y: number, width: number, height: number) {
  return `M ${x} ${y} V ${y + height} M ${x + width} ${y} V ${y + height}`;
}

export function appendPaths(
  d3Lib: typeof import("d3"),
  svg: D3Selection,
  treeData: D3Node,
  itemCountRange: ItemCountRange,
  orientation: TreeOrientation = "horizontal",
) {
  const x = (d: D3Node) => d.x! + calculateNodeDimensions(d.data.itemCount, itemCountRange).WIDTH / 2;
  const y = (d: D3Node) => d.y! + calculateNodeDimensions(d.data.itemCount, itemCountRange).HEIGHT / 2;

  const linkGenerator = isVerticalOrientation(orientation)
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
