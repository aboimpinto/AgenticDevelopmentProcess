import type { CardMetadataStore } from "@hepha/db";
import { describe, expect, it, vi } from "vitest";
import { createPhaseEntryApplications } from "../src/bootstrap/phase-entry-applications.js";
import { PhaseEntryPreparationApplication } from "../src/workflows/phases/phase-entry-preparation-application.js";
import { PhaseReviewHandoffApplication } from "../src/workflows/phases/phase-review-handoff-application.js";
import { ProtectedPhaseWorkerApplication } from "../src/workflows/phases/protected-phase-worker-application.js";

describe("phase entry application composition", () => {
  it("returns shared entry, handoff, reconciliation, continuation, and protection boundaries", () => {
    const applications = createPhaseEntryApplications({
      absoluteSafetyCap: 7,
      completionEvidence: { summarize: vi.fn() } as never,
      failureContexts: { findLatest: vi.fn() } as never,
      foundation: {
        featurePlanningArtifactPolicy: { isMissing: vi.fn() },
        phaseExecutionContractApplication: { get: vi.fn() },
        phaseExecutionOrderPolicy: { order: vi.fn() },
        phaseTaskExecutionApplication: { begin: vi.fn() },
        recordImplementationPhaseProgress: vi.fn(),
      } as never,
      metadataStore: {} as CardMetadataStore,
      prepareTemplate: vi.fn(),
      runCoordinator: { recordFeatureProgress: vi.fn() } as never,
      runDeclaredVerification: vi.fn(),
      statusDocuments: {
        hasCheckedTaskLedger: vi.fn(),
        markAwaitingReview: vi.fn(),
      } as never,
      targets: { findCurrentFeature: vi.fn() } as never,
      workflowMachineState: {
        capturePhaseWorker: vi.fn(),
        restorePhaseWorker: vi.fn(),
      } as never,
    });

    expect(applications.phaseEntryPreparationApplication).toBeInstanceOf(PhaseEntryPreparationApplication);
    expect(applications.phaseReviewHandoffApplication).toBeInstanceOf(PhaseReviewHandoffApplication);
    expect(applications.protectedPhaseWorkerApplication).toBeInstanceOf(ProtectedPhaseWorkerApplication);
    expect(applications.phaseStateReconciliationApplication).toBeDefined();
    expect(applications.phaseWorkerContinuationApplication).toBeDefined();
  });
});
