import { afterEach, describe, expect, it, vi } from "vitest";
import * as d3 from "d3";
import { calculateSvgDimensions, createTreeLayout, renderTree, setupTreeLayout } from "../tree-renderer";
import { buildTreeHierarchyStructure } from "../NodeHelper";
import { calculateNodeDimensions } from "../constants";
import type { GenreTreeNode } from "../types";
import type { RenderTreeCallbacks } from "../tree-renderer";

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function buildTreeData(nodes: GenreTreeNode[]) {
  const root = buildTreeHierarchyStructure(d3, nodes);
  const laidOut = createTreeLayout(d3, root);
  const { highestVerticalCoordinate, svgWidth, svgHeight } = calculateSvgDimensions(d3, laidOut);
  const treeData = setupTreeLayout(d3, laidOut, highestVerticalCoordinate);
  return { treeData, svgWidth, svgHeight };
}

function baseCallbacks(overrides: Partial<RenderTreeCallbacks> = {}): RenderTreeCallbacks {
  return {
    onReparentTargetSelect: vi.fn(),
    fileInputRef: { current: null },
    selectingFileNodeIdRef: { current: null },
    ...overrides,
  };
}

const SIMPLE_NODES: GenreTreeNode[] = [
  { id: "root", parentId: null, name: "Root", itemCount: 5 },
  { id: "child", parentId: "root", name: "Child", itemCount: 0 },
];

describe("calculateSvgDimensions / setupTreeLayout / createTreeLayout", () => {
  it("computes positive svg dimensions for a small tree", () => {
    const root = buildTreeHierarchyStructure(d3, SIMPLE_NODES);
    const laidOut = createTreeLayout(d3, root);
    const dims = calculateSvgDimensions(d3, laidOut);
    expect(dims.svgWidth).toBeGreaterThan(0);
    expect(dims.svgHeight).toBeGreaterThan(0);
  });

  it("swaps x/y and offsets the new y by highestVerticalCoordinate", () => {
    const root = buildTreeHierarchyStructure(d3, SIMPLE_NODES);
    const laidOut = createTreeLayout(d3, root);
    const before = laidOut.descendants().map((d) => ({ x: d.x!, y: d.y! }));

    const treeData = setupTreeLayout(d3, laidOut, 10);
    const after = treeData.descendants();

    after.forEach((d, i) => {
      expect(d.x).toBe(before[i].y);
      expect(d.y).toBe(before[i].x - 10);
    });
  });
});

describe("calculateSvgDimensions / setupTreeLayout / createTreeLayout (vertical orientation)", () => {
  const VERTICAL_NODES: GenreTreeNode[] = [
    { id: "root", parentId: null, name: "Root", itemCount: 0 },
    { id: "child-a", parentId: "root", name: "Child A", itemCount: 0 },
    { id: "child-b", parentId: "root", name: "Child B", itemCount: 0 },
    { id: "grandchild", parentId: "child-a", name: "Grandchild", itemCount: 0 },
  ];

  it("computes positive svg dimensions for a small tree", () => {
    const root = buildTreeHierarchyStructure(d3, VERTICAL_NODES);
    const laidOut = createTreeLayout(d3, root, "vertical");
    const dims = calculateSvgDimensions(d3, laidOut, "vertical");
    expect(dims.svgWidth).toBeGreaterThan(0);
    expect(dims.svgHeight).toBeGreaterThan(0);
  });

  it("centers the root's own visual anchor (x + own width / 2) at svgWidth / 2 and grows y upward with depth", () => {
    const root = buildTreeHierarchyStructure(d3, VERTICAL_NODES);
    const laidOut = createTreeLayout(d3, root, "vertical");
    const { svgWidth, highestVerticalCoordinate } = calculateSvgDimensions(d3, laidOut, "vertical");
    const treeData = setupTreeLayout(d3, laidOut, highestVerticalCoordinate, "vertical");

    const rootWidth = calculateNodeDimensions(treeData.data.itemCount).WIDTH;
    expect(treeData.x! + rootWidth / 2).toBe(svgWidth / 2);

    const descendants = treeData.descendants();
    const rootNode = descendants.find((d) => d.depth === 0)!;
    const deepestNode = descendants.reduce((deepest, d) => (d.depth > deepest.depth ? d : deepest));
    expect(rootNode.y).toBeGreaterThan(deepestNode.y!);
  });
});

