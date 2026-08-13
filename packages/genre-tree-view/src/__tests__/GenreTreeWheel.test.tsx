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

  it("still routes node actions from the visible subtree through to the forwarded callback", () => {
    const onPlayPause = vi.fn();
    const { container } = render(<GenreTreeWheel nodes={NODES} onPlayPause={onPlayPause} />);

    const nodeGroup = container.querySelector("#group-a-child") as SVGGElement;
    fireEvent.mouseOver(nodeGroup.querySelector("foreignObject") as SVGForeignObjectElement);
    const playButton = container.querySelector('#toolbar-a-child [data-menu-key="play"]') as HTMLButtonElement;
    fireEvent.click(playButton);

    expect(onPlayPause).toHaveBeenCalledWith("a-child");
  });
});
