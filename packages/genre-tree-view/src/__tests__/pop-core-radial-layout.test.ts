import * as d3 from "d3";
import { describe, expect, it } from "vitest";
import {
  buildPopHierarchy,
  calculateMainstreamPopOuterCircleRadius,
  calculatePopSubtreeRadialExtent,
  computeCenterRadialLayout,
  computePopRadialLayout,
  getRadialDepthRadius,
} from "../pop-core-radial-layout";
import { buildTreeHierarchyStructure } from "../NodeHelper";
import { POP_TREE_DEPTH_RADIAL_SPACING, MAX_NODE_WIDTH } from "../constants";
import type { GenreTreeNode } from "../types";

const popRock: GenreTreeNode[] = [
  { id: "rock-pop", parentId: null, name: "Pop Rock", itemCount: 0 },
  { id: "arena-rock", parentId: "rock-pop", name: "Arena Rock", itemCount: 0 },
  { id: "soft-rock", parentId: "rock-pop", name: "Soft Rock", itemCount: 0 },
  { id: "yacht-rock", parentId: "arena-rock", name: "Yacht Rock", itemCount: 0 },
];

describe("computePopRadialLayout", () => {
  it("places the pop child (depth 0, absolute depth 1) exactly on coreRootCircleRadius, on the wedge's center angle", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const coreRootCircleRadius = 500;
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, coreRootCircleRadius);
    const popChild = laidOut.descendants().find((d) => d.data.id === "rock-pop")!;

    expect(Math.hypot(popChild.x!, popChild.y!)).toBeCloseTo(coreRootCircleRadius, 5);
    // wedge centered on 0deg (top): projects to (0, -radius).
    expect(popChild.x!).toBeCloseTo(0, 5);
    expect(popChild.y!).toBeCloseTo(-coreRootCircleRadius, 5);
  });

  it("places every node at a radius that steps inward from coreRootCircleRadius by depth * depthSpacing, deepest nodes closest to the wheel's center", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const coreRootCircleRadius = 2000;
    const laidOut = computePopRadialLayout(d3, hierarchy, 90, coreRootCircleRadius);

    laidOut.each((d) => {
      const radius = Math.hypot(d.x!, d.y!);
      expect(radius).toBeCloseTo(coreRootCircleRadius - d.depth * POP_TREE_DEPTH_RADIAL_SPACING, 5);
    });
  });

  it("keeps every node's angle within the wedge centered on wedgeCenterAngleDegrees", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const wedgeCenterDeg = 90;
    const laidOut = computePopRadialLayout(d3, hierarchy, wedgeCenterDeg, 2000);

    laidOut.each((d) => {
      const angleDeg = (Math.atan2(d.x!, -d.y!) * 180) / Math.PI;
      const delta = Math.abs(((angleDeg - wedgeCenterDeg + 540) % 360) - 180);
      expect(delta).toBeLessThanOrEqual(40 + 1e-6);
    });
  });

  it("confines every node's angle to a narrower wedgeSpanDegrees when the root's real ring sector is narrower than the default 80deg wedge", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const wedgeCenterDeg = 90;
    const wedgeSpanDegrees = 30;
    const laidOut = computePopRadialLayout(d3, hierarchy, wedgeCenterDeg, 2000, wedgeSpanDegrees);

    laidOut.each((d) => {
      const angleDeg = (Math.atan2(d.x!, -d.y!) * 180) / Math.PI;
      const delta = Math.abs(((angleDeg - wedgeCenterDeg + 540) % 360) - 180);
      expect(delta).toBeLessThanOrEqual(wedgeSpanDegrees / 2 + 1e-6);
    });
  });

  it("keeps a single-node subtree (no children) at the wedge center, on coreRootCircleRadius", () => {
    const solo: GenreTreeNode[] = [{ id: "solo-pop", parentId: null, name: "Solo Pop", itemCount: 0 }];
    const hierarchy = buildPopHierarchy(d3, solo);
    const coreRootCircleRadius = 500;
    const laidOut = computePopRadialLayout(d3, hierarchy, 180, coreRootCircleRadius);
    const node = laidOut.descendants()[0];

    expect(node.x!).toBeCloseTo(0, 5);
    expect(node.y!).toBeCloseTo(coreRootCircleRadius, 5);
  });

  it("places nodes at the same absolute depth on the same circle regardless of how tall the subtree is", () => {
    const shallow = buildPopHierarchy(d3, [{ id: "shallow-pop", parentId: null, name: "Shallow Pop", itemCount: 0 }]);
    const deep = buildPopHierarchy(d3, popRock);
    const coreRootCircleRadius = 300;

    const laidOutShallow = computePopRadialLayout(d3, shallow, 0, coreRootCircleRadius);
    const laidOutDeep = computePopRadialLayout(d3, deep, 180, coreRootCircleRadius);

    const shallowRoot = laidOutShallow.descendants().find((d) => d.data.id === "shallow-pop")!;
    const deepRoot = laidOutDeep.descendants().find((d) => d.data.id === "rock-pop")!;

    // Both are the pop hierarchy's own depth-0 node (absolute depth 1), regardless of how tall
    // either subtree grows beneath it.
    expect(Math.hypot(shallowRoot.x!, shallowRoot.y!)).toBeCloseTo(Math.hypot(deepRoot.x!, deepRoot.y!), 5);
  });
});

