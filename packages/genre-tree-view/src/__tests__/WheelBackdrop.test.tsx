import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createRef } from "react";
import { WheelBackdrop } from "../WheelBackdrop";
import type { PanZoomView } from "../use-pan-zoom";
import { stubBackdropLayout } from "./backdrop-test-utils";

function harness() {
  let emit: (view: PanZoomView) => void = () => {};
  const subscribeView = (listener: (view: PanZoomView) => void) => {
    emit = listener;
    listener({ x: 0, y: 0, k: 1 });
    return () => {};
  };
  return { subscribeView, emit: (view: PanZoomView) => act(() => emit(view)) };
}

function renderBackdrop(extra: Partial<React.ComponentProps<typeof WheelBackdrop>> = {}) {
  const h = harness();
  const pivotRef = createRef<HTMLDivElement>();
  const utils = render(
    <div>
      <div>
        <div ref={pivotRef} />
      </div>
      <WheelBackdrop
        subscribeView={h.subscribeView}
        viewportSize={{ width: 800, height: 600 }}
        pivotRef={pivotRef}
        sectors={[{ key: "a", startDeg: 0, endDeg: 90, fill: "red" }]}
        dividers={[{ key: "a", angleDeg: 90 }]}
        {...extra}
      />
    </div>,
  );
  const backdrop = utils.container.querySelector(".gtv-wheel-backdrop")!;
  return { ...h, backdrop, ...utils };
}

describe("WheelBackdrop", () => {
  stubBackdropLayout();

  it("is hidden from assistive tech", () => {
    expect(renderBackdrop().backdrop.getAttribute("aria-hidden")).toBe("true");
  });

  it("mirrors the view onto its group transform without re-rendering the paths", () => {
    const { backdrop, emit } = renderBackdrop();
    const group = backdrop.querySelector("g")!;
    const path = backdrop.querySelector(".gtv-wheel-backdrop-sector")!;
    const d = path.getAttribute("d");
    emit({ x: 30, y: 40, k: 1 });
    expect(group.getAttribute("transform")).toBe("translate(30 40) scale(1)");
    expect(backdrop.querySelector(".gtv-wheel-backdrop-sector")).toBe(path);
    expect(path.getAttribute("d")).toBe(d);
  });

  it("grows the drawn radius when zooming out past it, and leaves it alone while panning", () => {
    const { backdrop, emit } = renderBackdrop();
    const radiusOf = () => Number(/A([\d.]+) /.exec(backdrop.querySelector(".gtv-wheel-backdrop-sector")!.getAttribute("d")!)![1]);
    const before = radiusOf();
    emit({ x: -20, y: -20, k: 1 });
    expect(radiusOf()).toBe(before);
    emit({ x: 0, y: 0, k: 0.05 });
    expect(radiusOf()).toBeGreaterThan(before);
  });

  it("draws underground scenes as rings starting at the inner radius", () => {
    const { backdrop } = renderBackdrop({
      scenes: [{ key: "s", startDeg: 0, endDeg: 90, fill: "black", fillOpacity: 0.2 }],
      innerSceneRadius: 50,
    });
    const scene = backdrop.querySelector(".gtv-wheel-scene-sector")!;
    expect(scene.getAttribute("d")).toContain("A50 50 0 0 0");
    expect(scene.getAttribute("fill-opacity")).toBe("0.2");
  });

  it("draws one divider per entry and rotates with rotationDeg", () => {
    const { backdrop } = renderBackdrop({ rotationDeg: 45 });
    expect(backdrop.querySelectorAll(".gtv-wheel-backdrop-divider")).toHaveLength(1);
    expect((backdrop.querySelector(".gtv-wheel-backdrop-rotor") as SVGGElement).style.transform).toBe("rotate(45deg)");
  });
});
