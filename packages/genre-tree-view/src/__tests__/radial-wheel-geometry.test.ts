import { describe, expect, it } from "vitest";
import {
  calculateWheelRadiusForAngles,
  computeRadialLayout,
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
