import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// jsdom (this suite's test environment) never loads styles.css and doesn't perform real
// layout/paint, so it can't reproduce the browser hit-testing bug this guards: unlike its inner
// shapes, a root <svg> element hit-tests as an ordinary rectangle over its full box regardless of
// paint, so an empty .gtv-wheel-pop-layer background silently swallowed clicks meant for
// the chips and layers underneath it. Asserting the stylesheet source directly is the only way this
// suite can catch a regression where that pointer-events: none rule is edited away.
const stylesCss = readFileSync(join(__dirname, "../styles.css"), "utf-8");

describe("styles.css pointer-events", () => {
  it("keeps .gtv-wheel-pop-layer out of hit-testing so clicks fall through to the layer beneath it", () => {
    const rule = stylesCss.match(/\.gtv-wheel-pop-layer\s*{[^}]*}/);
    expect(rule).toBeTruthy();
    expect(rule![0]).toMatch(/pointer-events:\s*none/);
  });
});

// Same reason as above: jsdom can't compute layout, so a regression that drops this wrapper back
// into document flow (rendering the zoom controls top-left, under the host app's actions bar) is
// only catchable by asserting the stylesheet source.
describe("styles.css floating controls", () => {
  it("keeps .gtv-wheel-floating-controls absolutely pinned bottom-right above the tree", () => {
    // The base rule pins the wrapper; later rules (e.g. the narrow-container column stacking) may
    // only adjust layout inside it, never take it out of flow or move it.
    const rules = [...stylesCss.matchAll(/\.gtv-wheel-floating-controls\s*{[^}]*}/g)].map((m) => m[0]);
    expect(rules.length).toBeGreaterThan(0);
    const [base, ...overrides] = rules;
    expect(base).toMatch(/position:\s*absolute/);
    expect(base).toMatch(/bottom:\s*\d/);
    expect(base).toMatch(/right:\s*\d/);
    expect(base).toMatch(/z-index:\s*\d/);
    for (const rule of overrides) {
      expect(rule).not.toMatch(/position:|bottom:|right:|top:|left:/);
    }
  });
});

// jsdom can't compute styles, and SVG <text> shows the I-beam unless the selectable group says otherwise.
describe("styles.css selectable cursor", () => {
  it("shows the hand on selectable nodes and root labels, and not-allowed on forbidden nodes", () => {
    expect(stylesCss).toMatch(/\.node,\s*\.gtv-root-label\s*{[^}]*cursor:\s*pointer/);
    expect(stylesCss).toMatch(/\.node\.gtv-node--forbidden\s*{[^}]*cursor:\s*not-allowed/);
  });
});
