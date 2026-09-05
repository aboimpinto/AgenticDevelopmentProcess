import type { CardMetadataStore } from "@hepha/db";
import { describe, expect, it, vi } from "vitest";
import { createPhaseFoundationApplications } from "../src/bootstrap/phase-foundation-applications.js";
import { PhaseExecutionContractApplication } from "../src/workflows/phases/phase-execution-contract-application.js";
import { PhaseGateRecoveryApplication } from "../src/workflows/phases/phase-gate-recovery-application.js";
import { PhaseTaskCursorResolver } from "../src/workflows/phases/phase-task-cursor-resolver.js";

describe("phase foundation application composition", () => {
  it("returns the shared contract, cursor, recovery, and progress boundaries", () => {
    const applications = createPhaseFoundationApplications({
      assertRunActive: vi.fn(),
      metadataStore: {
        listImplementationTaskRuns: vi.fn().mockReturnValue([]),
        recordFeatureWorkflowRun: vi.fn(),
        recordImplementationPhaseRun: vi.fn(),
      } as unknown as CardMetadataStore,
      runCoordinator: { recordFeatureProgress: vi.fn() } as never,
      sessionEvidence: { find: vi.fn() } as never,
      statusDocuments: {
        hasCheckedTaskLedger: vi.fn(),
        isAwaitingReviewRerun: vi.fn(),
        markCompleted: vi.fn(),
      } as never,
      targets: { findCurrentFeature: vi.fn() } as never,
    });

    expect(applications.phaseExecutionContractApplication).toBeInstanceOf(PhaseExecutionContractApplication);
    expect(applications.phaseTaskCursorResolver).toBeInstanceOf(PhaseTaskCursorResolver);
    expect(applications.phaseGateRecoveryApplication).toBeInstanceOf(PhaseGateRecoveryApplication);
    expect(applications.recordImplementationPhaseProgress).toBeTypeOf("function");
  });
});
