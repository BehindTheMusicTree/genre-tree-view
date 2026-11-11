import { describe, expect, it } from "vitest";
import { annularSectorPath, clampSpanToSector, dividerEnd, farRadius } from "../wheel-backdrop-geometry";

describe("farRadius", () => {
  const viewport = { width: 800, height: 600 };

  it("reaches the farthest viewport corner, in stage units, with a small margin", () => {
    // Pivot at the screen origin: the far corner is the opposite one.
    const r = farRadius({ x: 0, y: 0, k: 1 }, viewport, { x: 0, y: 0 });
    expect(r).toBeCloseTo(1000 * 1.05);
  });

  it("covers the viewport whatever the zoom, by dividing by k", () => {
    const base = farRadius({ x: 0, y: 0, k: 1 }, viewport, { x: 0, y: 0 });
    expect(farRadius({ x: 0, y: 0, k: 0.05 }, viewport, { x: 0, y: 0 })).toBeCloseTo(base / 0.05);
    expect(farRadius({ x: 0, y: 0, k: 3 }, viewport, { x: 0, y: 0 })).toBeCloseTo(base / 3);
  });

  it("accounts for a pivot far outside the viewport", () => {
    const r = farRadius({ x: -5000, y: 0, k: 1 }, viewport, { x: 0, y: 0 });
    expect(r).toBeCloseTo(Math.hypot(5800, 600) * 1.05);
  });

  it("applies the pivot offset in stage units through the view's scale", () => {
    const r = farRadius({ x: 100, y: 50, k: 2 }, viewport, { x: 10, y: 5 });
    expect(r).toBeCloseTo((Math.hypot(800 - 120, 600 - 60) / 2) * 1.05);
  });

  it("rejects a non-positive scale", () => {
    expect(() => farRadius({ x: 0, y: 0, k: 0 }, viewport, { x: 0, y: 0 })).toThrow();
  });
});

describe("annularSectorPath", () => {
  it("draws a pie slice with 0deg up and clockwise growth", () => {
    expect(annularSectorPath(0, 90, 0, 10)).toBe("M0 -10A10 10 0 0 1 10 0L0 0Z");
  });

  it("flags sweeps wider than 180deg as large arcs", () => {
    expect(annularSectorPath(0, 270, 0, 10)).toContain("A10 10 0 1 1");
  });

  it("closes an annular sector back along its inner radius", () => {
    expect(annularSectorPath(0, 90, 4, 10)).toBe("M0 -10A10 10 0 0 1 10 0L4 0A4 4 0 0 0 0 -4Z");
  });

  it("draws a full disc / ring when the sweep covers the circle", () => {
    expect(annularSectorPath(0, 360, 0, 10).match(/A/g)).toHaveLength(2);
    expect(annularSectorPath(-10, 400, 4, 10).match(/A/g)).toHaveLength(4);
  });

  it("returns an empty path for a non-positive sweep or an inverted radius range", () => {
    expect(annularSectorPath(10, 10, 0, 10)).toBe("");
    expect(annularSectorPath(20, 10, 0, 10)).toBe("");
    expect(annularSectorPath(0, 90, 10, 10)).toBe("");
  });
});

describe("dividerEnd", () => {
  it("follows the CSS rotate() convention", () => {
    expect(dividerEnd(0, 10)).toEqual({ x2: 0, y2: -10 });
    expect(dividerEnd(90, 10)).toEqual({ x2: 10, y2: 0 });
    expect(dividerEnd(180, 10).y2).toBe(10);
  });
});

describe("clampSpanToSector", () => {
  const sector = { startDeg: 100, endDeg: 200 };

  it("keeps a span already inside the sector", () => {
    expect(clampSpanToSector({ startDeg: 120, endDeg: 150 }, sector)).toEqual({ startDeg: 120, endDeg: 150 });
  });

  it("clamps a span that overflows the sector", () => {
    expect(clampSpanToSector({ startDeg: 80, endDeg: 150 }, sector)).toEqual({ startDeg: 100, endDeg: 150 });
    expect(clampSpanToSector({ startDeg: 150, endDeg: 230 }, sector)).toEqual({ startDeg: 150, endDeg: 200 });
  });

  it("brings a span offset by whole turns into the sector's frame", () => {
    expect(clampSpanToSector({ startDeg: -240, endDeg: -210 }, sector)).toEqual({ startDeg: 120, endDeg: 150 });
    expect(clampSpanToSector({ startDeg: 480, endDeg: 510 }, sector)).toEqual({ startDeg: 120, endDeg: 150 });
  });

  it("returns null when nothing of the span is inside the sector", () => {
    expect(clampSpanToSector({ startDeg: 250, endDeg: 280 }, sector)).toBeNull();
  });
});
