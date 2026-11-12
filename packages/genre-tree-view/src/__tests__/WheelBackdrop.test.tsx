import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
  const utils = render(
    <div>
      <div className="gtv-wheel-stage">
        <WheelBackdrop
          subscribeView={h.subscribeView}
          viewportSize={{ width: 800, height: 600 }}
          sectors={[{ key: "a", startDeg: 0, endDeg: 90, fill: "red" }]}
          dividers={[{ key: "a", angleDeg: 90 }]}
          {...extra}
        />
      </div>
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

  it("writes nothing on a view change it still covers: the stage transform carries it", () => {
    const { backdrop, emit } = renderBackdrop();
    const html = backdrop.outerHTML;
    emit({ x: 30, y: 40, k: 1.2 });
    expect(backdrop.outerHTML).toBe(html);
  });

  it("shrinks the drawn radius once it is more than twice what the view needs", () => {
    const { backdrop, emit } = renderBackdrop();
    const radiusOf = () => Number(/A([\d.]+) /.exec(backdrop.querySelector(".gtv-wheel-backdrop-sector")!.getAttribute("d")!)![1]);
    const before = radiusOf();
    emit({ x: 0, y: 0, k: 1.2 });
    expect(radiusOf()).toBe(before);
    emit({ x: 0, y: 0, k: 4 });
    expect(radiusOf()).toBeLessThan(before);
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

  it("cuts underground rings out of their sector and draws them with their own fill", () => {
    const { backdrop } = renderBackdrop({
      sectors: [
        {
          key: "a",
          startDeg: 0,
          endDeg: 180,
          fill: "red",
          scenes: [{ key: "s", startDeg: 0, endDeg: 90, fill: "rgba(1, 2, 3, 0.3)" }],
        },
      ],
      innerSceneRadius: 50,
    });
    const sector = backdrop.querySelector(".gtv-wheel-backdrop-sector")!;
    expect(sector.getAttribute("fill-rule")).toBe("evenodd");
    expect(sector.getAttribute("d")).toContain("A50 50");
    const scene = backdrop.querySelector(".gtv-wheel-scene-sector")!;
    expect(scene.getAttribute("d")).toContain("A50 50 0 0 0");
    expect(scene.getAttribute("fill")).toBe("rgba(1, 2, 3, 0.3)");
    expect(scene.hasAttribute("fill-opacity")).toBe(false);
  });

  it("draws one divider per entry and rotates with rotationDeg", () => {
    const { backdrop } = renderBackdrop({ rotationDeg: 45 });
    expect(backdrop.querySelectorAll(".gtv-wheel-backdrop-divider")).toHaveLength(1);
    expect((backdrop.querySelector(".gtv-wheel-backdrop-rotor") as SVGGElement).style.transform).toBe("rotate(45deg)");
  });
});
