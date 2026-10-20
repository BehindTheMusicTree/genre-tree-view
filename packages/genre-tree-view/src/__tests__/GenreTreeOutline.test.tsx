import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { GenreTreeOutline } from "../GenreTreeOutline";
import type { GenreTreeNode } from "../types";
import { getGenreTreeColor, POP_SECTOR_TINT_RATIO, TEXT_MUTED_COLOR, tintSurface } from "../constants";

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

const NODES: GenreTreeNode[] = [
  { id: "root-a", parentId: null, name: "Rock", itemCount: 1, wikidataId: "LOCAL:blues-rock" },
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

  it("colors every row's bullet like its genre, and the panel header like the bullet", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    expandAll(container);
    const dot = (id: string) => (itemOf(container, id).querySelector(".gtv-outline-dot") as HTMLElement).style.background;
    const style = (hex: string) => {
      const probe = document.createElement("span");
      probe.style.background = hex;
      return probe.style.background;
    };
    expect(dot("a-core")).toBe(style(getGenreTreeColor("LOCAL:blues-rock")));
    expect(dot("a-pop")).toBe(style(tintSurface(getGenreTreeColor("LOCAL:blues-rock"), POP_SECTOR_TINT_RATIO)));
    expect(dot("pop-child")).toBe(style(tintSurface("#ffffff", POP_SECTOR_TINT_RATIO)));

    fireEvent.click(nameButton(container, "a-pop"));
    expect((container.querySelector(".gtv-info-panel-header") as HTMLElement).style.background).toBe(dot("a-pop"));
  });

  it("lists Mainstream Pop first, then the other roots in data order", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    const rootList = container.querySelector(".gtv-outline-list--roots")!;
    const rootIds = Array.from(rootList.children).map((li) => li.getAttribute("data-gtv-node-id"));
    expect(rootIds).toEqual(["pop", "root-a", "root-b", "root-c"]);
  });

  it("lists detached roots in their own neutral section after the tree, without Core/Pop sections", () => {
    const nodes: GenreTreeNode[] = [
      ...NODES,
      { id: "genreless", parentId: null, name: "Genreless", itemCount: 3, detached: true },
      { id: "genreless-child", parentId: "genreless", name: "Untagged", itemCount: 2 },
    ];
    const { container } = render(<GenreTreeOutline nodes={nodes} selectedNodeId="genreless-child" />);
    const [rootList, detachedList] = Array.from(container.querySelectorAll(".gtv-outline-list--roots"));
    const ids = (list: Element) => Array.from(list.children).map((li) => li.getAttribute("data-gtv-node-id"));
    expect(ids(rootList)).toEqual(["pop", "root-a", "root-b", "root-c"]);
    expect(detachedList.classList.contains("gtv-outline-list--detached")).toBe(true);
    expect(ids(detachedList)).toEqual(["genreless"]);
    expect(rootList.compareDocumentPosition(detachedList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const probe = document.createElement("span");
    probe.style.background = TEXT_MUTED_COLOR;
    const dot = (id: string) => (itemOf(container, id).querySelector(".gtv-outline-dot") as HTMLElement).style.background;
    expect(dot("genreless")).toBe(probe.style.background);
    expect(dot("genreless-child")).toBe(probe.style.background);

    expect(container.querySelector(".gtv-info-panel-title")!.textContent).toBe("Untagged");
    expect(itemOf(container, "genreless").querySelector(".gtv-outline-section-label")).toBeNull();
    expect(container.querySelectorAll("details[open]")).toHaveLength(1);
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

  it("shows each root's aggregated item count", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    expandAll(container);
    expect(itemOf(container, "root-a").querySelector(".gtv-outline-count")!.textContent).toBe("7");
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

  it("opens the info panel and fires onNodeClick on a name click, without toggling the section", () => {
    const onNodeClick = vi.fn();
    const { container } = render(<GenreTreeOutline nodes={NODES} onNodeClick={onNodeClick} />);
    fireEvent.click(nameButton(container, "root-a"));

    expect(onNodeClick).toHaveBeenCalledWith(expect.objectContaining({ id: "root-a" }), expect.any(MouseEvent));
    expect(itemOf(container, "root-a").querySelector("details")!.open).toBe(false);
    const panel = container.querySelector(".gtv-info-panel") as HTMLElement;
    expect(panel.querySelector(".gtv-info-panel-title")!.textContent).toBe("Rock");
    expect(panel.className).toContain("gtv-info-panel--left");
    expect(container.querySelector(".gtv-outline")!.className).toContain("gtv-outline--panel-open");
    expect(itemOf(container, "root-a").querySelector(".gtv-outline-row--selected")).not.toBeNull();

    fireEvent.click(within(panel).getByLabelText("Close"));
    expect(container.querySelector(".gtv-info-panel")).toBeNull();
  });

  it("hides the panel actions once a reparent starts with the panel open", () => {
    const onPlayPause = vi.fn();
    const { container, rerender } = render(<GenreTreeOutline nodes={NODES} onPlayPause={onPlayPause} />);
    fireEvent.click(nameButton(container, "root-a"));
    const panel = () => container.querySelector(".gtv-info-panel") as HTMLElement;
    expect(within(panel()).getByRole("button", { name: /play/i })).toBeTruthy();

    rerender(<GenreTreeOutline nodes={NODES} onPlayPause={onPlayPause} reparentingNodeId="b-core" />);

    expect(within(panel()).queryByRole("button", { name: /play/i })).toBeNull();
  });

  it("opens every ancestor section when navigating to a node from the panel", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    const panelChip = (name: string) => within(container.querySelector(".gtv-info-panel-mini-tree") as HTMLElement).getByText(name);
    fireEvent.click(nameButton(container, "root-a"));
    fireEvent.click(panelChip("Pop Rock"));
    const popSection = itemOf(container, "a-pop").parentElement!.closest("details")!;
    expect(popSection.querySelector(".gtv-outline-section-label")!.textContent).toBe("Pop");
    expect(container.querySelectorAll("details[open]")).toHaveLength(2);
    toggle(popSection);
    toggle(itemOf(container, "root-a").querySelector("details")!);
    expect(container.querySelectorAll("details[open]")).toHaveLength(0);

    fireEvent.click(panelChip("Rock"));
    fireEvent.click(panelChip("Punk"));
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
    expandAll(container);
    fireEvent.click(nameButton(container, "root-a"));
    const chipColor = (name: string) =>
      ((within(container.querySelector(".gtv-info-panel") as HTMLElement).getByText(name) as HTMLElement)
        .previousElementSibling as HTMLElement).style.background;
    expect(chipColor("Punk")).not.toBe(chipColor("Pop Rock"));

    fireEvent.click(nameButton(container, "pop-child"));
    const header = container.querySelector(".gtv-info-panel-header") as HTMLElement;
    expect(header.style.color).toBe("rgb(24, 24, 27)");
  });

  it("notifies onSelectedNodeChange on name click, chip navigation and close, without echoing a controlled selection", () => {
    const onSelectedNodeChange = vi.fn();
    const { container, rerender } = render(<GenreTreeOutline nodes={NODES} onSelectedNodeChange={onSelectedNodeChange} />);
    const panel = () => container.querySelector(".gtv-info-panel") as HTMLElement;

    fireEvent.click(nameButton(container, "root-a"));
    expect(onSelectedNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: "root-a" }));
    fireEvent.click(nameButton(container, "root-a"));
    expect(onSelectedNodeChange).toHaveBeenCalledTimes(1);
    fireEvent.click(within(panel()).getByText("Punk"));
    expect(onSelectedNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: "a-core" }));
    fireEvent.click(within(panel()).getByLabelText("Close"));
    expect(onSelectedNodeChange).toHaveBeenLastCalledWith(null);
    expect(onSelectedNodeChange).toHaveBeenCalledTimes(3);

    rerender(<GenreTreeOutline nodes={NODES} selectedNodeId="b-core" onSelectedNodeChange={onSelectedNodeChange} hideInfoPanelClose />);
    expect(container.querySelector(".gtv-info-panel-title")!.textContent).toBe("Bebop");
    expect(within(panel()).queryByLabelText("Close")).toBeNull();
    expect(onSelectedNodeChange).toHaveBeenCalledTimes(3);
  });

  it.each([null, undefined])("closes the panel without notifying when selectedNodeId becomes %s", (cleared) => {
    const onSelectedNodeChange = vi.fn();
    const { container, rerender } = render(
      <GenreTreeOutline nodes={NODES} selectedNodeId="b-core" onSelectedNodeChange={onSelectedNodeChange} />,
    );
    expect(container.querySelector(".gtv-info-panel")).not.toBeNull();

    rerender(<GenreTreeOutline nodes={NODES} selectedNodeId={cleared} onSelectedNodeChange={onSelectedNodeChange} />);

    expect(container.querySelector(".gtv-info-panel")).toBeNull();
    expect(onSelectedNodeChange).not.toHaveBeenCalled();
  });

  it("opens the panel for an externally-selected node and ignores unknown ids", () => {
    const { container, rerender } = render(<GenreTreeOutline nodes={NODES} selectedNodeId="missing" />);
    expect(container.querySelector(".gtv-info-panel")).toBeNull();

    rerender(<GenreTreeOutline nodes={NODES} selectedNodeId="b-core" />);
    expect(container.querySelector(".gtv-info-panel-title")!.textContent).toBe("Bebop");
    expect(itemOf(container, "root-b").querySelector("details")!.open).toBe(true);
  });
  it("fires onNodeHover on a name's pointerenter and focus", () => {
    const onNodeHover = vi.fn();
    const { container } = render(<GenreTreeOutline nodes={NODES} onNodeHover={onNodeHover} />);
    fireEvent.pointerEnter(nameButton(container, "root-a"));
    fireEvent.focus(nameButton(container, "root-b"));
    expect(onNodeHover.mock.calls.map(([node]) => node.id)).toEqual(["root-a", "root-b"]);
  });

  it("scrolls an externally-selected node into view and keeps the panel on it", () => {
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    const { container } = render(<GenreTreeOutline nodes={NODES} selectedNodeId="a-core-child" />);
    expect(container.querySelector(".gtv-info-panel-title")!.textContent).toBe("Hardcore");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts[0]).toBe(itemOf(container, "a-core-child"));

    fireEvent.click(nameButton(container, "root-b"));
    expect(container.querySelector(".gtv-info-panel-title")!.textContent).toBe("Hardcore");
  });
  it("renders overlayPanel with no node selected", () => {
    const { getByText } = render(
      <GenreTreeOutline nodes={NODES} overlayPanel={{ title: "About", content: "Overlay body", onClose: () => {} }} />,
    );
    expect(getByText("About").closest(".gtv-info-panel--expanded")).not.toBeNull();
    expect(getByText("Overlay body")).toBeTruthy();
  });
});
