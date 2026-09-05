import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-phase-entry-preparation.feature", import.meta.url));
const applicationPath = fileURLToPath(
  new URL("../src/workflows/phases/phase-entry-preparation-application.ts", import.meta.url),
);
const orchestratorPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));

describe("generic phase entry preparation Gherkin integration", () => {
  it("binds every scenario to the production preparation application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");

    expect(feature).toContain("Scenario: Settled phase is skipped");
    expect(feature).toContain("Scenario: Resolved phase has unfinished durable obligations");
    expect(feature).toContain("Scenario: Pending phase declares future gates");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.prepareTemplate({");
    expect(application).toContain("const maySkip = resolved");
    expect(orchestrator).toContain("this.dependencies.entry.prepare({");
  });
});
