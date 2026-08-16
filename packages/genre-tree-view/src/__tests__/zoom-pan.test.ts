import { describe, expect, it } from "vitest";
import { clampZoomScale, computeFitScale, computeZoomScale, computeZoomScaleForButton } from "../zoom-pan";
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
    // scaleX = 1000/800 = 1.25, scaleY = 1000/200 = 5 — width wins.
    expect(computeFitScale(800, 200, 1000, 1000, 0)).toBeCloseTo(1.25);
  });

  it("picks height as the constraining dimension when it fits less tightly", () => {
    // scaleX = 1000/200 = 5, scaleY = 1000/800 = 1.25 — height wins.
    expect(computeFitScale(200, 800, 1000, 1000, 0)).toBeCloseTo(1.25);
  });

  it("shrinks the effective viewport by padding on every side", () => {
    expect(computeFitScale(100, 100, 200, 200, 0)).toBeCloseTo(2);
    expect(computeFitScale(100, 100, 200, 200, 50)).toBeCloseTo(1);
  });

  it("clamps the result to the configured bounds", () => {
    expect(computeFitScale(1, 1, 1000, 1000, 0)).toBe(ZOOM_MAX_SCALE);
    expect(computeFitScale(10000, 10000, 100, 100, 0)).toBe(ZOOM_MIN_SCALE);
  });
});
