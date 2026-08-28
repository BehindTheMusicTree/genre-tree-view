import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { GenreTreeWheelRadialPopCore } from "../GenreTreeWheelRadialPopCore";
import type { GenreTreeNode } from "../types";

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

// 3 ring roots (root-a, root-b, root-c), evenly spaced at 360/3 = 120-degree steps. root-a is
// clicked by default and lands at 90 (right): a=90, b=210, c=330.
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
