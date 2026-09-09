import { describe, expect, it } from "vitest";
import { resolveInfoPanelSide } from "../info-panel-geometry";

describe("resolveInfoPanelSide", () => {
  it("returns left when the node sits clear of where the panel would render", () => {
    const nodeRect = { left: 400 };
    const viewportRect = { left: 0 };
    expect(resolveInfoPanelSide(nodeRect, viewportRect, 280)).toBe("left");
  });

  it("returns right when the node's left edge falls inside the panel's would-be width", () => {
    const nodeRect = { left: 100 };
    const viewportRect = { left: 0 };
    expect(resolveInfoPanelSide(nodeRect, viewportRect, 280)).toBe("right");
  });

  it("treats the node's left edge exactly at the panel width boundary as clear (left)", () => {
    const nodeRect = { left: 280 };
    const viewportRect = { left: 0 };
    expect(resolveInfoPanelSide(nodeRect, viewportRect, 280)).toBe("left");
  });

  it("treats the node's left edge one pixel inside the boundary as covered (right)", () => {
    const nodeRect = { left: 279 };
    const viewportRect = { left: 0 };
    expect(resolveInfoPanelSide(nodeRect, viewportRect, 280)).toBe("right");
  });

  it("measures against the viewport's own left offset, not the page origin", () => {
    const nodeRect = { left: 620 };
    const viewportRect = { left: 500 };
    expect(resolveInfoPanelSide(nodeRect, viewportRect, 280)).toBe("right");
  });
});
