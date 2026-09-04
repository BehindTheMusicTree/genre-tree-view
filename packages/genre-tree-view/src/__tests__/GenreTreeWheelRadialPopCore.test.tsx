import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { GenreTreeWheelRadialPopCore } from "../GenreTreeWheelRadialPopCore";
import * as d3 from "d3";
import {
  buildPopHierarchy,
  calculateMainstreamPopOuterCircleRadius,
  calculatePopSubtreeRadialExtent,
  getRadialPointOnCircle,
} from "../pop-core-radial-layout";
import { buildTreeHierarchyStructure } from "../NodeHelper";
import { POP_TREE_DEPTH_RADIAL_SPACING, calculateNodeFontSize, getItemCountRange } from "../constants";
import type { GenreTreeNode } from "../types";
import { linkPathEndpoints } from "./link-path-test-utils";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const CENTER_NODE: GenreTreeNode = {
  id: "pop",
  parentId: null,
  name: "Mainstream Pop",
  itemCount: 10,
};

// 3 ring roots (root-a, root-b, root-c) with node counts 5, 2, 2 respectively (root-a's core+pop
// subtree is bigger), so computeRadialLayout's proportional spacing gives root-a a wider arc than
// root-b/root-c. root-a is clicked by default and lands at 90 (right): a=90, b=230, c=310.
const NODES_WITH_POP: GenreTreeNode[] = [
  CENTER_NODE,
  { id: "root-a", parentId: null, name: "Rock", itemCount: 5 },
  { id: "a-core", parentId: "root-a", name: "Punk", itemCount: 3 },
  { id: "a-core-child", parentId: "a-core", name: "Hardcore", itemCount: 1 },
  { id: "a-pop", parentId: "root-a", name: "Pop Rock", itemCount: 2, side: "pop" },
  { id: "a-pop-child", parentId: "a-pop", name: "Soft Rock", itemCount: 1 },
  { id: "root-b", parentId: null, name: "Electronic", itemCount: 0 },
  { id: "b-child", parentId: "root-b", name: "Techno", itemCount: 0 },
  { id: "root-c", parentId: null, name: "Jazz", itemCount: 0 },
  { id: "c-child", parentId: "root-c", name: "Bebop", itemCount: 0 },
];

function chipFor(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll(".gtv-wheel-chip")).find((el) =>
    el.textContent?.startsWith(name),
  ) as HTMLButtonElement;
}

function coreSectorForRoot(container: HTMLElement, rootId: string) {
  return container.querySelector(`.gtv-wheel-core-sector[data-gtv-root-id="${rootId}"]`) as SVGGElement | null;
}

function popSectorForRoot(container: HTMLElement, rootId: string) {
  return container.querySelector(`.gtv-wheel-pop-sector[data-gtv-root-id="${rootId}"]`) as SVGGElement | null;
}

function getWheelRadius(container: HTMLElement) {
  const wheelContainer = container.querySelector(".gtv-wheel-container") as HTMLElement;
  return parseFloat(wheelContainer.style.getPropertyValue("--gtv-wheel-radius"));
}

function getSvgCanvasRadius(container: HTMLElement) {
  const svg = container.querySelector(".gtv-wheel-pop-layer") as SVGSVGElement;
  return Number(svg.getAttribute("width")) / 2;
}

// jsdom's getBoundingClientRect() always returns all-zero rects, which isn't enough to exercise
// fit-to-frame's actual scale computation — this fakes real rects for specific elements, keyed by
// identity/class.
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

function nodeCoords(container: HTMLElement, id: string) {
  const group = container.querySelector(`#group-${id}`) as SVGGElement;
  const match = group.getAttribute("transform")!.match(/translate\(([^,]+),\s*([^)]+)\)/)!;
  return [Number(match[1]), Number(match[2])] as const;
}

// The center chip's rendered width is exactly `centerChipDiameter` (collapsed) or
// `centerNodeDimensions.WIDTH` (expanded) — reading it off the DOM avoids reimplementing the
// component's internal item-count-range sizing just to get the mainstream circle's radius.
function centerChipRadius(container: HTMLElement) {
  const chip = container.querySelector(".gtv-wheel-chip--center") as HTMLElement;
  return parseFloat(chip.style.width) / 2;
}

