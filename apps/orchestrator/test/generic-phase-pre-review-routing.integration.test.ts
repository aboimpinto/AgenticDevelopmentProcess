import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-phase-pre-review-routing.feature", import.meta.url));
const applicationPath = fileURLToPath(new URL("../src/workflows/reviews/phase-pre-review-routing-application.ts", import.meta.url));
const orchestratorPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));

describe("generic pre-review routing Gherkin integration", () => {
  it("binds every scenario to the production routing application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");

    expect(feature).toContain("Scenario: Baseline review is ready");
    expect(feature).toContain("Scenario: Independent review rerun is ready");
    expect(feature).toContain("Scenario: Durable reconciliation completes the phase");
    expect(feature).toContain("Scenario: Durable reconciliation selects another task");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.prepareReviewHandoff({");
    expect(application).toContain("this.dependencies.reconcileContinuation({");
    expect(orchestrator).toContain("this.dependencies.preReview.route({");
  });
});
