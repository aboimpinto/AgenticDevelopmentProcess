import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { freshScenarios } from "./support/fresh-verification-fixture.js";
it("uses one canonical Gherkin scenario list for browser and server-only fresh verification", () => {
  const source = readFileSync("apps/web/e2e/features/fresh-feature-verification.feature", "utf8");
  expect([...source.matchAll(/Scenario: (FV-\d+) ([^\n]+)/g)].map(([, id, title]) => ({ id, title })))
    .toEqual(freshScenarios.map(({ id, title }) => ({ id, title })));
  for (const file of ["apps/web/e2e/fresh-feature-verification.spec.ts", "apps/orchestrator/test/fresh-feature-verification.twin.test.ts"])
    expect(readFileSync(file, "utf8")).toContain("for (const scenario of freshScenarios)");
});
