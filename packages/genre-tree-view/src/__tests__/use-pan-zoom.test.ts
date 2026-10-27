import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePanZoom } from "../use-pan-zoom";
import { DEFAULT_VIEWPORT_CENTER_GUARD_MS, PAN_MIN_VISIBLE_PX, PAN_ZOOM_SETTLE_MS, ZOOM_FIT_PADDING, ZOOM_MAX_SCALE, ZOOM_MIN_SCALE, ZOOM_PINCH_SCALE_SPEED } from "../constants";
import { computeFitScale } from "../zoom-pan";

const WHEEL_TICK_DELTA = 4.000244140625;

function nullRef() {
  return { current: null };
}

const noStage = { current: null };

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, PAN_ZOOM_SETTLE_MS + 20));
  });

// Resolves after the frame the hook already scheduled, so its stage write has landed.
const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

// Drag/pinch state only commits on pointerup, so mid-gesture assertions read the stage transform.
const liveView = (stage: HTMLElement) => {
  if (stage.style.transform === "") return { panX: 0, panY: 0, zoomScale: 1 };
  const match = /translate\((.+)px, (.+)px\) scale\((.+)\)/.exec(stage.style.transform);
  if (!match) throw new Error(`unexpected stage transform: "${stage.style.transform}"`);
  return { panX: Number(match[1]), panY: Number(match[2]), zoomScale: Number(match[3]) };
};

