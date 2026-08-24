import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePanZoom } from "../use-pan-zoom";

function nullRef() {
  return { current: null };
}

describe("usePanZoom", () => {
  it("zoomIn/zoomOut/fitToFrame no-op when the viewport ref isn't attached to a DOM node", () => {
    const { result } = renderHook(() => usePanZoom(nullRef()));

    act(() => {
      result.current.zoomIn();
      result.current.zoomOut();
      result.current.fitToFrame([document.createElement("div")]);
    });

    expect(result.current.zoomScale).toBe(1);
    expect(result.current.panX).toBe(0);
    expect(result.current.panY).toBe(0);
  });

  it("fitToFrame no-ops when given no elements", () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    const { result } = renderHook(() => usePanZoom({ current: viewport }));

    act(() => {
      result.current.fitToFrame([null, undefined]);
    });

    expect(result.current.zoomScale).toBe(1);
    document.body.removeChild(viewport);
  });

  it("fitToFrame no-ops when the measured content has zero width/height", () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    document.body.appendChild(viewport);
    document.body.appendChild(content);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500 }) as DOMRect;
    content.getBoundingClientRect = () => ({ left: 10, top: 10, right: 10, bottom: 10, width: 0, height: 0 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }));

    act(() => {
      result.current.fitToFrame([content]);
    });

    expect(result.current.zoomScale).toBe(1);
    document.body.removeChild(viewport);
    document.body.removeChild(content);
  });
});
