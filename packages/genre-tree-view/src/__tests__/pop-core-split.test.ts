import { describe, expect, it } from "vitest";
import { splitRootGroupBySide } from "../pop-core-split";
import { groupNodesByRoot } from "../root-grouping";
import type { GenreTreeNode } from "../types";

describe("splitRootGroupBySide", () => {
  it("puts everything under the core branch when the root has no pop child", () => {
    const nodes: GenreTreeNode[] = [
      { id: "classical", parentId: null, name: "Classical", itemCount: 0 },
      { id: "baroque", parentId: "classical", name: "Baroque", itemCount: 0 },
      { id: "romantic", parentId: "baroque", name: "Romantic", itemCount: 0 },
    ];
    const [group] = groupNodesByRoot(nodes);
    const split = splitRootGroupBySide(group);
    expect(split.coreNodes.map((n) => n.id)).toEqual(["classical", "baroque", "romantic"]);
    expect(split.popNodes).toEqual([]);
  });

  it("treats an unset side the same as an explicit core side", () => {
    const nodes: GenreTreeNode[] = [
      { id: "rock", parentId: null, name: "Rock", itemCount: 0 },
      { id: "rock-core", parentId: "rock", name: "Rock Core", itemCount: 0, side: "core" },
      { id: "rock-pop", parentId: "rock", name: "Pop Rock", itemCount: 0, side: "pop" },
    ];
    const [group] = groupNodesByRoot(nodes);
    const split = splitRootGroupBySide(group);
    expect(split.coreNodes.map((n) => n.id)).toEqual(["rock", "rock-core"]);
    expect(split.popNodes.map((n) => n.id)).toEqual(["rock-pop"]);
  });

  it("separates the core subtree from the pop subtree, each with its own descendants", () => {
    const nodes: GenreTreeNode[] = [
      { id: "rock", parentId: null, name: "Rock", itemCount: 0 },
      { id: "rock-core", parentId: "rock", name: "Rock Core", itemCount: 0 },
      { id: "punk", parentId: "rock-core", name: "Punk", itemCount: 0 },
      { id: "rock-pop", parentId: "rock", name: "Pop Rock", itemCount: 0, side: "pop" },
      { id: "arena-rock", parentId: "rock-pop", name: "Arena Rock", itemCount: 0 },
    ];
    const [group] = groupNodesByRoot(nodes);
    const split = splitRootGroupBySide(group);
    expect(split.coreNodes.map((n) => n.id).sort()).toEqual(["rock", "rock-core", "punk"].sort());
    expect(split.popNodes.map((n) => n.id).sort()).toEqual(["rock-pop", "arena-rock"].sort());
  });

  it("returns just the root when it has no children at all", () => {
    const nodes: GenreTreeNode[] = [{ id: "solo", parentId: null, name: "Solo", itemCount: 0 }];
    const [group] = groupNodesByRoot(nodes);
    const split = splitRootGroupBySide(group);
    expect(split.coreNodes.map((n) => n.id)).toEqual(["solo"]);
    expect(split.popNodes).toEqual([]);
  });

  it("groups multiple non-pop direct children into their own core branches", () => {
    const nodes: GenreTreeNode[] = [
      { id: "rock", parentId: null, name: "Rock", itemCount: 0 },
      { id: "rock-core-a", parentId: "rock", name: "Rock Core A", itemCount: 0 },
      { id: "rock-core-b", parentId: "rock", name: "Rock Core B", itemCount: 0 },
      { id: "rock-pop", parentId: "rock", name: "Pop Rock", itemCount: 0, side: "pop" },
    ];
    const [group] = groupNodesByRoot(nodes);
    const split = splitRootGroupBySide(group);
    expect(split.coreBranches.map((branch) => branch.child.id)).toEqual(["rock-core-a", "rock-core-b"]);
    expect(split.coreBranches.map((branch) => branch.nodes.map((n) => n.id))).toEqual([
      ["rock-core-a"],
      ["rock-core-b"],
    ]);
    expect(split.coreNodes.map((n) => n.id).sort()).toEqual(["rock", "rock-core-a", "rock-core-b"].sort());
    expect(split.popBranches.map((branch) => branch.child.id)).toEqual(["rock-pop"]);
  });

  it("groups multiple pop direct children into their own pop branches instead of dropping extras", () => {
    const nodes: GenreTreeNode[] = [
      { id: "rock", parentId: null, name: "Rock", itemCount: 0 },
      { id: "rock-core", parentId: "rock", name: "Rock Core", itemCount: 0 },
      { id: "rock-pop-a", parentId: "rock", name: "Pop Rock A", itemCount: 0, side: "pop" },
      { id: "rock-pop-b", parentId: "rock", name: "Pop Rock B", itemCount: 0, side: "pop" },
    ];
    const [group] = groupNodesByRoot(nodes);
    const split = splitRootGroupBySide(group);
    expect(split.popBranches.map((branch) => branch.child.id)).toEqual(["rock-pop-a", "rock-pop-b"]);
    expect(split.popNodes.map((n) => n.id).sort()).toEqual(["rock-pop-a", "rock-pop-b"].sort());
  });

  it("supports a mix of multiple core and multiple pop direct children on the same root", () => {
    const nodes: GenreTreeNode[] = [
      { id: "rock", parentId: null, name: "Rock", itemCount: 0 },
      { id: "rock-core-a", parentId: "rock", name: "Rock Core A", itemCount: 0 },
      { id: "rock-core-b", parentId: "rock", name: "Rock Core B", itemCount: 0 },
      { id: "rock-pop-a", parentId: "rock", name: "Pop Rock A", itemCount: 0, side: "pop" },
      { id: "rock-pop-b", parentId: "rock", name: "Pop Rock B", itemCount: 0, side: "pop" },
    ];
    const [group] = groupNodesByRoot(nodes);
    const split = splitRootGroupBySide(group);
    expect(split.coreBranches).toHaveLength(2);
    expect(split.popBranches).toHaveLength(2);
    expect(split.coreNodes.map((n) => n.id).sort()).toEqual(["rock", "rock-core-a", "rock-core-b"].sort());
    expect(split.popNodes.map((n) => n.id).sort()).toEqual(["rock-pop-a", "rock-pop-b"].sort());
  });
});