describe("usePanZoom", () => {
  it("zoomIn/zoomOut/fitToFrame no-op when the viewport ref isn't attached to a DOM node", () => {
    const { result } = renderHook(() => usePanZoom(nullRef(), undefined, noStage));

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
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

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
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

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
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

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
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

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

    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

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

  it("applies a trackpad-classified ctrl+wheel event to the zoom scale instantly, with no animation delay", async () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

    act(() => {
      // abs(deltaY) < 4 is unambiguously "trackpad" regardless of event timing (see
      // classifyWheelEvent in zoom-pan.ts).
      viewport.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -2, clientX: 50, clientY: 50, bubbles: true }));
    });

    // No waitFor/rAF flush needed: the scale must already reflect the event synchronously.
    await settle();
    expect(result.current.zoomScale).toBeGreaterThan(1);

    document.body.removeChild(viewport);
  });

  it("eases a physical-mouse-wheel-classified ctrl+wheel event toward its target instead of jumping instantly", async () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));
    const baseScale = result.current.zoomScale;

    act(() => {
      // deltaY quantized to an exact multiple of the cross-browser mouse-wheel tick is
      // unambiguously "wheel" (see classifyWheelEvent in zoom-pan.ts).
      viewport.dispatchEvent(
        new WheelEvent("wheel", { ctrlKey: true, deltaY: -(WHEEL_TICK_DELTA * 3), clientX: 50, clientY: 50, bubbles: true }),
      );
    });

    // Unlike the trackpad path above, the scale must not have jumped yet on this same tick.
    expect(result.current.zoomScale).toBe(baseScale);

    await waitFor(() => expect(result.current.zoomScale).toBeGreaterThan(baseScale));

    document.body.removeChild(viewport);
  });

  it("leaves the scale alone when a physical wheel tick zooms in past the max", () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));
    for (let i = 0; i < 200 && result.current.canZoomIn; i++) {
      act(() => result.current.zoomIn());
    }
    const maxScale = result.current.zoomScale;

    act(() => {
      viewport.dispatchEvent(
        new WheelEvent("wheel", { ctrlKey: true, deltaY: -(WHEEL_TICK_DELTA * 3), clientX: 50, clientY: 50, bubbles: true }),
      );
    });

    expect(result.current.zoomScale).toBe(maxScale);
    document.body.removeChild(viewport);
  });

  it("defaults to wheelZoom \"always\": plain wheel zooms and is preventDefault'ed, touchAction is none", async () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));
    const event = new WheelEvent("wheel", { deltaY: -2, clientX: 50, clientY: 50, bubbles: true, cancelable: true });

    act(() => {
      viewport.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    await settle();
    expect(result.current.zoomScale).toBeGreaterThan(1);
    expect(result.current.touchAction).toBe("none");
    document.body.removeChild(viewport);
  });

  it("wheelZoom \"modifier\" leaves a plain wheel to the page: no pan/zoom, no preventDefault, touchAction pan-y", () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    const { result } = renderHook(() => usePanZoom({ current: viewport }, "modifier", noStage));
    const event = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true });

    act(() => {
      viewport.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.panY).toBe(0);
    expect(result.current.zoomScale).toBe(1);
    expect(result.current.touchAction).toBe("pan-y");
    document.body.removeChild(viewport);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }])("wheelZoom \"modifier\" zooms on %o + wheel", async (modifier) => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, "modifier", noStage));
    const event = new WheelEvent("wheel", { ...modifier, deltaY: -2, clientX: 50, clientY: 50, bubbles: true, cancelable: true });

    act(() => {
      viewport.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    await settle();
    expect(result.current.zoomScale).toBeGreaterThan(1);
    document.body.removeChild(viewport);
  });

  it("wheelZoom \"modifier\" pans X on a horizontal-dominant plain wheel and preventDefaults it", async () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    const { result } = renderHook(() => usePanZoom({ current: viewport }, "modifier", noStage));
    const event = new WheelEvent("wheel", { deltaX: 30, deltaY: 10, bubbles: true, cancelable: true });

    act(() => {
      viewport.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    await settle();
    expect(result.current.panX).toBe(-30);
    expect(result.current.panY).toBe(0);
    expect(result.current.zoomScale).toBe(1);
    document.body.removeChild(viewport);
  });

  it.each([
    { mode: "modifier" as const, pointerType: "touch", pans: false, prevented: false },
    { mode: "modifier" as const, pointerType: "mouse", pans: true, prevented: true },
    { mode: "modifier" as const, pointerType: "pen", pans: true, prevented: true },
    { mode: "always" as const, pointerType: "touch", pans: true, prevented: true },
  ])("wheelZoom $mode: a lone $pointerType drag pans=$pans", async ({ mode, pointerType, pans, prevented }) => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    const stage = document.createElement("div");
    const { result } = renderHook(() => usePanZoom({ current: viewport }, mode, { current: stage }));
    const preventDefault = vi.fn();

    act(() => {
      result.current.handlePointerDown({
        pointerId: 1,
        pointerType,
        button: 0,
        clientX: 100,
        clientY: 100,
        target: viewport,
        preventDefault,
      } as unknown as React.PointerEvent);
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 110, clientY: 130 }));
    });

    expect(preventDefault).toHaveBeenCalledTimes(prevented ? 1 : 0);
    await nextFrame();
    expect(liveView(stage).panX).toBe(pans ? 10 : 0);
    expect(liveView(stage).panY).toBe(pans ? 30 : 0);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    });
    document.body.removeChild(viewport);
  });

  it("wheelZoom \"modifier\": two lone touch pointers still pinch-zoom", async () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    const stage = document.createElement("div");
    const { result } = renderHook(() => usePanZoom({ current: viewport }, "modifier", { current: stage }));
    const down = (pointerId: number, clientX: number) =>
      result.current.handlePointerDown({
        pointerId,
        pointerType: "touch",
        button: 0,
        clientX,
        clientY: 500,
        target: viewport,
        preventDefault: () => {},
      } as unknown as React.PointerEvent);

    act(() => {
      down(1, 400);
      down(2, 600);
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 400, clientY: 500 }));
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 600, clientY: 500 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 300, clientY: 500 }));
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 700, clientY: 500 }));
    });

    await nextFrame();
    expect(liveView(stage).zoomScale).toBeGreaterThan(1);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2 }));
    });
    document.body.removeChild(viewport);
  });

  it.each([
    { mode: "modifier" as const, touches: 2, prevented: true },
    { mode: "modifier" as const, touches: 1, prevented: false },
    { mode: "always" as const, touches: 2, prevented: false },
  ])("wheelZoom $mode: a $touches-finger touchmove defaultPrevented=$prevented", ({ mode, touches, prevented }) => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    renderHook(() => usePanZoom({ current: viewport }, mode, noStage));
    const event = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: { length: touches } });

    act(() => {
      viewport.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(prevented);
    document.body.removeChild(viewport);
  });

  it("clamps modifier-mode horizontal wheel-panning so content can never be dragged fully out of view", () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    document.body.appendChild(viewport);
    document.body.appendChild(content);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    // clampPanAxis reads clientWidth/clientHeight (not getBoundingClientRect) for the viewport's
    // size — jsdom defaults these to 0, so they must be stubbed too or the clamp math is exercised
    // against the wrong viewport size.
    Object.defineProperty(viewport, "clientWidth", { value: 1200, configurable: true });
    Object.defineProperty(viewport, "clientHeight", { value: 750, configurable: true });
    content.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 3000, bottom: 4000, width: 3000, height: 4000 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, "modifier", noStage));

    act(() => {
      result.current.fitToFrame([content]);
    });
    const { zoomScale } = result.current;

    // A wildly large wheel delta, repeated many times, mirrors an unbounded scroll/trackpad drag
    // that would otherwise carry panX/panY off to infinity.
    for (let i = 0; i < 50; i++) {
      act(() => {
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaX: 1_000_000, bubbles: true }));
      });
    }

    const { panX } = result.current;
    const screenRight = panX + 3000 * zoomScale;
    // The content's trailing edge must never be dragged past PAN_MIN_VISIBLE_PX from the
    // viewport's leading edge — some part of the tree always stays visible and draggable back.
    expect(screenRight).toBeGreaterThanOrEqual(PAN_MIN_VISIBLE_PX);

    for (let i = 0; i < 50; i++) {
      act(() => {
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaX: -1_000_000, bubbles: true }));
      });
    }

    const opposite = result.current;
    expect(opposite.panX).toBeLessThanOrEqual(1200 - PAN_MIN_VISIBLE_PX);

    document.body.removeChild(viewport);
    document.body.removeChild(content);
  });

  it("ignores wheel events originating inside the info panel, leaving pan/zoom untouched", () => {
    const viewport = document.createElement("div");
    const panel = document.createElement("div");
    panel.className = "gtv-info-panel";
    const panelChild = document.createElement("p");
    panel.appendChild(panelChild);
    viewport.appendChild(panel);
    document.body.appendChild(viewport);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;

    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

    act(() => {
      panelChild.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true }));
    });

    expect(result.current.panX).toBe(0);
    expect(result.current.panY).toBe(0);
    expect(result.current.zoomScale).toBe(1);

    document.body.removeChild(viewport);
  });

  it("clamps click-and-drag panning so content can never be dragged fully out of view", () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    document.body.appendChild(viewport);
    document.body.appendChild(content);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    Object.defineProperty(viewport, "clientWidth", { value: 1200, configurable: true });
    Object.defineProperty(viewport, "clientHeight", { value: 750, configurable: true });
    content.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 3000, bottom: 4000, width: 3000, height: 4000 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

    act(() => {
      result.current.fitToFrame([content]);
    });
    const { zoomScale } = result.current;

    act(() => {
      result.current.handlePointerDown({
        pointerId: 1,
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
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: -1_000_000, clientY: -1_000_000 }));
    });

    const { panX, panY } = result.current;
    const screenRight = panX + 3000 * zoomScale;
    const screenBottom = panY + 4000 * zoomScale;
    expect(screenRight).toBeGreaterThanOrEqual(PAN_MIN_VISIBLE_PX);
    expect(screenBottom).toBeGreaterThanOrEqual(PAN_MIN_VISIBLE_PX);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 1_000_000, clientY: 1_000_000 }));
    });

    const opposite = result.current;
    expect(opposite.panX).toBeLessThanOrEqual(1200 - PAN_MIN_VISIBLE_PX);
    expect(opposite.panY).toBeLessThanOrEqual(750 - PAN_MIN_VISIBLE_PX);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    });

    document.body.removeChild(viewport);
    document.body.removeChild(content);
  });

  it("two-finger touch pinch zooms in around the fingers' midpoint", async () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 }) as DOMRect;
    const stage = document.createElement("div");
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, { current: stage }));

    act(() => {
      result.current.handlePointerDown({
        pointerId: 1,
        button: 0,
        clientX: 400,
        clientY: 500,
        target: viewport,
        preventDefault: () => {},
      } as unknown as React.PointerEvent);
      result.current.handlePointerDown({
        pointerId: 2,
        button: 0,
        clientX: 600,
        clientY: 500,
        target: viewport,
        preventDefault: () => {},
      } as unknown as React.PointerEvent);
    });

    // This first move only captures the starting distance (200px apart) as the pinch baseline —
    // scale stays at 1.
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 400, clientY: 500 }));
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 600, clientY: 500 }));
    });
    expect(result.current.zoomScale).toBe(1);

    // Fingers spread from 200px to 400px apart — distance doubles. Scale change is amplified by
    // ZOOM_PINCH_SCALE_SPEED, not a plain 1:1 doubling — see that constant's rationale.
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 300, clientY: 500 }));
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 700, clientY: 500 }));
    });
    await nextFrame();
    expect(liveView(stage).zoomScale).toBeCloseTo(2 ** ZOOM_PINCH_SCALE_SPEED);
    const panXAfterPinch = liveView(stage).panX;

    // Lifting one finger drops back to a plain single-pointer drag, anchored at the remaining one
    // (700, 500) — moving it 50px further should pan by exactly that 50px, with no jump.
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 750, clientY: 500 }));
    });
    await nextFrame();
    expect(liveView(stage).panX).toBeCloseTo(panXAfterPinch + 50);
    expect(liveView(stage).zoomScale).toBeCloseTo(2 ** ZOOM_PINCH_SCALE_SPEED);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2 }));
    });

    document.body.removeChild(viewport);
  });

  it("ignores a pinch whose fingers start on the same point", () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));
    const down = (pointerId: number) =>
      result.current.handlePointerDown({
        pointerId,
        button: 0,
        clientX: 500,
        clientY: 500,
        target: viewport,
        preventDefault: () => {},
      } as unknown as React.PointerEvent);

    act(() => {
      down(1);
      down(2);
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 500, clientY: 500 }));
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 500, clientY: 500 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 700, clientY: 500 }));
    });
    expect(result.current.zoomScale).toBe(1);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2 }));
    });
    document.body.removeChild(viewport);
  });

  it("recomputes the pinch baseline instead of jumping when a third finger joins mid-pinch", async () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 }) as DOMRect;
    const stage = document.createElement("div");
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, { current: stage }));

    act(() => {
      result.current.handlePointerDown({
        pointerId: 1,
        button: 0,
        clientX: 400,
        clientY: 500,
        target: viewport,
        preventDefault: () => {},
      } as unknown as React.PointerEvent);
      result.current.handlePointerDown({
        pointerId: 2,
        button: 0,
        clientX: 600,
        clientY: 500,
        target: viewport,
        preventDefault: () => {},
      } as unknown as React.PointerEvent);
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 400, clientY: 500 }));
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 600, clientY: 500 }));
    });
    expect(result.current.zoomScale).toBe(1);

    // A third finger lands, then the first finger lifts — the active pair (2, 3) never had its own
    // baseline captured, so it must be recomputed from their current spacing rather than reusing
    // pointers 1/2's stale 200px baseline (which would otherwise cause a sudden zoom jump).
    act(() => {
      result.current.handlePointerDown({
        pointerId: 3,
        button: 0,
        clientX: 650,
        clientY: 500,
        target: viewport,
        preventDefault: () => {},
      } as unknown as React.PointerEvent);
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 600, clientY: 500 }));
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 3, clientX: 650, clientY: 500 }));
    });
    expect(result.current.zoomScale).toBe(1);

    // Now that pair (2, 3) has its own baseline (50px apart), spreading them to 100px should scale
    // by 2^ZOOM_PINCH_SCALE_SPEED from the pre-third-finger value of 1 — not jump based on the old
    // pair's baseline.
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 575, clientY: 500 }));
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 3, clientX: 675, clientY: 500 }));
    });
    await nextFrame();
    expect(liveView(stage).zoomScale).toBeCloseTo(2 ** ZOOM_PINCH_SCALE_SPEED);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2 }));
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 3 }));
    });
    document.body.removeChild(viewport);
  });

  it("still tracks a pinch that starts with a finger on a node, without panning on that finger alone", async () => {
    const viewport = document.createElement("div");
    const node = document.createElement("g");
    node.setAttribute("class", "node");
    viewport.appendChild(node);
    document.body.appendChild(viewport);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 }) as DOMRect;
    const stage = document.createElement("div");
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, { current: stage }));

    act(() => {
      result.current.handlePointerDown({
        pointerId: 1,
        button: 0,
        clientX: 400,
        clientY: 500,
        target: node,
        preventDefault: () => {},
      } as unknown as React.PointerEvent);
    });

    // A single finger down on a node must not pan, so it doesn't fight the node's own click/hover
    // handling.
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 300, clientY: 500 }));
    });
    expect(result.current.panX).toBe(0);
    expect(result.current.panY).toBe(0);

    // A second finger landing on open background still starts a pinch, even though the first
    // finger's pointerdown landed on a node.
    act(() => {
      result.current.handlePointerDown({
        pointerId: 2,
        button: 0,
        clientX: 500,
        clientY: 500,
        target: viewport,
        preventDefault: () => {},
      } as unknown as React.PointerEvent);
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 300, clientY: 500 }));
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 500, clientY: 500 }));
    });
    expect(result.current.zoomScale).toBe(1);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 200, clientY: 500 }));
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 500, clientY: 500 }));
    });
    await nextFrame();
    expect(liveView(stage).zoomScale).toBeCloseTo(1.5 ** ZOOM_PINCH_SCALE_SPEED);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2 }));
    });
    document.body.removeChild(viewport);
  });

  it("centerOnElement no-ops when the viewport ref isn't attached to a DOM node", () => {
    const { result } = renderHook(() => usePanZoom(nullRef(), undefined, noStage));

    act(() => {
      result.current.centerOnElement(document.createElement("div"), 1);
    });

    expect(result.current.zoomScale).toBe(1);
    expect(result.current.panX).toBe(0);
    expect(result.current.panY).toBe(0);
  });

  it("centerOnElement no-ops when given no element", () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

    act(() => {
      result.current.centerOnElement(null, 1);
      result.current.centerOnElement(undefined, 1);
    });

    expect(result.current.zoomScale).toBe(1);
    document.body.removeChild(viewport);
  });

  it("centerOnElement no-ops when the viewport has zero width/height", () => {
    const viewport = document.createElement("div");
    const element = document.createElement("div");
    document.body.appendChild(viewport);
    document.body.appendChild(element);
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) as DOMRect;
    element.getBoundingClientRect = () => ({ left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

    act(() => {
      result.current.centerOnElement(element, 1);
    });

    expect(result.current.zoomScale).toBe(1);
    expect(result.current.panX).toBe(0);
    expect(result.current.panY).toBe(0);
    document.body.removeChild(viewport);
    document.body.removeChild(element);
  });

  it("centerOnElement animates the element's center to the viewport's center at the given scale, without jumping instantly", async () => {
    const viewport = document.createElement("div");
    const element = document.createElement("div");
    document.body.appendChild(viewport);
    document.body.appendChild(element);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    element.getBoundingClientRect = () =>
      ({ left: 100, top: 200, right: 180, bottom: 240, width: 80, height: 40 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));
    const baseScale = result.current.zoomScale;

    act(() => {
      result.current.centerOnElement(element, 2);
    });

    // Must glide smoothly (Google Maps style) rather than jumping to the target on this same tick.
    expect(result.current.zoomScale).toBe(baseScale);

    await waitFor(() => expect(result.current.zoomScale).toBe(2));
    // Element's center (140, 220) at scale 2 must land exactly on the viewport's center (600, 375).
    expect(result.current.panX + 140 * 2).toBeCloseTo(600);
    expect(result.current.panY + 220 * 2).toBeCloseTo(375);

    document.body.removeChild(viewport);
    document.body.removeChild(element);
  });

  it("centerOnElement keeps the current scale when it's already above the target, only panning", async () => {
    const viewport = document.createElement("div");
    const element = document.createElement("div");
    document.body.appendChild(viewport);
    document.body.appendChild(element);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    element.getBoundingClientRect = () =>
      ({ left: 100, top: 200, right: 180, bottom: 240, width: 80, height: 40 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));
    const baseScale = result.current.zoomScale;

    act(() => {
      result.current.centerOnElement(element, baseScale / 2);
    });

    await waitFor(() => expect(result.current.panX + 140 * baseScale).toBeCloseTo(600));
    expect(result.current.zoomScale).toBe(baseScale);
    expect(result.current.panY + 220 * baseScale).toBeCloseTo(375);

    document.body.removeChild(viewport);
    document.body.removeChild(element);
  });

  it("centerOnElement clamps the target scale to at most ZOOM_MAX_SCALE", async () => {
    const viewport = document.createElement("div");
    const element = document.createElement("div");
    document.body.appendChild(viewport);
    document.body.appendChild(element);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    element.getBoundingClientRect = () =>
      ({ left: 100, top: 200, right: 180, bottom: 240, width: 80, height: 40 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

    act(() => {
      result.current.centerOnElement(element, 999);
    });

    await waitFor(() => expect(result.current.zoomScale).toBe(ZOOM_MAX_SCALE));

    document.body.removeChild(viewport);
    document.body.removeChild(element);
  });

  it("centerOnElement centers within the strip beside a left-obscuring overlay instead of the viewport's full width", async () => {
    const viewport = document.createElement("div");
    const element = document.createElement("div");
    document.body.appendChild(viewport);
    document.body.appendChild(element);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    element.getBoundingClientRect = () =>
      ({ left: 100, top: 200, right: 180, bottom: 240, width: 80, height: 40 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

    act(() => {
      result.current.centerOnElement(element, 2, { width: 300, side: "left" });
    });

    await waitFor(() => expect(result.current.zoomScale).toBe(2));
    // Element's center (140, 220) at scale 2 must land at the midpoint of the visible strip to
    // the right of the 300px-wide overlay: 300 + (1200 - 300) / 2 = 750.
    expect(result.current.panX + 140 * 2).toBeCloseTo(750);
    expect(result.current.panY + 220 * 2).toBeCloseTo(375);

    document.body.removeChild(viewport);
    document.body.removeChild(element);
  });

  it("keeps the viewport's pan center fixed on screen when its box is resized", () => {
    let resizeCallback: ((entries: { contentRect: { width: number; height: number } }[]) => void) | null = null;
    const observe = vi.fn();
    const disconnect = vi.fn();
    const originalResizeObserver = global.ResizeObserver;
    global.ResizeObserver = vi.fn().mockImplementation(function (callback) {
      resizeCallback = callback;
      return { observe, disconnect, unobserve: vi.fn() };
    }) as unknown as typeof ResizeObserver;

    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

    expect(observe).toHaveBeenCalledWith(viewport);

    act(() => {
      resizeCallback!([{ contentRect: { width: 800, height: 600 } }]);
    });
    // First observation just records the initial size; nothing to compare against yet.
    expect(result.current.panX).toBe(0);
    expect(result.current.panY).toBe(0);

    act(() => {
      resizeCallback!([{ contentRect: { width: 1000, height: 500 } }]);
    });
    // Growing 200px wider / 100px shorter shifts pan by half the delta on each axis, so the point
    // that was centered in the old box stays centered in the new one.
    expect(result.current.panX).toBeCloseTo(100);
    expect(result.current.panY).toBeCloseTo(-50);

    document.body.removeChild(viewport);
    global.ResizeObserver = originalResizeObserver;
  });

  it("retargets an in-flight wheel glide and ignores ticks that cannot move the target", () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));
    const tick = (deltaY: number) =>
      viewport.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY, clientX: 50, clientY: 50, bubbles: true }));

    act(() => {
      tick(-(WHEEL_TICK_DELTA * 3));
      tick(-(WHEEL_TICK_DELTA * 3));
      tick(WHEEL_TICK_DELTA * 1000);
      tick(WHEEL_TICK_DELTA * 1000);
    });

    expect(result.current.zoomScale).toBe(1);
    document.body.removeChild(viewport);
  });

  it("ignores resize observations with no entries or no size change", () => {
    let resizeCallback: ((entries: { contentRect: { width: number; height: number } }[]) => void) | null = null;
    const originalResizeObserver = global.ResizeObserver;
    global.ResizeObserver = vi.fn().mockImplementation(function (callback) {
      resizeCallback = callback;
      return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
    }) as unknown as typeof ResizeObserver;

    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

    act(() => {
      resizeCallback!([]);
      resizeCallback!([{ contentRect: { width: 800, height: 600 } }]);
      resizeCallback!([{ contentRect: { width: 800, height: 600 } }]);
    });

    expect(result.current.panX).toBe(0);
    expect(result.current.panY).toBe(0);
    document.body.removeChild(viewport);
    global.ResizeObserver = originalResizeObserver;
  });

  it("centerOnElement centers within the strip beside a right-obscuring overlay and cancels an in-flight wheel glide", async () => {
    const viewport = document.createElement("div");
    const element = document.createElement("div");
    document.body.appendChild(viewport);
    document.body.appendChild(element);
    viewport.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
    element.getBoundingClientRect = () =>
      ({ left: 100, top: 200, right: 180, bottom: 240, width: 80, height: 40 }) as DOMRect;
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

    act(() => {
      viewport.dispatchEvent(
        new WheelEvent("wheel", { ctrlKey: true, deltaY: -(WHEEL_TICK_DELTA * 3), clientX: 50, clientY: 50, bubbles: true }),
      );
      result.current.centerOnElement(element, 2, { width: 300, side: "right" });
    });

    await waitFor(() => expect(result.current.zoomScale).toBe(2));
    expect(result.current.panX + 140 * 2).toBeCloseTo(450);

    document.body.removeChild(viewport);
    document.body.removeChild(element);
  });

  it("ignores window pointer moves from pointers that never went down", () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    const { result } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 99, clientX: 10, clientY: 10 }));
    });

    expect(result.current.panX).toBe(0);
    document.body.removeChild(viewport);
  });

  it("removes its window pointer listeners on unmount even mid-gesture", () => {
    const viewport = document.createElement("div");
    document.body.appendChild(viewport);
    const { result, unmount } = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage));

    act(() => {
      result.current.handlePointerDown({
        pointerId: 1,
        button: 0,
        clientX: 0,
        clientY: 0,
        target: viewport,
        preventDefault: () => {},
      } as unknown as React.PointerEvent);
    });

    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("pointerup", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("pointercancel", expect.any(Function));

    removeEventListenerSpy.mockRestore();
    document.body.removeChild(viewport);
  });

  describe("viewport deep link", () => {
    const mount = (options: Parameters<typeof usePanZoom>[3]) => {
      const viewport = document.createElement("div");
      const content = document.createElement("div");
      document.body.appendChild(viewport);
      document.body.appendChild(content);
      viewport.getBoundingClientRect = () =>
        ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
      content.getBoundingClientRect = () =>
        ({ left: 0, top: 0, right: 1200, bottom: 750, width: 1200, height: 750 }) as DOMRect;
      const hook = renderHook(() => usePanZoom({ current: viewport }, undefined, noStage, options));
      const cleanup = () => {
        document.body.removeChild(viewport);
        document.body.removeChild(content);
      };
      return { ...hook, content, cleanup };
    };

    it("applies defaultViewport on the first fitToFrame instead of the fitted view, without notifying", () => {
      const onViewportChange = vi.fn();
      const { result, content, cleanup } = mount({ defaultViewport: { x: 400, y: 300, zoom: 0.5 }, onViewportChange });

      act(() => {
        result.current.fitToFrame([content], { silent: true });
      });

      expect(result.current.zoomScale).toBe(0.5);
      expect(result.current.panX).toBe(1200 / 2 - 400 * 0.5);
      expect(result.current.panY).toBe(750 / 2 - 300 * 0.5);
      expect(onViewportChange).not.toHaveBeenCalled();
      cleanup();
    });

    it("applies defaultViewport only once", () => {
      const { result, content, cleanup } = mount({ defaultViewport: { x: 400, y: 300, zoom: 0.5 } });

      act(() => {
        result.current.fitToFrame([content], { silent: true });
      });
      act(() => {
        result.current.fitToFrame([content], { silent: true });
      });

      expect(result.current.zoomScale).not.toBe(0.5);
      cleanup();
    });

    it("clamps a seeded zoom to the allowed range", () => {
      const { result, content, cleanup } = mount({ defaultViewport: { x: 0, y: 0, zoom: ZOOM_MAX_SCALE * 10 } });

      act(() => {
        result.current.fitToFrame([content]);
      });

      expect(result.current.zoomScale).toBe(ZOOM_MAX_SCALE);
      cleanup();
    });

    it("ignores centerOnElement right after seeding, then honors it once the guard expires", async () => {
      const { result, content, cleanup } = mount({ defaultViewport: { x: 600, y: 375, zoom: 0.5 } });
      act(() => {
        result.current.fitToFrame([content], { silent: true });
      });

      act(() => {
        result.current.centerOnElement(content, 1.5);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 700));
      });
      expect(result.current.zoomScale).toBe(0.5);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, DEFAULT_VIEWPORT_CENTER_GUARD_MS));
      });
      act(() => {
        result.current.centerOnElement(content, 1.5);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 700));
      });
      expect(result.current.zoomScale).toBe(1.5);

      cleanup();
    });

    it("notifies the settled content-space viewport after a user zoom, but not after a silent fit", () => {
      const onViewportChange = vi.fn();
      const { result, content, cleanup } = mount({ onViewportChange });

      act(() => {
        result.current.fitToFrame([content], { silent: true });
      });
      expect(onViewportChange).not.toHaveBeenCalled();

      act(() => {
        result.current.zoomIn();
      });
      expect(onViewportChange).toHaveBeenCalledTimes(1);
      const { x, y, zoom } = onViewportChange.mock.calls[0][0];
      expect(zoom).toBe(result.current.zoomScale);
      expect(x).toBeCloseTo((1200 / 2 - result.current.panX) / zoom);
      expect(y).toBeCloseTo((750 / 2 - result.current.panY) / zoom);

      act(() => {
        result.current.fitToFrame([content]);
      });
      expect(onViewportChange).toHaveBeenCalledTimes(2);
      cleanup();
    });
  });
});
