import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-phase-post-worker-validation.feature", import.meta.url));
const applicationPath = fileURLToPath(
  new URL("../src/workflows/phases/phase-post-worker-validation-application.ts", import.meta.url),
);
const orchestratorPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));

describe("generic post-worker validation Gherkin integration", () => {
  it("binds every scenario to the production validation boundary", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");

    expect(feature).toContain("Scenario: An ordinary phase returns valid durable state");
    expect(feature).toContain("Scenario: A declared planning phase omits its artifact");
    expect(feature).toContain("Scenario: A recovery phase reaches its explicit boundary");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.assertTemplate");
    expect(application).toContain("input.planningArtifactRequired");
    expect(application).toContain("this.dependencies.isRecoveryComplete");
    expect(orchestrator).toContain("this.dependencies.postWorkerValidation.validate({");
    expect(orchestrator).toContain("planningArtifactRequired: this.dependencies.planningArtifactRequired(feature, phaseAfterWorker)");
  });
});
