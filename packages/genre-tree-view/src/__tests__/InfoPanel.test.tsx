import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InfoPanel } from "../InfoPanel";
import type { InfoPanelProps } from "../InfoPanel";
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

  it("omits the close button when hideClose is set", () => {
    const { queryByLabelText } = render(
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
        hideClose
      />,
    );

    expect(queryByLabelText("Close")).toBeNull();
  });

  it("hides the header title when hideTitle is set", () => {
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
        hideTitle
      />,
    );

    expect(container.querySelector(".gtv-info-panel-title")?.classList.contains("gtv-info-panel-title--hidden")).toBe(true);
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

    expect(getByText("0 child")).toBeTruthy();
    expect(container.querySelector(".gtv-info-panel-children-list")).toBeNull();
  });

  it("collapses and re-expands the Family section from its chevron toggle", () => {
    const { container, getByRole } = render(
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
    const toggle = getByRole("button", { name: "Family" });

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".gtv-info-panel-mini-tree")).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".gtv-info-panel-mini-tree")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".gtv-info-panel-mini-tree")).not.toBeNull();
  });

  it("marks the current node as a leaf (no outgoing branch) when it has no children", () => {
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

    expect(container.querySelector(".gtv-info-panel-mini-tree-node--leaf")).not.toBeNull();
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
    ).toHaveLength(2);
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

    expect(getByText("2 children")).toBeTruthy();
    const altRock = getByText("Alt Rock");
    expect(altRock.closest(".gtv-info-panel-child")).toBeTruthy();
    expect((altRock.previousElementSibling as HTMLElement).style.backgroundColor).toBe("rgb(79, 70, 229)");
    const indieRock = getByText("Indie Rock");
    expect((indieRock.previousElementSibling as HTMLElement).style.backgroundColor).toBe("rgb(241, 240, 253)");
  });

  it("lists the largest child first", () => {
    const { container } = render(
      <InfoPanel
        node={FULL_NODE}
        fill="#4F46E5"
        textColor="#FFFFFF"
        parentNode={null}
        childNodes={[...CHILD_NODES].reverse()}
        ancestorNodes={[]}
        side="left"
        onClose={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );

    const names = Array.from(container.querySelectorAll(".gtv-info-panel-children-list .gtv-info-panel-mini-label")).map(
      (label) => label.textContent,
    );
    expect(names).toEqual(["Alt Rock", "Indie Rock"]);
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

    const parentChip = getByText("Music");
    expect(parentChip.closest(".gtv-info-panel-child")).toBeTruthy();
    expect((parentChip.previousElementSibling as HTMLElement).style.backgroundColor).toBe("rgb(17, 24, 39)");
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

  it("renders the current node as a non-clickable card between parent and children, sized by item count", () => {
    const { container, getByText } = render(
      <InfoPanel
        node={FULL_NODE}
        fill="#4F46E5"
        textColor="#FFFFFF"
        parentNode={PARENT_NODE}
        childNodes={CHILD_NODES}
        ancestorNodes={[]}
        side="left"
        onClose={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );

    const current = container.querySelector(".gtv-info-panel-mini-tree-current") as HTMLElement;
    expect(current.tagName).toBe("SPAN");
    expect(current.textContent).toBe("Rock");
    const height = (el: HTMLElement) =>
      parseFloat((el.parentElement!.querySelector(".gtv-info-panel-mini-dot") as HTMLElement).style.height);
    expect(height(getByText("Music"))).toBe(32);
    expect(height(getByText("Indie Rock"))).toBe(14);
    expect(height(getByText("Alt Rock"))).toBeGreaterThan(height(getByText("Indie Rock")));
    expect(height(current)).toBeGreaterThan(height(getByText("Alt Rock")));
    expect(height(current)).toBeLessThan(height(getByText("Music")));
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

  it("lists each ancestor root-first as a circle node filled with its own color and log-sized by its song count", () => {
    const { container, getByText } = render(
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
    const items = container.querySelectorAll<HTMLElement>(".gtv-info-panel-ancestors-list li");
    expect(Array.from(items, (item) => item.textContent)).toEqual(["Music", "Genres"]);
    const [musicDot, genresDot] = Array.from(items, (item) =>
      item.querySelector<HTMLElement>(".gtv-info-panel-child .gtv-info-panel-mini-dot"),
    );
    expect(musicDot?.style.backgroundColor).toBe("rgb(17, 24, 39)");
    expect(genresDot?.style.backgroundColor).toBe("rgb(79, 70, 229)");
    expect(parseFloat(musicDot?.style.width ?? "")).toBeGreaterThan(parseFloat(genresDot?.style.width ?? ""));
  });

  it("collapses and re-expands the Ancestors section from its chevron toggle", () => {
    const { container, getByRole } = render(
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
    const toggle = getByRole("button", { name: "Ancestors" });

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".gtv-info-panel-ancestors-list")).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".gtv-info-panel-ancestors-list")).toBeNull();
    expect(container.querySelector(".gtv-info-panel-mini-tree")).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".gtv-info-panel-ancestors-list")).not.toBeNull();
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

  describe("edit mode", () => {
    function renderPanel(props: Partial<InfoPanelProps> = {}) {
      return render(
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
          renderTitleEditor={(node) => <input aria-label="Genre name" defaultValue={node.name} />}
          renderParentsEditor={() => <p>Parents editor</p>}
          renderDangerZone={() => <p>Danger zone</p>}
          {...props}
        />,
      );
    }

    it("still shows the title editor in edit mode when hideTitle is set", () => {
      renderPanel({ editMode: true, hideTitle: true });
      expect(screen.getByLabelText("Genre name").parentElement?.classList.contains("gtv-info-panel-title--hidden")).toBe(
        false,
      );
    });

    it("marks the title slot as an overflow-visible editor area in edit mode", () => {
      renderPanel({ editMode: true });
      expect(screen.getByLabelText("Genre name").parentElement?.classList.contains("gtv-info-panel-title--editor")).toBe(
        true,
      );
    });

    it("has no Edit button without onEditModeChange", () => {
      renderPanel();
      expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    });

    it("has no Edit button when readOnly", () => {
      renderPanel({ onEditModeChange: vi.fn(), readOnly: true, editMode: true });
      expect(screen.queryByRole("button", { name: /edit|done/i })).toBeNull();
      expect(screen.queryByText("Danger zone")).toBeNull();
    });

    it("toggles via an aria-pressed Edit/Done button", () => {
      const onEditModeChange = vi.fn();
      const { rerender } = renderPanel({ onEditModeChange });
      const edit = screen.getByRole("button", { name: "Edit" });
      expect(edit.getAttribute("aria-pressed")).toBe("false");
      fireEvent.click(edit);
      expect(onEditModeChange).toHaveBeenCalledWith(true);

      rerender(
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
          editMode
          onEditModeChange={onEditModeChange}
        />,
      );
      const done = screen.getByRole("button", { name: "Done" });
      expect(done.getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(done);
      expect(onEditModeChange).toHaveBeenLastCalledWith(false);
    });

    it("renders the slots only in edit mode", () => {
      renderPanel();
      expect(screen.getAllByText("Rock").length).toBeGreaterThan(0);
      expect(screen.getByText("Music")).toBeTruthy();
      expect(screen.queryByLabelText("Genre name")).toBeNull();
      expect(screen.queryByText("Parents editor")).toBeNull();
      expect(screen.queryByText("Danger zone")).toBeNull();
    });

    it("replaces the title and Parent section and adds the danger zone in edit mode", () => {
      renderPanel({ editMode: true });
      expect(screen.getByLabelText("Genre name")).toBeTruthy();
      expect(screen.queryByText("Music")).toBeNull();
      expect(screen.getByText("Parents editor")).toBeTruthy();
      expect(screen.getByText("Danger zone")).toBeTruthy();
    });

    it("keeps the danger zone in the panel when expanded", () => {
      renderPanel({ editMode: true, expanded: true });
      expect(screen.getByText("Danger zone")).toBeTruthy();
    });
  });

  describe("expanded mode", () => {
    function renderPanel(props: Partial<InfoPanelProps> = {}) {
      return render(
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
          {...props}
        />,
      );
    }

    it("has no expand button without onExpandedChange", () => {
      renderPanel({ expanded: true });
      expect(screen.queryByRole("button", { name: /expand panel|collapse panel/i })).toBeNull();
    });

    it("toggles via Expand panel / Collapse panel", () => {
      const onExpandedChange = vi.fn();
      const { rerender } = renderPanel({ onExpandedChange });
      fireEvent.click(screen.getByRole("button", { name: "Expand panel" }));
      expect(onExpandedChange).toHaveBeenCalledWith(true);

      rerender(
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
          expanded
          onExpandedChange={onExpandedChange}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));
      expect(onExpandedChange).toHaveBeenLastCalledWith(false);
    });

    it("collapses on Escape", () => {
      const onExpandedChange = vi.fn();
      renderPanel({ expanded: true, onExpandedChange });
      fireEvent.keyDown(document, { key: "Enter" });
      expect(onExpandedChange).not.toHaveBeenCalled();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onExpandedChange).toHaveBeenCalledWith(false);
    });

    it("ignores Escape while not expanded", () => {
      const onExpandedChange = vi.fn();
      renderPanel({ onExpandedChange });
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onExpandedChange).not.toHaveBeenCalled();
    });

    it("ignores Escape while an input has focus", () => {
      const onExpandedChange = vi.fn();
      renderPanel({
        expanded: true,
        onExpandedChange,
        renderExtraDetails: () => <input aria-label="Search" />,
      });
      fireEvent.keyDown(screen.getByLabelText("Search"), { key: "Escape" });
      expect(onExpandedChange).not.toHaveBeenCalled();
    });

    it("ignores Escape while a dialog is open", () => {
      const onExpandedChange = vi.fn();
      renderPanel({
        expanded: true,
        onExpandedChange,
        renderExtraDetails: () => <div role="dialog" aria-modal="true" aria-label="Confirm" />,
      });
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onExpandedChange).not.toHaveBeenCalled();
    });

    it("ignores Escape while an alertdialog is open", () => {
      const onExpandedChange = vi.fn();
      renderPanel({
        expanded: true,
        onExpandedChange,
        renderExtraDetails: () => <div role="alertdialog" aria-label="Confirm" />,
      });
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onExpandedChange).not.toHaveBeenCalled();
    });

    it("still collapses on Escape when only a non-modal dialog exists", () => {
      const onExpandedChange = vi.fn();
      renderPanel({
        expanded: true,
        onExpandedChange,
        renderExtraDetails: () => <div role="dialog" aria-label="Popover" />,
      });
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onExpandedChange).toHaveBeenCalledWith(false);
    });

    it("ignores an Escape whose default was prevented", () => {
      const onExpandedChange = vi.fn();
      renderPanel({ expanded: true, onExpandedChange });
      const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
      event.preventDefault();
      document.dispatchEvent(event);
      expect(onExpandedChange).not.toHaveBeenCalled();
    });

    it("ignores Escape from a contenteditable target", () => {
      const onExpandedChange = vi.fn();
      renderPanel({
        expanded: true,
        onExpandedChange,
        renderExtraDetails: () => <div contentEditable suppressContentEditableWarning aria-label="Rich" role="textbox" />,
      });
      fireEvent.keyDown(screen.getByRole("textbox", { name: "Rich" }), { key: "Escape" });
      expect(onExpandedChange).not.toHaveBeenCalled();
    });

    it("uses a single column without renderExtraDetails", () => {
      const { container } = renderPanel({ expanded: true });
      expect(container.firstElementChild?.classList.contains("gtv-info-panel--expanded-solo")).toBe(true);
    });

    it("keeps two columns with renderExtraDetails", () => {
      const { container } = renderPanel({ expanded: true, renderExtraDetails: () => <p>Extra</p> });
      expect(container.firstElementChild?.classList.contains("gtv-info-panel--expanded-solo")).toBe(false);
    });
  });
});
