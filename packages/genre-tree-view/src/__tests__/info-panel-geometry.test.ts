import { describe, expect, it } from "vitest";
import { resolveInfoPanelSide } from "../info-panel-geometry";

describe("resolveInfoPanelSide", () => {
  it("always returns left", () => {
    expect(resolveInfoPanelSide()).toBe("left");
  });
});
