import type { CardMetadataStore } from "@hepha/db";
import { describe, expect, it, vi } from "vitest";
import { createPhaseBoundaryApplications } from "../src/bootstrap/phase-boundary-applications.js";
import { AutonomousPhaseQueueApplication } from "../src/workflows/phases/autonomous-phase-queue-application.js";
import { DeclaredVerificationTaskApplication } from "../src/workflows/phases/declared-verification-task-application.js";
import { ImplementationCompletionApplication } from "../src/workflows/phases/implementation-completion-application.js";
import { PhaseExitLifecycleApplication } from "../src/workflows/phases/phase-exit-lifecycle-application.js";
import { PhaseFailureRecordingApplication } from "../src/workflows/phases/phase-failure-recording-application.js";
import { PhaseTemplateDispatchApplication } from "../src/workflows/phases/phase-template-dispatch-application.js";

describe("phase boundary application composition", () => {
  it("returns entry helpers, exit lifecycle, queue, failure, and completion boundaries", () => {
    const applications = createPhaseBoundaryApplications({
      completionEvidence: { has: vi.fn() } as never,
      foundation: {
        featurePlanningArtifactPolicy: { isMissing: vi.fn() },
        phaseCheckpointProjectionRepository: { persist: vi.fn() },
        phaseCompletionAuthorizationApplication: {
          completeAfterReview: vi.fn(),
          completeFromTasks: vi.fn(),
        },
        phaseExecutionContractApplication: { get: vi.fn(), require: vi.fn() },
        phaseTaskExecutionApplication: {
          complete: vi.fn(),
          completeNextCodeReview: vi.fn(),
          recordFailure: vi.fn(),
        },
        recordImplementationPhaseProgress: vi.fn(),
      } as never,
      metadataStore: {} as CardMetadataStore,
      runCoordinator: { recordFeatureProgress: vi.fn() } as never,
      runWorker: vi.fn(),
      statusDocuments: { hasCheckedTaskLedger: vi.fn() } as never,
      targets: { findCurrentFeature: vi.fn() } as never,
    });

    expect(applications.phaseTemplateDispatchApplication).toBeInstanceOf(PhaseTemplateDispatchApplication);
    expect(applications.declaredVerificationTaskApplication).toBeInstanceOf(DeclaredVerificationTaskApplication);
    expect(applications.phaseExitLifecycleApplication).toBeInstanceOf(PhaseExitLifecycleApplication);
    expect(applications.autonomousPhaseQueueApplication).toBeInstanceOf(AutonomousPhaseQueueApplication);
    expect(applications.phaseFailureRecordingApplication).toBeInstanceOf(PhaseFailureRecordingApplication);
    expect(applications.implementationCompletionApplication).toBeInstanceOf(ImplementationCompletionApplication);
  });
});
