import type { CardMetadataStore } from "@hepha/db";
import { describe, expect, it, vi } from "vitest";
import { createPhaseReviewApplications } from "../src/bootstrap/phase-review-applications.js";
import { PhaseExecutionPlanningApplication } from "../src/workflows/phases/phase-execution-planning-application.js";
import { PhaseReviewDispatchApplication } from "../src/workflows/reviews/phase-review-dispatch-application.js";
import { PhaseReviewGateHandoffApplication } from "../src/workflows/reviews/phase-review-gate-handoff-application.js";

describe("phase review application composition", () => {
  it("returns one independent review and review-aware planning graph", () => {
    const applications = createPhaseReviewApplications({
      buildReviewContext: vi.fn(),
      failureContexts: { findLatest: vi.fn(), resolve: vi.fn() } as never,
      focusedGit: { commitReviewReport: vi.fn() } as never,
      foundation: {
        phaseCodeClassificationPolicy: { hasCode: vi.fn() },
        phaseExecutionContractApplication: { get: vi.fn() },
        phaseTaskExecutionApplication: {
          completeNextCodeReview: vi.fn(),
          skip: vi.fn(),
        },
        recordImplementationPhaseProgress: vi.fn(),
      } as never,
      metadataStore: {} as CardMetadataStore,
      phaseEntry: { phaseStateReconciliationApplication: { reconcile: vi.fn() } } as never,
      previousReviewPresenter: { render: vi.fn() } as never,
      reportWriter: { write: vi.fn() } as never,
      runWorker: vi.fn(),
      runNestedWorker: vi.fn(),
      statusDocuments: {
        hasCheckedTaskLedger: vi.fn(),
        isAwaitingReviewRerun: vi.fn(),
        markAwaitingReview: vi.fn(),
        recordApprovedReviewEvidence: vi.fn(),
      } as never,
      targets: { findCurrentFeature: vi.fn() } as never,
    });

    expect(applications.phaseReviewDispatchApplication).toBeInstanceOf(PhaseReviewDispatchApplication);
    expect(applications.phaseReviewGateHandoffApplication).toBeInstanceOf(PhaseReviewGateHandoffApplication);
    expect(applications.phaseExecutionPlanningApplication).toBeInstanceOf(PhaseExecutionPlanningApplication);
    expect(applications.phaseReviewStateApplication).toBeDefined();
  });
});
