import codspeedPlugin from "@codspeed/vitest-plugin";
import { coverageConfigDefaults, defineConfig } from "vitest/config";

const interactionThresholds = { lines: 95, branches: 90, functions: 90, statements: 95 };

export default defineConfig({
  plugins: [codspeedPlugin()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [...coverageConfigDefaults.exclude, "src/index.ts", "src/types.ts", "src/__bench__/**"],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
        "src/use-node-info-panel.ts": interactionThresholds,
        "src/use-pan-zoom.ts": interactionThresholds,
        "src/GenreTreeOutline.tsx": interactionThresholds,
        "src/InfoPanel.tsx": interactionThresholds,
      },
    },
  },
});
