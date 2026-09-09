import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// jsdom (this suite's test environment) never loads styles.css and doesn't perform real
// layout/paint, so it can't reproduce the browser hit-testing bug this guards: unlike its inner
// shapes, a root <svg> element hit-tests as an ordinary rectangle over its full box regardless of
// paint, so an empty .gtv-wheel-pop-layer background silently swallowed clicks meant for
// .gtv-wheel-middle-circle--collapsible underneath it (see GenreTreeWheelRadialPopCore's
// click-to-collapse background). Asserting the stylesheet source directly is the only way this
// suite can catch a regression where that pointer-events: none rule is edited away.
const stylesCss = readFileSync(join(__dirname, "../styles.css"), "utf-8");

describe("styles.css pointer-events", () => {
  it("keeps .gtv-wheel-pop-layer out of hit-testing so clicks fall through to the layer beneath it", () => {
    const rule = stylesCss.match(/\.gtv-wheel-pop-layer\s*{[^}]*}/);
    expect(rule).toBeTruthy();
    expect(rule![0]).toMatch(/pointer-events:\s*none/);
  });
});
