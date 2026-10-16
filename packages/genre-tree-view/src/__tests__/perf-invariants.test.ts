import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAN_ZOOM_SETTLE_MS } from "../constants";
import { usePanZoom } from "../use-pan-zoom";

function setup() {
  const viewport = document.createElement("div");
  const stage = document.createElement("div");
  document.body.appendChild(viewport);
  viewport.appendChild(stage);
  viewport.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 }) as DOMRect;
  let renders = 0;
  const { result, unmount } = renderHook(() => {
    renders++;
    return usePanZoom({ current: viewport }, "always", { current: stage });
  });
  const transformWrites = vi.fn();
  let transform = "";
  Object.defineProperty(stage.style, "transform", {
    get: () => transform,
    set: (value: string) => {
      transform = value;
      transformWrites(value);
    },
  });
  return {
    viewport,
    stage,
    result,
    transformWrites,
    getRenders: () => renders,
    cleanup: () => {
      unmount();
      viewport.remove();
    },
  };
}

const down = (result: ReturnType<typeof setup>["result"], target: Element) =>
  result.current.handlePointerDown({
    pointerId: 1,
    button: 0,
    clientX: 100,
    clientY: 100,
    target,
    preventDefault: () => {},
  } as unknown as React.PointerEvent);

describe("pan/zoom performance invariants", () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not re-render while dragging, and commits once on pointerup", () => {
    const { viewport, result, getRenders, cleanup } = setup();
    act(() => down(result, viewport));
    const rendersBeforeDrag = getRenders();

    for (let i = 1; i <= 50; i++) {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 100 + i, clientY: 100 }));
    }
    expect(getRenders()).toBe(rendersBeforeDrag);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    });
    expect(result.current.panX).toBe(50);
    expect(getRenders()).toBeLessThanOrEqual(rendersBeforeDrag + 1);
    cleanup();
  });

  it("does not commit when the pointer pauses mid-drag, only on pointerup", () => {
    const { viewport, stage, result, getRenders, cleanup } = setup();
    act(() => down(result, viewport));
    const rendersBeforeDrag = getRenders();

    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 110, clientY: 100 }));
    act(() => {
      frames.splice(0).forEach((cb) => cb(0));
      vi.advanceTimersByTime(PAN_ZOOM_SETTLE_MS * 5);
    });
    expect(getRenders()).toBe(rendersBeforeDrag);
    expect(stage.classList.contains("gtv-stage--moving")).toBe(true);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    });
    expect(result.current.panX).toBe(10);
    expect(stage.classList.contains("gtv-stage--moving")).toBe(false);
    cleanup();
  });

  it("does not re-render during a trackpad wheel burst, and commits once after it goes idle", () => {
    const { viewport, result, getRenders, cleanup } = setup();
    const rendersBefore = getRenders();

    for (let i = 0; i < 20; i++) {
      viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -2, clientX: 500, clientY: 500, bubbles: true, cancelable: true }));
    }
    expect(getRenders()).toBe(rendersBefore);

    act(() => {
      vi.advanceTimersByTime(PAN_ZOOM_SETTLE_MS);
    });
    expect(result.current.zoomScale).toBeGreaterThan(1);
    expect(getRenders()).toBeLessThanOrEqual(rendersBefore + 1);
    cleanup();
  });

  it("writes the stage transform once per frame regardless of how many events arrived", () => {
    const { viewport, transformWrites, cleanup } = setup();

    for (let i = 0; i < 20; i++) {
      viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -2, clientX: 500, clientY: 500, bubbles: true, cancelable: true }));
    }
    expect(transformWrites).not.toHaveBeenCalled();

    frames.splice(0).forEach((cb) => cb(0));
    expect(transformWrites).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("marks the stage as moving during a gesture and clears it when the gesture settles", () => {
    const { viewport, stage, result, cleanup } = setup();
    act(() => down(result, viewport));

    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 120, clientY: 100 }));
    frames.splice(0).forEach((cb) => cb(0));
    expect(stage.classList.contains("gtv-stage--moving")).toBe(true);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    });
    expect(stage.classList.contains("gtv-stage--moving")).toBe(false);
    expect(stage.style.transform).toBe("translate(20px, 0px) scale(1)");
    cleanup();
  });
});
