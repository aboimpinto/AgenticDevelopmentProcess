import { defineConfig, devices } from "@playwright/test";

// Playwright enables colour for its workers. Do not pass an inherited
// NO_COLOR alongside that FORCE_COLOR setting; Node warns for every spawned
// build server and browser worker when both are present.
delete process.env.NO_COLOR;

export default defineConfig({
  expect: {
    timeout: 5_000,
  },
  testDir: "./apps/web/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @hepha/web build && pnpm --filter @hepha/web exec vite preview --host 127.0.0.1 --port 5174 --strictPort",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    url: "http://127.0.0.1:5174",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
