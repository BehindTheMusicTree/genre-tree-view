import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Guards against the bug this fixes: the dev-only alias in vite.config.ts pointed the library's
 * entry (".") straight at src/ for instant HMR, but a separate export subpath (styles.css) wasn't
 * covered, so it silently kept resolving through package.json's `exports` map to dist/ — stale
 * unless a `tsup --watch` happened to also be running. Rather than trusting the alias list to stay
 * in sync by memory as exports are added/removed, assert it here. */
describe("playground vite dev aliases stay in sync with the library's exports map", () => {
  it("has a dev alias for every export subpath besides package.json", () => {
    const packageJsonPath = path.resolve(
      __dirname,
      "../../../../packages/genre-tree-view/package.json",
    );
    const viteConfigPath = path.resolve(__dirname, "../../vite.config.ts");

    const { exports } = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      exports: Record<string, unknown>;
    };
    // Aliases are regexes (e.g. `/^@behindthemusictree\/genre-tree-view\/styles\.css$/`), so
    // un-escape backslash-escaped characters before doing a plain substring search for the
    // specifier below.
    const viteConfigSource = readFileSync(viteConfigPath, "utf-8").replace(/\\(.)/g, "$1");

    const subpaths = Object.keys(exports).filter((key) => key !== "./package.json");
    expect(subpaths.length).toBeGreaterThan(0);

    for (const subpath of subpaths) {
      const specifier =
        subpath === "."
          ? "@behindthemusictree/genre-tree-view"
          : `@behindthemusictree/genre-tree-view${subpath.slice(1)}`;

      expect(
        viteConfigSource.includes(specifier),
        `vite.config.ts has no dev alias for the "${subpath}" export ("${specifier}") — add one ` +
          "so playground dev reflects live src edits instead of a stale dist/ build.",
      ).toBe(true);
    }
  });
});
