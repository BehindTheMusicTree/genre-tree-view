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

const MINIMAL_NODE: GenreTreeNode = { id: "root-b", parentId: null, name: "Punk", itemCount: 0 };

const CHILD_NODES: InfoPanelChild[] = [
  { node: { id: "root-a-1", parentId: "root-a", name: "Alt Rock", itemCount: 2 }, fill: "#4F46E5", textColor: "#FFFFFF" },
  { node: { id: "root-a-2", parentId: "root-a", name: "Indie Rock", itemCount: 1 }, fill: "#F1F0FD", textColor: "#18181B" },
];

describe("InfoPanel", () => {
  it("renders all fields for a fully-populated node", () => {
    const { container, getByText } = render(
      <InfoPanel node={FULL_NODE} fill="#4F46E5" textColor="#FFFFFF" childNodes={[]} side="left" onClose={vi.fn()} />,
    );

    expect(getByText("root-a")).toBeTruthy();
    expect(getByText("root")).toBeTruthy();
    expect(container.querySelectorAll(".gtv-info-panel-title")[0].textContent).toBe("Rock");
    expect(getByText("5")).toBeTruthy();
    expect(getByText("No")).toBeTruthy();
    expect(getByText("pop")).toBeTruthy();

    const header = container.querySelector(".gtv-info-panel-header") as HTMLElement;
    expect(header.style.backgroundColor).toBe("rgb(79, 70, 229)");
    expect(header.style.color).toBe("rgb(255, 255, 255)");
  });

  it("falls back to defaults for a minimal node (no parentId, actionable, or side)", () => {
    const { getByText } = render(<InfoPanel node={MINIMAL_NODE} fill="#F1F0FD" textColor="#18181B" childNodes={[]} side="left" onClose={vi.fn()} />);

    expect(getByText("—")).toBeTruthy();
    expect(getByText("Yes")).toBeTruthy();
    expect(getByText("core")).toBeTruthy();
  });

  it("fires onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(<InfoPanel node={MINIMAL_NODE} fill="#F1F0FD" textColor="#18181B" childNodes={[]} side="left" onClose={onClose} />);

    fireEvent.click(container.querySelector('[aria-label="Close"]') as HTMLButtonElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies the left modifier class when side is left", () => {
    const { container } = render(<InfoPanel node={MINIMAL_NODE} fill="#F1F0FD" textColor="#18181B" childNodes={[]} side="left" onClose={vi.fn()} />);
    const panel = container.querySelector(".gtv-info-panel");
    expect(panel?.classList.contains("gtv-info-panel--left")).toBe(true);
    expect(panel?.classList.contains("gtv-info-panel--right")).toBe(false);
  });

  it("applies the right modifier class when side is right", () => {
    const { container } = render(<InfoPanel node={MINIMAL_NODE} fill="#F1F0FD" textColor="#18181B" childNodes={[]} side="right" onClose={vi.fn()} />);
    const panel = container.querySelector(".gtv-info-panel");
    expect(panel?.classList.contains("gtv-info-panel--right")).toBe(true);
    expect(panel?.classList.contains("gtv-info-panel--left")).toBe(false);
  });

  it("shows a zero count and no list when the node has no children", () => {
    const { getByText, container } = render(
      <InfoPanel node={MINIMAL_NODE} fill="#F1F0FD" textColor="#18181B" childNodes={[]} side="left" onClose={vi.fn()} />,
    );

    expect(getByText("Children (0)")).toBeTruthy();
    expect(container.querySelector(".gtv-info-panel-children-list")).toBeNull();
  });

  it("lists each child's name as a chip styled with its own fill and text color", () => {
    const { getByText } = render(
      <InfoPanel node={FULL_NODE} fill="#4F46E5" textColor="#FFFFFF" childNodes={CHILD_NODES} side="left" onClose={vi.fn()} />,
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
});
