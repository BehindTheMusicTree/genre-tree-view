import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { GenreTreeWheel } from "../GenreTreeWheel";
import type { GenreTreeNode } from "../types";

afterEach(() => {
  cleanup();
});

const NODES: GenreTreeNode[] = [
  { id: "root-a", parentId: null, name: "Rock", itemCount: 5 },
  { id: "a-child", parentId: "root-a", name: "Punk", itemCount: 3 },
  { id: "root-b", parentId: null, name: "Electronic", itemCount: 0 },
  { id: "b-child", parentId: "root-b", name: "Techno", itemCount: 0 },
  { id: "root-c", parentId: null, name: "Jazz", itemCount: 0 },
];

function chipFor(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll(".gtv-wheel-chip")).find((el) =>
    el.textContent?.startsWith(name),
  ) as HTMLButtonElement;
}

function getTransformDiv(container: HTMLElement) {
  return (container.querySelector(".gtv-wheel-stage") as HTMLElement).parentElement as HTMLElement;
}

function getScale(div: HTMLElement) {
  const match = div.style.transform.match(/scale\(([^)]+)\)/);
  return match ? Number(match[1]) : NaN;
}

// jsdom's getBoundingClientRect() always returns all-zero rects, which isn't enough to exercise
// fit-to-frame's actual scale computation — this fakes real rects for specific elements, keyed by
// identity since GenreTreeWheel has several DOM nodes of the same tag.
const makeRect = (left: number, top: number, width: number, height: number): DOMRect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  x: left,
  y: top,
  toJSON: () => ({}),
});

