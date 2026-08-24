import * as d3 from "d3";
import { describe, expect, it } from "vitest";
import { buildPopHierarchy, calculatePopSubtreeRadialExtent, computePopRadialLayout } from "../pop-core-radial-layout";
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
