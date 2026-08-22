import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NodeToolbar } from "../NodeToolbar";
import type { GenreTreeAction, GenreTreeNode } from "../types";

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

  it("omits add/overflow controls when the node is not actionable", () => {
    const { container } = render(<NodeToolbar node={{ ...NODE, actionable: false }} />);
    expect(container.querySelector('[aria-label="Add sub-genre"]')).toBeFalsy();
    expect(container.querySelector('[aria-label="More actions"]')).toBeFalsy();
  });

  it("calls onAddChild when Add sub-genre is clicked", () => {
    const onAddChild = vi.fn();
    const { container } = render(<NodeToolbar node={NODE} onAddChild={onAddChild} />);
    fireEvent.click(container.querySelector('[aria-label="Add sub-genre"]') as HTMLButtonElement);
    expect(onAddChild).toHaveBeenCalledWith("root-a");
  });

  it("renders a primary-placement additional action inline and invokes onClick with the node", () => {
    const onClick = vi.fn();
    const action: GenreTreeAction = {
      key: "custom",
      icon: () => null,
      label: () => "Custom",
      onClick,
      placement: "primary",
    };
    const { container } = render(<NodeToolbar node={NODE} additionalActions={() => [action]} />);
    fireEvent.click(container.querySelector('[aria-label="Custom"]') as HTMLButtonElement);
    expect(onClick).toHaveBeenCalledWith(expect.anything(), NODE);
  });

  it("disables a primary-placement action when enabled(node) returns false", () => {
    const onClick = vi.fn();
    const action: GenreTreeAction = {
      key: "custom",
      icon: () => null,
      label: () => "Custom",
      onClick,
      enabled: () => false,
      placement: "primary",
    };
    const { container } = render(<NodeToolbar node={NODE} additionalActions={() => [action]} />);
    const button = container.querySelector('[aria-label="Custom"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("applies the danger class to an overflow-placement action when danger is true", () => {
    const action: GenreTreeAction = {
      key: "custom",
      icon: () => null,
      label: () => "Custom",
      onClick: vi.fn(),
      danger: true,
    };
    const { container } = render(<NodeToolbar node={NODE} additionalActions={() => [action]} />);
    fireEvent.click(container.querySelector('[aria-label="More actions"]') as HTMLButtonElement);
    const row = Array.from(container.querySelectorAll(".gtv-menu-row")).find((el) =>
      el.textContent?.includes("Custom"),
    ) as HTMLButtonElement;
    expect(row.className).toContain("gtv-menu-row--danger");
  });

  it("disables an overflow-placement action when enabled(node) returns false", () => {
    const action: GenreTreeAction = {
      key: "custom",
      icon: () => null,
      label: () => "Custom",
      onClick: vi.fn(),
      enabled: () => false,
    };
    const { container } = render(<NodeToolbar node={NODE} additionalActions={() => [action]} />);
    fireEvent.click(container.querySelector('[aria-label="More actions"]') as HTMLButtonElement);
    const row = Array.from(container.querySelectorAll(".gtv-menu-row")).find((el) =>
      el.textContent?.includes("Custom"),
    ) as HTMLButtonElement;
    expect(row.disabled).toBe(true);
  });

  it("renders an overflow-placement additional action in the overflow menu and invokes onClick with the node", () => {
    const onClick = vi.fn();
    const action: GenreTreeAction = {
      key: "custom",
      icon: () => null,
      label: () => "Custom",
      onClick,
    };
    const { container } = render(<NodeToolbar node={NODE} additionalActions={() => [action]} />);
    expect(container.querySelector('[aria-label="Custom"]')).toBeFalsy();

    fireEvent.click(container.querySelector('[aria-label="More actions"]') as HTMLButtonElement);
    const overflowButton = Array.from(container.querySelectorAll(".gtv-menu-row")).find((el) =>
      el.textContent?.includes("Custom"),
    ) as HTMLButtonElement;
    expect(overflowButton).toBeTruthy();
    fireEvent.click(overflowButton);
    expect(onClick).toHaveBeenCalledWith(expect.anything(), NODE);
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
