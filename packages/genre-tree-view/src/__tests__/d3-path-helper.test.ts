import { afterEach, describe, expect, it } from "vitest";
import * as d3 from "d3";
import { appendPaths } from "../d3-helper/d3-path-helper";
import { buildTreeHierarchyStructure } from "../NodeHelper";
import { createTreeLayout } from "../tree-renderer";
import { CONNECTOR_COLOR, CONNECTOR_WIDTH } from "../constants";
import type { GenreTreeNode } from "../types";

afterEach(() => {
  document.body.innerHTML = "";
});

function createSvg() {
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.appendChild(svgEl);
  return d3.select(svgEl).append("g") as unknown as d3.Selection<SVGGElement, unknown, null, undefined>;
}

describe("appendPaths", () => {
  it("renders one path.gtv-link per link with the connector styling", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root", parentId: null, name: "Root", itemCount: 1 },
      { id: "child-a", parentId: "root", name: "Child A", itemCount: 2 },
      { id: "child-b", parentId: "root", name: "Child B", itemCount: 3 },
    ];
    const root = buildTreeHierarchyStructure(d3, nodes);
    const treeData = createTreeLayout(d3, root);

    const svg = createSvg();
    appendPaths(d3, svg, treeData);

    const paths = svg.selectAll<SVGPathElement, unknown>("path.gtv-link");
    expect(paths.size()).toBe(2);
    const expectedStroke = d3.rgb(CONNECTOR_COLOR).toString();
    paths.each(function () {
      const path = d3.select(this);
      expect(path.style("stroke")).toBe(expectedStroke);
      expect(path.style("stroke-width")).toBe(String(CONNECTOR_WIDTH));
      expect(path.attr("d")).toBeTruthy();
    });
  });

  it("uses linkVertical for orientation vertical, still one path per link", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root", parentId: null, name: "Root", itemCount: 1 },
      { id: "child-a", parentId: "root", name: "Child A", itemCount: 2 },
      { id: "child-b", parentId: "root", name: "Child B", itemCount: 3 },
    ];
    const root = buildTreeHierarchyStructure(d3, nodes);
    const treeData = createTreeLayout(d3, root, "vertical");

    const svg = createSvg();
    appendPaths(d3, svg, treeData, "vertical");

    const paths = svg.selectAll<SVGPathElement, unknown>("path.gtv-link");
    expect(paths.size()).toBe(2);
    paths.each(function () {
      expect(d3.select(this).attr("d")).toBeTruthy();
    });
  });
});
