import { describe, expect, it } from "vitest";
import {
  bisectAngles,
  buildSectorClipPathPolygon,
  calculateWheelRadiusForAngles,
  computeRadialLayout,
  computeSectorBounds,
  getCardinalRingOffsets,
} from "../radial-wheel-geometry";

describe("getCardinalRingOffsets", () => {
  it("returns [] for zero or negative root counts", () => {
    expect(getCardinalRingOffsets(0)).toEqual([]);
    expect(getCardinalRingOffsets(-1)).toEqual([]);
  });

  it("makes every root a cardinal when rootCount <= 4", () => {
    expect(getCardinalRingOffsets(1)).toEqual([0]);
    expect(getCardinalRingOffsets(2)).toEqual([0, 1]);
    expect(getCardinalRingOffsets(3)).toEqual([0, 1, 2]);
    expect(getCardinalRingOffsets(4)).toEqual([0, 1, 2, 3]);
  });

  it("divides the ring into 4 as-equal-as-possible arcs for rootCount >= 5", () => {
    expect(getCardinalRingOffsets(5)).toEqual([0, 1, 3, 4]);
    expect(getCardinalRingOffsets(6)).toEqual([0, 2, 3, 5]);
    expect(getCardinalRingOffsets(7)).toEqual([0, 2, 4, 5]);
  });

  it("always starts at offset 0 and stays strictly increasing for N up to 13", () => {
    for (let n = 1; n <= 13; n++) {
      const offsets = getCardinalRingOffsets(n);
      expect(offsets[0]).toBe(0);
      for (let i = 1; i < offsets.length; i++) {
        expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
        expect(offsets[i]).toBeLessThan(n);
      }
      expect(offsets.length).toBe(Math.min(n, 4));
    }
  });
});

describe("computeRadialLayout", () => {
  it("returns [] for zero or negative root counts", () => {
    expect(computeRadialLayout(0, 0, 90)).toEqual([]);
    expect(computeRadialLayout(-1, 0, 90)).toEqual([]);
  });

  it("puts every root on a cardinal, relative angles 0/90/180/270, when rootCount <= 4", () => {
    const layout = computeRadialLayout(4, 0, 0);
    expect(layout).toEqual([
      { rootIndex: 0, angle: 0, isCardinal: true },
      { rootIndex: 1, angle: 90, isCardinal: true },
      { rootIndex: 2, angle: 180, isCardinal: true },
      { rootIndex: 3, angle: 270, isCardinal: true },
    ]);
  });

  it("applies the landingAngle offset to every slot", () => {
    const layout = computeRadialLayout(4, 0, 90);
    expect(layout.map((s) => s.angle)).toEqual([90, 180, 270, 0]);
  });

  it("lands the clicked root at exactly landingAngle regardless of clickedIndex", () => {
    for (let clicked = 0; clicked < 4; clicked++) {
      const layout = computeRadialLayout(4, clicked, 90);
      expect(layout[clicked]).toEqual({ rootIndex: clicked, angle: 90, isCardinal: true });
    }
  });

  it("places 4 cardinals and spaces the remaining root(s) within their arc, biased toward the horizontal end, for rootCount 5", () => {
    const layout = computeRadialLayout(5, 0, 0);
    expect(layout).toEqual([
      { rootIndex: 0, angle: 0, isCardinal: true },
      { rootIndex: 1, angle: 90, isCardinal: true },
      { rootIndex: 2, angle: expect.closeTo(125.306, 3), isCardinal: false },
      { rootIndex: 3, angle: 180, isCardinal: true },
      { rootIndex: 4, angle: 270, isCardinal: true },
    ]);
  });

  it("recomputes cardinals from the newly clicked root, un-developing the former cardinal", () => {
    const layout = computeRadialLayout(5, 2, 0);
    const byIndex = layout.reduce<Record<number, (typeof layout)[number]>>((acc, slot) => {
      acc[slot.rootIndex] = slot;
      return acc;
    }, {});

    expect(byIndex[2]).toEqual({ rootIndex: 2, angle: 0, isCardinal: true });
    expect(byIndex[3]).toEqual({ rootIndex: 3, angle: 90, isCardinal: true });
    expect(byIndex[0]).toEqual({ rootIndex: 0, angle: 180, isCardinal: true });
    expect(byIndex[1]).toEqual({ rootIndex: 1, angle: 270, isCardinal: true });
    expect(byIndex[4]).toEqual({ rootIndex: 4, angle: expect.closeTo(125.306, 3), isCardinal: false });
  });

  it("spaces two non-cardinal roots within a single arc for rootCount 6, biased toward the horizontal end", () => {
    const layout = computeRadialLayout(6, 0, 0);
    const byIndex = layout.reduce<Record<number, (typeof layout)[number]>>((acc, slot) => {
      acc[slot.rootIndex] = slot;
      return acc;
    }, {});

    expect(byIndex[0]).toEqual({ rootIndex: 0, angle: 0, isCardinal: true });
    expect(byIndex[2]).toEqual({ rootIndex: 2, angle: 90, isCardinal: true });
    expect(byIndex[3]).toEqual({ rootIndex: 3, angle: 180, isCardinal: true });
    expect(byIndex[5]).toEqual({ rootIndex: 5, angle: 270, isCardinal: true });
    expect(byIndex[1]).toEqual({ rootIndex: 1, angle: expect.closeTo(54.694, 3), isCardinal: false });
    expect(byIndex[4]).toEqual({ rootIndex: 4, angle: expect.closeTo(234.694, 3), isCardinal: false });
  });

  it("spaces three non-cardinal roots (one per arc) for rootCount 7, biased toward the horizontal end", () => {
    const layout = computeRadialLayout(7, 0, 0);
    const byIndex = layout.reduce<Record<number, (typeof layout)[number]>>((acc, slot) => {
      acc[slot.rootIndex] = slot;
      return acc;
    }, {});

    expect(byIndex[0]).toEqual({ rootIndex: 0, angle: 0, isCardinal: true });
    expect(byIndex[2]).toEqual({ rootIndex: 2, angle: 90, isCardinal: true });
    expect(byIndex[4]).toEqual({ rootIndex: 4, angle: 180, isCardinal: true });
    expect(byIndex[5]).toEqual({ rootIndex: 5, angle: 270, isCardinal: true });
    expect(byIndex[1]).toEqual({ rootIndex: 1, angle: expect.closeTo(54.694, 3), isCardinal: false });
    expect(byIndex[3]).toEqual({ rootIndex: 3, angle: expect.closeTo(125.306, 3), isCardinal: false });
    expect(byIndex[6]).toEqual({ rootIndex: 6, angle: expect.closeTo(305.306, 3), isCardinal: false });
  });

  it("produces exactly one entry per ring index, all cardinal angles at 90-degree multiples, for N up to 13", () => {
    for (let n = 1; n <= 13; n++) {
      for (let clicked = 0; clicked < n; clicked++) {
        const layout = computeRadialLayout(n, clicked, 90);
        expect(layout.length).toBe(n);
        expect(new Set(layout.map((s) => s.rootIndex)).size).toBe(n);

        const cardinals = layout.filter((s) => s.isCardinal);
        expect(cardinals.length).toBe(Math.min(n, 4));
        for (const slot of cardinals) {
          expect(slot.angle % 90).toBe(0);
        }
        expect(layout.find((s) => s.rootIndex === clicked)).toEqual({
          rootIndex: clicked,
          angle: 90,
          isCardinal: true,
        });
      }
    }
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
