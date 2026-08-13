import { describe, expect, it } from "vitest";
import { computeRotationForSelection, getChipAngle } from "../wheel-geometry";

describe("getChipAngle", () => {
  it("spaces chips evenly around the full circle, starting at 0 for the first chip", () => {
    expect(getChipAngle(0, 4)).toBe(0);
    expect(getChipAngle(1, 4)).toBe(90);
    expect(getChipAngle(2, 4)).toBe(180);
    expect(getChipAngle(3, 4)).toBe(270);
  });

  it("spreads the pitch across the full 360 degrees regardless of chip count", () => {
    for (const total of [1, 2, 3, 5, 10]) {
      for (let i = 0; i < total; i++) {
        expect(getChipAngle(i, total)).toBe(i * (360 / total));
      }
    }
  });
});

describe("computeRotationForSelection", () => {
  it("is a no-op when the target is already at the top", () => {
    expect(computeRotationForSelection(0, 0)).toBe(0);
  });

  it("takes the shortest path to bring a 90 degree chip to the top", () => {
    expect(computeRotationForSelection(0, 90)).toBe(-90);
  });

  it("takes the shortest path to bring a 270 degree chip to the top", () => {
    expect(computeRotationForSelection(0, 270)).toBe(90);
  });

  it("resolves the 180 degree tie deterministically", () => {
    expect(computeRotationForSelection(0, 180)).toBe(-180);
  });

  it("accumulates rotation unwrapped across repeated selections instead of renormalizing", () => {
    const afterFirst = computeRotationForSelection(0, 90);
    expect(afterFirst).toBe(-90);

    const afterReselectingSame = computeRotationForSelection(afterFirst, 90);
    expect(afterReselectingSame).toBe(afterFirst);

    const afterBackToStart = computeRotationForSelection(afterReselectingSame, 0);
    expect(afterBackToStart).toBe(0);
  });
});
