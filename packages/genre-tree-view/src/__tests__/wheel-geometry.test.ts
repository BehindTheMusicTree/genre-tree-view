import { describe, expect, it } from "vitest";
import { computeRotationForSelection, getChipAngle } from "../wheel-geometry";

describe("getChipAngle", () => {
  it("spaces chips by a fixed pitch, starting at 0 for the first chip", () => {
    expect(getChipAngle(0)).toBe(0);
    expect(getChipAngle(1)).toBe(32);
    expect(getChipAngle(2)).toBe(64);
    expect(getChipAngle(3)).toBe(96);
  });

  it("keeps the same fixed pitch regardless of how many chips exist", () => {
    for (let i = 0; i < 10; i++) {
      expect(getChipAngle(i)).toBe(i * 32);
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