describe("GenreTreeWheelRadialPopCore", () => {
  it("renders the 'Mainstream Pop' root interactively at the wheel's center, styled as a chip, excluded from the ring", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);

    const centerNode = container.querySelector(".gtv-wheel-center-node") as HTMLElement;
    expect(centerNode.querySelector(".gtv-wheel-chip")).toBeTruthy();
    expect(centerNode.textContent).toContain("Mainstream Pop");
    expect(chipFor(container, "Rock").closest(".gtv-wheel-center-node")).toBeNull();
  });

  it("throws when nodes has no root named 'Mainstream Pop'", () => {
    const nodesWithoutCenter = NODES_WITH_POP.filter((node) => node.id !== "pop");
    expect(() => render(<GenreTreeWheelRadialPopCore nodes={nodesWithoutCenter} />)).toThrow(
      /requires a root node named "Mainstream Pop"/,
    );
  });

  it("keeps the center node's own subtree hidden until the floating toggle button is clicked, then reveals and re-hides it on toggle", () => {
    const nodesWithCenterChildren: GenreTreeNode[] = [
      ...NODES_WITH_POP,
      { id: "pop-child", parentId: "pop", name: "Radio Hits", itemCount: 1 },
      { id: "pop-grandchild", parentId: "pop-child", name: "Top 40", itemCount: 1 },
    ];
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={nodesWithCenterChildren} />);

    expect(container.querySelector(".gtv-wheel-center-sector")).toBeFalsy();
    expect(container.querySelector("#group-pop-child")).toBeFalsy();

    const toggleButton = container.querySelector('[aria-label="Show Mainstream Pop sub-genres"]');
    expect(toggleButton).toBeTruthy();
    fireEvent.click(toggleButton!);
    expect(container.querySelector(".gtv-wheel-center-sector")).toBeTruthy();
    expect(container.querySelector("#group-pop-child")).toBeTruthy();
    expect(container.querySelector("#group-pop-grandchild")).toBeTruthy();
    // The center node's own dedicated chip renders it, so its own subtree layer must not draw a
    // second card for it.
    expect(container.querySelector(".gtv-wheel-center-sector #group-pop")).toBeFalsy();

    const hideButton = container.querySelector('[aria-label="Hide Mainstream Pop sub-genres"]');
    expect(hideButton).toBeTruthy();
    fireEvent.click(hideButton!);
    expect(container.querySelector(".gtv-wheel-center-sector")).toBeFalsy();
    expect(container.querySelector("#group-pop-child")).toBeFalsy();
  });

  it("grows the wheel's outer circle to fit the center subtree once expanded, and shrinks back on collapse", () => {
    const deepCenterNodes: GenreTreeNode[] = [
      ...NODES_WITH_POP,
      { id: "pop-child", parentId: "pop", name: "Radio Hits", itemCount: 1 },
      { id: "pop-grandchild", parentId: "pop-child", name: "Top 40", itemCount: 1 },
      { id: "pop-great-grandchild", parentId: "pop-grandchild", name: "Deep Cuts", itemCount: 1 },
    ];
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={deepCenterNodes} />);
    const wheelContainer = container.querySelector(".gtv-wheel-container") as HTMLElement;
    const collapsedRadius = parseFloat(wheelContainer.style.getPropertyValue("--gtv-wheel-radius"));

    fireEvent.click(container.querySelector('[aria-label="Show Mainstream Pop sub-genres"]')!);
    const expandedRadius = parseFloat(wheelContainer.style.getPropertyValue("--gtv-wheel-radius"));
    expect(expandedRadius).toBeGreaterThan(collapsedRadius);

    fireEvent.click(container.querySelector('[aria-label="Hide Mainstream Pop sub-genres"]')!);
    const recollapsedRadius = parseFloat(wheelContainer.style.getPropertyValue("--gtv-wheel-radius"));
    expect(recollapsedRadius).toBe(collapsedRadius);
  });

  it("pins the deepest pop node just outside the collapsed mainstream circle, sizing the wheel off that gap", () => {
    const deepPopNodes: GenreTreeNode[] = [
      ...NODES_WITH_POP,
      { id: "a-pop-grandchild", parentId: "a-pop-child", name: "Yacht Rock", itemCount: 1 },
      { id: "a-pop-great-grandchild", parentId: "a-pop-grandchild", name: "Smooth Jazz Pop", itemCount: 1 },
    ];
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={deepPopNodes} />);

    const mainstreamRadius = centerChipRadius(container);
    const popHierarchy = buildPopHierarchy(
      d3,
      deepPopNodes.filter((node) => node.id.startsWith("a-pop")),
    );
    const expectedExtent = calculatePopSubtreeRadialExtent(popHierarchy, 0);
    const coreRootCircleRadius = getWheelRadius(container);

    expect(coreRootCircleRadius).toBeCloseTo(mainstreamRadius + expectedExtent, 6);

    const [x, y] = nodeCoords(container, "a-pop-great-grandchild");
    expect(Math.hypot(x, y)).toBeCloseTo(
      coreRootCircleRadius - (1 + popHierarchy.height) * POP_TREE_DEPTH_RADIAL_SPACING,
      6,
    );
  });

  it("pins the deepest pop node just outside the mainstream circle once it's expanded to fit the center subtree", () => {
    const deepPopAndCenterNodes: GenreTreeNode[] = [
      ...NODES_WITH_POP,
      { id: "a-pop-grandchild", parentId: "a-pop-child", name: "Yacht Rock", itemCount: 1 },
      { id: "a-pop-great-grandchild", parentId: "a-pop-grandchild", name: "Smooth Jazz Pop", itemCount: 1 },
      { id: "pop-child", parentId: "pop", name: "Radio Hits", itemCount: 1 },
      { id: "pop-grandchild", parentId: "pop-child", name: "Top 40", itemCount: 1 },
    ];
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={deepPopAndCenterNodes} />);
    fireEvent.click(container.querySelector('[aria-label="Show Mainstream Pop sub-genres"]')!);

    const centerSubtreeHierarchy = buildTreeHierarchyStructure(
      d3,
      deepPopAndCenterNodes.filter((node) => node.id === "pop" || node.id.startsWith("pop-")),
    );
    const mainstreamRadius = calculateMainstreamPopOuterCircleRadius(
      centerSubtreeHierarchy,
      0,
      POP_TREE_DEPTH_RADIAL_SPACING,
    );
    const popHierarchy = buildPopHierarchy(
      d3,
      deepPopAndCenterNodes.filter((node) => node.id.startsWith("a-pop")),
    );
    const expectedExtent = calculatePopSubtreeRadialExtent(popHierarchy, 0);
    const coreRootCircleRadius = getWheelRadius(container);

    expect(coreRootCircleRadius).toBeCloseTo(mainstreamRadius + expectedExtent, 6);

    const [x, y] = nodeCoords(container, "a-pop-great-grandchild");
    expect(Math.hypot(x, y)).toBeCloseTo(
      coreRootCircleRadius - (1 + popHierarchy.height) * POP_TREE_DEPTH_RADIAL_SPACING,
      6,
    );
  });

  it("keeps the center subtree strictly inside the mainstream circle when expanded, instead of past the outer wheel", () => {
    // Regression test for the bug where the center subtree was laid out outward from
    // coreRootCircleRadius (the outer wheel's own circle) instead of from the true center, pushing
    // it past the outer circle entirely rather than nesting it inside the mainstream circle where
    // the ring roots' pop branches expect to find it.
    const deepCenterNodes: GenreTreeNode[] = [
      ...NODES_WITH_POP,
      { id: "pop-child", parentId: "pop", name: "Radio Hits", itemCount: 1 },
      { id: "pop-grandchild", parentId: "pop-child", name: "Top 40", itemCount: 1 },
    ];
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={deepCenterNodes} />);
    fireEvent.click(container.querySelector('[aria-label="Show Mainstream Pop sub-genres"]')!);

    const centerSubtreeHierarchy = buildTreeHierarchyStructure(
      d3,
      deepCenterNodes.filter((node) => node.id === "pop" || node.id.startsWith("pop-")),
    );
    const mainstreamRadius = calculateMainstreamPopOuterCircleRadius(
      centerSubtreeHierarchy,
      0,
      POP_TREE_DEPTH_RADIAL_SPACING,
    );
    const coreRootCircleRadius = getWheelRadius(container);

    const middleCircle = container.querySelector(".gtv-wheel-middle-circle") as HTMLElement;
    expect(parseFloat(middleCircle.style.getPropertyValue("--gtv-wheel-middle-radius"))).toBeCloseTo(
      mainstreamRadius,
      6,
    );

    const [childX, childY] = nodeCoords(container, "pop-child");
    expect(Math.hypot(childX, childY)).toBeCloseTo(POP_TREE_DEPTH_RADIAL_SPACING, 6);

    const [grandchildX, grandchildY] = nodeCoords(container, "pop-grandchild");
    expect(Math.hypot(grandchildX, grandchildY)).toBeCloseTo(2 * POP_TREE_DEPTH_RADIAL_SPACING, 6);
    expect(Math.hypot(grandchildX, grandchildY)).toBeLessThan(mainstreamRadius);
    expect(Math.hypot(grandchildX, grandchildY)).toBeLessThan(coreRootCircleRadius);
  });

  it("keeps the pop branch's own root glued a fixed distance inside coreRootCircleRadius even when chip clearance (many ring roots), not pop reach, is what sizes the wheel", () => {
    // Enough extra roots (each with a core child, no pop) that chip-clearance angular spacing —
    // not the shallow pop branch on root-a — is what drives coreRootCircleRadius. Regression test
    // for the bug where the pop branch's own root was pinned a fixed distance outward from the
    // mainstream circle instead, so inflating coreRootCircleRadius for unrelated reasons (here,
    // chip clearance) left it stranded partway to the ring roots' circle instead of glued to it.
    const manyRootsNodes: GenreTreeNode[] = [
      ...NODES_WITH_POP,
      ...Array.from({ length: 24 }, (_, i) => [
        { id: `extra-root-${i}`, parentId: null, name: `Extra ${i}`, itemCount: 0 } satisfies GenreTreeNode,
        {
          id: `extra-root-${i}-child`,
          parentId: `extra-root-${i}`,
          name: `Extra ${i} Child`,
          itemCount: 0,
        } satisfies GenreTreeNode,
      ]).flat(),
    ];
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={manyRootsNodes} />);

    const mainstreamRadius = centerChipRadius(container);
    const popHierarchy = buildPopHierarchy(
      d3,
      manyRootsNodes.filter((node) => node.id.startsWith("a-pop")),
    );
    const expectedExtent = calculatePopSubtreeRadialExtent(popHierarchy, 0);
    const coreRootCircleRadius = getWheelRadius(container);

    // Confirms chip clearance, not pop reach, is the binding constraint here — otherwise this
    // test wouldn't exercise the regression at all.
    expect(coreRootCircleRadius).toBeGreaterThan(mainstreamRadius + expectedExtent);

    const [x, y] = nodeCoords(container, "a-pop-child");
    expect(Math.hypot(x, y)).toBeCloseTo(coreRootCircleRadius - 2 * POP_TREE_DEPTH_RADIAL_SPACING, 6);
  });

  it("grows the svg canvas, not the visual outer circle or ring root chip radius, to fit a deep core branch", () => {
    // Regression test: a deep core branch used to inflate coreRootCircleRadius itself (dragging
    // the visual outer circle and every ring root chip outward with it, reopening the pop-side
    // gap this whole fix chain exists to close). It must instead only grow the svg's own canvas
    // (--gtv-wheel-svg-radius), which core branches render past coreRootCircleRadius into.
    const deepCoreNodes: GenreTreeNode[] = [
      ...NODES_WITH_POP,
      { id: "a-core-grandchild", parentId: "a-core-child", name: "Crust Punk", itemCount: 1 },
      { id: "a-core-great-grandchild", parentId: "a-core-grandchild", name: "D-beat", itemCount: 1 },
      { id: "a-core-great-great-grandchild", parentId: "a-core-great-grandchild", name: "Grindcore", itemCount: 1 },
    ];
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={deepCoreNodes} />);

    const wheelRadius = getWheelRadius(container);
    const svgCanvasRadius = getSvgCanvasRadius(container);

    // The deepest core node reaches out past the visual outer circle / ring root chip radius...
    const [x, y] = nodeCoords(container, "a-core-great-great-grandchild");
    expect(Math.hypot(x, y)).toBeGreaterThan(wheelRadius);
    // ...but the svg canvas itself is big enough to actually hold it, not clip it.
    expect(svgCanvasRadius).toBeGreaterThan(wheelRadius);
    expect(Math.hypot(x, y)).toBeLessThanOrEqual(svgCanvasRadius);
  });

  it("leaves the wheel's sizing unaffected by the mainstream circle when no root has a pop branch", () => {
    const noPopNodes: GenreTreeNode[] = NODES_WITH_POP.filter((node) => node.id !== "a-pop" && node.id !== "a-pop-child");
    const withPopContainer = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />).container;
    const withoutPopRadius = (() => {
      const { container } = render(<GenreTreeWheelRadialPopCore nodes={noPopNodes} />);
      return getWheelRadius(container);
    })();

    // Removing the only pop branch must not grow the wheel to clear a mainstream circle that no
    // longer has anything reaching toward it — it should be no larger than with the pop branch.
    expect(withoutPopRadius).toBeLessThanOrEqual(getWheelRadius(withPopContainer));
  });

  it("does not throw and stays collapsed by default when the 'Mainstream Pop' root has children but the toggle button is never clicked", () => {
    const nodesWithChild: GenreTreeNode[] = [
      ...NODES_WITH_POP,
      { id: "pop-child", parentId: "pop", name: "Radio Hits", itemCount: 1 },
    ];
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={nodesWithChild} />);
    expect(container.querySelector("#group-pop-child")).toBeFalsy();
  });

  it("does not render the pop-subtree toggle button when the 'Mainstream Pop' root has no children", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);
    expect(container.querySelector('[aria-label="Show Mainstream Pop sub-genres"]')).toBeFalsy();
    expect(container.querySelector(".gtv-wheel-center-sector")).toBeFalsy();
  });

  it("develops every root's core branch and renders its pop branch inside the wheel's own circle", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);

    const rootASector = coreSectorForRoot(container, "root-a")!;
    expect(rootASector.querySelector("#group-a-core-child")).toBeTruthy();
    expect(rootASector.querySelector("#group-a-pop-child")).toBeFalsy();

    expect(popSectorForRoot(container, "root-a")).toBeTruthy();
    expect(popSectorForRoot(container, "root-a")?.querySelector("#group-a-pop")).toBeTruthy();
  });

  it("draws a link from the root's own position out to its depth-1 child, for both its core and pop branches", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);

    const wheelRadius = getWheelRadius(container);
    // root-a is the default top root, landing at 90deg (LANDING_ANGLE).
    const { x: rootX, y: rootY } = getRadialPointOnCircle(90, wheelRadius);

    const endpointsMatch = (d: string, targetX: number, targetY: number) => {
      const { start, end } = linkPathEndpoints(d);
      return (
        Math.abs(start[0] - rootX) < 1e-6 &&
        Math.abs(start[1] - rootY) < 1e-6 &&
        Math.abs(end[0] - targetX) < 1e-6 &&
        Math.abs(end[1] - targetY) < 1e-6
      );
    };

    const [coreChildX, coreChildY] = nodeCoords(container, "a-core");
    const coreLinks = coreSectorForRoot(container, "root-a")!.querySelectorAll("path.gtv-link");
    expect(
      Array.from(coreLinks).some((link) => endpointsMatch(link.getAttribute("d")!, coreChildX, coreChildY)),
    ).toBe(true);

    const [popChildX, popChildY] = nodeCoords(container, "a-pop");
    const popLinks = popSectorForRoot(container, "root-a")!.querySelectorAll("path.gtv-link");
    expect(
      Array.from(popLinks).some((link) => endpointsMatch(link.getAttribute("d")!, popChildX, popChildY)),
    ).toBe(true);
  });

  it("skips a root that has no children, mounting no core sector for it", () => {
    const nodesWithChildlessRoot: GenreTreeNode[] = [
      ...NODES_WITH_POP,
      { id: "root-d", parentId: null, name: "Folk", itemCount: 0 },
    ];
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={nodesWithChildlessRoot} />);

    expect(container.querySelectorAll(".gtv-wheel-core-sector").length).toBe(3);
    expect(container.querySelector("#group-root-d")).toBeFalsy();
  });

  it("omits the pop sector for a root that has no pop branch", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);

    for (const rootId of ["root-b", "root-c"]) {
      expect(popSectorForRoot(container, rootId)).toBeFalsy();
    }
  });

  it("fires onRootSelect on mount with the default root and again on click", () => {
    const onRootSelect = vi.fn();
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} onRootSelect={onRootSelect} />);
    expect(onRootSelect).toHaveBeenCalledWith("root-a");

    fireEvent.click(chipFor(container, "Jazz"));
    expect(onRootSelect).toHaveBeenLastCalledWith("root-c");
  });

  it("routes node actions from the center node and a mounted core subtree through the forwarded callbacks", () => {
    const onPlayPause = vi.fn();
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} onPlayPause={onPlayPause} />);

    const centerAnchor = container.querySelector(
      ".gtv-wheel-center-node .gtv-wheel-chip-anchor",
    ) as HTMLElement;
    fireEvent.click(centerAnchor.querySelector('[aria-label="Play"]') as HTMLButtonElement);
    expect(onPlayPause).toHaveBeenCalledWith("pop");

    const coreGroup = container.querySelector("#group-a-core-child") as SVGGElement;
    fireEvent.mouseOver(coreGroup.querySelector("foreignObject") as SVGForeignObjectElement);
    const corePlayButton = container.querySelector(
      '#toolbar-a-core-child [data-menu-key="play"]',
    ) as HTMLButtonElement;
    fireEvent.click(corePlayButton);
    expect(onPlayPause).toHaveBeenCalledWith("a-core-child");
  });

  it("routes actions fired from the in-circle pop subtree through the forwarded callbacks", () => {
    const onPlayPause = vi.fn();
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} onPlayPause={onPlayPause} />);

    const popGroup = popSectorForRoot(container, "root-a")?.querySelector("#group-a-pop") as SVGGElement;
    fireEvent.mouseOver(popGroup.querySelector("foreignObject") as SVGForeignObjectElement);
    const popPlayButton = container.querySelector('#toolbar-a-pop [data-menu-key="play"]') as HTMLButtonElement;
    fireEvent.click(popPlayButton);

    expect(onPlayPause).toHaveBeenCalledWith("a-pop");
  });

  it("renders a toolbar for each root chip and routes its actions through the forwarded callbacks", () => {
    const onAddChild = vi.fn();
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} onAddChild={onAddChild} />);

    const rockAnchor = chipFor(container, "Rock").closest(".gtv-wheel-chip-anchor") as HTMLElement;
    fireEvent.click(rockAnchor.querySelector('[aria-label="Add sub-genre"]') as HTMLButtonElement);

    expect(onAddChild).toHaveBeenCalledWith("root-a");
  });

  it("wires the ring chip and center chip toolbars' font-size to calculateNodeFontSize, so toolbar icons scale with their node instead of staying a fixed size", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);

    const rootItemCountRange = getItemCountRange([{ itemCount: 12 }, { itemCount: 0 }, { itemCount: 0 }]);

    const rockAnchor = chipFor(container, "Rock").closest(".gtv-wheel-chip-anchor") as HTMLElement;
    const rockToolbar = rockAnchor.querySelector(".gtv-wheel-chip-toolbar") as HTMLElement;
    expect(rockToolbar.style.getPropertyValue("--gtv-toolbar-font-size")).toBe(
      `${calculateNodeFontSize(12, rootItemCountRange)}px`,
    );

    const centerToolbar = container.querySelector(
      ".gtv-wheel-center-node .gtv-wheel-chip-toolbar",
    ) as HTMLElement;
    const CENTER_NODE_SCALE = 2;
    expect(centerToolbar.style.getPropertyValue("--gtv-toolbar-font-size")).toBe(
      `${calculateNodeFontSize(10, rootItemCountRange) * CENTER_NODE_SCALE}px`,
    );
  });

  it("draws the wheel's circle outline", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);
    expect(container.querySelector(".gtv-wheel-circle")).toBeTruthy();
  });

  it("develops every root when there are more than 3, one core sector per root", () => {
    const nodesWithMoreRoots: GenreTreeNode[] = [
      ...NODES_WITH_POP,
      { id: "root-d", parentId: null, name: "Folk", itemCount: 0 },
      { id: "d-child", parentId: "root-d", name: "Bluegrass", itemCount: 0 },
      { id: "root-e", parentId: null, name: "Metal", itemCount: 0 },
      { id: "e-child", parentId: "root-e", name: "Doom", itemCount: 0 },
    ];
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={nodesWithMoreRoots} />);

    expect(container.querySelectorAll(".gtv-wheel-core-sector").length).toBe(5);
    for (const name of ["Rock", "Electronic", "Jazz", "Folk", "Metal"]) {
      expect(chipFor(container, name).className).toContain("gtv-wheel-chip--selected");
    }
    expect(coreSectorForRoot(container, "root-d")?.querySelector("#group-d-child")).toBeTruthy();
    expect(coreSectorForRoot(container, "root-e")?.querySelector("#group-e-child")).toBeTruthy();
  });

  it("falls back to the first remaining root when the top root disappears from nodes", () => {
    const { container, rerender } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);
    fireEvent.click(chipFor(container, "Jazz"));
    expect(chipFor(container, "Jazz").className).toContain("gtv-wheel-chip--selected");

    const withoutJazz = NODES_WITH_POP.filter((n) => n.id !== "root-c" && n.id !== "c-child");
    rerender(<GenreTreeWheelRadialPopCore nodes={withoutJazz} />);

    expect(chipFor(container, "Jazz")).toBeUndefined();
    const rootASector = coreSectorForRoot(container, "root-a")!;
    expect(rootASector.querySelector("#group-a-core-child")).toBeTruthy();
  });

  it("adds the reparent-target overlay to eligible nodes in the pop sector and forwards the selection", () => {
    const onReparent = vi.fn();
    const { container } = render(
      <GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} reparentingNodeId="a-pop-child" onReparent={onReparent} />,
    );

    const popGroup = popSectorForRoot(container, "root-a")?.querySelector("#group-a-pop") as SVGGElement;
    fireEvent.mouseEnter(popGroup);
    const overlayTarget = container.querySelector(
      "#select-as-new-parent-group-a-pop foreignObject",
    ) as SVGForeignObjectElement;
    expect(overlayTarget).toBeTruthy();
    fireEvent.click(overlayTarget);

    expect(onReparent).toHaveBeenCalledWith("a-pop-child", "a-pop");
  });

  it("adds the reparent-target overlay to eligible nodes in a core sector and forwards the selection", () => {
    const onReparent = vi.fn();
    const { container } = render(
      <GenreTreeWheelRadialPopCore
        nodes={NODES_WITH_POP}
        reparentingNodeId="a-core-child"
        onReparent={onReparent}
      />,
    );

    const coreGroup = coreSectorForRoot(container, "root-a")?.querySelector("#group-a-core") as SVGGElement;
    fireEvent.mouseEnter(coreGroup);
    const overlayTarget = container.querySelector(
      "#select-as-new-parent-group-a-core foreignObject",
    ) as SVGForeignObjectElement;
    expect(overlayTarget).toBeTruthy();
    fireEvent.click(overlayTarget);

    expect(onReparent).toHaveBeenCalledWith("a-core-child", "a-core");
  });

  it("adds the reparent-target overlay to eligible nodes in the expanded center subtree and forwards the selection", () => {
    const onReparent = vi.fn();
    const nodesWithCenterChildren: GenreTreeNode[] = [
      ...NODES_WITH_POP,
      { id: "pop-child", parentId: "pop", name: "Radio Hits", itemCount: 1 },
      { id: "pop-grandchild", parentId: "pop-child", name: "Top 40", itemCount: 1 },
    ];
    const { container } = render(
      <GenreTreeWheelRadialPopCore
        nodes={nodesWithCenterChildren}
        reparentingNodeId="pop-grandchild"
        onReparent={onReparent}
      />,
    );
    fireEvent.click(container.querySelector('[aria-label="Show Mainstream Pop sub-genres"]')!);

    const centerChildGroup = container.querySelector(".gtv-wheel-center-sector #group-pop-child") as SVGGElement;
    fireEvent.mouseEnter(centerChildGroup);
    const overlayTarget = container.querySelector(
      "#select-as-new-parent-group-pop-child foreignObject",
    ) as SVGForeignObjectElement;
    expect(overlayTarget).toBeTruthy();
    fireEvent.click(overlayTarget);

    expect(onReparent).toHaveBeenCalledWith("pop-grandchild", "pop-child");
  });

  it("zoom-in button and fit-to-frame button both rescale the shared transform", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);
    const transformDiv = (container.querySelector(".gtv-wheel-stage") as HTMLElement).parentElement as HTMLElement;
    const getScale = () => {
      const match = transformDiv.style.transform.match(/scale\(([^)]+)\)/);
      return match ? Number(match[1]) : NaN;
    };
    const baseScale = getScale();

    fireEvent.click(container.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement);
    expect(getScale()).toBeGreaterThan(baseScale);

    fireEvent.click(container.querySelector('[aria-label="Zoom out"]') as HTMLButtonElement);
    fireEvent.click(container.querySelector('[aria-label="Fit to frame"]') as HTMLButtonElement);
    expect(Number.isNaN(getScale())).toBe(false);
  });

  it("fit-to-frame button fits the popped tree's actually-rendered nodes/links, not just the reserved wheel circle's own box", () => {
    // popSvgRef's declared width/height cover only the reserved wheel-circle radius; the pop/core
    // wedges it renders (via renderPopSubtree) draw outward past that with `overflow: visible`, so
    // measuring the svg element's own box instead of its rendered .gtv-node-rect/.gtv-link content
    // undersizes the fit and crops the tree. This pins the fit to the real content bounds.
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);
    const wheelContainer = container.querySelector(".gtv-wheel-container") as HTMLElement;
    const circle = container.querySelector(".gtv-wheel-circle") as HTMLElement;
    const transformDiv = (container.querySelector(".gtv-wheel-stage") as HTMLElement).parentElement as HTMLElement;
    const getScale = () => {
      const match = transformDiv.style.transform.match(/scale\(([^)]+)\)/);
      return match ? Number(match[1]) : NaN;
    };

    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      if (this === wheelContainer) return makeRect(0, 0, 800, 600);
      if (this === circle) return makeRect(300, 200, 200, 200);
      if (this.matches(".gtv-node-rect, .gtv-link")) return makeRect(0, 0, 2000, 2000);
      return makeRect(0, 0, 0, 0);
    });

    fireEvent.click(container.querySelector('[aria-label="Fit to frame"]') as HTMLButtonElement);

    // Fitting the 2000x2000 rendered content into an 800x600 viewport (with ZOOM_FIT_PADDING
    // clearance) must shrink well below 1 — fitting only the 200x200 reserved circle would cap at
    // scale 1 instead, cropping everything past it.
    expect(getScale()).toBeLessThan(0.5);

    rectSpy.mockRestore();
  });

  it("disables the zoom-in button once the maximum scale is reached", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);
    const zoomInButton = container.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement;

    for (let i = 0; i < 30; i++) {
      fireEvent.click(zoomInButton);
    }

    expect(zoomInButton.disabled).toBe(true);
    expect(zoomInButton.className).toContain("gtv-zoom-btn--disabled");
  });

  it("disables the zoom-out button once the minimum scale is reached", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);
    const zoomOutButton = container.querySelector('[aria-label="Zoom out"]') as HTMLButtonElement;

    for (let i = 0; i < 30; i++) {
      fireEvent.click(zoomOutButton);
    }

    expect(zoomOutButton.disabled).toBe(true);
    expect(zoomOutButton.className).toContain("gtv-zoom-btn--disabled");
  });

  it("removes a pop node's toolbar and hover label after the mouseleave timeout elapses", () => {
    vi.useFakeTimers();
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);

    const popGroup = popSectorForRoot(container, "root-a")?.querySelector("#group-a-pop") as SVGGElement;
    fireEvent.mouseOver(popGroup.querySelector("foreignObject") as SVGForeignObjectElement);
    expect(container.querySelector("#toolbar-a-pop")).toBeTruthy();

    fireEvent.mouseLeave(popGroup);
    vi.advanceTimersByTime(150);

    expect(container.querySelector("#toolbar-a-pop")).toBeFalsy();
    expect(container.querySelector("#hover-label-a-pop")).toBeFalsy();
  });

  it("keeps a pop node's toolbar mounted when the mouse re-enters before the mouseleave timeout fires", () => {
    vi.useFakeTimers();
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);

    const popGroup = popSectorForRoot(container, "root-a")?.querySelector("#group-a-pop") as SVGGElement;
    fireEvent.mouseOver(popGroup.querySelector("foreignObject") as SVGForeignObjectElement);
    expect(container.querySelector("#toolbar-a-pop")).toBeTruthy();

    fireEvent.mouseLeave(popGroup);
    vi.advanceTimersByTime(50);
    fireEvent.mouseEnter(popGroup);
    vi.advanceTimersByTime(100);

    expect(container.querySelector("#toolbar-a-pop")).toBeTruthy();
  });

  it("does not add a reparent overlay to a pop node being reparented itself", () => {
    const onReparent = vi.fn();
    const { container } = render(
      <GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} reparentingNodeId="a-pop" onReparent={onReparent} />,
    );

    const popGroup = popSectorForRoot(container, "root-a")?.querySelector("#group-a-pop") as SVGGElement;
    fireEvent.mouseEnter(popGroup);

    expect(container.querySelector("#select-as-new-parent-group-a-pop")).toBeFalsy();
  });

  it("renders only the center chip and mounts no core sectors when nodes only contains the required center root", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={[CENTER_NODE]} />);
    expect(container.querySelectorAll(".gtv-wheel-chip").length).toBe(1);
    expect(container.querySelector(".gtv-wheel-center-node .gtv-wheel-chip")).toBeTruthy();
    expect(container.querySelectorAll(".gtv-wheel-core-sector").length).toBe(0);
  });

  it("still develops the lone ring root's core sector when it's the only root besides the center (no sibling to bisect a sector against)", () => {
    const nodes: GenreTreeNode[] = [
      CENTER_NODE,
      { id: "root-a", parentId: null, name: "Rock", itemCount: 5 },
      { id: "a-core", parentId: "root-a", name: "Punk", itemCount: 3 },
    ];
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={nodes} />);

    expect(container.querySelectorAll(".gtv-wheel-core-sector").length).toBe(1);
    expect(container.querySelector("#group-a-core")).toBeTruthy();
  });
});