describe("calculatePopSubtreeRadialExtent", () => {
  it("grows with the subtree's depth", () => {
    const shallow = buildPopHierarchy(d3, [{ id: "a", parentId: null, name: "A", itemCount: 0 }]);
    const deep = buildPopHierarchy(d3, popRock);

    const shallowExtent = calculatePopSubtreeRadialExtent(shallow);
    const deepExtent = calculatePopSubtreeRadialExtent(deep);

    expect(deepExtent).toBeGreaterThan(shallowExtent);
  });

  it("matches the (height + 1) * spacing + half node width + margin formula", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const extent = calculatePopSubtreeRadialExtent(hierarchy);
    const maxDepth = hierarchy.height;

    expect(extent).toBeCloseTo((maxDepth + 1) * POP_TREE_DEPTH_RADIAL_SPACING + MAX_NODE_WIDTH / 2 + 24, 5);
  });
});

const centerWithSubtree: GenreTreeNode[] = [
  { id: "pop", parentId: null, name: "Pop", itemCount: 0 },
  { id: "pop-a", parentId: "pop", name: "Pop A", itemCount: 0 },
  { id: "pop-b", parentId: "pop", name: "Pop B", itemCount: 0 },
  { id: "pop-a-1", parentId: "pop-a", name: "Pop A 1", itemCount: 0 },
];

