import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
  async onSuccess() {
    fs.copyFileSync(
      path.join(repoRoot, "src/styles.css"),
      path.join(repoRoot, "dist/styles.css"),
    );
  },
});
