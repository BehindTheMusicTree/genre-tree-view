import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { InfoPanel } from "../InfoPanel";
import type { InfoPanelChild } from "../InfoPanel";
import type { GenreTreeNode } from "../types";

afterEach(() => {
  cleanup();
});

const FULL_NODE: GenreTreeNode = {
  id: "root-a",
  parentId: "root",
  name: "Rock",
  itemCount: 5,
  actionable: false,
  side: "pop",
};

const MINIMAL_NODE: GenreTreeNode = {
  id: "root-b",
  parentId: null,
  name: "Punk",
  itemCount: 0,
};

const CHILD_NODES: InfoPanelChild[] = [
  {
    node: {
      id: "root-a-1",
      parentId: "root-a",
      name: "Alt Rock",
      itemCount: 2,
    },
    fill: "#4F46E5",
    textColor: "#FFFFFF",
  },
  {
    node: {
      id: "root-a-2",
      parentId: "root-a",
      name: "Indie Rock",
      itemCount: 1,
    },
    fill: "#F1F0FD",
    textColor: "#18181B",
  },
];

const PARENT_NODE: InfoPanelChild = {
  node: { id: "root", parentId: null, name: "Music", itemCount: 10 },
  fill: "#111827",
  textColor: "#FFFFFF",
};

const ANCESTOR_NODES: InfoPanelChild[] = [
  {
    node: { id: "root", parentId: null, name: "Music", itemCount: 20 },
    fill: "#111827",
    textColor: "#FFFFFF",
  },
  {
    node: { id: "root-genre", parentId: "root", name: "Genres", itemCount: 15 },
    fill: "#4F46E5",
    textColor: "#FFFFFF",
  },
];

