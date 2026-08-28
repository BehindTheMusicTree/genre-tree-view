import * as d3 from "d3";
import { describe, expect, it } from "vitest";
import { buildCoreHierarchy, calculateCoreSubtreeRadialExtent, computeCoreRadialLayout } from "../core-radial-layout";
import { POP_TREE_DEPTH_RADIAL_SPACING, MAX_NODE_WIDTH } from "../constants";
import type { GenreTreeNode } from "../types";

const rockCore: GenreTreeNode[] = [
  { id: "root-a", parentId: null, name: "Rock", itemCount: 0 },
  { id: "punk", parentId: "root-a", name: "Punk", itemCount: 0 },
  { id: "hardcore", parentId: "punk", name: "Hardcore", itemCount: 0 },
  { id: "grunge", parentId: "punk", name: "Grunge", itemCount: 0 },
];

describe("buildCoreHierarchy", () => {
  it("normalizes a core child's parentId to null when it points at the excluded ring root", () => {
    const hierarchy = buildCoreHierarchy(d3, rockCore.slice(1));
    expect(hierarchy.data.id).toBe("punk");
    expect(hierarchy.parent).toBeNull();
  });

  it("preserves parentId links between core descendants", () => {
    const hierarchy = buildCoreHierarchy(d3, rockCore.slice(1));
    const hardcore = hierarchy.descendants().find((d) => d.data.id === "hardcore")!;
    expect(hardcore.parent?.data.id).toBe("punk");
  });
});

describe("computeCoreRadialLayout", () => {
  it("places the core child (depth 0, absolute depth 1) one depthSpacing step past coreRootCircleRadius, on the wedge's center angle", () => {
    const hierarchy = buildCoreHierarchy(d3, rockCore.slice(1));
    const coreRootCircleRadius = 500;
    const laidOut = computeCoreRadialLayout(d3, hierarchy, 0, 80, coreRootCircleRadius, POP_TREE_DEPTH_RADIAL_SPACING);
    const punk = laidOut.descendants().find((d) => d.data.id === "punk")!;

    expect(Math.hypot(punk.x!, punk.y!)).toBeCloseTo(coreRootCircleRadius + POP_TREE_DEPTH_RADIAL_SPACING, 5);
    // wedge centered on 0deg (top): projects to (0, -radius).
    expect(punk.x!).toBeCloseTo(0, 5);
    expect(punk.y!).toBeCloseTo(-(coreRootCircleRadius + POP_TREE_DEPTH_RADIAL_SPACING), 5);
  });

  it("places every node at a radius that steps outward from coreRootCircleRadius by (depth + 1) * depthSpacing", () => {
    const hierarchy = buildCoreHierarchy(d3, rockCore.slice(1));
    const coreRootCircleRadius = 300;
    const laidOut = computeCoreRadialLayout(d3, hierarchy, 90, 80, coreRootCircleRadius, POP_TREE_DEPTH_RADIAL_SPACING);

    laidOut.each((d) => {
      const radius = Math.hypot(d.x!, d.y!);
      expect(radius).toBeCloseTo(coreRootCircleRadius + (d.depth + 1) * POP_TREE_DEPTH_RADIAL_SPACING, 5);
    });
  });

  it("keeps every node's angle within the wedge centered on wedgeCenterAngleDegrees", () => {
    const hierarchy = buildCoreHierarchy(d3, rockCore.slice(1));
    const wedgeCenterDeg = 90;
    const wedgeSpanDeg = 80;
    const laidOut = computeCoreRadialLayout(d3, hierarchy, wedgeCenterDeg, wedgeSpanDeg, 500, POP_TREE_DEPTH_RADIAL_SPACING);

    laidOut.each((d) => {
      const angleDeg = (Math.atan2(d.x!, -d.y!) * 180) / Math.PI;
      const delta = Math.abs(((angleDeg - wedgeCenterDeg + 540) % 360) - 180);
      expect(delta).toBeLessThanOrEqual(wedgeSpanDeg / 2 + 1e-6);
    });
  });

  it("keeps a single-node subtree (no children) at the wedge center, one depthSpacing step past coreRootCircleRadius", () => {
    const solo = buildCoreHierarchy(d3, [{ id: "solo-core", parentId: null, name: "Solo Core", itemCount: 0 }]);
    const coreRootCircleRadius = 500;
    const laidOut = computeCoreRadialLayout(d3, solo, 180, 80, coreRootCircleRadius, POP_TREE_DEPTH_RADIAL_SPACING);
    const node = laidOut.descendants()[0];

    expect(node.x!).toBeCloseTo(0, 5);
    // wedge centered on 180deg (bottom): projects to (0, +radius).
    expect(node.y!).toBeCloseTo(coreRootCircleRadius + POP_TREE_DEPTH_RADIAL_SPACING, 5);
  });
});

describe("calculateCoreSubtreeRadialExtent", () => {
  it("grows with the subtree's depth", () => {
    const shallow = buildCoreHierarchy(d3, [{ id: "a", parentId: null, name: "A", itemCount: 0 }]);
    const deep = buildCoreHierarchy(d3, rockCore.slice(1));

    const shallowExtent = calculateCoreSubtreeRadialExtent(shallow, POP_TREE_DEPTH_RADIAL_SPACING);
    const deepExtent = calculateCoreSubtreeRadialExtent(deep, POP_TREE_DEPTH_RADIAL_SPACING);

    expect(deepExtent).toBeGreaterThan(shallowExtent);
  });

  it("matches the (height + 1) * depthSpacing + half node width + margin formula when coreRootCircleRadius defaults to 0", () => {
    const hierarchy = buildCoreHierarchy(d3, rockCore.slice(1));
    const extent = calculateCoreSubtreeRadialExtent(hierarchy, POP_TREE_DEPTH_RADIAL_SPACING);
    const maxDepth = hierarchy.height;

    expect(extent).toBeCloseTo((maxDepth + 1) * POP_TREE_DEPTH_RADIAL_SPACING + MAX_NODE_WIDTH / 2 + 24, 5);
  });

  it("offsets the extent by the given coreRootCircleRadius", () => {
    const hierarchy = buildCoreHierarchy(d3, rockCore.slice(1));
    const coreRootCircleRadius = 400;
    const extentWithoutRadius = calculateCoreSubtreeRadialExtent(hierarchy, POP_TREE_DEPTH_RADIAL_SPACING);
    const extentWithRadius = calculateCoreSubtreeRadialExtent(hierarchy, POP_TREE_DEPTH_RADIAL_SPACING, coreRootCircleRadius);

    expect(extentWithRadius).toBeCloseTo(extentWithoutRadius + coreRootCircleRadius, 5);
  });
});
