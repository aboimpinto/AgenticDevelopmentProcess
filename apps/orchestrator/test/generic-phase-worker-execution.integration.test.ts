import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-phase-worker-execution.feature", import.meta.url));
const applicationPath = fileURLToPath(new URL("../src/workflows/phases/phase-worker-execution-application.ts", import.meta.url));
const workflowPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));

describe("generic protected phase worker Gherkin integration", () => {
  it("binds every scenario to the production worker execution application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const workflow = readFileSync(workflowPath, "utf8");

    expect(feature).toContain("Scenario: Ordinary implementation worker runs");
    expect(feature).toContain("Scenario: Planning worker runs");
    expect(feature).toContain("Scenario: Review findings worker runs");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.buildContext({");
    expect(application).toContain("this.dependencies.prepareSuccessor({");
    expect(application).toContain("this.dependencies.executeProtected({");
    expect(workflow).toContain("this.dependencies.workerExecution.execute({");
  });
});