describe("GenreTreeWheel", () => {
  it("renders a chip for every root, including the selected one, and only that root's descendant nodes", () => {
    const { container } = render(<GenreTreeWheel nodes={NODES} />);
    expect(container.querySelectorAll(".gtv-wheel-chip").length).toBe(3);
    expect(chipFor(container, "Rock")).toBeTruthy();
    expect(chipFor(container, "Rock")!.className).toContain("gtv-wheel-chip--selected");
    expect(chipFor(container, "Electronic")).toBeTruthy();
    expect(chipFor(container, "Jazz")).toBeTruthy();
    // The selected root's own card is hidden — its tree grows directly out of its chip — but
    // its descendants still render.
    expect(container.querySelector("#group-root-a")).toBeFalsy();
    expect(container.querySelector("#group-a-child")).toBeTruthy();
    expect(container.querySelector("#group-root-b")).toBeFalsy();
    expect(container.querySelector("#group-root-c")).toBeFalsy();
  });

  it("fires onRootSelect on mount with the default root", () => {
    const onRootSelect = vi.fn();
    render(<GenreTreeWheel nodes={NODES} onRootSelect={onRootSelect} />);
    expect(onRootSelect).toHaveBeenCalledWith("root-a");
  });

  it("swaps the visible subtree and fires onRootSelect when a different chip is clicked", () => {
    const onRootSelect = vi.fn();
    const { container } = render(<GenreTreeWheel nodes={NODES} onRootSelect={onRootSelect} />);

    fireEvent.click(chipFor(container, "Electronic"));

    expect(container.querySelector("#group-root-a")).toBeFalsy();
    expect(container.querySelector("#group-root-b")).toBeFalsy();
    expect(container.querySelector("#group-b-child")).toBeTruthy();
    expect(onRootSelect).toHaveBeenLastCalledWith("root-b");
    expect(chipFor(container, "Electronic").className).toContain("gtv-wheel-chip--selected");
    expect(chipFor(container, "Rock").className).not.toContain("gtv-wheel-chip--selected");
  });

  it("updates the wheel's rotation custom property after a click", () => {
    const { container } = render(<GenreTreeWheel nodes={NODES} />);
    const wheel = container.querySelector(".gtv-wheel") as HTMLElement;
    expect(wheel.style.getPropertyValue("--gtv-wheel-rotation")).toBe("0deg");

    fireEvent.click(chipFor(container, "Electronic"));

    expect(wheel.style.getPropertyValue("--gtv-wheel-rotation")).not.toBe("0deg");
  });

  it("falls back to the first remaining root when the selected root disappears from nodes", () => {
    const { container, rerender } = render(<GenreTreeWheel nodes={NODES} />);
    fireEvent.click(chipFor(container, "Jazz"));
    expect(chipFor(container, "Jazz").className).toContain("gtv-wheel-chip--selected");

    const withoutRootC = NODES.filter((n) => n.id !== "root-c");
    rerender(<GenreTreeWheel nodes={withoutRootC} />);

    expect(chipFor(container, "Jazz")).toBeUndefined();
    expect(chipFor(container, "Rock").className).toContain("gtv-wheel-chip--selected");
  });

  it("renders no chips and mounts no subtree when nodes is empty", () => {
    const onRootSelect = vi.fn();
    const { container } = render(<GenreTreeWheel nodes={[]} onRootSelect={onRootSelect} />);
    expect(container.querySelectorAll(".gtv-wheel-chip").length).toBe(0);
    expect(container.querySelectorAll("g.node").length).toBe(0);
    expect(onRootSelect).not.toHaveBeenCalled();
  });

  it("falls back to no selection when every root is removed from nodes", () => {
    const { container, rerender } = render(<GenreTreeWheel nodes={NODES} />);
    rerender(<GenreTreeWheel nodes={[]} />);
    expect(container.querySelectorAll(".gtv-wheel-chip").length).toBe(0);
    expect(container.querySelectorAll("g.node").length).toBe(0);
  });

  it("ctrl+wheel scales the shared stage that anchors both the tree and the wheel", () => {
    const { container } = render(<GenreTreeWheel nodes={NODES} />);
    const wheelContainer = container.querySelector(".gtv-wheel-container") as HTMLElement;
    const transformDiv = getTransformDiv(container);
    const baseScale = getScale(transformDiv);

    fireEvent.wheel(wheelContainer, { ctrlKey: true, deltaY: -100, clientX: 50, clientY: 50 });

    expect(getScale(transformDiv)).toBeGreaterThan(baseScale);
  });

  it("drag-panning the container moves the shared stage that both the tree and wheel sit inside", () => {
    const { container } = render(<GenreTreeWheel nodes={NODES} />);
    const wheelContainer = container.querySelector(".gtv-wheel-container") as HTMLElement;
    const transformDiv = getTransformDiv(container);
    const stage = container.querySelector(".gtv-wheel-stage") as HTMLElement;

    fireEvent.pointerDown(wheelContainer, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 70 });
    fireEvent.pointerUp(window);

    expect(transformDiv.style.transform).toContain("translate(-20px, -30px)");
    expect(transformDiv.contains(stage.querySelector(".gtv-wheel-tree-anchor"))).toBe(true);
    expect(transformDiv.contains(stage.querySelector(".gtv-wheel"))).toBe(true);
  });

  it("does not start a pan drag from a pointerdown on a wheel chip", () => {
    const { container } = render(<GenreTreeWheel nodes={NODES} />);
    const transformDiv = getTransformDiv(container);
    const chip = chipFor(container, "Electronic");

    fireEvent.pointerDown(chip, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 70 });
    fireEvent.pointerUp(window);

    expect(transformDiv.style.transform).toBe("translate(0px, 0px) scale(1)");
  });

  it("zoom-in button scales the shared stage, keeping the tree and wheel visually linked", () => {
    const { container } = render(<GenreTreeWheel nodes={NODES} />);
    const transformDiv = getTransformDiv(container);
    const baseScale = getScale(transformDiv);

    fireEvent.click(container.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement);

    expect(getScale(transformDiv)).toBeGreaterThan(baseScale);
  });

  it("draws the wheel's circle outline", () => {
    const { container } = render(<GenreTreeWheel nodes={NODES} />);
    expect(container.querySelector(".gtv-wheel-circle")).toBeTruthy();
  });

  it("renders an optional center label, and omits it when not provided", () => {
    const { container, rerender } = render(<GenreTreeWheel nodes={NODES} />);
    expect(container.querySelector(".gtv-wheel-center-label")).toBeFalsy();

    rerender(<GenreTreeWheel nodes={NODES} centerLabel="TheMusicTree" />);
    expect(container.querySelector(".gtv-wheel-center-label")?.textContent).toBe("TheMusicTree");
  });

  it("still routes node actions from the visible subtree through to the forwarded callback", () => {
    const onPlayPause = vi.fn();
    const { container } = render(<GenreTreeWheel nodes={NODES} onPlayPause={onPlayPause} />);

    const nodeGroup = container.querySelector("#group-a-child") as SVGGElement;
    fireEvent.mouseOver(nodeGroup.querySelector("foreignObject") as SVGForeignObjectElement);
    const playButton = container.querySelector('#toolbar-a-child [data-menu-key="play"]') as HTMLButtonElement;
    fireEvent.click(playButton);

    expect(onPlayPause).toHaveBeenCalledWith("a-child");
  });

  it("sizes a root's chip from its whole subtree's item count, not just its own", () => {
    // root-empty has itemCount 0 itself but a child carrying the whole subtree's items — its
    // chip should size (and scale the shared range) off that aggregated total, not read as 0.
    const nodesWithZeroRoot: GenreTreeNode[] = [
      { id: "root-empty", parentId: null, name: "Empty", itemCount: 0 },
      { id: "empty-child", parentId: "root-empty", name: "Filled", itemCount: 9 },
      { id: "root-flat", parentId: null, name: "Flat", itemCount: 0 },
    ];
    const { container } = render(<GenreTreeWheel nodes={nodesWithZeroRoot} />);

    const emptyChip = chipFor(container, "Empty");
    const flatChip = chipFor(container, "Flat");

    expect(emptyChip.style.width).not.toBe(flatChip.style.width);
    expect(parseFloat(emptyChip.style.width)).toBeGreaterThan(parseFloat(flatChip.style.width));
  });

  it("fit-to-frame button rescales the shared transform to fit the circle and tree anchor", () => {
    const { container } = render(<GenreTreeWheel nodes={NODES} />);
    const wheelContainer = container.querySelector(".gtv-wheel-container") as HTMLElement;
    const circle = container.querySelector(".gtv-wheel-circle") as HTMLElement;
    const transformDiv = getTransformDiv(container);
    const baseScale = getScale(transformDiv);

    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      if (this === wheelContainer) return makeRect(0, 0, 800, 600);
      if (this === circle) return makeRect(0, 200, 1200, 1200);
      if (this.matches(".gtv-node-rect, .gtv-link")) return makeRect(200, 0, 400, 200);
      return makeRect(0, 0, 0, 0);
    });

    fireEvent.click(container.querySelector('[aria-label="Fit to frame"]') as HTMLButtonElement);

    expect(getScale(transformDiv)).toBeLessThan(baseScale);

    rectSpy.mockRestore();
  });

  it("fit-to-frame is a no-op when no target element is measurable", () => {
    const { container } = render(<GenreTreeWheel nodes={NODES} />);
    const transformDiv = getTransformDiv(container);
    const baseScale = getScale(transformDiv);

    fireEvent.click(container.querySelector('[aria-label="Fit to frame"]') as HTMLButtonElement);

    expect(getScale(transformDiv)).toBe(baseScale);
  });
});
