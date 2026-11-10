import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { GenreTreeOutline } from "../GenreTreeOutline";
import type { GenreTreeNode } from "../types";

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

const NODES: GenreTreeNode[] = [
  { id: "root-a", parentId: null, name: "Rock", itemCount: 5, wikidataId: "LOCAL:blues-rock" },
  { id: "a-core", parentId: "root-a", name: "Punk", itemCount: 3 },
  { id: "a-core-child", parentId: "a-core", name: "Hardcore", itemCount: 1 },
  { id: "a-pop", parentId: "root-a", name: "Pop Rock", itemCount: 2, side: "pop" },
  { id: "pop", parentId: null, name: "Mainstream Pop", itemCount: 10 },
  { id: "pop-child", parentId: "pop", name: "Dance Pop", itemCount: 4 },
  { id: "root-b", parentId: null, name: "Jazz", itemCount: 0 },
  { id: "b-core", parentId: "root-b", name: "Bebop", itemCount: 0 },
  { id: "root-c", parentId: null, name: "Ambient", itemCount: 0 },
];

function itemOf(container: HTMLElement, id: string) {
  return container.querySelector(`[data-gtv-node-id="${id}"]`) as HTMLLIElement;
}

function nameButton(container: HTMLElement, id: string) {
  return itemOf(container, id).querySelector(".gtv-outline-name") as HTMLButtonElement;
}

function toggle(details: HTMLDetailsElement) {
  fireEvent.click(details.querySelector("summary")!);
}

// Children only render while their section is open, so keep opening the first closed one.
function expandAll(container: HTMLElement) {
  for (
    let closed = container.querySelector<HTMLDetailsElement>("details:not([open])");
    closed;
    closed = container.querySelector<HTMLDetailsElement>("details:not([open])")
  ) {
    toggle(closed);
  }
}

