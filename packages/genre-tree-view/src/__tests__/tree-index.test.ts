import { describe, expect, it } from "vitest";
import { buildTreeIndex } from "../tree-index";
import { computeAncestorChain, findRootId } from "../root-grouping";
import type { GenreTreeNode } from "../types";

const NODES: GenreTreeNode[] = [
  { id: "r", parentId: null, name: "Root", itemCount: 0 },
  { id: "a", parentId: "r", name: "A", itemCount: 0 },
  { id: "b", parentId: "r", name: "B", itemCount: 0 },
  { id: "a1", parentId: "a", name: "A1", itemCount: 0 },
  { id: "orphan", parentId: "missing", name: "Orphan", itemCount: 0 },
  { id: "orphan-child", parentId: "orphan", name: "Orphan child", itemCount: 0 },
];

describe("buildTreeIndex", () => {
  const index = buildTreeIndex(NODES);

  it("indexes nodes by id and children by parent, in nodes order", () => {
    expect(index.byId.get("a1")).toBe(NODES[3]);
    expect(index.childrenByParentId.get("r")!.map((n) => n.id)).toEqual(["a", "b"]);
    expect(index.childrenByParentId.get("b")).toBeUndefined();
  });

  it("matches findRootId, including null for a dangling chain", () => {
    for (const node of NODES) expect(index.rootIdById.get(node.id)).toBe(findRootId(node.id, NODES));
    expect(index.rootIdById.get("orphan-child")).toBeNull();
  });

  it("lists ancestors root-first, matching computeAncestorChain one level up", () => {
    expect(index.ancestorsOf("a1").map((n) => n.id)).toEqual(["r", "a"]);
    expect(index.ancestorsOf("r")).toEqual([]);
    expect(index.ancestorsOf("unknown")).toEqual([]);
    expect(index.ancestorsOf("orphan-child").map((n) => n.id)).toEqual(["orphan"]);
    for (const node of NODES) {
      expect(index.ancestorsOf(node.id).slice(0, -1)).toEqual(computeAncestorChain(NODES, node.parentId));
    }
  });
});