describe("InfoPanel", () => {
  it("renders all fields for a fully-populated node", () => {
    const { container, getByText } = render(
      <InfoPanel
        node={FULL_NODE}
        fill="#4F46E5"
        textColor="#FFFFFF"
        parentNode={null}
        childNodes={[]}
        ancestorNodes={[]}
        side="left"
        onClose={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(
      container.querySelectorAll(".gtv-info-panel-title")[0].textContent,
    ).toBe("Rock");
    expect(getByText("5")).toBeTruthy();
    expect(getByText("pop")).toBeTruthy();

    const header = container.querySelector(
      ".gtv-info-panel-header",
    ) as HTMLElement;
    expect(header.style.backgroundColor).toBe("rgb(79, 70, 229)");
    expect(header.style.color).toBe("rgb(255, 255, 255)");
  });

  it("falls back to defaults for a minimal node (no actionable or side)", () => {
    const { getByText } = render(
      <InfoPanel
        node={MINIMAL_NODE}
        fill="#F1F0FD"
        textColor="#18181B"
        parentNode={null}
        childNodes={[]}
        ancestorNodes={[]}
        side="left"
        onClose={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(getByText("core")).toBeTruthy();
  });

  it("fires onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <InfoPanel
        node={MINIMAL_NODE}
        fill="#F1F0FD"
        textColor="#18181B"
        parentNode={null}
        childNodes={[]}
        ancestorNodes={[]}
        side="left"
        onClose={onClose}
        onSelectNode={vi.fn()}
      />,
    );

    fireEvent.click(
      container.querySelector('[aria-label="Close"]') as HTMLButtonElement,
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies the left modifier class when side is left", () => {
    const { container } = render(
      <InfoPanel
        node={MINIMAL_NODE}
        fill="#F1F0FD"
        textColor="#18181B"
        parentNode={null}
        childNodes={[]}
        ancestorNodes={[]}
        side="left"
        onClose={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );
    const panel = container.querySelector(".gtv-info-panel");
    expect(panel?.classList.contains("gtv-info-panel--left")).toBe(true);
    expect(panel?.classList.contains("gtv-info-panel--right")).toBe(false);
  });

  it("shows a zero count and no list when the node has no children", () => {
    const { getByText, container } = render(
      <InfoPanel
        node={MINIMAL_NODE}
        fill="#F1F0FD"
        textColor="#18181B"
        parentNode={null}
        childNodes={[]}
        ancestorNodes={[]}
        side="left"
        onClose={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(getByText("Children (0)")).toBeTruthy();
    expect(container.querySelector(".gtv-info-panel-children-list")).toBeNull();
  });

  it("omits the parent section when there is no parent", () => {
    const { container, queryByText } = render(
      <InfoPanel
        node={MINIMAL_NODE}
        fill="#F1F0FD"
        textColor="#18181B"
        parentNode={null}
        childNodes={[]}
        ancestorNodes={[]}
        side="left"
        onClose={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(queryByText("Parent")).toBeNull();
    expect(
      container.querySelectorAll(".gtv-info-panel-children-title"),
    ).toHaveLength(1);
  });

  it("lists each child's name as a chip styled with its own fill and text color", () => {
    const { getByText } = render(
      <InfoPanel
        node={FULL_NODE}
        fill="#4F46E5"
        textColor="#FFFFFF"
        parentNode={null}
        childNodes={CHILD_NODES}
        ancestorNodes={[]}
        side="left"
        onClose={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(getByText("Children (2)")).toBeTruthy();
    const altRock = getByText("Alt Rock");
    expect(altRock.classList.contains("gtv-info-panel-child")).toBe(true);
    expect(altRock.style.backgroundColor).toBe("rgb(79, 70, 229)");
    expect(altRock.style.color).toBe("rgb(255, 255, 255)");
    const indieRock = getByText("Indie Rock");
    expect(indieRock.style.backgroundColor).toBe("rgb(241, 240, 253)");
    expect(indieRock.style.color).toBe("rgb(24, 24, 27)");
  });

  it("renders the parent as a chip styled with its own fill and text color", () => {
    const { getByText } = render(
      <InfoPanel
        node={FULL_NODE}
        fill="#4F46E5"
        textColor="#FFFFFF"
        parentNode={PARENT_NODE}
        childNodes={[]}
        ancestorNodes={[]}
        side="left"
        onClose={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(getByText("Parent")).toBeTruthy();
    const parentChip = getByText("Music");
    expect(parentChip.classList.contains("gtv-info-panel-child")).toBe(true);
    expect(parentChip.style.backgroundColor).toBe("rgb(17, 24, 39)");
    expect(parentChip.style.color).toBe("rgb(255, 255, 255)");
  });

  it("fires onSelectNode with the parent's id when the parent chip is clicked", () => {
    const onSelectNode = vi.fn();
    const { getByText } = render(
      <InfoPanel
        node={FULL_NODE}
        fill="#4F46E5"
        textColor="#FFFFFF"
        parentNode={PARENT_NODE}
        childNodes={[]}
        ancestorNodes={[]}
        side="left"
        onClose={vi.fn()}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.click(getByText("Music"));
    expect(onSelectNode).toHaveBeenCalledTimes(1);
    expect(onSelectNode).toHaveBeenCalledWith("root");
  });

  it("fires onSelectNode with a child's id when a child chip is clicked", () => {
    const onSelectNode = vi.fn();
    const { getByText } = render(
      <InfoPanel
        node={FULL_NODE}
        fill="#4F46E5"
        textColor="#FFFFFF"
        parentNode={null}
        childNodes={CHILD_NODES}
        ancestorNodes={[]}
        side="left"
        onClose={vi.fn()}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.click(getByText("Indie Rock"));
    expect(onSelectNode).toHaveBeenCalledTimes(1);
    expect(onSelectNode).toHaveBeenCalledWith("root-a-2");
  });

  it("omits the ancestors section when there are no ancestors", () => {
    const { queryByText } = render(
      <InfoPanel
        node={MINIMAL_NODE}
        fill="#F1F0FD"
        textColor="#18181B"
        parentNode={null}
        childNodes={[]}
        ancestorNodes={[]}
        side="left"
        onClose={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(queryByText("Ancestors")).toBeNull();
  });

  it("lists each ancestor's name, root-first, as a chip styled with its own fill and text color", () => {
    const { getByText } = render(
      <InfoPanel
        node={FULL_NODE}
        fill="#4F46E5"
        textColor="#FFFFFF"
        parentNode={null}
        childNodes={[]}
        ancestorNodes={ANCESTOR_NODES}
        side="left"
        onClose={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(getByText("Ancestors")).toBeTruthy();
    const music = getByText("Music");
    expect(music.classList.contains("gtv-info-panel-child")).toBe(true);
    expect(music.style.backgroundColor).toBe("rgb(17, 24, 39)");
    const genres = getByText("Genres");
    expect(genres.style.backgroundColor).toBe("rgb(79, 70, 229)");
  });

  it("fires onSelectNode with an ancestor's id when an ancestor chip is clicked", () => {
    const onSelectNode = vi.fn();
    const { getByText } = render(
      <InfoPanel
        node={FULL_NODE}
        fill="#4F46E5"
        textColor="#FFFFFF"
        parentNode={null}
        childNodes={[]}
        ancestorNodes={ANCESTOR_NODES}
        side="left"
        onClose={vi.fn()}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.click(getByText("Genres"));
    expect(onSelectNode).toHaveBeenCalledTimes(1);
    expect(onSelectNode).toHaveBeenCalledWith("root-genre");
  });

  it("renders renderExtraDetails' output, called with the panel's node, below the built-in sections", () => {
    const renderExtraDetails = vi.fn((node: GenreTreeNode) => (
      <div data-testid="extra-details">Essential tracks for {node.name}</div>
    ));
    const { getByTestId } = render(
      <InfoPanel
        node={FULL_NODE}
        fill="#4F46E5"
        textColor="#FFFFFF"
        parentNode={null}
        childNodes={[]}
        ancestorNodes={[]}
        side="left"
        onClose={vi.fn()}
        onSelectNode={vi.fn()}
        renderExtraDetails={renderExtraDetails}
      />,
    );

    expect(renderExtraDetails).toHaveBeenCalledWith(FULL_NODE);
    expect(getByTestId("extra-details").textContent).toBe(
      "Essential tracks for Rock",
    );
  });

  it("omits any extra section when renderExtraDetails is not passed", () => {
    const { container } = render(
      <InfoPanel
        node={MINIMAL_NODE}
        fill="#F1F0FD"
        textColor="#18181B"
        parentNode={null}
        childNodes={[]}
        ancestorNodes={[]}
        side="left"
        onClose={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-testid="extra-details"]')).toBeNull();
  });
});
