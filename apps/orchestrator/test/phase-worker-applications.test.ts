import { describe, expect, it, vi } from "vitest";
import { createPhaseWorkerApplications } from "../src/bootstrap/phase-worker-applications.js";
import { PhaseWorkerExecutionApplication } from "../src/workflows/phases/phase-worker-execution-application.js";
import { PhaseWorkerResultApplication } from "../src/workflows/phases/phase-worker-result-application.js";
import { PhasePostWorkerReviewApplication } from "../src/workflows/reviews/phase-post-worker-review-application.js";
import { PhasePreReviewRoutingApplication } from "../src/workflows/reviews/phase-pre-review-routing-application.js";

describe("phase worker application composition", () => {
  it("returns one worker, remediation, and review-routing graph", () => {
    const applications = createPhaseWorkerApplications({
      buildContext: vi.fn(),
      completionEvidence: { has: vi.fn() } as never,
      failureContexts: { findLatest: vi.fn() } as never,
      formatModelLabel: vi.fn(() => "model"),
      foundation: {
        phaseGateEvidenceApplication: { apply: vi.fn() },
        phaseSameRunRepairApplication: { prepare: vi.fn() },
        recordImplementationPhaseProgress: vi.fn(),
      } as never,
      maximumRepairAttempts: 7,
      phaseEntry: {
        phaseWorkerContinuationApplication: { reconcile: vi.fn() },
        protectedPhaseWorkerApplication: { execute: vi.fn() },
      } as never,
      phaseReview: { phaseReviewGateHandoffApplication: { prepare: vi.fn() } } as never,
      runWorker: vi.fn(),
      runtimeDatabasePath: "/tmp/runtime.sqlite",
      statusDocuments: { markAwaitingReviewRerun: vi.fn() } as never,
      targets: { findCurrentFeature: vi.fn() } as never,
    });

    expect(applications.phaseWorkerExecutionApplication).toBeInstanceOf(PhaseWorkerExecutionApplication);
    expect(applications.phaseWorkerResultApplication).toBeInstanceOf(PhaseWorkerResultApplication);
    expect(applications.phasePostWorkerReviewApplication).toBeInstanceOf(PhasePostWorkerReviewApplication);
    expect(applications.phasePreReviewRoutingApplication).toBeInstanceOf(PhasePreReviewRoutingApplication);
  });
});
