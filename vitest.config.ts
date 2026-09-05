import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Web tests have their own jsdom configuration and coverage job in CI.
    // Keep this root suite in Vitest's Node environment for orchestrator,
    // database, and shared-package tests.
    setupFiles: ["./scripts/vitest-isolated-environment.ts"],
    exclude: [
      "apps/web/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/e2e/**",
      "**/dist-types/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["lcov"],
      reportsDirectory: "coverage/core",
      include: [
        "apps/orchestrator/src/**/*.ts",
        "packages/*/src/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.integration.test.ts",
        "**/test/**",
        "**/__fixtures__/**",
      ],
    },
  },
});
