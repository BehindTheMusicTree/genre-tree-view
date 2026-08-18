import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NodeToolbar } from "../NodeToolbar";
import type { GenreTreeNode } from "../types";

afterEach(() => {
  cleanup();
});

const NODE: GenreTreeNode = { id: "root-a", parentId: null, name: "Rock", itemCount: 5 };

describe("NodeToolbar", () => {
  it("disables Play when itemCount is zero and calls onPlayPause when playable", () => {
    const onPlayPause = vi.fn();
    const { container, rerender } = render(
      <NodeToolbar node={{ ...NODE, itemCount: 0 }} onPlayPause={onPlayPause} />,
    );
    const playButton = container.querySelector('[aria-label="Play"]') as HTMLButtonElement;
    expect(playButton.disabled).toBe(true);

    rerender(<NodeToolbar node={NODE} onPlayPause={onPlayPause} />);
    const enabledPlay = container.querySelector('[aria-label="Play"]') as HTMLButtonElement;
    expect(enabledPlay.disabled).toBe(false);
    fireEvent.click(enabledPlay);
    expect(onPlayPause).toHaveBeenCalledWith("root-a");
  });

  it("uses the itemCount override instead of node.itemCount for playability", () => {
    const { container } = render(<NodeToolbar node={{ ...NODE, itemCount: 0 }} itemCount={2} />);
    expect((container.querySelector('[aria-label="Play"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows Pause when this node is playing", () => {
    const { container } = render(
      <NodeToolbar node={NODE} playingNodeId="root-a" playState="playing" />,
    );
    expect(container.querySelector('[aria-label="Pause"]')).toBeTruthy();
  });

  it("shows Loading... when this node is loading", () => {
    const { container } = render(
      <NodeToolbar node={NODE} playingNodeId="root-a" playState="loading" />,
    );
    expect(container.querySelector('[aria-label="Loading..."]')).toBeTruthy();
  });

  it("shows Play (not Pause/Loading) when a different node is playing", () => {
    const { container } = render(
      <NodeToolbar node={NODE} playingNodeId="other-node" playState="playing" />,
    );
    expect(container.querySelector('[aria-label="Play"]')).toBeTruthy();
  });

  it("omits upload/add/overflow controls when the node is not actionable", () => {
    const { container } = render(<NodeToolbar node={{ ...NODE, actionable: false }} />);
    expect(container.querySelector('[aria-label="Upload files"]')).toBeFalsy();
    expect(container.querySelector('[aria-label="Add sub-genre"]')).toBeFalsy();
    expect(container.querySelector('[aria-label="More actions"]')).toBeFalsy();
  });

  it("calls onAddChild when Add sub-genre is clicked", () => {
    const onAddChild = vi.fn();
    const { container } = render(<NodeToolbar node={NODE} onAddChild={onAddChild} />);
    fireEvent.click(container.querySelector('[aria-label="Add sub-genre"]') as HTMLButtonElement);
    expect(onAddChild).toHaveBeenCalledWith("root-a");
  });

  it("forwards selected files to onUploadFiles and resets the input", () => {
    const onUploadFiles = vi.fn();
    const { container } = render(<NodeToolbar node={NODE} onUploadFiles={onUploadFiles} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "song.mp3");
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);
    expect(onUploadFiles).toHaveBeenCalledWith("root-a", [file]);
    expect(input.value).toBe("");
  });

  it("does not call onUploadFiles when the change event carries no files", () => {
    const onUploadFiles = vi.fn();
    const { container } = render(<NodeToolbar node={NODE} onUploadFiles={onUploadFiles} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [], configurable: true });
    fireEvent.change(input);
    expect(onUploadFiles).not.toHaveBeenCalled();
  });

  it("clicking Upload files delegates to the hidden file input", () => {
    const { container } = render(<NodeToolbar node={NODE} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    fireEvent.click(container.querySelector('[aria-label="Upload files"]') as HTMLButtonElement);
    expect(clickSpy).toHaveBeenCalled();
  });

  it("toggles the overflow menu open and closed", () => {
    const { container } = render(<NodeToolbar node={NODE} />);
    const moreButton = container.querySelector('[aria-label="More actions"]') as HTMLButtonElement;
    expect(container.querySelector(".gtv-toolbar-overflow-menu")).toBeFalsy();

    fireEvent.click(moreButton);
    expect(container.querySelector(".gtv-toolbar-overflow-menu")).toBeTruthy();

    fireEvent.click(moreButton);
    expect(container.querySelector(".gtv-toolbar-overflow-menu")).toBeFalsy();
  });

  it("calls onRenameRequest and closes the menu", () => {
    const onRenameRequest = vi.fn();
    const { container } = render(<NodeToolbar node={NODE} onRenameRequest={onRenameRequest} />);
    fireEvent.click(container.querySelector('[aria-label="More actions"]') as HTMLButtonElement);
    fireEvent.click(container.querySelector(".gtv-menu-row") as HTMLButtonElement);
    expect(onRenameRequest).toHaveBeenCalledWith(NODE);
    expect(container.querySelector(".gtv-toolbar-overflow-menu")).toBeFalsy();
  });

  it("calls onReparentRequest and closes the menu", () => {
    const onReparentRequest = vi.fn();
    const { container } = render(<NodeToolbar node={NODE} onReparentRequest={onReparentRequest} />);
    fireEvent.click(container.querySelector('[aria-label="More actions"]') as HTMLButtonElement);
    const rows = container.querySelectorAll(".gtv-menu-row");
    fireEvent.click(rows[1]);
    expect(onReparentRequest).toHaveBeenCalledWith(NODE);
    expect(container.querySelector(".gtv-toolbar-overflow-menu")).toBeFalsy();
  });

  it("calls onDeleteRequest and closes the menu", () => {
    const onDeleteRequest = vi.fn();
    const { container } = render(<NodeToolbar node={NODE} onDeleteRequest={onDeleteRequest} />);
    fireEvent.click(container.querySelector('[aria-label="More actions"]') as HTMLButtonElement);
    const rows = container.querySelectorAll(".gtv-menu-row");
    fireEvent.click(rows[2]);
    expect(onDeleteRequest).toHaveBeenCalledWith(NODE);
    expect(container.querySelector(".gtv-toolbar-overflow-menu")).toBeFalsy();
  });

  it("applies the className prop alongside gtv-toolbar", () => {
    const { container } = render(<NodeToolbar node={NODE} className="extra-class" />);
    expect(container.querySelector(".gtv-toolbar")?.className).toContain("extra-class");
  });
});
