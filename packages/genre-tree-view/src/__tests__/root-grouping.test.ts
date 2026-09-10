import { describe, expect, it } from "vitest";
import { computeAncestorChain, groupNodesByRoot } from "../root-grouping";
import type { GenreTreeNode } from "../types";

describe("groupNodesByRoot", () => {
  it("groups a single-root tree into one group containing every node", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root", parentId: null, name: "Root", itemCount: 0 },
      { id: "child", parentId: "root", name: "Child", itemCount: 0 },
    ];
    const groups = groupNodesByRoot(nodes);
    expect(groups).toHaveLength(1);
    expect(groups[0].root.id).toBe("root");
    expect(groups[0].nodes.map((n) => n.id)).toEqual(["root", "child"]);
  });

  it("splits a multi-root forest into one group per root", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root-a", parentId: null, name: "A", itemCount: 0 },
      { id: "a-child", parentId: "root-a", name: "A Child", itemCount: 0 },
      { id: "root-b", parentId: null, name: "B", itemCount: 0 },
      { id: "b-child", parentId: "root-b", name: "B Child", itemCount: 0 },
      { id: "b-grandchild", parentId: "b-child", name: "B Grandchild", itemCount: 0 },
    ];
    const groups = groupNodesByRoot(nodes);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.root.id === "root-a")?.nodes.map((n) => n.id)).toEqual(["root-a", "a-child"]);
    expect(groups.find((g) => g.root.id === "root-b")?.nodes.map((n) => n.id)).toEqual([
      "root-b",
      "b-child",
      "b-grandchild",
    ]);
  });

  it("returns an empty array for an empty node list", () => {
    expect(groupNodesByRoot([])).toEqual([]);
  });

  it("drops nodes whose parentId chain dangles on a missing node", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root", parentId: null, name: "Root", itemCount: 0 },
      { id: "orphan", parentId: "missing-parent", name: "Orphan", itemCount: 0 },
    ];
    const groups = groupNodesByRoot(nodes);
    expect(groups).toHaveLength(1);
    expect(groups[0].nodes.map((n) => n.id)).toEqual(["root"]);
  });
});

describe("computeAncestorChain", () => {
  const nodes: GenreTreeNode[] = [
    { id: "root", parentId: null, name: "Root", itemCount: 0 },
    { id: "parent", parentId: "root", name: "Parent", itemCount: 0 },
    { id: "child", parentId: "parent", name: "Child", itemCount: 0 },
  ];

  it("returns an empty array when parentId is a top-level root", () => {
    expect(computeAncestorChain(nodes, "root")).toEqual([]);
  });

  it("returns every ancestor above parentId, root-first", () => {
    expect(computeAncestorChain(nodes, "parent").map((n) => n.id)).toEqual(["root"]);
    expect(computeAncestorChain(nodes, "child").map((n) => n.id)).toEqual(["root", "parent"]);
  });

  it("returns an empty array when parentId is null", () => {
    expect(computeAncestorChain(nodes, null)).toEqual([]);
  });

  it("stops walking when the chain dangles on a parentId missing from nodes", () => {
    const withOrphan: GenreTreeNode[] = [
      ...nodes,
      { id: "orphan-child", parentId: "missing-parent", name: "Orphan Child", itemCount: 0 },
    ];
    expect(computeAncestorChain(withOrphan, "orphan-child")).toEqual([]);
  });
});
