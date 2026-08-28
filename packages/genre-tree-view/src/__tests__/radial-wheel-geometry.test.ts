import { describe, expect, it } from "vitest";
import {
  bisectAngles,
  buildSectorClipPathPolygon,
  calculateWheelRadiusForAngles,
  computeRadialLayout,
  computeSectorBounds,
  computeSectorSymmetricSpan,
} from "../radial-wheel-geometry";

describe("computeRadialLayout", () => {
  it("returns [] for an empty weights array", () => {
    expect(computeRadialLayout([], 0, 90)).toEqual([]);
  });

  it("throws when any weight is non-positive", () => {
    expect(() => computeRadialLayout([1, 0, 1], 0, 90)).toThrow();
    expect(() => computeRadialLayout([1, -2, 1], 0, 90)).toThrow();
  });

  it("evenly spaces all roots at 90-degree steps when weights are uniform (rootCount 4)", () => {
    const layout = computeRadialLayout([1, 1, 1, 1], 0, 0);
    expect(layout).toEqual([
      { rootIndex: 0, angle: 0 },
      { rootIndex: 1, angle: 90 },
      { rootIndex: 2, angle: 180 },
      { rootIndex: 3, angle: 270 },
    ]);
  });

  it("applies the landingAngle offset to every slot", () => {
    const layout = computeRadialLayout([1, 1, 1, 1], 0, 90);
    expect(layout.map((s) => s.angle)).toEqual([90, 180, 270, 0]);
  });

  it("lands the clicked root at exactly landingAngle regardless of clickedIndex", () => {
    for (let clicked = 0; clicked < 4; clicked++) {
      const layout = computeRadialLayout([1, 1, 1, 1], clicked, 90);
      expect(layout[clicked]).toEqual({ rootIndex: clicked, angle: 90 });
    }
  });

  it("evenly spaces all 5 roots at 72-degree steps when weights are uniform", () => {
    const layout = computeRadialLayout([1, 1, 1, 1, 1], 0, 0);
    expect(layout).toEqual([
      { rootIndex: 0, angle: 0 },
      { rootIndex: 1, angle: 72 },
      { rootIndex: 2, angle: 144 },
      { rootIndex: 3, angle: 216 },
      { rootIndex: 4, angle: 288 },
    ]);
  });

  it("recomputes evenly-spaced angles from the newly clicked root when weights are uniform", () => {
    const layout = computeRadialLayout([1, 1, 1, 1, 1], 2, 0);
    const byIndex = layout.reduce<Record<number, (typeof layout)[number]>>((acc, slot) => {
      acc[slot.rootIndex] = slot;
      return acc;
    }, {});

    expect(byIndex[2]).toEqual({ rootIndex: 2, angle: 0 });
    expect(byIndex[3]).toEqual({ rootIndex: 3, angle: 72 });
    expect(byIndex[4]).toEqual({ rootIndex: 4, angle: 144 });
    expect(byIndex[0]).toEqual({ rootIndex: 0, angle: 216 });
    expect(byIndex[1]).toEqual({ rootIndex: 1, angle: 288 });
  });

  it("evenly spaces all 6 roots at 60-degree steps when weights are uniform", () => {
    const layout = computeRadialLayout([1, 1, 1, 1, 1, 1], 0, 0);
    const byIndex = layout.reduce<Record<number, (typeof layout)[number]>>((acc, slot) => {
      acc[slot.rootIndex] = slot;
      return acc;
    }, {});

    expect(byIndex[0]).toEqual({ rootIndex: 0, angle: 0 });
    expect(byIndex[1]).toEqual({ rootIndex: 1, angle: 60 });
    expect(byIndex[2]).toEqual({ rootIndex: 2, angle: 120 });
    expect(byIndex[3]).toEqual({ rootIndex: 3, angle: 180 });
    expect(byIndex[4]).toEqual({ rootIndex: 4, angle: 240 });
    expect(byIndex[5]).toEqual({ rootIndex: 5, angle: 300 });
  });

  it("evenly spaces all 7 roots at 360/7-degree steps when weights are uniform", () => {
    const layout = computeRadialLayout([1, 1, 1, 1, 1, 1, 1], 0, 0);
    const byIndex = layout.reduce<Record<number, (typeof layout)[number]>>((acc, slot) => {
      acc[slot.rootIndex] = slot;
      return acc;
    }, {});

    const step = 360 / 7;
    for (let i = 0; i < 7; i++) {
      expect(byIndex[i]).toEqual({ rootIndex: i, angle: expect.closeTo(i * step, 6) });
    }
  });

  it("produces exactly one entry per ring index for N up to 13 with uniform weights", () => {
    for (let n = 1; n <= 13; n++) {
      const weights = new Array(n).fill(1);
      for (let clicked = 0; clicked < n; clicked++) {
        const layout = computeRadialLayout(weights, clicked, 90);
        expect(layout.length).toBe(n);
        expect(new Set(layout.map((s) => s.rootIndex)).size).toBe(n);

        for (const slot of layout) {
          expect(slot.angle).toBeGreaterThanOrEqual(0);
          expect(slot.angle).toBeLessThan(360);
        }
        expect(layout.find((s) => s.rootIndex === clicked)).toEqual({
          rootIndex: clicked,
          angle: 90,
        });
      }
    }
  });

  it("gives each root an arc proportional to its own weight, centered at its own angle", () => {
    // total weight 4, unit = 90deg/weight: root 0 and 1 each get a 90deg-wide arc, root 2 (weight
    // 2) gets a 180deg-wide arc twice as wide. Hand-computed boundaries (cumulative, offset so
    // root 0's arc is centered on landingAngle=0): root 0 spans [-45, 45], root 1 spans [45, 135],
    // root 2 spans [135, 315] (wrapping to -45) — so their centers are 0, 90, and 225.
    const layout = computeRadialLayout([1, 1, 2], 0, 0);
    expect(layout).toEqual([
      { rootIndex: 0, angle: 0 },
      { rootIndex: 1, angle: 90 },
      { rootIndex: 2, angle: 225 },
    ]);
  });

  it("still lands the clicked (heavier) root exactly at landingAngle, ring order unchanged", () => {
    // Same weights as above but clicking root 2 (the heavy one) instead of root 0. Ring order
    // starting at root 2 is [2, 0, 1]; root 2's own 180deg-wide arc is centered on landingAngle=90,
    // so it spans [0, 180]. Root 0 (weight 1, 90deg-wide) follows, spanning [180, 270], centered at
    // 225. Root 1 (weight 1, 90deg-wide) follows that, spanning [270, 360], centered at 315.
    const layout = computeRadialLayout([1, 1, 2], 2, 90);
    expect(layout).toEqual([
      { rootIndex: 0, angle: 225 },
      { rootIndex: 1, angle: 315 },
      { rootIndex: 2, angle: 90 },
    ]);
  });

  it("gives a root with a much larger weight a proportionally wider gap to its neighbors", () => {
    // Root 3's weight (7) dwarfs its three weight-1 neighbors, so both gaps touching it (to root 2
    // and wrapping around to root 0) should be much wider than the gap between two light roots.
    const layout = computeRadialLayout([1, 1, 1, 7], 0, 0);
    const byIndex = layout.reduce<Record<number, (typeof layout)[number]>>((acc, slot) => {
      acc[slot.rootIndex] = slot;
      return acc;
    }, {});

    const lightGap = byIndex[1].angle - byIndex[0].angle;
    const heavyGap = byIndex[3].angle - byIndex[2].angle;
    expect(heavyGap).toBeGreaterThan(lightGap);
  });
});

