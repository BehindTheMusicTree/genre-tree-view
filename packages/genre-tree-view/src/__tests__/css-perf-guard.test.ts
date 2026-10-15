import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MAX_FILTER_BLUR_PX = 24;

const css = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

describe("styles.css perf guard", () => {
  it("keeps every filter blur radius small, since filters re-run on each zoom frame", () => {
    const radii = [...css.matchAll(/(?<![-\w])(?:backdrop-)?filter:\s*([^;]+);/g)].flatMap(([, value]) =>
      value.includes("drop-shadow")
        ? [...value.matchAll(/drop-shadow\(\s*\S+\s+\S+\s+([\d.]+)px/g)].map((m) => Number(m[1]))
        : [...value.matchAll(/blur\(\s*([\d.]+)px/g)].map((m) => Number(m[1])),
    );
    expect(radii.length).toBeGreaterThan(0);
    expect(Math.max(...radii)).toBeLessThanOrEqual(MAX_FILTER_BLUR_PX);
  });
});
