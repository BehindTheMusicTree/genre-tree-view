import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { GenreTreeWheelRadialPopCore } from "../GenreTreeWheelRadialPopCore";
import type { GenreTreeNode } from "../types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const CENTER_NODE: GenreTreeNode = {
  id: "mainstream-pop",
  parentId: null,
  name: "Mainstream pop",
  itemCount: 10,
};

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

describe("GenreTreeWheelRadialPopCore", () => {
  it("renders the 'Mainstream pop' root interactively at the wheel's center, excluded from the ring", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);

    const centerNode = container.querySelector(".gtv-wheel-center-node") as HTMLElement;
    expect(centerNode.querySelector("#group-mainstream-pop")).toBeTruthy();
    expect(chipFor(container, "Mainstream pop")).toBeUndefined();
  });

  it("throws when nodes has no root named 'Mainstream pop'", () => {
    const nodesWithoutCenter = NODES_WITH_POP.filter((node) => node.id !== "mainstream-pop");
    expect(() => render(<GenreTreeWheelRadialPopCore nodes={nodesWithoutCenter} />)).toThrow(
      /requires a root node named "Mainstream pop"/,
    );
  });

  it("throws when the 'Mainstream pop' root has children", () => {
    const nodesWithChild: GenreTreeNode[] = [
      ...NODES_WITH_POP,
      { id: "mainstream-pop-child", parentId: "mainstream-pop", name: "Radio Hits", itemCount: 1 },
    ];
    expect(() => render(<GenreTreeWheelRadialPopCore nodes={nodesWithChild} />)).toThrow(
      /"Mainstream pop" root must not have children/,
    );
  });

  it("develops the cardinal roots' core branches and renders their pop branch inside the wheel's own circle", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);

    const rightAnchor = container.querySelector(".gtv-wheel-radial-tree-anchor--right") as HTMLElement;
    expect(rightAnchor.querySelector("#group-a-core-child")).toBeTruthy();
    expect(rightAnchor.querySelector("#group-a-pop-child")).toBeFalsy();

    expect(container.querySelector(".gtv-wheel-pop-sector--right")).toBeTruthy();
    expect(container.querySelector(".gtv-wheel-pop-sector--right #group-a-pop")).toBeTruthy();
  });

  it("omits the pop sector for a cardinal root that has no pop branch", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);

    for (const direction of ["top", "bottom", "left"]) {
      expect(container.querySelector(`.gtv-wheel-pop-sector--${direction}`)).toBeFalsy();
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

    const centerGroup = container.querySelector("#group-mainstream-pop") as SVGGElement;
    fireEvent.mouseOver(centerGroup.querySelector("foreignObject") as SVGForeignObjectElement);
    const centerPlayButton = container.querySelector(
      '#toolbar-mainstream-pop [data-menu-key="play"]',
    ) as HTMLButtonElement;
    fireEvent.click(centerPlayButton);
    expect(onPlayPause).toHaveBeenCalledWith("mainstream-pop");

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

    const popGroup = container.querySelector(".gtv-wheel-pop-sector--right #group-a-pop") as SVGGElement;
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

  it("mounts a miniature preview tree only for non-cardinal (filler) roots, not the 4 developed cardinals", () => {
    const nodesWithFiller: GenreTreeNode[] = [
      ...NODES_WITH_POP,
      { id: "root-d", parentId: null, name: "Folk", itemCount: 0 },
      { id: "d-child", parentId: "root-d", name: "Bluegrass", itemCount: 0 },
      { id: "root-e", parentId: null, name: "Metal", itemCount: 0 },
      { id: "e-child", parentId: "root-e", name: "Doom", itemCount: 0 },
    ];
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={nodesWithFiller} />);

    expect(container.querySelectorAll(".gtv-wheel-radial-mini-tree").length).toBe(1);
    expect(
      chipFor(container, "Jazz").closest(".gtv-wheel-slot")?.querySelector(".gtv-wheel-radial-mini-tree"),
    ).toBeTruthy();
    for (const name of ["Rock", "Electronic", "Folk", "Metal"]) {
      expect(
        chipFor(container, name).closest(".gtv-wheel-slot")?.querySelector(".gtv-wheel-radial-mini-tree"),
      ).toBeFalsy();
    }
  });

  it("falls back to the first remaining root when the top root disappears from nodes", () => {
    const { container, rerender } = render(<GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} />);
    fireEvent.click(chipFor(container, "Jazz"));
    expect(chipFor(container, "Jazz").className).toContain("gtv-wheel-chip--selected");

    const withoutJazz = NODES_WITH_POP.filter((n) => n.id !== "root-c" && n.id !== "c-child");
    rerender(<GenreTreeWheelRadialPopCore nodes={withoutJazz} />);

    expect(chipFor(container, "Jazz")).toBeUndefined();
    const rightAnchor = container.querySelector(".gtv-wheel-radial-tree-anchor--right") as HTMLElement;
    expect(rightAnchor.querySelector("#group-a-core-child")).toBeTruthy();
  });

  it("adds the reparent-target overlay to eligible nodes in the pop sector and forwards the selection", () => {
    const onReparent = vi.fn();
    const { container } = render(
      <GenreTreeWheelRadialPopCore nodes={NODES_WITH_POP} reparentingNodeId="a-pop-child" onReparent={onReparent} />,
    );

    const popGroup = container.querySelector(".gtv-wheel-pop-sector--right #group-a-pop") as SVGGElement;
    fireEvent.mouseEnter(popGroup);
    const overlayTarget = container.querySelector(
      "#select-as-new-parent-group-a-pop foreignObject",
    ) as SVGForeignObjectElement;
    expect(overlayTarget).toBeTruthy();
    fireEvent.click(overlayTarget);

    expect(onReparent).toHaveBeenCalledWith("a-pop-child", "a-pop");
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

    const popGroup = container.querySelector(".gtv-wheel-pop-sector--right #group-a-pop") as SVGGElement;
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

    const popGroup = container.querySelector(".gtv-wheel-pop-sector--right #group-a-pop") as SVGGElement;
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

    const popGroup = container.querySelector(".gtv-wheel-pop-sector--right #group-a-pop") as SVGGElement;
    fireEvent.mouseEnter(popGroup);

    expect(container.querySelector("#select-as-new-parent-group-a-pop")).toBeFalsy();
  });

  it("renders no chips and mounts no anchors when nodes only contains the required center root", () => {
    const { container } = render(<GenreTreeWheelRadialPopCore nodes={[CENTER_NODE]} />);
    expect(container.querySelectorAll(".gtv-wheel-chip").length).toBe(0);
    expect(container.querySelectorAll(".gtv-wheel-radial-tree-anchor").length).toBe(0);
  });
});
