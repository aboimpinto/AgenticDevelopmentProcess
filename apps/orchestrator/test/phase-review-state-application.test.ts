import { describe, expect, it, vi } from "vitest";
import { PhaseReviewStateApplication } from "../src/workflows/reviews/phase-review-state-application.js";

const phase = { number: 731, status: "AWAITING_REVIEW", title: "Arbitrary work" } as never;
const feature = { externalId: "arbitrary-feature" } as never;
const project = { id: "arbitrary-project", rootPath: "/arbitrary/project" } as never;
const planResult = { reviewResumeRoute: "reviewer" } as never;

function createTarget(options: {
  evidence?: unknown;
  featureId?: string | null;
  failureContext?: { phaseNumber: number; reportPath: string } | null;
  latestReport?: { path: string; result: string } | null;
  ordered?: boolean;
} = {}) {
  const plan = vi.fn(() => planResult);
  const readCurrentEvidence = vi.fn(() => options.evidence as never);
  return {
    application: new PhaseReviewStateApplication({
      deriveFeatureId: () => options.featureId === undefined ? "arbitrary-feature-id" : options.featureId,
      findLatestReport: () => options.latestReport ?? null,
      isAwaitingReview: () => true,
      isAwaitingRerun: () => false,
      isReadyForIndependentReview: () => true,
      isOrderedTaskWorkflow: () => options.ordered ?? false,
      plan,
      readCurrentEvidence,
      resolveFailureContext: () => options.failureContext ?? null,
    }),
    plan,
    readCurrentEvidence,
  };
}

const input = {
  contract: null,
  databasePath: "/arbitrary/hepha.sqlite",
  feature,
  missingQualityGates: ["code_review"],
  nextOrderedTaskKind: null,
  orderedReviewRequired: false,
  phase,
  previousFailureBrief: null,
  project,
  reviewRequired: true,
};

describe("PhaseReviewStateApplication", () => {
  it("plans a baseline review from current phase facts and exact durable scope", () => {
    const target = createTarget({ latestReport: { path: "/report.md", result: "APPROVED" } });

    const result = target.application.resolve(input);

    expect(result.plan).toBe(planResult);
    expect(target.readCurrentEvidence).toHaveBeenCalledWith({
      databasePath: "/arbitrary/hepha.sqlite",
      expectedScope: {
        projectId: "arbitrary-project",
        featureId: "arbitrary-feature-id",
        phaseNumber: 731,
        reviewGateId: "code-review",
      },
      projectRoot: "/arbitrary/project",
    });
    expect(target.plan).toHaveBeenCalledWith(expect.objectContaining({
      latestReportResult: "APPROVED",
      phaseNumber: 731,
      workReadyForReview: true,
    }));
  });

  it("carries historical failure context only as a planning fact", () => {
    const failureContext = { phaseNumber: 731, reportPath: "/latest.md" };
    const target = createTarget({ failureContext, latestReport: { path: "/latest.md", result: "NEEDS_CHANGES" } });

    const result = target.application.resolve({ ...input, previousFailureBrief: "Previous failure" });

    expect(result.failureContext).toBe(failureContext);
    expect(target.plan).toHaveBeenCalledWith(expect.objectContaining({
      failureContextPhaseNumber: 731,
      latestReportResult: "NEEDS_CHANGES",
    }));
  });

  it("passes current immutable approval evidence into resume planning", () => {
    const evidence = {
      artifact: { artifactKind: "review_manifest", result: "APPROVED" },
      gate: { gateState: "PENDING" },
    };
    const target = createTarget({ evidence });

    expect(target.application.resolve(input).durableEvidence).toBe(evidence);
    expect(target.plan).toHaveBeenCalledWith(expect.objectContaining({
      currentDurableArtifactKind: "review_manifest",
      currentDurableManifestResult: "APPROVED",
      currentDurableGateState: "PENDING",
    }));
  });

  it("does not query immutable storage without a canonical feature identity", () => {
    const target = createTarget({ featureId: null });

    expect(target.application.resolve(input).durableEvidence).toBeUndefined();
    expect(target.readCurrentEvidence).not.toHaveBeenCalled();
  });
});
