import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { GenreNodeAncestors, GenreNodeFamily, GenreNodeItemCount, useGenreNodeRelations } from "../GenreNodePanelContent";
import { useExposeNodeStyleResolver } from "../use-expose-node-style";
import type { GenreTreeNode } from "../types";

afterEach(cleanup);

const NODES: GenreTreeNode[] = [
  { id: "root", parentId: null, name: "Root", itemCount: 10 },
  { id: "mid", parentId: "root", name: "Mid", itemCount: 5 },
  { id: "leaf-a", parentId: "mid", name: "Leaf A", itemCount: 2 },
  { id: "leaf-b", parentId: "mid", name: "Leaf B", itemCount: 1 },
];
const resolver = (node: GenreTreeNode) => ({ fill: `fill-${node.id}`, textColor: "#fff" });

describe("useGenreNodeRelations", () => {
  it("returns the node with its parent, children and root-first ancestors, each styled", () => {
    const { result } = renderHook(() => useGenreNodeRelations(NODES, "mid", resolver));
    expect(result.current?.node.id).toBe("mid");
    expect(result.current?.fill).toBe("fill-mid");
    expect(result.current?.parentNode?.node.id).toBe("root");
    expect(result.current?.childNodes.map((c) => c.node.id)).toEqual(["leaf-a", "leaf-b"]);
    expect(result.current?.ancestorNodes.map((a) => a.fill)).toEqual(["fill-root"]);
  });

  it("is null for a missing selection, an unknown id, or before the resolver is published", () => {
    expect(renderHook(() => useGenreNodeRelations(NODES, null, resolver)).result.current).toBeNull();
    expect(renderHook(() => useGenreNodeRelations(NODES, "nope", resolver)).result.current).toBeNull();
    expect(renderHook(() => useGenreNodeRelations(NODES, "mid", null)).result.current).toBeNull();
  });

  it("has no parent and no ancestors for a root", () => {
    const { result } = renderHook(() => useGenreNodeRelations(NODES, "root", resolver));
    expect(result.current?.parentNode).toBeNull();
    expect(result.current?.ancestorNodes).toEqual([]);
  });
});

describe("content pieces", () => {
  it("lists ancestors and selects one on click", () => {
    const onSelectNode = vi.fn();
    const { result } = renderHook(() => useGenreNodeRelations(NODES, "leaf-a", resolver));
    render(<GenreNodeAncestors ancestorNodes={result.current!.ancestorNodes} onSelectNode={onSelectNode} />);
    fireEvent.click(screen.getByRole("button", { name: "Mid" }));
    expect(onSelectNode).toHaveBeenCalledWith("mid");
  });

  it("renders no ancestors section for a root", () => {
    const { container } = render(<GenreNodeAncestors ancestorNodes={[]} onSelectNode={() => {}} />);
    expect(container.textContent).toBe("");
  });

  it("reserves the mini tree's label space from the parent's font size, only when there is a parent", () => {
    const familyOf = (id: string) => {
      const r = renderHook(() => useGenreNodeRelations(NODES, id, resolver)).result.current!;
      const { container } = render(
        <GenreNodeFamily node={r.node} fill={r.fill} textColor={r.textColor} parentNode={r.parentNode} childNodes={r.childNodes} onSelectNode={() => {}} />,
      );
      return container.querySelector<HTMLElement>(".gtv-info-panel-mini-tree")!;
    };
    expect(familyOf("mid").style.getPropertyValue("--gtv-mini-parent-font-size")).toMatch(/^\d+(\.\d+)?px$/);
    expect(familyOf("root").style.getPropertyValue("--gtv-mini-parent-font-size")).toBe("");
  });

  it("shows the family and selects a child on click", () => {
    const onSelectNode = vi.fn();
    const { result } = renderHook(() => useGenreNodeRelations(NODES, "mid", resolver));
    const r = result.current!;
    render(<GenreNodeFamily node={r.node} fill={r.fill} textColor={r.textColor} parentNode={r.parentNode} childNodes={r.childNodes} onSelectNode={onSelectNode} />);
    fireEvent.click(screen.getByRole("button", { name: "Leaf B" }));
    expect(onSelectNode).toHaveBeenCalledWith("leaf-b");
    fireEvent.click(screen.getByRole("button", { name: "Root" }));
    expect(onSelectNode).toHaveBeenCalledWith("root");
  });

  it("shows the item count with its label", () => {
    render(<GenreNodeItemCount node={NODES[1]} label="Tracks" />);
    expect(screen.getByText("Tracks")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
  });
});

describe("useExposeNodeStyleResolver", () => {
  it("publishes one stable function that always reads the latest resolver", () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(({ r }) => useExposeNodeStyleResolver(onChange, r), {
      initialProps: { r: resolver },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const published = onChange.mock.calls[0][0];
    rerender({ r: () => ({ fill: "next", textColor: "#000" }) });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(published(NODES[0])).toEqual({ fill: "next", textColor: "#000" });
  });

  it("does nothing without a listener", () => {
    expect(() => renderHook(() => useExposeNodeStyleResolver(undefined, resolver))).not.toThrow();
  });
});
