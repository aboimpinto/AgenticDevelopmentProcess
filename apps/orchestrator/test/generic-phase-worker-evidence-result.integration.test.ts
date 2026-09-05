import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-phase-worker-evidence-result.feature", import.meta.url));
const applicationPath = fileURLToPath(new URL("../src/workflows/phases/phase-worker-result-application.ts", import.meta.url));
const orchestratorPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));

describe("generic protected phase worker evidence Gherkin integration", () => {
  it("binds every scenario to the production result application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");

    expect(feature).toContain("Scenario: Removed test coverage is restored");
    expect(feature).toContain("Scenario: Declared gate evidence fails");
    expect(feature).toContain("Scenario: Authoritative remediation bindings are invalid");
    expect(feature).toContain("Scenario: Worker evidence is valid");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.applyGateEvidence({");
    expect(application).toContain("this.dependencies.publishSuccessor({");
    expect(application).toContain("this.dependencies.prepareRepair({");
    expect(orchestrator).toContain("this.dependencies.workerResult.process({");
  });
});
