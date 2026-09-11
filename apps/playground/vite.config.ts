import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve:
    // Dev server only: resolve straight to the library's source instead of its built dist/, so
    // Vite's own HMR reflects a src/*.ts(x) edit immediately with no tsup build step in between.
    // `vite build` (command "build") keeps resolving the package normally, via its package.json
    // exports (dist/), so the playground's production bundle matches what's actually published.
    // Exact-match regexp, not a plain string key: a string key also matches subpaths
    // (`@behindthemusictree/genre-tree-view/package.json`), which would wrongly redirect those
    // into this src file too.
    command === "serve"
      ? {
          alias: [
            {
              find: /^@behindthemusictree\/genre-tree-view$/,
              replacement: path.resolve(__dirname, "../../packages/genre-tree-view/src/index.ts"),
            },
            // Same reasoning as the entry alias above: without this, the CSS subpath still
            // resolves through package.json's exports map to dist/styles.css, which only a
            // separately-running `tsup --watch` rebuilds — so a src/styles.css edit would
            // silently not show up in the playground unless that watcher happened to be running.
            {
              find: /^@behindthemusictree\/genre-tree-view\/styles\.css$/,
              replacement: path.resolve(__dirname, "../../packages/genre-tree-view/src/styles.css"),
            },
          ],
        }
      : undefined,
  optimizeDeps: {
    // Workspace-linked package: don't pre-bundle/cache it, so its source edits are picked up on
    // save instead of requiring a manual restart to re-run the optimizer.
    exclude: ["@behindthemusictree/genre-tree-view"],
  },
}));
