import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planPhaseReviewInvocation } from "../src/workflows/reviews/phase-review-invocation-planner.js";

const baseline = {
  baselineReviewRequired: true,
  featureId: "arbitrary-feature",
  invocationId: "invocation",
  phaseNumber: 731,
  projectId: "arbitrary-project",
  projectRoot: "/arbitrary/project",
  rerunRequired: false,
  terminalDecisionPresent: false,
  workflowRunId: "workflow",
};

describe("phase review invocation planner", () => {
  it("dispatches a baseline review with exact scope, storage, and immutable identity", () => {
    const plan = planPhaseReviewInvocation(baseline);
    expect(plan.dispatchReviewer).toBe(true);
    expect(plan.scope).toEqual({
      featureId: "arbitrary-feature",
      phaseNumber: 731,
      projectId: "arbitrary-project",
      reviewGateId: "code-review",
    });
    expect(plan.databasePath).toBe(join("/arbitrary/project", ".hepha", "hepha.sqlite"));
    expect(plan.artifactId).toBe("phase-731-code-review-workflow-invocation");
  });

  it("dispatches an independent rerun even without a baseline request", () => {
    const plan = planPhaseReviewInvocation({ ...baseline, baselineReviewRequired: false, rerunRequired: true });
    expect(plan.dispatchReviewer).toBe(true);
    expect(plan.rerun).toBe(true);
  });

  it("does not dispatch over a terminal durable decision", () => {
    const plan = planPhaseReviewInvocation({ ...baseline, rerunRequired: true, terminalDecisionPresent: true });
    expect(plan.dispatchReviewer).toBe(false);
  });

  it("uses an explicitly configured authoritative database", () => {
    expect(planPhaseReviewInvocation({
      ...baseline,
      configuredDatabasePath: "/durable/reviews.sqlite",
    }).databasePath).toBe("/durable/reviews.sqlite");
  });

  it("projects a durable approval into an exact-scope phase-exit receipt", () => {
    const scope = {
      featureId: "arbitrary-feature",
      phaseNumber: 731,
      projectId: "arbitrary-project",
      reviewGateId: "code-review" as const,
    };
    const plan = planPhaseReviewInvocation({
      ...baseline,
      baselineReviewRequired: false,
      durableApprovedEvidence: { contentHash: "a".repeat(64) },
    });
    expect(plan.dispatchReviewer).toBe(false);
    expect(plan.approvedReceipt).toEqual({
      contentHash: "a".repeat(64),
      databasePath: join("/arbitrary/project", ".hepha", "hepha.sqlite"),
      scope,
    });
  });
});
