import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { InfoPanel } from "../InfoPanel";
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

describe("InfoPanel", () => {
  it("renders all fields for a fully-populated node", () => {
    const { container, getByText } = render(<InfoPanel node={FULL_NODE} side="left" onClose={vi.fn()} />);

    expect(getByText("root-a")).toBeTruthy();
    expect(getByText("root")).toBeTruthy();
    expect(container.querySelectorAll(".gtv-info-panel-title")[0].textContent).toBe("Rock");
    expect(getByText("5")).toBeTruthy();
    expect(getByText("No")).toBeTruthy();
    expect(getByText("pop")).toBeTruthy();
  });

  it("falls back to defaults for a minimal node (no parentId, actionable, or side)", () => {
    const { getByText } = render(<InfoPanel node={MINIMAL_NODE} side="left" onClose={vi.fn()} />);

    expect(getByText("—")).toBeTruthy();
    expect(getByText("Yes")).toBeTruthy();
    expect(getByText("core")).toBeTruthy();
  });

  it("fires onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(<InfoPanel node={MINIMAL_NODE} side="left" onClose={onClose} />);

    fireEvent.click(container.querySelector('[aria-label="Close"]') as HTMLButtonElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies the left modifier class when side is left", () => {
    const { container } = render(<InfoPanel node={MINIMAL_NODE} side="left" onClose={vi.fn()} />);
    const panel = container.querySelector(".gtv-info-panel");
    expect(panel?.classList.contains("gtv-info-panel--left")).toBe(true);
    expect(panel?.classList.contains("gtv-info-panel--right")).toBe(false);
  });

  it("applies the right modifier class when side is right", () => {
    const { container } = render(<InfoPanel node={MINIMAL_NODE} side="right" onClose={vi.fn()} />);
    const panel = container.querySelector(".gtv-info-panel");
    expect(panel?.classList.contains("gtv-info-panel--right")).toBe(true);
    expect(panel?.classList.contains("gtv-info-panel--left")).toBe(false);
  });
});
