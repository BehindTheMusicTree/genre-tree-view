import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePanZoom } from "../use-pan-zoom";
import { PAN_MIN_VISIBLE_PX, ZOOM_FIT_PADDING, ZOOM_MIN_SCALE } from "../constants";
import { computeFitScale } from "../zoom-pan";

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

  it("fitToFrame no-ops when the viewport is too small to hold ZOOM_FIT_PADDING on both sides", () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    document.body.appendChild(viewport);
    document.body.appendChild(content);
    const collapsedSize = ZOOM_FIT_PADDING * 2 - 1;
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: collapsedSize, bottom: collapsedSize, width: collapsedSize, height: collapsedSize }) as DOMRect;
    content.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }));

    act(() => {
      result.current.fitToFrame([content]);
    });

    expect(result.current.zoomScale).toBe(1);
    expect(result.current.panX).toBe(0);
    expect(result.current.panY).toBe(0);
    document.body.removeChild(viewport);
    document.body.removeChild(content);
  });

  it("fitToFrame's computed transform contains the full measured content bounding box, uncropped", () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    document.body.appendChild(viewport);
    document.body.appendChild(content);
    // Content (3000x4000) is far larger than the viewport (1200x750), mirroring a tall/wide tree
    // rendered inside a fixed-size frame smaller than its own unscaled extent.
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    content.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 3000, bottom: 4000, width: 3000, height: 4000 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }));

    act(() => {
      result.current.fitToFrame([content]);
    });

    const { panX, panY, zoomScale } = result.current;
    const screenLeft = panX;
    const screenTop = panY;
    const screenRight = panX + 3000 * zoomScale;
    const screenBottom = panY + 4000 * zoomScale;

    // Full content bounding box must land entirely inside the viewport — no node/edge clipped.
    expect(screenLeft).toBeGreaterThanOrEqual(0);
    expect(screenTop).toBeGreaterThanOrEqual(0);
    expect(screenRight).toBeLessThanOrEqual(1200);
    expect(screenBottom).toBeLessThanOrEqual(750);

    // Height is the binding constraint here, so the fitted content should sit right up against
    // ZOOM_FIT_PADDING vertically (not shrunk far more than necessary, which would also indicate
    // a wrong viewport measurement).
    expect(screenTop).toBeCloseTo(ZOOM_FIT_PADDING, 0);
    expect(750 - screenBottom).toBeCloseTo(ZOOM_FIT_PADDING, 0);

    document.body.removeChild(viewport);
    document.body.removeChild(content);
  });

  it("relaxes manual zoom-out's floor to match a fitToFrame scale below ZOOM_MIN_SCALE", () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    document.body.appendChild(viewport);
    document.body.appendChild(content);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }) as DOMRect;
    // Content large enough that computeFitScale must go well below ZOOM_MIN_SCALE to fit it.
    content.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 100000, bottom: 100000, width: 100000, height: 100000 }) as DOMRect;
    const expectedFitScale = computeFitScale(100000, 100000, 100, 100, ZOOM_FIT_PADDING);
    expect(expectedFitScale).toBeLessThan(ZOOM_MIN_SCALE);

    const { result } = renderHook(() => usePanZoom({ current: viewport }));

    act(() => {
      result.current.fitToFrame([content]);
    });
    expect(result.current.zoomScale).toBeCloseTo(expectedFitScale);

    // Zoom back in above the static floor, then confirm manual zoom-out can walk back down past
    // ZOOM_MIN_SCALE instead of bottoming out there — i.e. it can reach at least as far out as
    // fitToFrame already did.
    for (let i = 0; i < 100 && result.current.zoomScale <= ZOOM_MIN_SCALE; i++) {
      act(() => result.current.zoomIn());
    }
    expect(result.current.zoomScale).toBeGreaterThan(ZOOM_MIN_SCALE);

    for (let i = 0; i < 200 && result.current.canZoomOut; i++) {
      act(() => result.current.zoomOut());
    }
    expect(result.current.zoomScale).toBeLessThan(ZOOM_MIN_SCALE);

    document.body.removeChild(viewport);
    document.body.removeChild(content);
  });

  it("clamps plain wheel-panning so content can never be dragged fully out of view", () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    document.body.appendChild(viewport);
    document.body.appendChild(content);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    content.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 3000, bottom: 4000, width: 3000, height: 4000 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }));

    act(() => {
      result.current.fitToFrame([content]);
    });
    const { zoomScale } = result.current;

    // A wildly large wheel delta, repeated many times, mirrors an unbounded scroll/trackpad drag
    // that would otherwise carry panX/panY off to infinity.
    for (let i = 0; i < 50; i++) {
      act(() => {
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaX: 1_000_000, deltaY: 1_000_000, bubbles: true }));
      });
    }

    const { panX, panY } = result.current;
    const screenRight = panX + 3000 * zoomScale;
    const screenBottom = panY + 4000 * zoomScale;
    // The content's trailing edge must never be dragged past PAN_MIN_VISIBLE_PX from the
    // viewport's leading edge — some part of the tree always stays visible and draggable back.
    expect(screenRight).toBeGreaterThanOrEqual(PAN_MIN_VISIBLE_PX);
    expect(screenBottom).toBeGreaterThanOrEqual(PAN_MIN_VISIBLE_PX);

    for (let i = 0; i < 50; i++) {
      act(() => {
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaX: -1_000_000, deltaY: -1_000_000, bubbles: true }));
      });
    }

    const opposite = result.current;
    expect(opposite.panX).toBeLessThanOrEqual(1200 - PAN_MIN_VISIBLE_PX);
    expect(opposite.panY).toBeLessThanOrEqual(750 - PAN_MIN_VISIBLE_PX);

    document.body.removeChild(viewport);
    document.body.removeChild(content);
  });

  it("clamps click-and-drag panning so content can never be dragged fully out of view", () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    document.body.appendChild(viewport);
    document.body.appendChild(content);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    content.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 3000, bottom: 4000, width: 3000, height: 4000 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }));

    act(() => {
      result.current.fitToFrame([content]);
    });
    const { zoomScale } = result.current;

    act(() => {
      result.current.handlePointerDown({
        button: 0,
        clientX: 0,
        clientY: 0,
        target: viewport,
        preventDefault: () => {},
      } as unknown as React.PointerEvent);
    });

    // A wildly large single drag mirrors a fast/flung pointer move that would otherwise carry
    // panX/panY off to infinity in one step.
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: -1_000_000, clientY: -1_000_000 }));
    });

    const { panX, panY } = result.current;
    const screenRight = panX + 3000 * zoomScale;
    const screenBottom = panY + 4000 * zoomScale;
    expect(screenRight).toBeGreaterThanOrEqual(PAN_MIN_VISIBLE_PX);
    expect(screenBottom).toBeGreaterThanOrEqual(PAN_MIN_VISIBLE_PX);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 1_000_000, clientY: 1_000_000 }));
    });

    const opposite = result.current;
    expect(opposite.panX).toBeLessThanOrEqual(1200 - PAN_MIN_VISIBLE_PX);
    expect(opposite.panY).toBeLessThanOrEqual(750 - PAN_MIN_VISIBLE_PX);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });

    document.body.removeChild(viewport);
    document.body.removeChild(content);
  });
});
