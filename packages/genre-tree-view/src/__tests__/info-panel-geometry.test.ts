import { describe, expect, it } from "vitest";
import { INFO_PANEL_SHEET_PEEK_FRACTION } from "../constants";
import { resolveInfoPanelObscuredArea, resolveInfoPanelSide } from "../info-panel-geometry";

describe("resolveInfoPanelSide", () => {
  it("always returns left", () => {
    expect(resolveInfoPanelSide()).toBe("left");
  });
});

describe("resolveInfoPanelObscuredArea", () => {
  const viewportOf = (width: number, height: number) => {
    const viewport = document.createElement("div");
    Object.defineProperty(viewport, "clientWidth", { value: width });
    Object.defineProperty(viewport, "clientHeight", { value: height });
    return viewport;
  };
  const element = document.createElement("div");

  it("returns null without an element or viewport", () => {
    expect(resolveInfoPanelObscuredArea(null, viewportOf(1200, 800), 280)).toBeNull();
    expect(resolveInfoPanelObscuredArea(element, undefined, 280)).toBeNull();
  });

  it("covers the left column in a wide or unmeasured container", () => {
    expect(resolveInfoPanelObscuredArea(element, viewportOf(1200, 800), 280)).toEqual({ width: 280, side: "left" });
    expect(resolveInfoPanelObscuredArea(element, viewportOf(0, 0), 280)).toEqual({ width: 280, side: "left" });
  });

  it("covers the sheet's peek height in a narrow container", () => {
    expect(resolveInfoPanelObscuredArea(element, viewportOf(390, 800), 280)).toEqual({
      side: "bottom",
      height: 800 * INFO_PANEL_SHEET_PEEK_FRACTION,
    });
  });
});
