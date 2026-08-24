import { describe, expect, it } from "vitest";
import {
  clampZoomScale,
  computeFitScale,
  computeZoomScale,
  computeZoomScaleForButton,
  queryTreeContentElements,
} from "../zoom-pan";
import { ZOOM_MAX_SCALE, ZOOM_MIN_SCALE } from "../constants";

describe("clampZoomScale", () => {
  it("passes through values already within bounds", () => {
    expect(clampZoomScale(1)).toBe(1);
  });

  it("clamps below the minimum", () => {
    expect(clampZoomScale(ZOOM_MIN_SCALE - 1)).toBe(ZOOM_MIN_SCALE);
  });

  it("clamps above the maximum", () => {
    expect(clampZoomScale(ZOOM_MAX_SCALE + 1)).toBe(ZOOM_MAX_SCALE);
  });
});

describe("computeZoomScale", () => {
  it("returns the same scale for a zero delta", () => {
    expect(computeZoomScale(1, 0)).toBe(1);
  });

  it("increases scale for a negative deltaY (zoom in)", () => {
    expect(computeZoomScale(1, -100)).toBeGreaterThan(1);
  });

  it("decreases scale for a positive deltaY (zoom out)", () => {
    expect(computeZoomScale(1, 100)).toBeLessThan(1);
  });

  it("clamps the result to the configured bounds", () => {
    expect(computeZoomScale(ZOOM_MAX_SCALE, -10000)).toBe(ZOOM_MAX_SCALE);
    expect(computeZoomScale(ZOOM_MIN_SCALE, 10000)).toBe(ZOOM_MIN_SCALE);
  });
});

describe("computeZoomScaleForButton", () => {
  it("increases scale for direction 1 (zoom in)", () => {
    expect(computeZoomScaleForButton(1, 1)).toBeGreaterThan(1);
  });

  it("decreases scale for direction -1 (zoom out)", () => {
    expect(computeZoomScaleForButton(1, -1)).toBeLessThan(1);
  });

  it("is the inverse of itself across a round trip", () => {
    const zoomedIn = computeZoomScaleForButton(1, 1);
    expect(computeZoomScaleForButton(zoomedIn, -1)).toBeCloseTo(1);
  });

  it("clamps the result to the configured bounds", () => {
    expect(computeZoomScaleForButton(ZOOM_MAX_SCALE, 1)).toBe(ZOOM_MAX_SCALE);
    expect(computeZoomScaleForButton(ZOOM_MIN_SCALE, -1)).toBe(ZOOM_MIN_SCALE);
  });
});

describe("computeFitScale", () => {
  it("picks width as the constraining dimension when it fits less tightly", () => {
    // scaleX = 500/800 = 0.625, scaleY = 1000/200 = 5 — width wins. Kept below 1 so the scale=1
    // cap doesn't mask which dimension actually won.
    expect(computeFitScale(800, 200, 500, 1000, 0)).toBeCloseTo(0.625);
  });

  it("picks height as the constraining dimension when it fits less tightly", () => {
    // scaleX = 1000/200 = 5, scaleY = 500/800 = 0.625 — height wins. Kept below 1 so the scale=1
    // cap doesn't mask which dimension actually won.
    expect(computeFitScale(200, 800, 1000, 500, 0)).toBeCloseTo(0.625);
  });

  it("shrinks the effective viewport by padding on every side", () => {
    expect(computeFitScale(300, 300, 200, 200, 0)).toBeCloseTo(0.667, 2);
    expect(computeFitScale(300, 300, 200, 200, 50)).toBeCloseTo(0.333, 2);
  });

  it("caps at 1 — never zooms in past the tree's natural size", () => {
    // Content far smaller than the viewport would compute a scale > 1 (and even > ZOOM_MAX_SCALE)
    // if left unbounded; capping at 1 avoids inflating the toolbar/menu clearance the layout
    // reserves at natural size past what the fixed-px padding can still contain.
    expect(computeFitScale(1, 1, 1000, 1000, 0)).toBe(1);
  });

  it("clamps only the upper bound, never the lower one", () => {
    // Content far larger than the viewport must shrink below ZOOM_MIN_SCALE to actually fit —
    // clamping it at ZOOM_MIN_SCALE here would render content too big for the viewport while
    // still centering on the full bounding box, cropping it instead of fitting it.
    expect(computeFitScale(10000, 10000, 100, 100, 0)).toBeLessThan(ZOOM_MIN_SCALE);
    expect(computeFitScale(10000, 10000, 100, 100, 0)).toBeCloseTo(0.01);
  });
});

describe("queryTreeContentElements", () => {
  it("returns an empty array when the container is null or undefined", () => {
    expect(queryTreeContentElements(null)).toEqual([]);
    expect(queryTreeContentElements(undefined)).toEqual([]);
  });

  it("collects nodes and links matching TREE_CONTENT_SELECTOR under the container", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="gtv-node-rect"></div>
      <div class="gtv-link"></div>
      <div class="gtv-hover-hit-area"></div>
    `;
    expect(queryTreeContentElements(container)).toHaveLength(2);
  });
});
