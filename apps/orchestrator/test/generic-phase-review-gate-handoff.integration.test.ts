import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-phase-review-gate-handoff.feature", import.meta.url));
const applicationPath = fileURLToPath(
  new URL("../src/workflows/reviews/phase-review-gate-handoff-application.ts", import.meta.url),
);
const routingPath = fileURLToPath(
  new URL("../src/workflows/reviews/phase-pre-review-routing-application.ts", import.meta.url),
);
const orchestratorPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const workerCompositionPath = fileURLToPath(
  new URL("../src/bootstrap/phase-worker-applications.ts", import.meta.url),
);

describe("generic phase review handoff Gherkin integration", () => {
  it("binds every scenario to the production handoff application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const routing = readFileSync(routingPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    const workerComposition = readFileSync(workerCompositionPath, "utf8");

    expect(feature).toContain("Scenario: Completed work reaches baseline review");
    expect(feature).toContain("Scenario: Fixer work is awaiting an independent rerun");
    expect(feature).toContain("Scenario: The phase contract does not require review");
    expect(feature).toContain("Scenario: The review gate is already settled");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.markAwaitingReview(feature, phase)");
    expect(application).toContain("this.dependencies.refreshFeature(");
    expect(orchestrator).toContain("phaseReview: { phaseReviewGateHandoffApplication }");
    expect(workerComposition).toContain("prepareReviewHandoff: (input) => dependencies.phaseReview.phaseReviewGateHandoffApplication.prepare(input)");
    expect(routing).toContain("this.dependencies.prepareReviewHandoff({");
  });
});
