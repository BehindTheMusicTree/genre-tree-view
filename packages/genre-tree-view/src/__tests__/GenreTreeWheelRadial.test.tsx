import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { GenreTreeWheelRadial } from "../GenreTreeWheelRadial";
import type { GenreTreeNode } from "../types";

afterEach(() => {
  cleanup();
});

const NODES_UNDER_FOUR: GenreTreeNode[] = [
  { id: "root-a", parentId: null, name: "Rock", itemCount: 5 },
  { id: "a-child", parentId: "root-a", name: "Punk", itemCount: 3 },
  { id: "root-b", parentId: null, name: "Electronic", itemCount: 0 },
  { id: "b-child", parentId: "root-b", name: "Techno", itemCount: 0 },
  { id: "root-c", parentId: null, name: "Jazz", itemCount: 0 },
  { id: "c-child", parentId: "root-c", name: "Bebop", itemCount: 0 },
];

// 5 roots, ring order a,b,c,d,e — with the default top root (a, index 0), cardinal ring offsets
// are [0,1,3,4] (getCardinalRingOffsets(5)), so c (ring index 2) is the one arc-filler chip.
const NODES_FIVE: GenreTreeNode[] = [
  { id: "root-a", parentId: null, name: "Rock", itemCount: 5 },
  { id: "a-child", parentId: "root-a", name: "Punk", itemCount: 3 },
  { id: "root-b", parentId: null, name: "Electronic", itemCount: 0 },
  { id: "b-child", parentId: "root-b", name: "Techno", itemCount: 0 },
  { id: "root-c", parentId: null, name: "Jazz", itemCount: 0 },
  { id: "c-child", parentId: "root-c", name: "Bebop", itemCount: 0 },
  { id: "root-d", parentId: null, name: "Folk", itemCount: 0 },
  { id: "d-child", parentId: "root-d", name: "Bluegrass", itemCount: 0 },
  { id: "root-e", parentId: null, name: "Metal", itemCount: 0 },
  { id: "e-child", parentId: "root-e", name: "Doom", itemCount: 0 },
];

// 6 roots, ring order a..f — with the default top root (a, index 0), cardinal ring offsets are
// [0,2,3,5] (getCardinalRingOffsets(6)), landing at 90deg (right): a=90, c=180, d=270, f=0(top),
// with b/e as arc fillers at 135/315. Clicking b (topIndex -> 1) moves f from the top cardinal
// (raw 0deg) to a filler slot at raw 315deg — a scenario that only a continuous-angle chip that
// unwraps to -45deg (not 315deg) takes the correct short path for.
const NODES_SIX: GenreTreeNode[] = [
  { id: "root-a", parentId: null, name: "Rock", itemCount: 5 },
  { id: "a-child", parentId: "root-a", name: "Punk", itemCount: 3 },
  { id: "root-b", parentId: null, name: "Electronic", itemCount: 0 },
  { id: "b-child", parentId: "root-b", name: "Techno", itemCount: 0 },
  { id: "root-c", parentId: null, name: "Jazz", itemCount: 0 },
  { id: "c-child", parentId: "root-c", name: "Bebop", itemCount: 0 },
  { id: "root-d", parentId: null, name: "Folk", itemCount: 0 },
  { id: "d-child", parentId: "root-d", name: "Bluegrass", itemCount: 0 },
  { id: "root-e", parentId: null, name: "Metal", itemCount: 0 },
  { id: "e-child", parentId: "root-e", name: "Doom", itemCount: 0 },
  { id: "root-f", parentId: null, name: "Blues", itemCount: 0 },
  { id: "f-child", parentId: "root-f", name: "Delta", itemCount: 0 },
];

function chipFor(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll(".gtv-wheel-chip")).find((el) =>
    el.textContent?.startsWith(name),
  ) as HTMLButtonElement;
}

function anchors(container: HTMLElement) {
  return Array.from(container.querySelectorAll(".gtv-wheel-radial-tree-anchor")) as HTMLElement[];
}

function getTransformDiv(container: HTMLElement) {
  return (container.querySelector(".gtv-wheel-stage") as HTMLElement).parentElement as HTMLElement;
}

function getScale(div: HTMLElement) {
  const match = div.style.transform.match(/scale\(([^)]+)\)/);
  return match ? Number(match[1]) : NaN;
}

// jsdom's getBoundingClientRect() always returns all-zero rects, which isn't enough to exercise
// fit-to-frame's actual scale computation — this fakes real rects keyed by identity/class.
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

