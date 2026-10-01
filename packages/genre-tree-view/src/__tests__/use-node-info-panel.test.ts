import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useNodeInfoPanel } from "../use-node-info-panel";
import { GenreTreeNode } from "../types";

const nodeA: GenreTreeNode = { id: "a", parentId: null, name: "Rock", itemCount: 10 };
const nodeB: GenreTreeNode = { id: "b", parentId: "a", name: "Punk", itemCount: 3 };

function elementAt(left: number): Element {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ left, top: 0, right: left + 10, bottom: 10, width: 10, height: 10 }) as DOMRect;
  return el;
}

describe("useNodeInfoPanel", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => useNodeInfoPanel());
    expect(result.current.panel).toBeNull();
  });

  it("opens the panel for a clicked node, resolving its side from the element/viewport rects", () => {
    const { result } = renderHook(() => useNodeInfoPanel());
    const viewport = elementAt(0);
    const element = elementAt(400);

    act(() => {
      result.current.showNodeInfo(nodeA, element, viewport);
    });

    expect(result.current.panel).toEqual({ node: nodeA, side: "left" });
  });

  it("switches to a different node's content without closing", () => {
    const { result } = renderHook(() => useNodeInfoPanel());
    const viewport = elementAt(0);

    act(() => {
      result.current.showNodeInfo(nodeA, elementAt(400), viewport);
    });
    expect(result.current.panel).toEqual({ node: nodeA, side: "left" });

    act(() => {
      result.current.showNodeInfo(nodeB, elementAt(100), viewport);
    });
    expect(result.current.panel).toEqual({ node: nodeB, side: "left" });
  });

  it("closes only via closeNodeInfo", () => {
    const { result } = renderHook(() => useNodeInfoPanel());
    const viewport = elementAt(0);

    act(() => {
      result.current.showNodeInfo(nodeA, elementAt(400), viewport);
    });
    expect(result.current.panel).not.toBeNull();

    act(() => {
      result.current.closeNodeInfo();
    });
    expect(result.current.panel).toBeNull();
  });

  it("no-ops when the clicked element is null", () => {
    const { result } = renderHook(() => useNodeInfoPanel());

    act(() => {
      result.current.showNodeInfo(nodeA, null, elementAt(0));
    });

    expect(result.current.panel).toBeNull();
  });

  it("no-ops when the viewport is null", () => {
    const { result } = renderHook(() => useNodeInfoPanel());

    act(() => {
      result.current.showNodeInfo(nodeA, elementAt(400), null);
    });

    expect(result.current.panel).toBeNull();
  });

  describe("controlled selection", () => {
    it("notifies onSelectedNodeChange on show and on close", () => {
      const onSelectedNodeChange = vi.fn();
      const { result } = renderHook(() => useNodeInfoPanel({ onSelectedNodeChange }));

      act(() => {
        result.current.showNodeInfo(nodeA, elementAt(400), elementAt(0));
      });
      expect(onSelectedNodeChange).toHaveBeenLastCalledWith(nodeA);

      act(() => {
        result.current.closeNodeInfo();
      });
      expect(onSelectedNodeChange).toHaveBeenLastCalledWith(null);
      expect(onSelectedNodeChange).toHaveBeenCalledTimes(2);
    });

    it("does not notify when syncing to the consumer's selectedNodeId (notify: false)", () => {
      const onSelectedNodeChange = vi.fn();
      const { result } = renderHook(() => useNodeInfoPanel({ selectedNodeId: "a", onSelectedNodeChange }));

      act(() => {
        result.current.showNodeInfo(nodeA, elementAt(400), elementAt(0), { notify: false });
      });

      expect(result.current.panel?.node).toBe(nodeA);
      expect(onSelectedNodeChange).not.toHaveBeenCalled();
    });

    it("notifies a user selection of the controlled id once the panel has moved away from it", () => {
      const onSelectedNodeChange = vi.fn();
      const { result } = renderHook(() => useNodeInfoPanel({ selectedNodeId: "a", onSelectedNodeChange }));

      act(() => {
        result.current.showNodeInfo(nodeA, elementAt(400), elementAt(0), { notify: false });
      });
      act(() => {
        result.current.showNodeInfo(nodeB, elementAt(400), elementAt(0));
      });
      act(() => {
        result.current.showNodeInfo(nodeA, elementAt(400), elementAt(0));
      });

      expect(onSelectedNodeChange.mock.calls.map(([node]) => node?.id)).toEqual(["b", "a"]);
    });

    it("does not notify when re-selecting the node already shown", () => {
      const onSelectedNodeChange = vi.fn();
      const { result } = renderHook(() => useNodeInfoPanel({ onSelectedNodeChange }));

      act(() => {
        result.current.showNodeInfo(nodeA, elementAt(400), elementAt(0));
      });
      act(() => {
        result.current.showNodeInfo(nodeA, elementAt(400), elementAt(0));
      });

      expect(onSelectedNodeChange).toHaveBeenCalledTimes(1);
    });

    it.each([null, undefined])("closes without notifying when selectedNodeId goes from an id to %s", (cleared) => {
      const onSelectedNodeChange = vi.fn();
      const { result, rerender } = renderHook(
        ({ selectedNodeId }: { selectedNodeId?: string | null }) =>
          useNodeInfoPanel({ selectedNodeId, onSelectedNodeChange }),
        { initialProps: { selectedNodeId: "a" as string | null | undefined } },
      );
      act(() => {
        result.current.showNodeInfo(nodeA, elementAt(400), elementAt(0), { notify: false });
      });

      rerender({ selectedNodeId: cleared });

      expect(result.current.panel).toBeNull();
      expect(onSelectedNodeChange).not.toHaveBeenCalled();
    });

    it("keeps the panel open when selectedNodeId switches between ids", () => {
      const { result, rerender } = renderHook(
        ({ selectedNodeId }: { selectedNodeId: string | null }) => useNodeInfoPanel({ selectedNodeId }),
        { initialProps: { selectedNodeId: "a" as string | null } },
      );
      act(() => {
        result.current.showNodeInfo(nodeA, elementAt(400), elementAt(0));
      });

      rerender({ selectedNodeId: "b" });

      expect(result.current.panel?.node).toBe(nodeA);
    });
  });
});
