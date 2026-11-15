import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure", channel: process.env.PLAYWRIGHT_CHANNEL },
  projects: [
    { name: "chromium-touch", use: { ...devices["Pixel 5"] } },
    { name: "chromium-desktop", use: { browserName: "chromium" } },
  ],
  webServer: {
    command: "pnpm --filter genre-tree-view-playground exec vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
