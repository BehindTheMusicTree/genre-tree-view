import { describe, expect, it } from "vitest";
import * as api from "../index";

describe("public exports for standalone detail panels", () => {
  it("exposes InfoPanel and the helpers that style its header like a tree card", () => {
    expect(typeof api.InfoPanel).toBe("function");
    expect(api.tintSurface("#000000", api.ROOT_TINT_RATIO)).toMatch(/^#[0-9a-f]{6}$/);
    expect(api.TEXT_COLOR).toMatch(/^#/);
    expect(api.ACCENT_TEXT_COLOR).toMatch(/^#/);
  });
});