describe("bisectAngles", () => {
  it("averages two angles that are already close together", () => {
    expect(bisectAngles(0, 90)).toBe(45);
    expect(bisectAngles(90, 0)).toBe(45);
  });

  it("takes the shorter arc across a 0/360 wraparound instead of the long way round", () => {
    expect(bisectAngles(350, 10)).toBe(360);
    expect(bisectAngles(10, 350)).toBe(0);
  });

  it("handles continuous/unwrapped angles outside [0, 360) the same way", () => {
    expect(bisectAngles(370, 350)).toBe(360);
    expect(bisectAngles(-10, 10)).toBe(0);
  });
});

describe("buildSectorClipPathPolygon", () => {
  it("returns an empty string for a non-positive sweep", () => {
    expect(buildSectorClipPathPolygon(0)).toBe("");
    expect(buildSectorClipPathPolygon(-10)).toBe("");
  });

  it("starts and ends the fan at the pivot, with the first ray straight up", () => {
    const polygon = buildSectorClipPathPolygon(90, 10);
    expect(polygon.startsWith("polygon(50% 50%, 50% 0%")).toBe(true);
  });

  it("samples the arc every stepDeg and lands exactly on the sweep's end angle", () => {
    const polygon = buildSectorClipPathPolygon(180, 10);
    // 90 degrees clockwise from "up" is straight right, radius 50% from center (50%, 50%).
    expect(polygon).toContain("100% 50%");
    // 180 degrees clockwise from "up" is straight down. Math.sin(Math.PI) isn't exactly 0, so the
    // x coordinate carries a floating-point residual (e.g. "50.00000000000001%") — compare
    // numerically instead of matching the string exactly.
    const lastPoint = polygon.slice(0, -1).split(", ").pop();
    const [lastX, lastY] = (lastPoint ?? "").split(" ").map((coord) => parseFloat(coord));
    expect(lastX).toBeCloseTo(50);
    expect(lastY).toBeCloseTo(100);
  });

  it("clamps the last sample to the exact sweep even when it doesn't divide evenly by stepDeg", () => {
    const polygon = buildSectorClipPathPolygon(95, 10);
    const lastTheta = (95 * Math.PI) / 180;
    const lastX = 50 + 50 * Math.sin(lastTheta);
    const lastY = 50 - 50 * Math.cos(lastTheta);
    expect(polygon.endsWith(`${lastX}% ${lastY}%)`)).toBe(true);
  });

  it("produces a robust wide (180 degree) fan instead of a 3-point chord-clipped triangle", () => {
    const polygon = buildSectorClipPathPolygon(180, 10);
    const pointCount = polygon.slice("polygon(".length, -1).split(", ").length;
    expect(pointCount).toBeGreaterThan(3);
  });
});

