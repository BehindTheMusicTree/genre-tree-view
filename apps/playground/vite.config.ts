import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Workspace-linked package: don't pre-bundle/cache it, so tsup's watch-mode rebuilds of
    // dist/ are picked up on save instead of requiring a manual restart to re-run the optimizer.
    exclude: ["@behindthemusictree/genre-tree-view"],
  },
  server: {
    watch: {
      // Vite ignores node_modules by default (including workspace symlinks); un-ignore this
      // package's dist output specifically so its rebuilds trigger a reload.
      ignored: ["!**/node_modules/@behindthemusictree/genre-tree-view/dist/**"],
    },
  },
});
