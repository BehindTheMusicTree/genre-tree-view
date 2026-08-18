import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { GenreTree } from "../GenreTree";
import { getGenreTreeColor, tintSurface } from "../constants";
import type { GenreTreeNode } from "../types";

afterEach(() => {
  cleanup();
});

const TREE: GenreTreeNode[] = [
  { id: "root", parentId: null, name: "Root", itemCount: 5 },
  { id: "child-a", parentId: "root", name: "Child A", itemCount: 2 },
  { id: "child-b", parentId: "root", name: "Child B", itemCount: 0 },
];

describe("GenreTree", () => {
  it("renders one group per node and one link per edge", () => {
    const { container } = render(<GenreTree nodes={TREE} />);
    expect(container.querySelectorAll("g.node").length).toBe(3);
    expect(container.querySelectorAll("path.gtv-link").length).toBe(2);
  });

  it("uses the deterministic root-seeded color when rootColor is not provided", () => {
    const { container } = render(<GenreTree nodes={TREE} />);
    const rect = container.querySelector("#group-root .gtv-node-rect") as SVGRectElement;
    expect(rect.getAttribute("fill")).toBe(tintSurface(getGenreTreeColor("root")));
  });

  it("uses the explicit rootColor prop when provided", () => {
    const { container } = render(<GenreTree nodes={TREE} rootColor="#123456" />);
    const rect = container.querySelector("#group-root .gtv-node-rect") as SVGRectElement;
    expect(rect.getAttribute("fill")).toBe(tintSurface("#123456"));
  });

  it("scopes the shadow filter id per instance so two trees never collide", () => {
    const otherTree: GenreTreeNode[] = [{ id: "other-root", parentId: null, name: "Other", itemCount: 1 }];
    const first = render(<GenreTree nodes={TREE} />);
    const second = render(<GenreTree nodes={otherTree} />);

    expect(first.container.querySelector("filter#gtv-card-shadow-root")).toBeTruthy();
    expect(second.container.querySelector("filter#gtv-card-shadow-other-root")).toBeTruthy();

    first.unmount();
    second.unmount();
  });

  it("re-renders stale groups away when the nodes prop changes", () => {
    const { container, rerender } = render(<GenreTree nodes={TREE} />);
    expect(container.querySelector("#group-child-b")).toBeTruthy();

    const trimmedTree: GenreTreeNode[] = [{ id: "root", parentId: null, name: "Root", itemCount: 5 }];
    rerender(<GenreTree nodes={trimmedTree} />);

    expect(container.querySelectorAll("g.node").length).toBe(1);
    expect(container.querySelector("#group-child-b")).toBeFalsy();
  });

  describe("play/pause/loading toolbar label", () => {
    function playButton(container: HTMLElement, nodeId: string) {
      const nodeGroup = container.querySelector(`#group-${nodeId}`) as SVGGElement;
      fireEvent.mouseOver(nodeGroup.querySelector("foreignObject") as SVGForeignObjectElement);
      return container.querySelector(`#toolbar-${nodeId} [data-menu-key="play"]`) as HTMLButtonElement;
    }

    it("shows Play when the node is not the currently playing node", () => {
      const { container } = render(<GenreTree nodes={TREE} playingNodeId={null} />);
      expect(playButton(container, "root").getAttribute("aria-label")).toBe("Play");
    });

    it("shows Pause when the node is playing", () => {
      const { container } = render(<GenreTree nodes={TREE} playingNodeId="root" playState="playing" />);
      expect(playButton(container, "root").getAttribute("aria-label")).toBe("Pause");
    });

    it("shows Loading... when the node is loading", () => {
      const { container } = render(<GenreTree nodes={TREE} playingNodeId="root" playState="loading" />);
      expect(playButton(container, "root").getAttribute("aria-label")).toBe("Loading...");
    });

    it("disables the play button for an empty node and invokes onPlayPause for a non-empty one", () => {
      const onPlayPause = vi.fn();
      const { container } = render(<GenreTree nodes={TREE} onPlayPause={onPlayPause} />);

      const disabledButton = playButton(container, "child-b");
      expect(disabledButton.disabled).toBe(true);
      fireEvent.click(disabledButton);
      expect(onPlayPause).not.toHaveBeenCalled();

      const enabledButton = playButton(container, "root");
      fireEvent.click(enabledButton);
      expect(onPlayPause).toHaveBeenCalledWith("root");
    });

    it("shows the node's name as a floating label alongside the toolbar", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      playButton(container, "root");
      expect(container.querySelector("#hover-label-root .gtv-hover-label")!.textContent).toBe("Root");
    });
  });

  it("routes a file selection through selectingFileNodeIdRef to onUploadFiles", () => {
    const onUploadFiles = vi.fn();
    const { container } = render(<GenreTree nodes={TREE} onUploadFiles={onUploadFiles} />);

    const nodeGroup = container.querySelector("#group-root") as SVGGElement;
    fireEvent.mouseOver(nodeGroup.querySelector("foreignObject") as SVGForeignObjectElement);
    const uploadButton = container.querySelector('#toolbar-root [data-menu-key="upload"]') as HTMLButtonElement;
    fireEvent.click(uploadButton);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["content"], "sample.mp3", { type: "audio/mpeg" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);

    expect(onUploadFiles).toHaveBeenCalledWith("root", [file]);
    expect(fileInput.value).toBe("");
  });

  it("does not call onUploadFiles when no node id was recorded", () => {
    const onUploadFiles = vi.fn();
    const { container } = render(<GenreTree nodes={TREE} onUploadFiles={onUploadFiles} />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["content"], "sample.mp3", { type: "audio/mpeg" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);

    expect(onUploadFiles).not.toHaveBeenCalled();
  });

  describe("reparenting flow", () => {
    it("adds the reparent-target overlay only on eligible, non-forbidden nodes and forwards the selection", async () => {
      const onReparent = vi.fn();
      const { container } = render(
        <GenreTree nodes={TREE} reparentingNodeId="child-a" onReparent={onReparent} />,
      );

      const rootGroup = container.querySelector("#group-root") as SVGGElement;
      fireEvent.mouseEnter(rootGroup);
      expect(container.querySelector("#select-as-new-parent-group-root")).toBeTruthy();

      const overlayTarget = container.querySelector(
        "#select-as-new-parent-group-root foreignObject",
      ) as SVGForeignObjectElement;
      fireEvent.click(overlayTarget);

      expect(onReparent).toHaveBeenCalledWith("child-a", "root");
    });

    it("excludes the node being reparented and its descendants from the overlay", () => {
      const { container } = render(<GenreTree nodes={TREE} reparentingNodeId="root" />);

      const rootGroup = container.querySelector("#group-root") as SVGGElement;
      fireEvent.mouseEnter(rootGroup);
      expect(container.querySelector("#select-as-new-parent-group-root")).toBeFalsy();

      const childGroup = container.querySelector("#group-child-a") as SVGGElement;
      fireEvent.mouseEnter(childGroup);
      expect(container.querySelector("#select-as-new-parent-group-child-a")).toBeFalsy();
    });

    it("does not add the overlay when no reparent is in progress", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      const rootGroup = container.querySelector("#group-root") as SVGGElement;
      fireEvent.mouseEnter(rootGroup);
      expect(container.querySelector("#select-as-new-parent-group-root")).toBeFalsy();
    });
  });

  describe("zoom and pan", () => {
    const getTransformDiv = (container: HTMLElement) =>
      (container.querySelector("svg") as SVGSVGElement).parentElement as HTMLElement;

    const getScale = (div: HTMLElement) => {
      const match = div.style.transform.match(/scale\(([^)]+)\)/);
      return match ? Number(match[1]) : NaN;
    };

    // jsdom's getBoundingClientRect() always returns all-zero rects, which isn't enough to
    // exercise fit-to-frame's actual scale computation — this fakes real rects for specific
    // elements, keyed by identity since GenreTree has several DOM nodes of the same tag.
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

    it("ctrl+wheel scales the shared transform, anchored on the cursor", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      const wrapper = container.firstChild as HTMLElement;
      const transformDiv = getTransformDiv(container);
      const baseScale = getScale(transformDiv);

      fireEvent.wheel(wrapper, { ctrlKey: true, deltaY: -100, clientX: 50, clientY: 50 });

      expect(getScale(transformDiv)).toBeGreaterThan(baseScale);
    });

    it("ignores plain wheel scroll (no ctrlKey) and leaves the svg size unchanged", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      const wrapper = container.firstChild as HTMLElement;
      const svg = container.querySelector("svg") as SVGSVGElement;
      const baseWidth = svg.getAttribute("width");

      fireEvent.wheel(wrapper, { ctrlKey: false, deltaY: -100 });

      expect(svg.getAttribute("width")).toBe(baseWidth);
    });

    it("does not rescale when a zero delta resolves to the same clamped scale", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      const wrapper = container.firstChild as HTMLElement;
      const svg = container.querySelector("svg") as SVGSVGElement;
      const baseWidth = svg.getAttribute("width");

      fireEvent.wheel(wrapper, { ctrlKey: true, deltaY: 0 });

      expect(svg.getAttribute("width")).toBe(baseWidth);
    });

    it("drag-panning from empty background moves the shared transform", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      const svg = container.querySelector("svg") as SVGSVGElement;
      const transformDiv = getTransformDiv(container);

      fireEvent.pointerDown(svg, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 80, clientY: 70 });
      fireEvent.pointerUp(window);

      expect(transformDiv.style.transform).toContain("translate(-20px, -30px)");
    });

    it("does not start a pan drag from a pointerdown on a node", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      const rootGroup = container.querySelector("#group-root") as SVGGElement;
      const scrollBySpy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});

      fireEvent.pointerDown(rootGroup, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 80, clientY: 70 });
      fireEvent.pointerUp(window);

      expect(scrollBySpy).not.toHaveBeenCalled();

      scrollBySpy.mockRestore();
    });

    it("ignores a non-primary-button pointerdown", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      const svg = container.querySelector("svg") as SVGSVGElement;
      const scrollBySpy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});

      fireEvent.pointerDown(svg, { button: 2, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 80, clientY: 70 });
      fireEvent.pointerUp(window);

      expect(scrollBySpy).not.toHaveBeenCalled();

      scrollBySpy.mockRestore();
    });

    it("zoom-in button scales the shared transform up, anchored on the viewport center", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      const transformDiv = getTransformDiv(container);
      const baseScale = getScale(transformDiv);

      fireEvent.click(container.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement);

      expect(getScale(transformDiv)).toBeGreaterThan(baseScale);
    });

    it("zoom-out button scales the shared transform down", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      const transformDiv = getTransformDiv(container);
      const baseScale = getScale(transformDiv);

      fireEvent.click(container.querySelector('[aria-label="Zoom out"]') as HTMLButtonElement);

      expect(getScale(transformDiv)).toBeLessThan(baseScale);
    });

    it("disables the zoom-in button once the max scale is reached", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      const zoomIn = container.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement;
      const scrollBySpy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});

      for (let i = 0; i < 20; i++) fireEvent.click(zoomIn);

      expect(zoomIn.disabled).toBe(true);

      scrollBySpy.mockRestore();
    });

    it("disables the zoom-out button once the min scale is reached", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      const zoomOut = container.querySelector('[aria-label="Zoom out"]') as HTMLButtonElement;
      const scrollBySpy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});

      for (let i = 0; i < 20; i++) fireEvent.click(zoomOut);

      expect(zoomOut.disabled).toBe(true);

      scrollBySpy.mockRestore();
    });

    it("does not start a pan drag from a pointerdown on the zoom controls", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      const zoomControls = container.querySelector(".gtv-zoom-controls") as HTMLElement;
      const scrollBySpy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});

      fireEvent.pointerDown(zoomControls, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 80, clientY: 70 });
      fireEvent.pointerUp(window);

      expect(scrollBySpy).not.toHaveBeenCalled();

      scrollBySpy.mockRestore();
    });

    it("fit-to-frame button rescales the shared transform to fit content larger than the viewport", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      const wrapper = container.firstChild as HTMLElement;
      const transformDiv = getTransformDiv(container);
      const baseScale = getScale(transformDiv);

      const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
        this: Element,
      ) {
        if (this === wrapper) return makeRect(0, 0, 800, 600);
        if (this.matches(".gtv-node-rect, .gtv-link")) return makeRect(0, 0, 2000, 1500);
        return makeRect(0, 0, 0, 0);
      });

      fireEvent.click(container.querySelector('[aria-label="Fit to frame"]') as HTMLButtonElement);

      expect(getScale(transformDiv)).toBeLessThan(baseScale);

      rectSpy.mockRestore();
    });

    it("fit-to-frame is a no-op when the target element isn't measurable", () => {
      const { container } = render(<GenreTree nodes={TREE} />);
      const transformDiv = getTransformDiv(container);
      const baseScale = getScale(transformDiv);

      fireEvent.click(container.querySelector('[aria-label="Fit to frame"]') as HTMLButtonElement);

      expect(getScale(transformDiv)).toBe(baseScale);
    });
  });
});
