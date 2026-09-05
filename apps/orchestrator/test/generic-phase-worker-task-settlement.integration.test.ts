import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-phase-worker-task-settlement.feature", import.meta.url));
const applicationPath = fileURLToPath(
  new URL("../src/workflows/phases/phase-worker-task-settlement-application.ts", import.meta.url),
);
const orchestratorPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));

describe("generic worker task settlement Gherkin integration", () => {
  it("binds every scenario to the production settlement application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");

    expect(feature).toContain("Scenario: An ordinary task succeeds");
    expect(feature).toContain("Scenario: A declared task returns a blocker");
    expect(feature).toContain("Scenario: A fixer succeeds before independent review");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.selectTransition(");
    expect(application).toContain("this.dependencies.completeTask({");
    expect(application).toContain("this.dependencies.refreshFeature(");
    expect(orchestrator).toContain("this.dependencies.settleTask.settle({");
  });
});
