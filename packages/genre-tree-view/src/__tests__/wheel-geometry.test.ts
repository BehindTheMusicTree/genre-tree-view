import { describe, expect, it } from "vitest";
import { computeRotationForSelection, getChipAngle } from "../wheel-geometry";

describe("getChipAngle", () => {
  it("evenly spaces chips around the circle, starting at 0 for the first chip", () => {
    expect(getChipAngle(0, 4)).toBe(0);
    expect(getChipAngle(1, 4)).toBe(90);
    expect(getChipAngle(2, 4)).toBe(180);
    expect(getChipAngle(3, 4)).toBe(270);
  });

  it("spaces 10 chips at 36 degree increments", () => {
    for (let i = 0; i < 10; i++) {
      expect(getChipAngle(i, 10)).toBe(i * 36);
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
