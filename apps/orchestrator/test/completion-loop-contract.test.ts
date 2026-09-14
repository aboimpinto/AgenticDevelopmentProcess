import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { completionScenarios } from "./support/completion-loop-fixture.js";

it("keeps one unique Gherkin scenario per shared browser/server twin journey", () => {
  const source = readFileSync("apps/web/e2e/features/completion-loop.feature", "utf8");
  const scenarios = [...source.matchAll(/@(CR-\d+) @Playwright @TwinIntegration\s+Scenario: ([^\n]+)/g)]
    .map(([, id, title]) => ({ id, title }));
  expect(scenarios).toEqual(completionScenarios.map(({ id, title }) => ({ id, title })));
  expect(new Set(scenarios.map(scenario => scenario.id)).size).toBe(scenarios.length);
  expect(new Set(scenarios.map(scenario => scenario.title)).size).toBe(scenarios.length);
  expect(source.match(/^\s*Scenario:/gm)?.length).toBe(scenarios.length);
  for (const path of ["apps/web/e2e/completion-loop.spec.ts", "apps/orchestrator/test/completion-loop-twin.integration.test.ts"]) {
    const runner = readFileSync(path, "utf8");
    expect(runner).toContain("for (const scenario of completionScenarios)");
    expect(runner).not.toContain("page.route(");
  }
});
