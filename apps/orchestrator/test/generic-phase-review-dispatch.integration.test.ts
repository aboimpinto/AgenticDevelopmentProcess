import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { selectPersistedReviewTransition } from "../src/review-resume-route-policy.js";

const featurePath = fileURLToPath(new URL("./generic-phase-review-dispatch.feature", import.meta.url));
const applicationPath = fileURLToPath(new URL("../src/workflows/reviews/phase-review-dispatch-application.ts", import.meta.url));
const workflowPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));

describe("generic review dispatch Gherkin integration", () => {
  it("binds every scenario to the production dispatch application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const workflow = readFileSync(workflowPath, "utf8");

    expect(feature).toContain("Scenario: Durable approval already exists");
    expect(feature).toContain("Scenario: Reviewer requests changes");
    expect(feature).toContain("Scenario: Declared review task completes");
    expect(feature).toContain("Scenario: Approved review reaches phase exit");
    expect(feature).toContain("Scenario: Approved manifest still requires terminal remediation evidence");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.planInvocation({");
    expect(application).toContain("this.dependencies.executeReview({");
    expect(application).toContain("this.dependencies.completeReviewTask({");
    expect(workflow).toContain("this.dependencies.review.dispatch({");
  });

  it("routes approved nonterminal authority back to the same declared task", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Then the executor repeats the same review task through fixer evidence recovery");
    expect(feature).toContain("And phase exit is not attempted");
    expect(selectPersistedReviewTransition("APPROVED", "PENDING")).toBe("fixer");
  });
});