describe("computeCenterRadialLayout", () => {
  it("pins the depth-0 center node exactly at the origin", () => {
    const hierarchy = buildTreeHierarchyStructure(d3, centerWithSubtree);
    const laidOut = computeCenterRadialLayout(d3, hierarchy, 100, POP_TREE_DEPTH_RADIAL_SPACING);
    const center = laidOut.descendants().find((d) => d.data.id === "pop")!;

    expect(center.x!).toBeCloseTo(0, 5);
    expect(center.y!).toBeCloseTo(0, 5);
  });

  it("places depth-1 nodes one depthSpacing past coreRootCircleRadius, and each deeper generation one further step out", () => {
    const hierarchy = buildTreeHierarchyStructure(d3, centerWithSubtree);
    const coreRootCircleRadius = 100;
    const laidOut = computeCenterRadialLayout(d3, hierarchy, coreRootCircleRadius, POP_TREE_DEPTH_RADIAL_SPACING);

    laidOut.each((d) => {
      if (d.depth === 0) return;
      const radius = Math.hypot(d.x!, d.y!);
      expect(radius).toBeCloseTo(coreRootCircleRadius + d.depth * POP_TREE_DEPTH_RADIAL_SPACING, 5);
    });
  });

  it("places its own depth-1 nodes one depthSpacing further out than a cardinal's pop hierarchy places its own depth-0 (absolute depth 1) node — the two subtrees grow away from opposite ends of the same ring circle", () => {
    const hierarchy = buildTreeHierarchyStructure(d3, centerWithSubtree);
    const coreRootCircleRadius = 250;
    const laidOutCenter = computeCenterRadialLayout(d3, hierarchy, coreRootCircleRadius, POP_TREE_DEPTH_RADIAL_SPACING);
    const centerChild = laidOutCenter.descendants().find((d) => d.data.id === "pop-a")!;

    const popHierarchy = buildPopHierarchy(d3, popRock);
    const laidOutPop = computePopRadialLayout(d3, popHierarchy, 0, coreRootCircleRadius);
    const popRoot = laidOutPop.descendants().find((d) => d.data.id === "rock-pop")!;

    expect(Math.hypot(centerChild.x!, centerChild.y!)).toBeCloseTo(
      Math.hypot(popRoot.x!, popRoot.y!) + POP_TREE_DEPTH_RADIAL_SPACING,
      5,
    );
  });

  it("spreads depth-1 siblings proportional to their own subtree size rather than equally", () => {
    const hierarchy = buildTreeHierarchyStructure(d3, centerWithSubtree);
    const laidOut = computeCenterRadialLayout(d3, hierarchy, 100, POP_TREE_DEPTH_RADIAL_SPACING);
    const [a, b] = hierarchy.children!;

    // pop-a has a child (pop-a-1), pop-b doesn't: d3.tree's default separation should not split the
    // full circle evenly between them.
    const nodeA = laidOut.descendants().find((d) => d.data.id === a.data.id)!;
    const nodeB = laidOut.descendants().find((d) => d.data.id === b.data.id)!;
    const angleA = Math.atan2(nodeA.x!, -nodeA.y!);
    const angleB = Math.atan2(nodeB.x!, -nodeB.y!);

    expect(angleA).not.toBeCloseTo(angleB - Math.PI, 5);
  });
});

describe("calculateMainstreamPopOuterCircleRadius", () => {
  it("grows with the subtree's depth", () => {
    const shallow = buildTreeHierarchyStructure(d3, [
      { id: "pop", parentId: null, name: "Pop", itemCount: 0 },
      { id: "pop-a", parentId: "pop", name: "Pop A", itemCount: 0 },
    ]);
    const deep = buildTreeHierarchyStructure(d3, centerWithSubtree);

    const shallowExtent = calculateMainstreamPopOuterCircleRadius(shallow, 100, POP_TREE_DEPTH_RADIAL_SPACING);
    const deepExtent = calculateMainstreamPopOuterCircleRadius(deep, 100, POP_TREE_DEPTH_RADIAL_SPACING);

    expect(deepExtent).toBeGreaterThan(shallowExtent);
  });

  it("matches the coreRootCircleRadius + height * depthSpacing + half node width + margin formula", () => {
    const hierarchy = buildTreeHierarchyStructure(d3, centerWithSubtree);
    const coreRootCircleRadius = 100;
    const extent = calculateMainstreamPopOuterCircleRadius(hierarchy, coreRootCircleRadius, POP_TREE_DEPTH_RADIAL_SPACING);

    expect(extent).toBeCloseTo(
      coreRootCircleRadius + hierarchy.height * POP_TREE_DEPTH_RADIAL_SPACING + MAX_NODE_WIDTH / 2 + 24,
      5,
    );
  });
});

describe("getRadialDepthRadius", () => {
  it("is the single shared formula: coreRootCircleRadius + depth * depthSpacing", () => {
    expect(getRadialDepthRadius(0, 200, 50)).toBeCloseTo(200, 5);
    expect(getRadialDepthRadius(3, 200, 50)).toBeCloseTo(350, 5);
  });
});
