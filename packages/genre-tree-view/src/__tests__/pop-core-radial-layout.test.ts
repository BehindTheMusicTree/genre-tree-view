import * as d3 from "d3";
import { describe, expect, it } from "vitest";
import {
  buildPopHierarchy,
  calculateMainstreamPopOuterCircleRadius,
  calculatePopSubtreeRadialExtent,
  computeCenterRadialLayout,
  computePopRadialLayout,
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
  it("places the pop child (depth 0) at the subtree's outermost radial step, on the wedge's center angle", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0);
    const popChild = laidOut.descendants().find((d) => d.data.id === "rock-pop")!;
    const maxDepth = hierarchy.height;
    const outermostRadius = (maxDepth + 1) * POP_TREE_DEPTH_RADIAL_SPACING;

    expect(Math.hypot(popChild.x!, popChild.y!)).toBeCloseTo(outermostRadius, 5);
    // wedge centered on 0deg (top): projects to (0, -radius).
    expect(popChild.x!).toBeCloseTo(0, 5);
    expect(popChild.y!).toBeCloseTo(-outermostRadius, 5);
  });

  it("places every node at a radius proportional to (maxDepth - depth + 1), deepest nodes closest to center", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const laidOut = computePopRadialLayout(d3, hierarchy, 90);
    const maxDepth = hierarchy.height;

    laidOut.each((d) => {
      const radius = Math.hypot(d.x!, d.y!);
      expect(radius).toBeCloseTo((maxDepth - d.depth + 1) * POP_TREE_DEPTH_RADIAL_SPACING, 5);
    });
  });

  it("keeps every node's angle within the wedge centered on wedgeCenterAngleDegrees", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const wedgeCenterDeg = 90;
    const laidOut = computePopRadialLayout(d3, hierarchy, wedgeCenterDeg);

    laidOut.each((d) => {
      const angleDeg = (Math.atan2(d.x!, -d.y!) * 180) / Math.PI;
      const delta = Math.abs(((angleDeg - wedgeCenterDeg + 540) % 360) - 180);
      expect(delta).toBeLessThanOrEqual(40 + 1e-6);
    });
  });

  it("keeps a single-node subtree (no children) at the wedge center, one step out", () => {
    const solo: GenreTreeNode[] = [{ id: "solo-pop", parentId: null, name: "Solo Pop", itemCount: 0 }];
    const hierarchy = buildPopHierarchy(d3, solo);
    const laidOut = computePopRadialLayout(d3, hierarchy, 180);
    const node = laidOut.descendants()[0];

    expect(node.x!).toBeCloseTo(0, 5);
    expect(node.y!).toBeCloseTo(POP_TREE_DEPTH_RADIAL_SPACING, 5);
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

  it("matches the (maxDepth + 1) * spacing + half node width + margin formula", () => {
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

  it("places depth-1 nodes exactly on innerRadius, and each deeper generation one depthSpacing further out", () => {
    const hierarchy = buildTreeHierarchyStructure(d3, centerWithSubtree);
    const innerRadius = 100;
    const laidOut = computeCenterRadialLayout(d3, hierarchy, innerRadius, POP_TREE_DEPTH_RADIAL_SPACING);

    laidOut.each((d) => {
      if (d.depth === 0) return;
      const radius = Math.hypot(d.x!, d.y!);
      expect(radius).toBeCloseTo(innerRadius + (d.depth - 1) * POP_TREE_DEPTH_RADIAL_SPACING, 5);
    });
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

  it("matches the mainstreamPopRootCircleRadius + (height - 1) * depthSpacing + half node width + margin formula", () => {
    const hierarchy = buildTreeHierarchyStructure(d3, centerWithSubtree);
    const mainstreamPopRootCircleRadius = 100;
    const extent = calculateMainstreamPopOuterCircleRadius(
      hierarchy,
      mainstreamPopRootCircleRadius,
      POP_TREE_DEPTH_RADIAL_SPACING,
    );

    expect(extent).toBeCloseTo(
      mainstreamPopRootCircleRadius + (hierarchy.height - 1) * POP_TREE_DEPTH_RADIAL_SPACING + MAX_NODE_WIDTH / 2 + 24,
      5,
    );
  });
});
