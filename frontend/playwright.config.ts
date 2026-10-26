import { defineConfig, devices } from "@playwright/test";

/** End-to-end tests run against the *production build* (vite preview), so
 *  build-only failures — like MapLibre's worker missing from dist/ — are
 *  caught. The API and map tiles are replayed from e2e/fixtures (real
 *  responses recorded from the live backend), so the tests don't depend
 *  on ERA's endpoint, which intermittently times out.
 *
 *  Locally, PLAYWRIGHT_CHROMIUM_EXECUTABLE can point at an installed
 *  Chrome instead of `npx playwright install chromium`. */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    ...(executablePath && { launchOptions: { executablePath } }),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
