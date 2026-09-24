import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
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
  { id: "root-a", parentId: null, name: "Rock", itemCount: 1 },
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

  it("splits a root's children into Core and Pop sections, omitting an empty one", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
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

  it("shows each root's aggregated item count", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    expect(itemOf(container, "root-a").querySelector(".gtv-outline-count")!.textContent).toBe("7");
    expect(itemOf(container, "a-core").querySelector(".gtv-outline-count")!.textContent).toBe("3");
  });

  it("renders a toolbar per row that fires the consumer callbacks, hidden when showToolbar is false", () => {
    const onPlayPause = vi.fn();
    const onAddChild = vi.fn();
    const { container, rerender } = render(
      <GenreTreeOutline nodes={NODES} onPlayPause={onPlayPause} onAddChild={onAddChild} />,
    );
    const row = itemOf(container, "a-core").querySelector(".gtv-outline-row") as HTMLElement;
    fireEvent.click(within(row).getByLabelText("Play"));
    fireEvent.click(within(row).getByLabelText("Add sub-genre"));
    expect(onPlayPause).toHaveBeenCalledWith("a-core");
    expect(onAddChild).toHaveBeenCalledWith("a-core");

    rerender(<GenreTreeOutline nodes={NODES} showToolbar={false} />);
    expect(container.querySelector(".gtv-toolbar")).toBeNull();
  });

  it("keeps a toolbar click from toggling its section", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    const details = itemOf(container, "root-a").querySelector("details")!;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    within(details.querySelector("summary")!).getByLabelText("Add sub-genre").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("reparents on a name click while reparenting, disabling the node itself and its descendants", () => {
    const onReparent = vi.fn();
    const onNodeClick = vi.fn();
    const { container } = render(
      <GenreTreeOutline nodes={NODES} reparentingNodeId="a-core" onReparent={onReparent} onNodeClick={onNodeClick} />,
    );
    expect(nameButton(container, "a-core").disabled).toBe(true);
    expect(nameButton(container, "a-core-child").disabled).toBe(true);
    expect(nameButton(container, "root-b").className).toContain("gtv-outline-name--reparent-target");

    fireEvent.click(nameButton(container, "root-b"));
    expect(onReparent).toHaveBeenCalledWith("a-core", "root-b");
    expect(onNodeClick).not.toHaveBeenCalled();
    expect(container.querySelector(".gtv-info-panel")).toBeNull();
  });

  it("opens the info panel and fires onNodeClick on a name click, without toggling the section", () => {
    const onNodeClick = vi.fn();
    const { container } = render(<GenreTreeOutline nodes={NODES} onNodeClick={onNodeClick} />);
    fireEvent.click(nameButton(container, "root-a"));

    expect(onNodeClick).toHaveBeenCalledWith(expect.objectContaining({ id: "root-a" }), expect.any(MouseEvent));
    expect(itemOf(container, "root-a").querySelector("details")!.open).toBe(false);
    const panel = container.querySelector(".gtv-info-panel") as HTMLElement;
    expect(panel.querySelector(".gtv-info-panel-title")!.textContent).toBe("Rock");
    expect(panel.className).toContain("gtv-info-panel--right");
    expect(container.querySelector(".gtv-outline")!.className).toContain("gtv-outline--panel-open");
    expect(itemOf(container, "root-a").querySelector(".gtv-outline-row--selected")).not.toBeNull();

    fireEvent.click(within(panel).getByLabelText("Close"));
    expect(container.querySelector(".gtv-info-panel")).toBeNull();
  });

  it("opens every ancestor section when navigating to a node from the panel", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    fireEvent.click(nameButton(container, "a-core"));
    fireEvent.click(within(container.querySelector(".gtv-info-panel") as HTMLElement).getByText("Hardcore"));

    expect(container.querySelector(".gtv-info-panel-title")!.textContent).toBe("Hardcore");
    const coreSection = itemOf(container, "a-core").parentElement!.closest("details")!;
    expect(itemOf(container, "root-a").querySelector("details")!.open).toBe(true);
    expect(coreSection.querySelector(".gtv-outline-section-label")!.textContent).toBe("Core");
    expect(coreSection.open).toBe(true);
    expect(itemOf(container, "a-core").querySelector("details")!.open).toBe(true);
    expect(container.querySelectorAll("details[open]")).toHaveLength(3);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("styles panel chips by where the node renders: center tinted, core solid, pop tinted", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    fireEvent.click(nameButton(container, "root-a"));
    const chipColor = (name: string) =>
      (within(container.querySelector(".gtv-info-panel") as HTMLElement).getByText(name) as HTMLElement).style.background;
    expect(chipColor("Punk")).not.toBe(chipColor("Pop Rock"));

    fireEvent.click(nameButton(container, "pop-child"));
    const header = container.querySelector(".gtv-info-panel-header") as HTMLElement;
    expect(header.style.color).toBe("rgb(24, 24, 27)");
  });

  it("opens the panel for an externally-selected node and ignores unknown ids", () => {
    const { container, rerender } = render(<GenreTreeOutline nodes={NODES} selectedNodeId="missing" />);
    expect(container.querySelector(".gtv-info-panel")).toBeNull();

    rerender(<GenreTreeOutline nodes={NODES} selectedNodeId="b-core" />);
    expect(container.querySelector(".gtv-info-panel-title")!.textContent).toBe("Bebop");
    expect(itemOf(container, "root-b").querySelector("details")!.open).toBe(true);
  });
});
