import * as d3 from "d3";
import { describe, expect, it } from "vitest";
import { buildCoreHierarchy, calculateCoreSubtreeRadialExtent, computeCoreRadialLayout, computeRootChipOffsetDegrees, computeUndergroundSceneSpans } from "../core-radial-layout";
import { POP_TREE_DEPTH_RADIAL_SPACING, MAX_NODE_WIDTH } from "../constants";
import { coreRadiusOfDepth, layoutWedge } from "../pop-core-radial-layout";
import type { GenreTreeNode } from "../types";

const rockCore: GenreTreeNode[] = [
  { id: "root-a", parentId: null, name: "Rock", itemCount: 0 },
  { id: "punk", parentId: "root-a", name: "Punk", itemCount: 0 },
  { id: "hardcore", parentId: "punk", name: "Hardcore", itemCount: 0 },
  { id: "grunge", parentId: "punk", name: "Grunge", itemCount: 0 },
];

describe("buildCoreHierarchy", () => {
  it("roots the d3 hierarchy at the core child, despite its parentId pointing at the excluded ring root", () => {
    const hierarchy = buildCoreHierarchy(d3, rockCore.slice(1));
    expect(hierarchy.data.id).toBe("punk");
    expect(hierarchy.parent).toBeNull();
  });

  it("preserves parentId links between core descendants", () => {
    const hierarchy = buildCoreHierarchy(d3, rockCore.slice(1));
    const hardcore = hierarchy.descendants().find((d) => d.data.id === "hardcore")!;
    expect(hardcore.parent?.data.id).toBe("punk");
  });

  it("keeps the root core child's own parentId pointing at the real (excluded) ring root, not normalized to null", () => {
    const hierarchy = buildCoreHierarchy(d3, rockCore.slice(1));
    expect(hierarchy.data.id).toBe("punk");
    expect(hierarchy.data.parentId).toBe("root-a");
  });

  it("leaves non-root descendants' data untouched, still pointing at their real in-subtree parent", () => {
    const hierarchy = buildCoreHierarchy(d3, rockCore.slice(1));
    const hardcore = hierarchy.descendants().find((d) => d.data.id === "hardcore")!;
    expect(hardcore.data.parentId).toBe("punk");
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

describe("computeCoreRadialLayout slack", () => {
  const leafAngles = (root: d3.HierarchyNode<GenreTreeNode>, centerDeg: number) =>
    root
      .leaves()
      .map((d) => centerDeg + ((((Math.atan2(d.x!, -d.y!) * 180) / Math.PI - centerDeg + 540) % 360) - 180));

  it("spreads spare wedge angle between the branching node's children, reaching both wedge edges", () => {
    const wedgeSpanDeg = 200;
    const spread = leafAngles(
      computeCoreRadialLayout(d3, buildCoreHierarchy(d3, rockCore.slice(1)), 90, wedgeSpanDeg, 500, POP_TREE_DEPTH_RADIAL_SPACING),
      90,
    );
    const centered = leafAngles(
      layoutWedge(d3, buildCoreHierarchy(d3, rockCore.slice(1)), 90, wedgeSpanDeg, coreRadiusOfDepth(500, POP_TREE_DEPTH_RADIAL_SPACING)),
      90,
    );

    const edgeGap = (angles: number[]) => Math.min(...angles) - (90 - wedgeSpanDeg / 2);
    expect(edgeGap(spread)).toBeLessThan(edgeGap(centered) / 2);
    expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThan(Math.max(...centered) - Math.min(...centered));
    expect(Math.max(...spread)).toBeLessThanOrEqual(90 + wedgeSpanDeg / 2 + 1e-6);
  });

  it("keeps the branching node centered over its first and last child", () => {
    const laidOut = computeCoreRadialLayout(d3, buildCoreHierarchy(d3, rockCore.slice(1)), 0, 200, 500, POP_TREE_DEPTH_RADIAL_SPACING);
    const angleOf = (d: d3.HierarchyNode<GenreTreeNode>) => Math.atan2(d.x!, -d.y!);
    const [first, last] = [laidOut.children![0], laidOut.children![1]];
    expect(angleOf(laidOut)).toBeCloseTo((angleOf(first) + angleOf(last)) / 2, 6);
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

describe("computeUndergroundSceneSpans", () => {
  const nodes: GenreTreeNode[] = [
    { id: "core", parentId: "root-a", name: "Core", itemCount: 0 },
    { id: "ug1", parentId: "core", name: "Underground 1", itemCount: 0, scene: "underground" },
    { id: "ug1-child", parentId: "ug1", name: "Child", itemCount: 0, scene: "underground" },
    { id: "mid", parentId: "core", name: "Mid", itemCount: 0 },
    { id: "ug2", parentId: "core", name: "Underground 2", itemCount: 0, scene: "underground" },
  ];
  const layout = () => {
    const root = buildCoreHierarchy(d3, nodes);
    const laidOut = layoutWedge(d3, root, 90, 90, (depth: number) => 100 + depth * 60);
    return computeUndergroundSceneSpans(laidOut, 90, 90);
  };

  it("returns one span per top-most underground subtree, never one for its underground descendants", () => {
    expect(layout().map((s) => s.id).sort()).toEqual(["ug1", "ug2"]);
  });

  it("tiles each span between the wedge edge and its neighbor, without gap or inversion", () => {
    const spans = layout();
    const ug1 = spans.find((s) => s.id === "ug1")!;
    const ug2 = spans.find((s) => s.id === "ug2")!;
    expect(ug1.startDeg).toBeLessThan(ug1.endDeg);
    expect(ug2.startDeg).toBeLessThan(ug2.endDeg);
    expect(Math.min(ug1.startDeg, ug2.startDeg)).toBeGreaterThanOrEqual(45 - 1e-9);
    expect(Math.max(ug1.endDeg, ug2.endDeg)).toBeLessThanOrEqual(135 + 1e-9);
  });

  it("returns nothing when no node is underground", () => {
    const root = buildCoreHierarchy(d3, nodes.filter((n) => !n.scene));
    expect(computeUndergroundSceneSpans(layoutWedge(d3, root, 90, 90, (depth: number) => 100 + depth * 60), 90, 90)).toEqual([]);
  });
});

describe("underground scene boundary parent", () => {
  const radiusOfDepth = (depth: number) => 100 + depth * 60;
  const angleOf = (d: { x?: number; y?: number }) => (Math.atan2(d.x!, -d.y!) * 180) / Math.PI;
  const placed = (nodes: GenreTreeNode[], slack: "center" | "between-children", centerDeg = 90, anchor = true) => {
    const laidOut = layoutWedge(
      d3,
      buildCoreHierarchy(d3, nodes),
      centerDeg,
      90,
      radiusOfDepth,
      slack,
      undefined,
      anchor,
    );
    return { laidOut, spans: computeUndergroundSceneSpans(laidOut, centerDeg, 90) };
  };
  const find = (laidOut: ReturnType<typeof layoutWedge>, id: string) => laidOut.descendants().find((d) => d.data.id === id)!;
  const node = (id: string, parentId: string | null, scene?: "underground"): GenreTreeNode => ({
    id,
    parentId,
    name: id,
    itemCount: 0,
    scene,
  });

  it("puts the branching parent on the edge between the underground zone and its neighbor", () => {
    const nodes = [node("core", "root-a"), node("ug", "core", "underground"), node("ug-child", "ug", "underground"), node("a", "core"), node("b", "core")];
    const { laidOut, spans } = placed(nodes, "between-children");
    expect(angleOf(find(laidOut, "core"))).toBeCloseTo(spans[0].endDeg, 6);
  });

  it("puts a deeper parent on the boundary too", () => {
    const nodes = [
      node("core", "root-a"),
      node("p", "core"),
      node("ug", "p", "underground"),
      node("c", "p"),
      node("d", "p"),
      node("q", "core"),
      node("q1", "q"),
      node("q2", "q"),
    ];
    const { laidOut, spans } = placed(nodes, "between-children");
    expect(angleOf(find(laidOut, "p"))).toBeCloseTo(spans[0].endDeg, 6);
  });

  it("keeps the plain centering when no node is underground", () => {
    const nodes = [node("core", "root-a"), node("a", "core"), node("b", "core"), node("c", "core")];
    const { laidOut } = placed(nodes, "between-children");
    const mid = (angleOf(find(laidOut, "a")) + angleOf(find(laidOut, "c"))) / 2;
    expect(angleOf(find(laidOut, "core"))).toBeCloseTo(mid, 6);
  });

  it("offsets the root chip onto the boundary, and not at all without an underground scene", () => {
    const withScene = [node("core", "root-a"), node("ug", "core", "underground"), node("a", "core"), node("b", "core")];
    const { laidOut, spans } = placed(withScene, "between-children");
    expect(90 + computeRootChipOffsetDegrees(laidOut, 90)).toBeCloseTo(spans[0].endDeg, 6);
    const plain = placed(withScene.map((n) => ({ ...n, scene: undefined })), "between-children").laidOut;
    expect(computeRootChipOffsetDegrees(plain, 90)).toBe(0);
  });

  it("does not offset the chip when the top node is not on a boundary, even with a deeper underground node", () => {
    const nodes = [
      node("core", "root-a"),
      node("p", "core"),
      node("q", "core"),
      node("ug", "q", "underground"),
      node("q2", "q"),
      node("p1", "p"),
      node("p2", "p"),
    ];
    const { laidOut } = placed(nodes, "between-children");
    expect(computeRootChipOffsetDegrees(laidOut, 90)).toBe(0);
  });

  it("offsets the chip through a single-child chain down to a boundary at the branching node", () => {
    const nodes = [
      node("core", "root-a"),
      node("mid", "core"),
      node("ug", "mid", "underground"),
      node("a", "mid"),
      node("b", "mid"),
    ];
    const { laidOut, spans } = placed(nodes, "between-children");
    expect(90 + computeRootChipOffsetDegrees(laidOut, 90)).toBeCloseTo(spans[0].endDeg, 6);
  });

  it("gives the same offset near the 0/360 wrap-around as at 90 degrees", () => {
    const nodes = [node("core", "root-a"), node("ug", "core", "underground"), node("a", "core"), node("b", "core")];
    const reference = computeRootChipOffsetDegrees(placed(nodes, "between-children", 90).laidOut, 90);
    expect(reference).not.toBe(0);
    for (const centre of [350, -10]) {
      const { laidOut } = placed(nodes, "between-children", centre);
      expect(computeRootChipOffsetDegrees(laidOut, centre)).toBeCloseTo(reference, 6);
    }
  });

  it("leaves the plain centering when anchoring is off", () => {
    const nodes = [node("core", "root-a"), node("ug", "core", "underground"), node("a", "core"), node("b", "core")];
    const { laidOut } = placed(nodes, "between-children", 90, false);
    const mid = (angleOf(find(laidOut, "ug")) + angleOf(find(laidOut, "b"))) / 2;
    expect(angleOf(find(laidOut, "core"))).toBeCloseTo(mid, 6);
  });
});
