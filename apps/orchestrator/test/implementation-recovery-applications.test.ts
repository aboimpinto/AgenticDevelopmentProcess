import { describe, expect, it, vi } from "vitest";
import { ImplementationAutoRecoveryApplication } from "../src/workflows/recovery/implementation-auto-recovery-application.js";
import { createImplementationRecoveryApplications } from "../src/bootstrap/implementation-recovery-applications.js";

describe("implementation recovery application composition", () => {
  it("returns the bounded autonomous recovery boundary", () => {
    const applications = createImplementationRecoveryApplications({
      codeReviewFailureContext: {} as never,
      consoleSummary: {} as never,
      createPiEnvironment: vi.fn(() => ({})),
      ensureCargoShimDirectory: vi.fn(() => null),
      failureBriefPresenter: { create: vi.fn() },
      lessons: {} as never,
      machineState: {} as never,
      modelRouter: {} as never,
      recordPhaseProgress: vi.fn(),
      runAutonomous: vi.fn(),
      runCoordinator: {} as never,
      targets: {} as never,
      worker: {} as never,
    });

    expect(applications.implementationAutoRecoveryApplication).toBeInstanceOf(ImplementationAutoRecoveryApplication);
  });
});