describe("computeSectorBounds", () => {
  it("splits an evenly-spaced 4-root ring into four 90-degree sectors centered on each root", () => {
    const angles = [0, 90, 180, 270];
    expect(computeSectorBounds(angles, 0)).toEqual({ start: -45, end: 45 });
    expect(computeSectorBounds(angles, 1)).toEqual({ start: 45, end: 135 });
    expect(computeSectorBounds(angles, 2)).toEqual({ start: 135, end: 225 });
    expect(computeSectorBounds(angles, 3)).toEqual({ start: 225, end: 315 });
  });

  it("gives each of 2 roots a full 180-degree sector with no chord-clipping gap", () => {
    const angles = [0, 180];
    const first = computeSectorBounds(angles, 0);
    const second = computeSectorBounds(angles, 1);
    expect(first.end - first.start).toBe(180);
    expect(second.end - second.start).toBe(180);
    // Together the two sectors must cover the full circle exactly once, with no gap or overlap.
    expect(first.end).toBe(second.start);
    expect(second.end - first.start).toBe(360);
  });

  it("keeps both bounds anchored in the same continuous frame as the root's own angle, unlike naively differencing independently-anchored dividers", () => {
    // Every root's continuous angle has wound up a full lap outside [0, 360) (as if
    // continuousAngleByRootId accumulated one extra lap across repeated re-layouts), while their
    // relative order/spacing stays the same evenly-spaced 4-root ring as the first test above.
    const angles = [-360, -270, -180, -90];
    const { start, end } = computeSectorBounds(angles, 0);
    expect(end - start).toBe(90);
    expect(start).toBe(-405);
    expect(end).toBe(-315);
  });
});

describe("computeSectorSymmetricSpan", () => {
  it("equals the full sector width when the root's angle is centered in its sector (evenly-spaced ring)", () => {
    const angles = [0, 90, 180, 270];
    for (let i = 0; i < angles.length; i++) {
      expect(computeSectorSymmetricSpan(angles, i)).toBe(90);
    }
  });

  it("caps at twice the smaller side when the root's sector is asymmetric, so a wedge centered on the root's own angle never spills past the tighter boundary", () => {
    // Root 1 sits much closer to root 0 (10deg away) than to root 2 (170deg away), so its sector
    // (computeSectorBounds) is highly asymmetric: only 5deg of room on the tight side, 85deg on
    // the other. A symmetric wedge must be capped at 2*5=10deg to stay within [start, end] on both
    // sides at once.
    const angles = [0, 10, 180];
    const { start, end } = computeSectorBounds(angles, 1);
    const span = computeSectorSymmetricSpan(angles, 1);
    const mine = angles[1];

    expect(span).toBeCloseTo(10);
    // A symmetric wedge of this span centered on `mine` must land fully inside [start, end].
    expect(mine - span / 2).toBeGreaterThanOrEqual(start - 1e-9);
    expect(mine + span / 2).toBeLessThanOrEqual(end + 1e-9);
  });

  it("never exceeds the raw sector width (end - start)", () => {
    const angles = [0, 10, 180];
    for (let i = 0; i < angles.length; i++) {
      const { start, end } = computeSectorBounds(angles, i);
      expect(computeSectorSymmetricSpan(angles, i)).toBeLessThanOrEqual(end - start + 1e-9);
    }
  });
});

describe("calculateWheelRadiusForAngles", () => {
  it("falls back to the base radius for 0 or 1 angles", () => {
    expect(calculateWheelRadiusForAngles([], 350, 260)).toBe(260);
    expect(calculateWheelRadiusForAngles([90], 350, 260)).toBe(260);
  });

  it("falls back to the base radius when it's already big enough for the gap/chip size", () => {
    expect(calculateWheelRadiusForAngles([0, 90, 180, 270], 10, 260)).toBe(260);
  });

  it("grows past the base radius to clear the smallest gap between tightly clustered angles", () => {
    const angles = [0, 10, 90, 180, 270];
    const radius = calculateWheelRadiusForAngles(angles, 350, 260);
    expect(radius).toBeGreaterThan(260);

    const chordBetweenClosest = 2 * radius * Math.sin((10 * Math.PI) / 360);
    expect(chordBetweenClosest).toBeGreaterThanOrEqual(350);
  });

  it("accounts for the wraparound gap between the last and first angle", () => {
    const angles = [0, 100, 200];
    const radius = calculateWheelRadiusForAngles(angles, 350, 260);

    const wraparoundGapDeg = 360 - 200;
    const chordAcrossWraparound = 2 * radius * Math.sin((wraparoundGapDeg * Math.PI) / 360);
    expect(chordAcrossWraparound).toBeGreaterThanOrEqual(350);
  });
});
