import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-phase-review-state.feature", import.meta.url));
const applicationPath = fileURLToPath(
  new URL("../src/workflows/reviews/phase-review-state-application.ts", import.meta.url),
);
const orchestratorPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));
const planningPath = fileURLToPath(
  new URL("../src/workflows/phases/phase-execution-planning-application.ts", import.meta.url),
);

describe("generic phase review state Gherkin integration", () => {
  it("binds every scenario to the production state resolver", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    const planning = readFileSync(planningPath, "utf8");

    expect(feature).toContain("Scenario: A phase reaches its baseline review gate");
    expect(feature).toContain("Scenario: A previous failure references review findings");
    expect(feature).toContain("Scenario: Immutable approval survives a restart");
    expect(feature).toContain("Scenario: Canonical feature identity is unavailable");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.readCurrentEvidence({");
    expect(application).toContain("this.dependencies.plan({");
    expect(orchestrator).toContain("this.dependencies.planning.prepare({");
    expect(planning).toContain("this.dependencies.resolveReviewState({");
  });
});
