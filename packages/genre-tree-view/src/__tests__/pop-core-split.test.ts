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

  it("throws when the root has more than one non-pop direct child", () => {
    const nodes: GenreTreeNode[] = [
      { id: "rock", parentId: null, name: "Rock", itemCount: 0 },
      { id: "rock-core-a", parentId: "rock", name: "Rock Core A", itemCount: 0 },
      { id: "rock-core-b", parentId: "rock", name: "Rock Core B", itemCount: 0 },
      { id: "rock-pop", parentId: "rock", name: "Pop Rock", itemCount: 0, side: "pop" },
    ];
    const [group] = groupNodesByRoot(nodes);
    expect(() => splitRootGroupBySide(group)).toThrow(/Rock.*rock.*2.*Rock Core A.*Rock Core B/s);
  });
});