describe("renderTree", () => {
  it("throws when svgRef.current is null", () => {
    const { treeData, svgWidth, svgHeight } = buildTreeData(SIMPLE_NODES);
    const svgRef: React.RefObject<SVGSVGElement> = { current: null };
    expect(() =>
      renderTree(d3, svgRef, treeData, svgWidth, svgHeight, null, [], "#000000", baseCallbacks()),
    ).toThrow("SVG reference is null");
  });

  it("renders one g.node per descendant with a sanitized-id-scoped shadow filter", () => {
    const { treeData, svgWidth, svgHeight } = buildTreeData(SIMPLE_NODES);
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svgEl);
    const svgRef: React.RefObject<SVGSVGElement> = { current: svgEl };

    renderTree(d3, svgRef, treeData, svgWidth, svgHeight, null, [], "#4F46E5", baseCallbacks());

    expect(svgEl.querySelectorAll("g.node").length).toBe(2);
    expect(svgEl.querySelector("#group-root")).toBeTruthy();
    expect(svgEl.querySelector("#group-child")).toBeTruthy();
    expect(svgEl.querySelector("filter#gtv-card-shadow-root")).toBeTruthy();
  });

  it("sanitizes ids containing unsafe characters for the shadow filter id", () => {
    const nodes: GenreTreeNode[] = [{ id: "root id/with:chars", parentId: null, name: "Root", itemCount: 0 }];
    const { treeData, svgWidth, svgHeight } = buildTreeData(nodes);
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svgEl);
    const svgRef: React.RefObject<SVGSVGElement> = { current: svgEl };

    renderTree(d3, svgRef, treeData, svgWidth, svgHeight, null, [], "#4F46E5", baseCallbacks());

    expect(svgEl.querySelector("filter#gtv-card-shadow-root_id_with_chars")).toBeTruthy();
  });

  it("marks forbidden nodes with gtv-node--forbidden and a muted label", () => {
    const { treeData, svgWidth, svgHeight } = buildTreeData(SIMPLE_NODES);
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svgEl);
    const svgRef: React.RefObject<SVGSVGElement> = { current: svgEl };

    renderTree(d3, svgRef, treeData, svgWidth, svgHeight, "root", ["child"], "#4F46E5", baseCallbacks());

    const childGroup = svgEl.querySelector("#group-child") as SVGGElement;
    expect(childGroup.getAttribute("class")).toContain("gtv-node--forbidden");
  });

  it("suffixes the label with the item count when non-zero, and omits it when zero", () => {
    const { treeData, svgWidth, svgHeight } = buildTreeData(SIMPLE_NODES);
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svgEl);
    const svgRef: React.RefObject<SVGSVGElement> = { current: svgEl };

    renderTree(d3, svgRef, treeData, svgWidth, svgHeight, null, [], "#4F46E5", baseCallbacks());

    const rootLabel = svgEl.querySelector("#group-root .gtv-node-label") as HTMLDivElement;
    const childLabel = svgEl.querySelector("#group-child .gtv-node-label") as HTMLDivElement;
    expect(rootLabel.textContent).toBe("Root (5)");
    expect(childLabel.textContent).toBe("Child");
  });

  it("does not add a toolbar on mouseover while a reparent is in progress or the node is forbidden", () => {
    const { treeData, svgWidth, svgHeight } = buildTreeData(SIMPLE_NODES);
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svgEl);
    const svgRef: React.RefObject<SVGSVGElement> = { current: svgEl };

    renderTree(d3, svgRef, treeData, svgWidth, svgHeight, "root", ["child"], "#4F46E5", baseCallbacks());

    const childForeignObject = svgEl.querySelector("#group-child foreignObject") as SVGForeignObjectElement;
    childForeignObject.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(svgEl.querySelector("#toolbar-child")).toBeFalsy();
  });

  it("adds the reparent-target overlay on mouseenter only for eligible, non-forbidden nodes", () => {
    const { treeData, svgWidth, svgHeight } = buildTreeData(SIMPLE_NODES);
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svgEl);
    const svgRef: React.RefObject<SVGSVGElement> = { current: svgEl };
    const onReparentTargetSelect = vi.fn();

    renderTree(
      d3,
      svgRef,
      treeData,
      svgWidth,
      svgHeight,
      "some-other-node",
      [],
      "#4F46E5",
      baseCallbacks({ onReparentTargetSelect }),
    );

    const childGroup = svgEl.querySelector("#group-child") as SVGGElement;
    childGroup.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    expect(svgEl.querySelector("#select-as-new-parent-group-child")).toBeTruthy();
  });

  it("does not add the reparent-target overlay when no reparent is in progress", () => {
    const { treeData, svgWidth, svgHeight } = buildTreeData(SIMPLE_NODES);
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svgEl);
    const svgRef: React.RefObject<SVGSVGElement> = { current: svgEl };

    renderTree(d3, svgRef, treeData, svgWidth, svgHeight, null, [], "#4F46E5", baseCallbacks());

    const childGroup = svgEl.querySelector("#group-child") as SVGGElement;
    childGroup.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    expect(svgEl.querySelector("#select-as-new-parent-group-child")).toBeFalsy();
  });

  it("removes the toolbar on mouseleave after the timeout when no overflow menu is open", () => {
    vi.useFakeTimers();
    const { treeData, svgWidth, svgHeight } = buildTreeData(SIMPLE_NODES);
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svgEl);
    const svgRef: React.RefObject<SVGSVGElement> = { current: svgEl };

    renderTree(d3, svgRef, treeData, svgWidth, svgHeight, null, [], "#4F46E5", baseCallbacks());

    const rootForeignObject = svgEl.querySelector("#group-root foreignObject") as SVGForeignObjectElement;
    rootForeignObject.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(svgEl.querySelector("#toolbar-root")).toBeTruthy();

    const rootGroup = svgEl.querySelector("#group-root") as SVGGElement;
    rootGroup.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
    vi.advanceTimersByTime(150);

    expect(svgEl.querySelector("#toolbar-root")).toBeFalsy();
  });

  it("also removes a lingering reparent-target overlay on the same mouseleave timeout", () => {
    vi.useFakeTimers();
    const { treeData, svgWidth, svgHeight } = buildTreeData(SIMPLE_NODES);
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svgEl);
    const svgRef: React.RefObject<SVGSVGElement> = { current: svgEl };

    renderTree(d3, svgRef, treeData, svgWidth, svgHeight, "some-other-node", [], "#4F46E5", baseCallbacks());

    const rootGroup = svgEl.querySelector("#group-root") as SVGGElement;
    rootGroup.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    expect(svgEl.querySelector("#select-as-new-parent-group-root")).toBeTruthy();

    rootGroup.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
    vi.advanceTimersByTime(150);

    expect(svgEl.querySelector("#select-as-new-parent-group-root")).toBeFalsy();
  });
});