describe("GenreTreeWheelRadial", () => {
  it("develops every root when there are fewer than 4, one anchor per root", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_UNDER_FOUR} />);

    expect(container.querySelectorAll(".gtv-wheel-chip").length).toBe(3);
    expect(chipFor(container, "Rock").className).toContain("gtv-wheel-chip--selected");
    expect(chipFor(container, "Electronic").className).toContain("gtv-wheel-chip--selected");
    expect(chipFor(container, "Jazz").className).toContain("gtv-wheel-chip--selected");
    expect(anchors(container).length).toBe(3);

    // Each root's own card is hidden (it grows out of its chip) but its descendants render.
    expect(container.querySelector("#group-root-a")).toBeFalsy();
    expect(container.querySelector("#group-a-child")).toBeTruthy();
    expect(container.querySelector("#group-b-child")).toBeTruthy();
    expect(container.querySelector("#group-c-child")).toBeTruthy();
  });

  it("develops exactly 4 roots when there are 5 or more, leaving the rest as plain chips", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);

    expect(container.querySelectorAll(".gtv-wheel-chip").length).toBe(5);
    expect(anchors(container).length).toBe(4);
    for (const name of ["Rock", "Electronic", "Folk", "Metal"]) {
      expect(chipFor(container, name).className).toContain("gtv-wheel-chip--selected");
    }
    expect(chipFor(container, "Jazz").className).not.toContain("gtv-wheel-chip--selected");
    expect(container.querySelector("#group-c-child")).toBeFalsy();
  });

  it("the just-clicked root lands on the right at full opacity; the other developed roots are secondary", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);

    const rightAnchor = container.querySelector(".gtv-wheel-radial-tree-anchor--right") as HTMLElement;
    expect(rightAnchor.className).not.toContain("gtv-wheel-radial-tree-anchor--secondary");
    expect(rightAnchor.querySelector("#group-a-child")).toBeTruthy();

    for (const direction of ["top", "bottom", "left"]) {
      const anchor = container.querySelector(`.gtv-wheel-radial-tree-anchor--${direction}`) as HTMLElement;
      expect(anchor.className).toContain("gtv-wheel-radial-tree-anchor--secondary");
    }
  });

  it("clicking an undeveloped chip develops it and re-lays-out the ring so it lands on the right", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);

    expect(container.querySelector("#group-c-child")).toBeFalsy();

    fireEvent.click(chipFor(container, "Jazz"));

    const rightAnchor = container.querySelector(".gtv-wheel-radial-tree-anchor--right") as HTMLElement;
    expect(rightAnchor.querySelector("#group-c-child")).toBeTruthy();
    expect(chipFor(container, "Jazz").className).toContain("gtv-wheel-chip--selected");
    // With clickedIndex=2 (c), cardinal ring offsets [0,1,3,4] resolve to ring indices
    // {2,3,0,1} = c,d,a,b — e (index 4) is the one that falls out of the cardinals.
    expect(chipFor(container, "Metal").className).not.toContain("gtv-wheel-chip--selected");
    expect(container.querySelector("#group-e-child")).toBeFalsy();
  });

  it("carries a chip's angle across the wrap point so it transitions the short way, not the raw re-wrapped angle", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_SIX} />);

    // Initial layout (topIndex 0): Blues (f) is the top cardinal, raw/continuous angle 0deg.
    expect(
      chipFor(container, "Blues").parentElement?.parentElement?.style.getPropertyValue("--gtv-chip-angle"),
    ).toBe("0deg");

    // Clicking Electronic (b) moves the top cardinal off Blues; its new raw wrapped angle is
    // 315deg, but the short path from its previous 0deg is -45deg, not +315deg.
    fireEvent.click(chipFor(container, "Electronic"));

    expect(
      chipFor(container, "Blues").parentElement?.parentElement?.style.getPropertyValue("--gtv-chip-angle"),
    ).toBe("-45deg");
  });

  it("fires onRootSelect on mount with the default root and again on click", () => {
    const onRootSelect = vi.fn();
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} onRootSelect={onRootSelect} />);
    expect(onRootSelect).toHaveBeenCalledWith("root-a");

    fireEvent.click(chipFor(container, "Jazz"));
    expect(onRootSelect).toHaveBeenLastCalledWith("root-c");
  });

  it("falls back to the first remaining root when the top root disappears from nodes", () => {
    const { container, rerender } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);
    fireEvent.click(chipFor(container, "Metal"));
    expect(chipFor(container, "Metal").className).toContain("gtv-wheel-chip--selected");

    const withoutMetal = NODES_FIVE.filter((n) => n.id !== "root-e" && n.id !== "e-child");
    rerender(<GenreTreeWheelRadial nodes={withoutMetal} />);

    expect(chipFor(container, "Metal")).toBeUndefined();
    const rightAnchor = container.querySelector(".gtv-wheel-radial-tree-anchor--right") as HTMLElement;
    expect(rightAnchor.querySelector("#group-a-child")).toBeTruthy();
  });

  it("renders no chips and mounts no anchors when nodes is empty", () => {
    const onRootSelect = vi.fn();
    const { container } = render(<GenreTreeWheelRadial nodes={[]} onRootSelect={onRootSelect} />);
    expect(container.querySelectorAll(".gtv-wheel-chip").length).toBe(0);
    expect(anchors(container).length).toBe(0);
    expect(onRootSelect).not.toHaveBeenCalled();
  });

  it("falls back to no selection when every root is removed from nodes", () => {
    const { container, rerender } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);
    rerender(<GenreTreeWheelRadial nodes={[]} />);
    expect(container.querySelectorAll(".gtv-wheel-chip").length).toBe(0);
    expect(anchors(container).length).toBe(0);
  });

  it("ctrl+wheel scales the shared stage that anchors both the trees and the wheel", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);
    const wheelContainer = container.querySelector(".gtv-wheel-container") as HTMLElement;
    const transformDiv = getTransformDiv(container);
    const baseScale = getScale(transformDiv);

    fireEvent.wheel(wheelContainer, { ctrlKey: true, deltaY: -100, clientX: 50, clientY: 50 });

    expect(getScale(transformDiv)).toBeGreaterThan(baseScale);
  });

  it("drag-panning the container moves the shared stage that the trees and wheel sit inside", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);
    const wheelContainer = container.querySelector(".gtv-wheel-container") as HTMLElement;
    const transformDiv = getTransformDiv(container);
    const stage = container.querySelector(".gtv-wheel-stage") as HTMLElement;

    fireEvent.pointerDown(wheelContainer, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 70 });
    fireEvent.pointerUp(window);

    expect(transformDiv.style.transform).toContain("translate(-20px, -30px)");
    expect(transformDiv.contains(stage.querySelector(".gtv-wheel"))).toBe(true);
    expect(anchors(container).every((anchor) => transformDiv.contains(anchor))).toBe(true);
  });

  it("does not start a pan drag from a pointerdown on a wheel chip", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);
    const transformDiv = getTransformDiv(container);
    const chip = chipFor(container, "Electronic");

    fireEvent.pointerDown(chip, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 70 });
    fireEvent.pointerUp(window);

    expect(transformDiv.style.transform).toBe("translate(0px, 0px) scale(1)");
  });

  it("zoom-in button scales the shared stage", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);
    const transformDiv = getTransformDiv(container);
    const baseScale = getScale(transformDiv);

    fireEvent.click(container.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement);

    expect(getScale(transformDiv)).toBeGreaterThan(baseScale);
  });

  it("draws the wheel's circle outline", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);
    expect(container.querySelector(".gtv-wheel-circle")).toBeTruthy();
  });

  it("renders an optional center label, and omits it when not provided", () => {
    const { container, rerender } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);
    expect(container.querySelector(".gtv-wheel-center-label")).toBeFalsy();

    rerender(<GenreTreeWheelRadial nodes={NODES_FIVE} centerLabel="TheMusicTree" />);
    expect(container.querySelector(".gtv-wheel-center-label")?.textContent).toBe("TheMusicTree");
  });

  it("still routes node actions from a mounted subtree through to the forwarded callback", () => {
    const onPlayPause = vi.fn();
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} onPlayPause={onPlayPause} />);

    const nodeGroup = container.querySelector("#group-a-child") as SVGGElement;
    fireEvent.mouseOver(nodeGroup.querySelector("foreignObject") as SVGForeignObjectElement);
    const playButton = container.querySelector('#toolbar-a-child [data-menu-key="play"]') as HTMLButtonElement;
    fireEvent.click(playButton);

    expect(onPlayPause).toHaveBeenCalledWith("a-child");
  });

  it("renders a toolbar for each root chip and routes its actions through the forwarded callbacks", () => {
    const onPlayPause = vi.fn();
    const onAddChild = vi.fn();
    const { container } = render(
      <GenreTreeWheelRadial nodes={NODES_FIVE} onPlayPause={onPlayPause} onAddChild={onAddChild} />,
    );

    const rockAnchor = chipFor(container, "Rock").closest(".gtv-wheel-chip-anchor") as HTMLElement;
    fireEvent.click(rockAnchor.querySelector('[aria-label="Play"]') as HTMLButtonElement);
    expect(onPlayPause).toHaveBeenCalledWith("root-a");

    fireEvent.click(rockAnchor.querySelector('[aria-label="Add sub-genre"]') as HTMLButtonElement);
    expect(onAddChild).toHaveBeenCalledWith("root-a");
  });

  it("renders a hover-revealed name label inside each root chip", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);

    expect(chipFor(container, "Rock").querySelector(".gtv-wheel-chip-hover-name")!.textContent).toBe("Rock");
  });

  it("fit-to-frame button rescales the shared transform to fit the circle and every mounted anchor", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);
    const wheelContainer = container.querySelector(".gtv-wheel-container") as HTMLElement;
    const transformDiv = getTransformDiv(container);
    const baseScale = getScale(transformDiv);

    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      if (this === wheelContainer) return makeRect(0, 0, 800, 600);
      if ((this as HTMLElement).classList?.contains("gtv-wheel-circle")) return makeRect(0, 200, 1200, 1200);
      if (this.matches(".gtv-node-rect, .gtv-link")) return makeRect(200, 0, 400, 200);
      return makeRect(0, 0, 0, 0);
    });

    fireEvent.click(container.querySelector('[aria-label="Fit to frame"]') as HTMLButtonElement);

    expect(getScale(transformDiv)).toBeLessThan(baseScale);

    rectSpy.mockRestore();
  });

  it("fit-to-frame is a no-op when no target element is measurable", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);
    const transformDiv = getTransformDiv(container);
    const baseScale = getScale(transformDiv);

    fireEvent.click(container.querySelector('[aria-label="Fit to frame"]') as HTMLButtonElement);

    expect(getScale(transformDiv)).toBe(baseScale);
  });
});
