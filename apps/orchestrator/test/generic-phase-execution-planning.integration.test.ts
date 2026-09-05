import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-phase-execution-planning.feature", import.meta.url));
const applicationPath = fileURLToPath(new URL(
  "../src/workflows/phases/phase-execution-planning-application.ts",
  import.meta.url,
));
const orchestratorPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));

describe("generic phase execution planning Gherkin integration", () => {
  it("binds every scenario to the production planning application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");

    expect(feature.match(/^  Scenario:/gm)).toHaveLength(4);
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.prepareReviewRequirement({");
    expect(application).toContain("this.dependencies.resolveReviewState({");
    expect(application).toContain("this.dependencies.planWorker({");
    expect(orchestrator).toContain("this.dependencies.planning.prepare({");
  });
});
