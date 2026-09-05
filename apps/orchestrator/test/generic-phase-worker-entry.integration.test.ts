import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-phase-worker-entry.feature", import.meta.url));
const applicationPath = fileURLToPath(new URL("../src/workflows/phases/phase-worker-entry-application.ts", import.meta.url));
const orchestratorPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));

describe("generic phase worker entry Gherkin integration", () => {
  it("binds every scenario to the production worker-entry application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");

    expect(feature).toContain("Scenario: Phase is ready for review or exit");
    expect(feature).toContain("Scenario: Next declared task is full verification");
    expect(feature).toContain("Scenario: Next declared task uses an implementation worker");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.beginTask({");
    expect(application).toContain("this.dependencies.executeVerification({");
    expect(application).toContain("this.dependencies.recordProgress({");
    expect(orchestrator).toContain("this.dependencies.workerEntry.enter({");
  });
});
