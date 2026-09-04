import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { GenreTreeWheelRadial } from "../GenreTreeWheelRadial";
import { POP_TREE_DEPTH_RADIAL_SPACING, calculateNodeFontSize, getItemCountRange } from "../constants";
import { getRadialPointOnCircle } from "../pop-core-radial-layout";
import { buildSectorClipPathPolygon } from "../radial-wheel-geometry";
import type { GenreTreeNode } from "../types";
import { linkPathEndpoints } from "./link-path-test-utils";

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

// 5 roots, ring order a,b,c,d,e, each with exactly 2 nodes (root + one child) — equal weight means
// computeRadialLayout's proportional spacing degenerates to even 72-degree steps, landing at 90deg
// (right) with the default top root (a, index 0): a=90, b=162, c=234, d=306, e=18.
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

// 6 roots, ring order a..f, each with exactly 2 nodes (root + one child) — equal weight means
// computeRadialLayout's proportional spacing degenerates to even 60-degree steps, landing at 90deg
// (right) with the default top root (a, index 0): a=90, b=150, c=210, d=270, e=330, f=30. Clicking b (topIndex -> 1)
// moves f from raw 30deg to raw 330deg — a scenario that only a continuous-angle chip that unwraps
// to -30deg (not the raw +330deg) takes the correct short path for.
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

// 3 roots with deliberately unequal weight, engineered so the ONLY thing that could make it wrong
// is weighting by group.nodes.length (root + core branch + pop branch) instead of by the rendered
// core branch alone (splitRootGroupBySide's coreNodes) — see rootWeights in
// GenreTreeWheelRadialBase.tsx. root-a has a small core (2 nodes: root + a-core) hidden behind a
// pop branch of equal size (2 nodes: a-pop + a-pop-child) that this wheel never renders, so its
// group.nodes.length (4) equals root-b's, even though root-b's core branch (4 nodes: root +
// b-core + 2 children) is actually twice as large as root-a's rendered core (2 nodes). root-c (2
// nodes, no pop) is an unweighted control. Weighting by group.nodes.length (the bug) yields ring
// weights [4, 4, 2]; weighting by rendered core nodes (the fix) yields [2, 4, 2] — different enough
// to move every non-clicked root's angle.
const NODES_UNEQUAL_POP_CORE_WEIGHT: GenreTreeNode[] = [
  { id: "root-a", parentId: null, name: "Classical", itemCount: 0 },
  { id: "a-core", parentId: "root-a", name: "Baroque", itemCount: 0 },
  { id: "a-pop", parentId: "root-a", name: "Crossover", itemCount: 0, side: "pop" },
  { id: "a-pop-child", parentId: "a-pop", name: "Neoclassical Pop", itemCount: 0 },
  { id: "root-b", parentId: null, name: "Rock", itemCount: 0 },
  { id: "b-core", parentId: "root-b", name: "Punk", itemCount: 0 },
  { id: "b-core-child1", parentId: "b-core", name: "Hardcore", itemCount: 0 },
  { id: "b-core-child2", parentId: "b-core", name: "Post-Punk", itemCount: 0 },
  { id: "root-c", parentId: null, name: "Jazz", itemCount: 0 },
  { id: "c-child", parentId: "root-c", name: "Bebop", itemCount: 0 },
];

function chipFor(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll(".gtv-wheel-chip")).find((el) =>
    el.textContent?.startsWith(name),
  ) as HTMLButtonElement;
}

function coreSectors(container: HTMLElement) {
  return Array.from(container.querySelectorAll(".gtv-wheel-core-sector")) as SVGGElement[];
}

function coreSectorForRoot(container: HTMLElement, rootId: string) {
  return container.querySelector(`.gtv-wheel-core-sector[data-gtv-root-id="${rootId}"]`) as SVGGElement | null;
}

