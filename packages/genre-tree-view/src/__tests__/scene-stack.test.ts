import * as d3 from "d3";
import { describe, expect, it } from "vitest";
import { buildCoreHierarchy, calculateCoreSubtreeRadialExtent, computeCoreRadialLayout } from "../core-radial-layout";
import { MAX_NODE_WIDTH, POP_TREE_DEPTH_RADIAL_SPACING, SCENE_SPLIT_PARENT_NAME } from "../constants";
import { findSceneStack } from "../scene-stack";
import type { GenreTreeNode } from "../types";

const node = (id: string, parentId: string | null, extra: Partial<GenreTreeNode> = {}): GenreTreeNode => ({
  id,
  parentId,
  name: id,
  itemCount: 0,
  ...extra,
});

const splitNodes = (): GenreTreeNode[] => [
  node("core", "root", { name: SCENE_SPLIT_PARENT_NAME }),
  node("edm", "core", { scene: "commercial" }),
  node("house", "edm"),
  node("deep-house", "house"),
  node("techno-pop", "edm"),
  node("underground", "core", { scene: "underground" }),
  node("ambient", "underground"),
];

const build = (nodes: GenreTreeNode[]) => buildCoreHierarchy(d3, nodes);
const byId = (h: d3.HierarchyNode<GenreTreeNode>, id: string) => h.descendants().find((d) => d.data.id === id)!;

describe("findSceneStack", () => {
  it("returns null when no node carries the split name", () => {
    expect(findSceneStack(build(splitNodes().map((n) => ({ ...n, name: n.id }))))).toBeNull();
  });

  it("returns null when no child of the split node has a scene", () => {
    const nodes = splitNodes().map((n) => ({ ...n, scene: undefined }));
    expect(findSceneStack(build(nodes))).toBeNull();
  });

  it("throws unless the split node has exactly one commercial and one underground child", () => {
    const nodes = splitNodes().filter((n) => n.id !== "underground" && n.id !== "ambient");
    expect(() => findSceneStack(build(nodes))).toThrow(/exactly one commercial and one underground/);
    const extra = [...splitNodes(), node("other", "core")];
    expect(() => findSceneStack(build(extra))).toThrow(/other \(no scene\)/);
  });

  it("pushes the underground subtree past the commercial subtree's deepest ring", () => {
    const hierarchy = build(splitNodes());
    const stack = findSceneStack(hierarchy)!;
    expect(stack.ringDepthOf(byId(hierarchy, "core"))).toBe(0);
    expect(stack.ringDepthOf(byId(hierarchy, "edm"))).toBe(1);
    expect(stack.ringDepthOf(byId(hierarchy, "deep-house"))).toBe(3);
    expect(stack.ringDepthOf(byId(hierarchy, "underground"))).toBe(4);
    expect(stack.ringDepthOf(byId(hierarchy, "ambient"))).toBe(5);
    expect(stack.isUnderground(byId(hierarchy, "ambient"))).toBe(true);
    expect(stack.isUnderground(byId(hierarchy, "house"))).toBe(false);
  });
});

describe("scene-stacked core layout", () => {
  const radius = 500;
  const layout = (stack: boolean) => {
    const hierarchy = build(splitNodes());
    return computeCoreRadialLayout(
      d3,
      hierarchy,
      0,
      80,
      radius,
      POP_TREE_DEPTH_RADIAL_SPACING,
      undefined,
      stack ? findSceneStack(hierarchy) : null,
    );
  };
  const angleOf = (d: d3.HierarchyNode<GenreTreeNode>) => Math.atan2(d.x!, -d.y!);
  const radiusOf = (d: d3.HierarchyNode<GenreTreeNode>) => Math.hypot(d.x!, d.y!);

  it("puts the underground root on the ring after the commercial subtree's deepest one", () => {
    const laidOut = layout(true);
    expect(radiusOf(byId(laidOut, "underground"))).toBeCloseTo(radius + 5 * POP_TREE_DEPTH_RADIAL_SPACING, 5);
    expect(radiusOf(byId(laidOut, "ambient"))).toBeCloseTo(radius + 6 * POP_TREE_DEPTH_RADIAL_SPACING, 5);
  });

  it("centers both scene children on their parent's angle instead of placing them side by side", () => {
    const laidOut = layout(true);
    expect(angleOf(byId(laidOut, "edm"))).toBeCloseTo(angleOf(byId(laidOut, "core")), 5);
    expect(angleOf(byId(laidOut, "underground"))).toBeCloseTo(angleOf(byId(laidOut, "core")), 5);
  });

  it("keeps the unstacked layout's children apart when no stack is given", () => {
    const laidOut = layout(false);
    expect(angleOf(byId(laidOut, "edm"))).not.toBeCloseTo(angleOf(byId(laidOut, "underground")), 3);
  });

  it("extends the subtree extent by the underground rings", () => {
    const hierarchy = build(splitNodes());
    const stack = findSceneStack(hierarchy);
    const plain = calculateCoreSubtreeRadialExtent(hierarchy, POP_TREE_DEPTH_RADIAL_SPACING);
    const stacked = calculateCoreSubtreeRadialExtent(hierarchy, POP_TREE_DEPTH_RADIAL_SPACING, 0, stack);
    expect(stacked - plain).toBeCloseTo(POP_TREE_DEPTH_RADIAL_SPACING * 2, 5);
    expect(stacked).toBeGreaterThan(MAX_NODE_WIDTH);
  });
});
