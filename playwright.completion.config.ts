import { defineConfig, devices } from "@playwright/test";
delete process.env.NO_COLOR;
export default defineConfig({ testDir: "./apps/web/e2e", testMatch: ["completion-loop.spec.ts", "fresh-feature-verification.spec.ts"], timeout: 30_000,
  expect: { timeout: 8_000 }, fullyParallel: false, workers: 1, use: { ...devices["Desktop Chrome"], trace: "retain-on-failure" },
  outputDir: "test-results/completion-loop", reporter: [["list"], ["json", { outputFile: "test-results/completion-loop-results.json" }]],
});
