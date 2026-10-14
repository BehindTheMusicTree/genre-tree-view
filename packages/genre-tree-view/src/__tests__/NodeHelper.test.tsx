import { afterEach, describe, expect, it, vi } from "vitest";
import * as d3 from "d3";
import {
  addReparentTargetOverlay,
  buildTreeHierarchyStructure,
} from "../NodeHelper";
import { getItemCountRange } from "../constants";
import type { GenreTreeNode } from "../types";

afterEach(() => {
  document.body.innerHTML = "";
});

function createSvgGroup(node: GenreTreeNode) {
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.appendChild(svgEl);
  // addReparentTargetOverlay read `nodeGroup.datum().data`, matching the
  // d3.HierarchyNode shape (`{ data: GenreTreeNode }`) the real render pipeline binds via `.data(treeData.descendants())`.
  const g = d3
    .select(svgEl)
    .append("g")
    .datum({ data: node }) as unknown as d3.Selection<SVGGElement, unknown, HTMLElement, unknown>;
  return { svgEl, g };
}

describe("buildTreeHierarchyStructure", () => {
  it("builds a hierarchy where each node's parent matches parentId", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root", parentId: null, name: "Root", itemCount: 0 },
      { id: "child", parentId: "root", name: "Child", itemCount: 0 },
    ];
    const root = buildTreeHierarchyStructure(d3, nodes);
    expect(root.data.id).toBe("root");
    expect(root.children?.[0].data.id).toBe("child");
  });

  it("rolls up itemCount bottom-up so a node's count is at least the sum of its children's", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root", parentId: null, name: "Root", itemCount: 1 },
      { id: "child", parentId: "root", name: "Child", itemCount: 2 },
      { id: "grandchild-a", parentId: "child", name: "Grandchild A", itemCount: 3 },
      { id: "grandchild-b", parentId: "child", name: "Grandchild B", itemCount: 4 },
    ];
    const root = buildTreeHierarchyStructure(d3, nodes);
    const byId = new Map(root.descendants().map((d) => [d.data.id, d.data.itemCount]));

    expect(byId.get("grandchild-a")).toBe(3);
    expect(byId.get("grandchild-b")).toBe(4);
    expect(byId.get("child")).toBe(2 + 3 + 4);
    expect(byId.get("root")).toBe(1 + 2 + 3 + 4);
  });

  it("does not mutate the original nodes array/objects passed in", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root", parentId: null, name: "Root", itemCount: 1 },
      { id: "child", parentId: "root", name: "Child", itemCount: 2 },
    ];
    buildTreeHierarchyStructure(d3, nodes);
    expect(nodes[0].itemCount).toBe(1);
    expect(nodes[1].itemCount).toBe(2);
  });
});

describe("addReparentTargetOverlay", () => {
  it("appends an overlay group with a clickable target that fires the callback with this node's id", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 0 };
    const { g } = createSvgGroup(node);
    const onSelect = vi.fn();

    addReparentTargetOverlay(d3, g, onSelect, getItemCountRange([node]));

    const foreignObject = g.select("foreignObject").node() as SVGForeignObjectElement;
    foreignObject.dispatchEvent(new MouseEvent("click", { bubbles: false }));
    expect(onSelect).toHaveBeenCalledWith("n1");
  });

  it("is idempotent: calling it twice keeps a single overlay group", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 0 };
    const { g } = createSvgGroup(node);
    const onSelect = vi.fn();

    addReparentTargetOverlay(d3, g, onSelect, getItemCountRange([node]));
    addReparentTargetOverlay(d3, g, onSelect, getItemCountRange([node]));

    expect(g.selectAll("#select-as-new-parent-group-n1").size()).toBe(1);
  });

  it("removes itself on mouseleave", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 0 };
    const { g } = createSvgGroup(node);

    const overlay = addReparentTargetOverlay(d3, g, vi.fn(), getItemCountRange([node]));
    (overlay.node() as SVGGElement).dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));

    expect(g.select("#select-as-new-parent-group-n1").empty()).toBe(true);
  });
});