function getWheelRadius(container: HTMLElement) {
  const wheelContainer = container.querySelector(".gtv-wheel-container") as HTMLElement;
  return parseFloat(wheelContainer.style.getPropertyValue("--gtv-wheel-radius"));
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
  it("skips a root that has no children, mounting no core sector for it", () => {
    const nodesWithChildlessRoot: GenreTreeNode[] = [
      ...NODES_UNDER_FOUR,
      { id: "root-d", parentId: null, name: "Folk", itemCount: 0 },
    ];
    const { container } = render(<GenreTreeWheelRadial nodes={nodesWithChildlessRoot} />);

    expect(coreSectors(container).length).toBe(3);
    expect(container.querySelector("#group-root-d")).toBeFalsy();
  });

  it("develops every root when there are fewer than 4, one core sector per root", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_UNDER_FOUR} />);

    expect(container.querySelectorAll(".gtv-wheel-chip").length).toBe(3);
    expect(chipFor(container, "Rock").className).toContain("gtv-wheel-chip--selected");
    expect(chipFor(container, "Electronic").className).toContain("gtv-wheel-chip--selected");
    expect(chipFor(container, "Jazz").className).toContain("gtv-wheel-chip--selected");
    expect(coreSectors(container).length).toBe(3);

    // Each root's own card is hidden (it grows out of its chip) but its descendants render.
    expect(container.querySelector("#group-root-a")).toBeFalsy();
    expect(container.querySelector("#group-a-child")).toBeTruthy();
    expect(container.querySelector("#group-b-child")).toBeTruthy();
    expect(container.querySelector("#group-c-child")).toBeTruthy();
  });

  it("still develops the lone root's core sector when there's only one root (no sibling to bisect a sector against)", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root-a", parentId: null, name: "Rock", itemCount: 5 },
      { id: "a-child", parentId: "root-a", name: "Punk", itemCount: 3 },
    ];
    const { container } = render(<GenreTreeWheelRadial nodes={nodes} />);

    expect(coreSectors(container).length).toBe(1);
    expect(container.querySelector("#group-a-child")).toBeTruthy();
  });

  it("renders a root that has both a core child and a pop-side child, without throwing d3.stratify's 'multiple roots' error", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root-a", parentId: null, name: "Rock", itemCount: 5 },
      { id: "a-core-child", parentId: "root-a", name: "Punk", itemCount: 3 },
      { id: "a-pop-child", parentId: "root-a", name: "Pop Rock", itemCount: 2, side: "pop" },
    ];

    expect(() => render(<GenreTreeWheelRadial nodes={nodes} />)).not.toThrow();
    const { container } = render(<GenreTreeWheelRadial nodes={nodes} />);

    expect(coreSectors(container).length).toBe(1);
    expect(container.querySelector("#group-a-core-child")).toBeTruthy();
  });

  it("places a root's depth-1 core child one depthSpacing step past the wheel's own radius, and grows the wheel to fit a deeper core branch", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root-a", parentId: null, name: "Small", itemCount: 1 },
      { id: "a-child", parentId: "root-a", name: "SmallChild", itemCount: 1 },
      { id: "root-b", parentId: null, name: "Big", itemCount: 500 },
      { id: "b-child", parentId: "root-b", name: "BigChild", itemCount: 500 },
    ];
    const { container } = render(<GenreTreeWheelRadial nodes={nodes} />);

    const wheelRadius = getWheelRadius(container);
    const aChild = container.querySelector("#group-a-child") as SVGGElement;
    const match = aChild.getAttribute("transform")!.match(/translate\(([^,]+),\s*([^)]+)\)/)!;
    const [x, y] = [Number(match[1]), Number(match[2])];

    expect(Math.hypot(x, y)).toBeCloseTo(wheelRadius + POP_TREE_DEPTH_RADIAL_SPACING, 5);

    const deepNodes: GenreTreeNode[] = [
      ...nodes,
      { id: "a-grandchild", parentId: "a-child", name: "SmallGrandchild", itemCount: 1 },
    ];
    const { container: deepContainer } = render(<GenreTreeWheelRadial nodes={deepNodes} />);
    expect(getWheelRadius(deepContainer)).toBeGreaterThan(wheelRadius);
  });

  it("draws a link from the root's own position (on the wheel's circle, at its chip's angle) out to its depth-1 core child", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root-a", parentId: null, name: "Rock", itemCount: 5 },
      { id: "a-child", parentId: "root-a", name: "Punk", itemCount: 3 },
    ];
    const { container } = render(<GenreTreeWheelRadial nodes={nodes} />);

    const wheelRadius = getWheelRadius(container);
    // root-a is the only (and default top) root, landing at 90deg (LANDING_ANGLE).
    const { x: rootX, y: rootY } = getRadialPointOnCircle(90, wheelRadius);

    const aChild = container.querySelector("#group-a-child") as SVGGElement;
    const match = aChild.getAttribute("transform")!.match(/translate\(([^,]+),\s*([^)]+)\)/)!;
    const [childX, childY] = [Number(match[1]), Number(match[2])];

    const links = coreSectorForRoot(container, "root-a")!.querySelectorAll("path.gtv-link");
    const rootLink = Array.from(links).find((link) => {
      const { start, end } = linkPathEndpoints(link.getAttribute("d")!);
      return (
        Math.abs(start[0] - rootX) < 1e-6 &&
        Math.abs(start[1] - rootY) < 1e-6 &&
        Math.abs(end[0] - childX) < 1e-6 &&
        Math.abs(end[1] - childY) < 1e-6
      );
    });
    expect(rootLink).toBeTruthy();
  });

  it("develops every root when there are 5 or more, one core sector per root", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);

    expect(container.querySelectorAll(".gtv-wheel-chip").length).toBe(5);
    expect(coreSectors(container).length).toBe(5);
    for (const name of ["Rock", "Electronic", "Jazz", "Folk", "Metal"]) {
      expect(chipFor(container, name).className).toContain("gtv-wheel-chip--selected");
    }
    expect(container.querySelector("#group-c-child")).toBeTruthy();
  });

  it("the just-clicked root lands on the right, at the sector for its own root id", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);

    const rightSector = coreSectorForRoot(container, "root-a");
    expect(rightSector?.querySelector("#group-a-child")).toBeTruthy();

    for (const rootId of ["root-b", "root-c", "root-d", "root-e"]) {
      expect(coreSectorForRoot(container, rootId)).toBeTruthy();
    }
  });

  it("clicking a chip re-lays-out the ring so it lands on the right", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);

    expect(coreSectorForRoot(container, "root-c")?.querySelector("#group-c-child")).toBeTruthy();

    fireEvent.click(chipFor(container, "Jazz"));

    const rightSector = coreSectorForRoot(container, "root-c");
    expect(rightSector?.querySelector("#group-c-child")).toBeTruthy();
    expect(chipFor(container, "Jazz").className).toContain("gtv-wheel-chip--selected");
    // Every root is still fully developed after re-layout, including the one that was on the
    // right before the click.
    expect(chipFor(container, "Metal").className).toContain("gtv-wheel-chip--selected");
    expect(coreSectorForRoot(container, "root-e")?.querySelector("#group-e-child")).toBeTruthy();
  });

  it("carries a chip's angle across the wrap point so it transitions the short way, not the raw re-wrapped angle", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_SIX} />);

    // Initial layout (topIndex 0): Blues (f) sits at raw/continuous angle 30deg.
    expect(
      chipFor(container, "Blues").parentElement?.parentElement?.style.getPropertyValue("--gtv-chip-angle"),
    ).toBe("30deg");

    // Clicking Electronic (b) re-lays-out the ring, moving Blues to raw 330deg — but the short
    // path from its previous 30deg is -30deg, not the raw +330deg.
    fireEvent.click(chipFor(container, "Electronic"));

    expect(
      chipFor(container, "Blues").parentElement?.parentElement?.style.getPropertyValue("--gtv-chip-angle"),
    ).toBe("-30deg");
  });

  it("weights each root's angular slice by its rendered core branch, not its hidden pop branch's node count", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_UNEQUAL_POP_CORE_WEIGHT} />);

    // root-a (the default top root) always centers on the 90deg landing angle regardless of its
    // own weight, so it can't reveal the bug — root-b and root-c can, since their angles shift
    // with every root's relative weight. Weighting by group.nodes.length ([4, 4, 2], the bug)
    // would land root-b at 234deg and root-c at 342deg; weighting by rendered core nodes ([2, 4,
    // 2], the fix) lands them at 225deg and 0deg.
    expect(
      chipFor(container, "Rock").parentElement?.parentElement?.style.getPropertyValue("--gtv-chip-angle"),
    ).toBe("225deg");
    expect(
      chipFor(container, "Jazz").parentElement?.parentElement?.style.getPropertyValue("--gtv-chip-angle"),
    ).toBe("0deg");

    // Same story for the rendered sector wash: root-b's (index 1) sector should sweep the full
    // 180deg its weight (4 of the 8 total core nodes) proportionally earns, once root-a's
    // inflated pop-inclusive weight no longer steals space from it.
    const sectors = Array.from(container.querySelectorAll(".gtv-wheel-sector")) as HTMLElement[];
    expect(sectors[1].style.clipPath).toBe(buildSectorClipPathPolygon(180));
  });

  it("fires onNodeClick with the root node's data when its chip is clicked", () => {
    const onNodeClick = vi.fn();
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} onNodeClick={onNodeClick} />);

    fireEvent.click(chipFor(container, "Jazz"));

    expect(onNodeClick).toHaveBeenCalledTimes(1);
    expect(onNodeClick.mock.calls[0][0]).toEqual(expect.objectContaining({ id: "root-c" }));
  });

  it("does not fire onNodeClick on its chip while a reparent is in progress", () => {
    const onNodeClick = vi.fn();
    const { container } = render(
      <GenreTreeWheelRadial nodes={NODES_FIVE} reparentingNodeId="root-c" onNodeClick={onNodeClick} />,
    );

    fireEvent.click(chipFor(container, "Jazz"));

    expect(onNodeClick).not.toHaveBeenCalled();
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
    const rightSector = coreSectorForRoot(container, "root-a");
    expect(rightSector?.querySelector("#group-a-child")).toBeTruthy();
  });

  it("renders no chips and mounts no anchors when nodes is empty", () => {
    const onRootSelect = vi.fn();
    const { container } = render(<GenreTreeWheelRadial nodes={[]} onRootSelect={onRootSelect} />);
    expect(container.querySelectorAll(".gtv-wheel-chip").length).toBe(0);
    expect(coreSectors(container).length).toBe(0);
    expect(onRootSelect).not.toHaveBeenCalled();
  });

  it("falls back to no selection when every root is removed from nodes", () => {
    const { container, rerender } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);
    rerender(<GenreTreeWheelRadial nodes={[]} />);
    expect(container.querySelectorAll(".gtv-wheel-chip").length).toBe(0);
    expect(coreSectors(container).length).toBe(0);
  });

  it("ctrl+wheel scales the shared stage that anchors both the core sectors and the wheel", () => {
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
    expect(coreSectors(container).every((anchor) => transformDiv.contains(anchor))).toBe(true);
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

  it("disables the zoom-in button once the maximum scale is reached", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);
    const zoomInButton = container.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement;

    for (let i = 0; i < 30; i++) {
      fireEvent.click(zoomInButton);
    }

    expect(zoomInButton.disabled).toBe(true);
    expect(zoomInButton.className).toContain("gtv-zoom-btn--disabled");
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

  it("wires the wheel-chip toolbar's font-size to the same value calculateNodeFontSize gives the label, so toolbar icons scale with the node instead of staying a fixed size", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} />);
    const rockAnchor = chipFor(container, "Rock").closest(".gtv-wheel-chip-anchor") as HTMLElement;
    const toolbar = rockAnchor.querySelector(".gtv-wheel-chip-toolbar") as HTMLElement;

    const rootItemCountRange = getItemCountRange([{ itemCount: 8 }, { itemCount: 0 }, { itemCount: 0 }, { itemCount: 0 }, { itemCount: 0 }]);
    const expectedFontSize = calculateNodeFontSize(8, rootItemCountRange);

    expect(toolbar.style.getPropertyValue("--gtv-toolbar-font-size")).toBe(`${expectedFontSize}px`);
  });

  it("adds the reparent-target overlay to eligible core nodes and forwards the selection, excluding the reparented node's own descendants", () => {
    const onReparent = vi.fn();
    const nodes: GenreTreeNode[] = [
      ...NODES_FIVE,
      { id: "a-grandchild", parentId: "a-child", name: "Oi", itemCount: 0 },
    ];
    const { container } = render(
      <GenreTreeWheelRadial nodes={nodes} reparentingNodeId="a-child" onReparent={onReparent} />,
    );

    const grandchildGroup = container.querySelector("#group-a-grandchild") as SVGGElement;
    expect(grandchildGroup.className.baseVal).toContain("gtv-node--forbidden");

    const bChildGroup = container.querySelector("#group-b-child") as SVGGElement;
    fireEvent.mouseEnter(bChildGroup);
    const overlayTarget = container.querySelector(
      "#select-as-new-parent-group-b-child foreignObject",
    ) as SVGForeignObjectElement;
    expect(overlayTarget).toBeTruthy();
    fireEvent.click(overlayTarget);

    expect(onReparent).toHaveBeenCalledWith("a-child", "b-child");
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

  it("keeps root chips visible but hides their inner toolbar and suppresses the core sector's hover toolbar when showToolbar is false", () => {
    const { container } = render(<GenreTreeWheelRadial nodes={NODES_FIVE} showToolbar={false} />);

    expect(container.querySelectorAll(".gtv-wheel-chip").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".gtv-wheel-chip-toolbar").length).toBe(0);
    expect(container.querySelectorAll(".gtv-wheel-chip-hover-name").length).toBe(0);
    expect(container.querySelectorAll(".gtv-wheel-chip-anchor--no-toolbar").length).toBeGreaterThan(0);

    const nodeGroup = container.querySelector("#group-a-child") as SVGGElement;
    fireEvent.mouseOver(nodeGroup.querySelector("foreignObject") as SVGForeignObjectElement);
    expect(container.querySelector("#toolbar-a-child")).toBeFalsy();
  });
});
