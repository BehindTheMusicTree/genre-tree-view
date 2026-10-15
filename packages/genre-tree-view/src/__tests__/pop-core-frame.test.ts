import { describe, expect, it } from "vitest";
import { isZoomableNode, resolvePopCoreFrame } from "../pop-core-frame";
import type { GenreTreeNode } from "../types";

const NODES: GenreTreeNode[] = [
  { id: "pop", parentId: null, name: "Mainstream Pop", itemCount: 0 },
  { id: "dance-pop", parentId: "pop", name: "Dance Pop", itemCount: 0 },
  { id: "rock", parentId: null, name: "Rock", itemCount: 0 },
  { id: "punk", parentId: "rock", name: "Punk", itemCount: 0 },
  { id: "hardcore", parentId: "punk", name: "Hardcore", itemCount: 0 },
  { id: "metal", parentId: "rock", name: "Metal", itemCount: 0 },
  { id: "pop-rock", parentId: "rock", name: "Pop Rock", itemCount: 0, side: "pop" },
  { id: "soft-rock", parentId: "pop-rock", name: "Soft Rock", itemCount: 0 },
  { id: "pop-punk", parentId: "punk", name: "Pop Punk", itemCount: 0, side: "pop" },
];

const ids = (nodes: GenreTreeNode[]) => nodes.map((node) => node.id).sort();

describe("resolvePopCoreFrame", () => {
  it("centers the Mainstream Pop root and rings every other root's subtree without a focus", () => {
    const frame = resolvePopCoreFrame(NODES, null);
    expect(frame.center.id).toBe("pop");
    expect(frame.centerHasPopDisc).toBe(true);
    expect(ids(frame.centerNodes)).toEqual(["dance-pop", "pop"]);
    expect(ids(frame.ringNodes)).toEqual(["hardcore", "metal", "pop-punk", "pop-rock", "punk", "rock", "soft-rock"]);
  });

  it("throws without a focus when there's no Mainstream Pop root", () => {
    expect(() => resolvePopCoreFrame(NODES.slice(2), null)).toThrow(/Mainstream Pop/);
  });

  it("centers the focus node's pop child as a disc and rings its other children as roots", () => {
    const frame = resolvePopCoreFrame(NODES, "rock");
    expect(frame.center).toMatchObject({ id: "pop-rock", parentId: null });
    expect(frame.centerHasPopDisc).toBe(true);
    expect(ids(frame.centerNodes)).toEqual(["pop-rock", "soft-rock"]);
    expect(ids(frame.ringNodes)).toEqual(["hardcore", "metal", "pop-punk", "punk"]);
    expect(frame.ringNodes.filter((node) => node.parentId === null).map((node) => node.id).sort()).toEqual([
      "metal",
      "punk",
    ]);
  });

  it("centers the focus node itself, label only, when it has no pop child", () => {
    const frame = resolvePopCoreFrame(NODES, "pop");
    expect(frame.center.id).toBe("pop");
    expect(frame.centerHasPopDisc).toBe(false);
    expect(ids(frame.centerNodes)).toEqual(["pop"]);
    expect(frame.ringNodes).toEqual([{ ...NODES[1], parentId: null }]);
  });

  it("centers a childless focus node as a label-only disc with an empty ring", () => {
    const frame = resolvePopCoreFrame(NODES, "hardcore");
    expect(frame.center.id).toBe("hardcore");
    expect(frame.centerHasPopDisc).toBe(false);
    expect(frame.ringNodes).toEqual([]);
  });

  it("resolves a nested focus against that node's own children", () => {
    const frame = resolvePopCoreFrame(NODES, "punk");
    expect(frame.center).toMatchObject({ id: "pop-punk", parentId: null });
    expect(frame.ringNodes).toEqual([{ ...NODES[4], parentId: null }]);
  });

  it("throws on an unknown focus id", () => {
    expect(() => resolvePopCoreFrame(NODES, "nope")).toThrow(/Unknown/);
  });

  it("throws when the focus node has two pop children", () => {
    const nodes = [...NODES, { id: "glam", parentId: "rock", name: "Glam", itemCount: 0, side: "pop" as const }];
    expect(() => resolvePopCoreFrame(nodes, "rock")).toThrow(/more than one pop child/);
  });
});

describe("isZoomableNode", () => {
  it("accepts a top-level root with children other than Mainstream Pop", () => {
    expect(isZoomableNode(NODES, "rock")).toBe(true);
  });

  it("accepts a nested non-pop child of a zoomable node", () => {
    expect(isZoomableNode(NODES, "punk")).toBe(true);
  });

  it("rejects pop-side nodes and their descendants", () => {
    expect(isZoomableNode(NODES, "pop-rock")).toBe(false);
    expect(isZoomableNode([...NODES, { id: "yacht", parentId: "soft-rock", name: "Yacht Rock", itemCount: 0 }], "soft-rock")).toBe(
      false,
    );
  });

  it("rejects Mainstream Pop and its descendants", () => {
    const nodes = [...NODES, { id: "teen-pop", parentId: "dance-pop", name: "Teen Pop", itemCount: 0 }];
    expect(isZoomableNode(nodes, "pop")).toBe(false);
    expect(isZoomableNode(nodes, "dance-pop")).toBe(false);
  });

  it("rejects a node with more than one pop child, and anything below it", () => {
    const nodes = [
      ...NODES,
      { id: "power-pop", parentId: "rock", name: "Power Pop", itemCount: 0, side: "pop" as const },
    ];
    expect(isZoomableNode(nodes, "rock")).toBe(false);
    expect(isZoomableNode(nodes, "punk")).toBe(false);
  });

  it("rejects a node without children", () => {
    expect(isZoomableNode(NODES, "metal")).toBe(false);
  });

  it("rejects an unknown id or a dangling parent", () => {
    expect(isZoomableNode(NODES, "nope")).toBe(false);
    expect(
      isZoomableNode([{ id: "orphan", parentId: "gone", name: "Orphan", itemCount: 0 }, { id: "kid", parentId: "orphan", name: "Kid", itemCount: 0 }], "orphan"),
    ).toBe(false);
  });
});
