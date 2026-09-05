import { describe, expect, it, vi } from "vitest";
import { FeatureCompletionReadinessPolicy } from "../src/application/features/feature-completion-readiness-policy.js";
import type { WorkItemCard } from "@hepha/shared";

function readyFeature(overrides: Record<string, unknown> = {}): WorkItemCard {
  return {
    featureWorkflow: {
      activeRun: null,
      findings: [{ status: "closed" }],
      manualTestsCompletedAt: "2032-01-01T00:00:00.000Z",
      userCodeReviewCompletedAt: "2032-01-01T00:00:00.000Z",
    },
    implementationEvidence: { phaseQualityGates: [] },
    phases: [{ fileName: "phase-8-random.md", number: 8, status: "COMPLETED", title: "Random" }],
    stateFolder: "03_IN_PROGRESS",
    ...overrides,
  } as WorkItemCard;
}

describe("FeatureCompletionReadinessPolicy", () => {
  it("allows completion when implementation, user evidence, findings, and gates are resolved", () => {
    const readDeliveryMode = vi.fn(() => "direct_merge" as const);
    const policy = new FeatureCompletionReadinessPolicy({ readDeliveryMode });

    expect(policy.canStart(readyFeature())).toBe(true);
    expect(readDeliveryMode).toHaveBeenCalledOnce();
  });

  it.each([
    ["active workflow", { featureWorkflow: { ...readyFeature().featureWorkflow, activeRun: { command: "continue-implementing" } } }],
    ["wrong lifecycle folder", { stateFolder: "02_READY_TO_DEVELOP" }],
    ["unresolved phase", { phases: [{ fileName: "phase-1-random.md", number: 1, status: "IN_PROGRESS", title: "Random" }] }],
    ["missing manual acceptance", { featureWorkflow: { ...readyFeature().featureWorkflow, manualTestsCompletedAt: null } }],
    ["missing review acceptance", { featureWorkflow: { ...readyFeature().featureWorkflow, userCodeReviewCompletedAt: null } }],
    ["open finding", { featureWorkflow: { ...readyFeature().featureWorkflow, findings: [{ status: "open" }] } }],
    ["missing phase gate", { implementationEvidence: { phaseQualityGates: [{ phaseNumber: 8, phaseStatus: "COMPLETED", phaseTitle: "Random", gates: [{ gate: "tests", status: "missing" }] }] } }],
    ["unresolved human review", { phases: [
      { fileName: "phase-8-random.md", number: 8, status: "COMPLETED", title: "Random" },
      { fileName: "phase-9-random.md", number: 9, status: "AWAITING_USER_ACCEPTANCE", title: "Human Review Findings" },
    ] }],
  ])("blocks completion for %s", (_label, overrides) => {
    const policy = new FeatureCompletionReadinessPolicy({ readDeliveryMode: () => "direct_merge" });
    expect(policy.canStart(readyFeature(overrides))).toBe(false);
  });

  it("leaves pull-request delivery completion to its delivery gates", () => {
    const policy = new FeatureCompletionReadinessPolicy({ readDeliveryMode: () => "pull_request" });
    expect(policy.canStart(readyFeature())).toBe(false);
  });

  it("preserves completion behavior when delivery metadata is unavailable", () => {
    const policy = new FeatureCompletionReadinessPolicy({ readDeliveryMode: () => null });
    expect(policy.canStart(readyFeature())).toBe(true);
  });
});
