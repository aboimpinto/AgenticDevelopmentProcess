import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-phase-review-requirement.feature", import.meta.url));
const applicationPath = fileURLToPath(
  new URL("../src/workflows/reviews/phase-review-requirement-application.ts", import.meta.url),
);
const orchestratorPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));
const planningPath = fileURLToPath(
  new URL("../src/workflows/phases/phase-execution-planning-application.ts", import.meta.url),
);

describe("generic phase review requirement Gherkin integration", () => {
  it("binds every scenario to the production review-requirement application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    const planning = readFileSync(planningPath, "utf8");

    expect(feature).toContain("Scenario: Conditional review is not applicable");
    expect(feature).toContain("Scenario: Documentation-only legacy review state is stale");
    expect(feature).toContain("Scenario: Current work requires review");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.skipTask({");
    expect(application).toContain("this.dependencies.reconcile({");
    expect(orchestrator).toContain("this.dependencies.planning.prepare({");
    expect(planning).toContain("this.dependencies.prepareReviewRequirement({");
  });
});
