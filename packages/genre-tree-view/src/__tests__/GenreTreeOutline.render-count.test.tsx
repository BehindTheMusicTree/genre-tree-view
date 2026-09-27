import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { GenreTreeOutline } from "../GenreTreeOutline";
import { InfoPanel } from "../InfoPanel";
import { NodeToolbar } from "../NodeToolbar";
import { buildTreeIndex } from "../tree-index";
import type { GenreTreeNode } from "../types";

// Spying on these modules counts renders without any production-code hooks: each rendered
// OutlineNode renders exactly one NodeToolbar (showToolbar defaults to true).
vi.mock("../NodeToolbar", { spy: true });
vi.mock("../InfoPanel", { spy: true });
vi.mock("../tree-index", { spy: true });

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mainstream Pop + 9 roots × 10 children × 10 grandchildren = 1000 nodes.
function buildFixture(): GenreTreeNode[] {
  const nodes: GenreTreeNode[] = [{ id: "pop", parentId: null, name: "Mainstream Pop", itemCount: 1 }];
  for (let r = 0; r < 9; r++) {
    const rootId = `r${r}`;
    nodes.push({ id: rootId, parentId: null, name: `Root ${r}`, itemCount: 1 });
    for (let c = 0; c < 10; c++) {
      const childId = `${rootId}-c${c}`;
      nodes.push({ id: childId, parentId: rootId, name: `Child ${r}.${c}`, itemCount: 1, side: c % 3 === 0 ? "pop" : "core" });
      for (let g = 0; g < 10; g++) {
        nodes.push({ id: `${childId}-g${g}`, parentId: childId, name: `Grandchild ${r}.${c}.${g}`, itemCount: 1 });
      }
    }
  }
  return nodes.slice(0, 1000);
}

const NODES = buildFixture();

function nameButton(container: HTMLElement, id: string) {
  return container.querySelector(`[data-gtv-node-id="${id}"] .gtv-outline-name`) as HTMLButtonElement;
}

// One batched commit per tree level instead of one per section.
function expandAll(container: HTMLElement) {
  for (
    let closed = container.querySelectorAll("details:not([open])");
    closed.length > 0;
    closed = container.querySelectorAll("details:not([open])")
  ) {
    act(() => closed.forEach((details) => fireEvent.click(details.querySelector("summary")!)));
  }
}

describe("GenreTreeOutline render cost", () => {
  it("re-renders only the previously and newly selected rows plus the panel on selection", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    expandAll(container);
    expect(container.querySelectorAll(".gtv-outline-row")).toHaveLength(NODES.length);

    fireEvent.click(nameButton(container, "r1-c1-g1"));
    vi.mocked(NodeToolbar).mockClear();
    vi.mocked(InfoPanel).mockClear();

    fireEvent.click(nameButton(container, "r7-c8-g9"));
    expect(vi.mocked(NodeToolbar)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(InfoPanel)).toHaveBeenCalledTimes(1);

    vi.mocked(NodeToolbar).mockClear();
    fireEvent.click(within(container.querySelector(".gtv-info-panel") as HTMLElement).getByText("Child 7.8"));
    expect(vi.mocked(NodeToolbar)).toHaveBeenCalledTimes(2);
  }, 30000);

  it("builds the tree index once per nodes identity across selections and consumer re-renders", () => {
    const { container, rerender } = render(<GenreTreeOutline nodes={NODES} />);
    fireEvent.click(nameButton(container, "r0"));
    fireEvent.click(nameButton(container, "r1"));
    rerender(<GenreTreeOutline nodes={NODES} playingNodeId="r1" />);
    fireEvent.click(nameButton(container, "r2"));
    expect(vi.mocked(buildTreeIndex)).toHaveBeenCalledTimes(1);

    rerender(<GenreTreeOutline nodes={[...NODES]} />);
    expect(vi.mocked(buildTreeIndex)).toHaveBeenCalledTimes(2);
  });

  it("renders no rows inside a closed branch until it opens", () => {
    const { container } = render(<GenreTreeOutline nodes={NODES} />);
    expect(container.querySelectorAll(".gtv-outline-row")).toHaveLength(10);

    const root = container.querySelector('[data-gtv-node-id="r0"] details')!;
    fireEvent.click(root.querySelector("summary")!);
    expect(root.querySelectorAll(".gtv-outline-row")).toHaveLength(1);
    expect(root.querySelectorAll(".gtv-outline-section-label")).toHaveLength(2);

    const coreSection = root.querySelectorAll("details")[0];
    fireEvent.click(coreSection.querySelector("summary")!);
    expect(coreSection.querySelectorAll(".gtv-outline-row")).toHaveLength(6);

    fireEvent.click(root.querySelector("summary")!);
    expect(root.querySelectorAll(".gtv-outline-row")).toHaveLength(1);
  });
});
