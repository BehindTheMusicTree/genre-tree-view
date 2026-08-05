import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { GenreTree } from "../GenreTree";
import type { GenreTreeNode } from "../types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("toolbar stays anchored while its overflow menu is open", () => {
  it("keeps #toolbar-<id> mounted after the mouseleave timeout elapses if #overflow-menu-<id> is open", () => {
    vi.useFakeTimers();
    const nodes: GenreTreeNode[] = [{ id: "root", parentId: null, name: "Root", itemCount: 3 }];
    const { container } = render(<GenreTree nodes={nodes} />);

    const nodeGroup = container.querySelector("#group-root") as unknown as SVGGElement;
    fireEvent.mouseOver(nodeGroup.querySelector("foreignObject") as unknown as SVGForeignObjectElement);

    const kebab = container.querySelector('[data-menu-key="__more"]') as HTMLButtonElement;
    fireEvent.click(kebab);
    expect(container.querySelector("#overflow-menu-root")).toBeTruthy();

    fireEvent.mouseLeave(nodeGroup);
    vi.advanceTimersByTime(150);

    expect(container.querySelector("#toolbar-root")).toBeTruthy();
    expect(container.querySelector("#overflow-menu-root")).toBeTruthy();
  });

  it("still removes the toolbar on a normal mouseleave when no overflow menu is open", () => {
    vi.useFakeTimers();
    const nodes: GenreTreeNode[] = [{ id: "root", parentId: null, name: "Root", itemCount: 3 }];
    const { container } = render(<GenreTree nodes={nodes} />);

    const nodeGroup = container.querySelector("#group-root") as unknown as SVGGElement;
    fireEvent.mouseOver(nodeGroup.querySelector("foreignObject") as unknown as SVGForeignObjectElement);
    expect(container.querySelector("#toolbar-root")).toBeTruthy();

    fireEvent.mouseLeave(nodeGroup);
    vi.advanceTimersByTime(150);

    expect(container.querySelector("#toolbar-root")).toBeFalsy();
  });

  it("keeps the toolbar mounted when the mouse re-enters the node before the mouseleave timeout fires", () => {
    // A fast movement from the node label onto the toolbar can momentarily cross an unpainted
    // gap between the two, which the browser reports as a brief mouseleave+mouseenter blip on
    // the node's <g> even though the mouse never actually left the card. The toolbar must survive
    // that blip instead of being deleted out from under the still-hovering mouse 100ms later.
    vi.useFakeTimers();
    const nodes: GenreTreeNode[] = [{ id: "root", parentId: null, name: "Root", itemCount: 3 }];
    const { container } = render(<GenreTree nodes={nodes} />);

    const nodeGroup = container.querySelector("#group-root") as unknown as SVGGElement;
    fireEvent.mouseOver(nodeGroup.querySelector("foreignObject") as unknown as SVGForeignObjectElement);
    expect(container.querySelector("#toolbar-root")).toBeTruthy();

    fireEvent.mouseLeave(nodeGroup);
    vi.advanceTimersByTime(50);
    fireEvent.mouseEnter(nodeGroup);
    vi.advanceTimersByTime(100);

    expect(container.querySelector("#toolbar-root")).toBeTruthy();
  });
});
