import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./browser/android",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "android-results",
  reporter: [["list"], ["html", { outputFolder: "android-report", open: "never" }]],
  projects: [{ name: "android-chrome-cdp-touch" }],
  webServer: {
    command: "pnpm --filter genre-tree-view-playground exec vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