describe("GenreTreeOutline", () => {
  it("throws without a Mainstream Pop root", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<GenreTreeOutline nodes={NODES.filter((n) => n.name !== "Mainstream Pop" && n.parentId !== "pop")} />)).toThrow(
      'GenreTreeOutline requires a root node named "Mainstream Pop"',
    );
    vi.restoreAllMocks();
  });

  it("lists Mainstream Pop first, then the other roots in data order", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    const rootList = container.querySelector(".gtv-outline-list--roots")!;
    const rootIds = Array.from(rootList.children).map((li) => li.getAttribute("data-gtv-node-id"));
    expect(rootIds).toEqual(["pop", "root-a", "root-b", "root-c"]);
  });

  it("marks an umbrella node's name and leaves others unmarked", () => {
    const nodes = NODES.map((n) => (n.id === "a-core" ? { ...n, umbrella: true } : n));
    const { container } = render(<GenreTreeOutline nodes={nodes} />);
    expandAll(container);
    expect(nameButton(container, "a-core").classList.contains("gtv-outline-name--umbrella")).toBe(true);
    expect(nameButton(container, "a-pop").classList.contains("gtv-outline-name--umbrella")).toBe(false);
  });

  it("renders no detached section when no root is detached", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    expect(container.querySelector(".gtv-outline-list--detached")).toBeNull();
  });

  it("splits a root's children into Core and Pop sections, omitting an empty one", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    expandAll(container);
    const labels = (id: string) =>
      Array.from(itemOf(container, id).querySelectorAll(".gtv-outline-section-label")).map((el) => el.textContent);
    expect(labels("root-a")).toEqual(["Core", "Pop"]);
    expect(labels("root-b")).toEqual(["Core"]);
    expect(labels("pop")).toEqual([]);
    expect(itemOf(container, "root-c").querySelector("details")).toBeNull();
    expect(itemOf(container, "a-core-child").querySelector(".gtv-outline-leaf")).not.toBeNull();
  });

  it("starts with every section collapsed", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    const details = Array.from(container.querySelectorAll("details"));
    expect(details.length).toBeGreaterThan(0);
    expect(details.every((d) => !d.open)).toBe(true);
  });

  it("shows each node's itemCount as given, without rolling descendants up", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    expandAll(container);
    expect(itemOf(container, "root-a").querySelector(".gtv-outline-count")!.textContent).toBe("5");
    expect(itemOf(container, "a-core").querySelector(".gtv-outline-count")!.textContent).toBe("3");
  });

  it("reparents on a name click while reparenting, disabling the node itself and its descendants", () => {
    const onReparent = vi.fn();
    const onNodeClick = vi.fn();
    const { container } = render(
      <GenreTreeOutline nodes={NODES} reparentingNodeId="a-core" onReparent={onReparent} onNodeClick={onNodeClick} />,
    );
    expandAll(container);
    expect(nameButton(container, "a-core").disabled).toBe(true);
    expect(nameButton(container, "a-core-child").disabled).toBe(true);
    expect(nameButton(container, "root-b").className).toContain("gtv-outline-name--reparent-target");

    fireEvent.click(nameButton(container, "root-b"));
    expect(onReparent).toHaveBeenCalledWith("a-core", "root-b");
    expect(onNodeClick).not.toHaveBeenCalled();
    expect(container.querySelector(".gtv-info-panel")).toBeNull();
  });

  it("pads its list by obscuredInset and publishes its node style resolver", () => {
    const onNodeStyleResolverChange = vi.fn();
    const { container } = render(
      <GenreTreeOutline nodes={NODES} obscuredInset={{ left: 120, bottom: 40 }} onNodeStyleResolverChange={onNodeStyleResolverChange} />,
    );
    const root = container.querySelector(".gtv-outline") as HTMLElement;
    expect(root.style.paddingLeft).toBe("120px");
    expect(root.style.paddingBottom).toBe("40px");
    expect(onNodeStyleResolverChange).toHaveBeenCalledTimes(1);
    expect(onNodeStyleResolverChange.mock.calls[0][0](NODES[0])).toEqual({ fill: expect.any(String), textColor: expect.any(String) });
  });

  it("fires onNodeHover on a name's pointerenter and focus", () => {
    const onNodeHover = vi.fn();
    const { container } = render(<GenreTreeOutline nodes={NODES} onNodeHover={onNodeHover} />);
    fireEvent.pointerEnter(nameButton(container, "root-a"));
    fireEvent.focus(nameButton(container, "root-b"));
    expect(onNodeHover.mock.calls.map(([node]) => node.id)).toEqual(["root-a", "root-b"]);
  });

  it("selects a row and fires onNodeClick on a name click, without toggling the section", () => {
    const onNodeClick = vi.fn();
    const { container } = render(<GenreTreeOutline nodes={NODES} onNodeClick={onNodeClick} />);
    fireEvent.click(nameButton(container, "root-a"));

    expect(onNodeClick).toHaveBeenCalledWith(expect.objectContaining({ id: "root-a" }), expect.any(MouseEvent));
    expect(itemOf(container, "root-a").querySelector("details")!.open).toBe(false);
    expect(itemOf(container, "root-a").querySelector(".gtv-outline-row--selected")).not.toBeNull();
  });

  it("notifies onSelectedNodeChange only when the selection changes", () => {
    const onSelectedNodeChange = vi.fn();
    const { container } = render(<GenreTreeOutline nodes={NODES} onSelectedNodeChange={onSelectedNodeChange} />);
    fireEvent.click(nameButton(container, "root-a"));
    fireEvent.click(nameButton(container, "root-a"));
    expect(onSelectedNodeChange).toHaveBeenCalledTimes(1);
    expect(onSelectedNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: "root-a" }));
    fireEvent.click(nameButton(container, "root-b"));
    expect(onSelectedNodeChange).toHaveBeenCalledTimes(2);
  });

  it("waits for a controlled selection before marking the row", () => {
    const onSelectedNodeChange = vi.fn();
    const { container, rerender } = render(<GenreTreeOutline nodes={NODES} selectedNodeId={null} onSelectedNodeChange={onSelectedNodeChange} />);
    fireEvent.click(nameButton(container, "root-a"));
    expect(onSelectedNodeChange).toHaveBeenCalledWith(expect.objectContaining({ id: "root-a" }));
    expect(container.querySelector(".gtv-outline-row--selected")).toBeNull();
    rerender(<GenreTreeOutline nodes={NODES} selectedNodeId="root-a" onSelectedNodeChange={onSelectedNodeChange} />);
    expect(itemOf(container, "root-a").querySelector(".gtv-outline-row--selected")).not.toBeNull();
    expect(onSelectedNodeChange).toHaveBeenCalledTimes(1);
  });

  it.each([null, undefined])("clears the selection without notifying when selectedNodeId becomes %s", (cleared) => {
    const onSelectedNodeChange = vi.fn();
    const { container, rerender } = render(<GenreTreeOutline nodes={NODES} selectedNodeId="b-core" onSelectedNodeChange={onSelectedNodeChange} />);
    expect(container.querySelector(".gtv-outline-row--selected")).not.toBeNull();
    rerender(<GenreTreeOutline nodes={NODES} selectedNodeId={cleared} onSelectedNodeChange={onSelectedNodeChange} />);
    expect(container.querySelector(".gtv-outline-row--selected")).toBeNull();
    expect(onSelectedNodeChange).not.toHaveBeenCalled();
  });

  it("opens every ancestor section of an externally-selected node, scrolls it into view and ignores unknown ids", () => {
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    const { container, rerender } = render(<GenreTreeOutline nodes={NODES} selectedNodeId="missing" />);
    expect(container.querySelectorAll("details[open]")).toHaveLength(0);

    rerender(<GenreTreeOutline nodes={NODES} selectedNodeId="a-core-child" />);
    expect(itemOf(container, "root-a").querySelector("details")!.open).toBe(true);
    expect(itemOf(container, "a-core").querySelector("details")!.open).toBe(true);
    expect(container.querySelectorAll("details[open]")).toHaveLength(3);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts[0]).toBe(itemOf(container, "a-core-child"));
  });
});

describe("GenreTreeOutline muted nodes", () => {
  it("marks the row of a muted node and leaves the name clickable", () => {
    const onSelectedNodeChange = vi.fn();
    const nodes = NODES.map((n) => (n.id === "root-a" ? { ...n, muted: true } : n));
    const { container } = render(<GenreTreeOutline nodes={nodes} onSelectedNodeChange={onSelectedNodeChange} />);

    expect(itemOf(container, "root-a").querySelector(".gtv-outline-row--muted")).not.toBeNull();
    expect(itemOf(container, "root-b").querySelector(".gtv-outline-row--muted")).toBeNull();

    fireEvent.click(nameButton(container, "root-a"));
    expect(onSelectedNodeChange).toHaveBeenCalledWith(expect.objectContaining({ id: "root-a" }));
  });
});
