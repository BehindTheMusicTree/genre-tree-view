import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as api from "../index";

describe("public exports for standalone detail panels", () => {
  it("exposes the content-only node panel pieces and the helpers that style a header like a tree card", () => {
    expect(typeof api.GenreNodeFamily).toBe("function");
    expect(typeof api.GenreNodeAncestors).toBe("function");
    expect(typeof api.GenreNodeItemCount).toBe("function");
    expect(typeof api.useGenreNodeRelations).toBe("function");
    expect(api.tintSurface("#000000", api.ROOT_TINT_RATIO)).toMatch(/^#[0-9a-f]{6}$/);
    expect(api.TEXT_COLOR).toMatch(/^#/);
    expect(api.ACCENT_TEXT_COLOR).toMatch(/^#/);
  });
});

describe("styles.css", () => {
  // Section padding, titles and borders belong to PanelSection / FieldList in @behindthemusictree/ui.
  // A generic section rule here is a second source that drifts from it (and was removed once already).
  it("styles only the tree content, never a generic panel section", () => {
    const css = readFileSync(join(__dirname, "..", "styles.css"), "utf8");
    expect(css).not.toMatch(/\.gtv-info-panel-(children-title|children|fields|toolbar)\b(?!-)/);
  });
});
