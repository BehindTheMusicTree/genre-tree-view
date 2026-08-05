import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { GenreTree } from "../GenreTree";
import { getGenreTreeColor } from "../constants";
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
    const dot = container.querySelector("#group-root circle") as SVGCircleElement;
    expect(dot.getAttribute("fill")).toBe(getGenreTreeColor("root"));
  });

  it("uses the explicit rootColor prop when provided", () => {
    const { container } = render(<GenreTree nodes={TREE} rootColor="#123456" />);
    const dot = container.querySelector("#group-root circle") as SVGCircleElement;
    expect(dot.getAttribute("fill")).toBe("#123456");
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
});
