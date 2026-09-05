import { describe, expect, it, vi } from "vitest";
import { PhasePostWorkerValidationApplication } from "../src/workflows/phases/phase-post-worker-validation-application.js";

const phase = { number: 731, status: "IN_PROGRESS", title: "Arbitrary work" } as never;
const feature = { externalId: "arbitrary-feature", folderPath: "/arbitrary/feature" } as never;
const project = { id: "arbitrary-project" } as never;

function createTarget(options: { planningError?: Error; recoveryComplete?: boolean } = {}) {
  const assertTemplate = vi.fn();
  const assertPlanningArtifact = vi.fn(() => {
    if (options.planningError) throw options.planningError;
  });
  const recordProgress = vi.fn(async () => undefined);
  return {
    application: new PhasePostWorkerValidationApplication({
      assertPlanningArtifact,
      assertTemplate,
      isRecoveryComplete: () => options.recoveryComplete ?? false,
      recordProgress,
    }),
    assertPlanningArtifact,
    assertTemplate,
    recordProgress,
  };
}

const input = {
  agent: "Arbitrary Agent",
  cardKey: "arbitrary-card",
  command: "continue_implementing" as const,
  feature,
  model: "arbitrary-model",
  phase,
  phaseRef: "Phase 731",
  planningArtifactRequired: false,
  project,
  runId: "arbitrary-run",
};

describe("PhasePostWorkerValidationApplication", () => {
  it("accepts valid ordinary worker output without requiring a planning artifact", async () => {
    const target = createTarget();

    await expect(target.application.validate(input)).resolves.toEqual({ kind: "continue" });
    expect(target.assertTemplate).toHaveBeenCalledWith("/arbitrary/feature", 731);
    expect(target.assertPlanningArtifact).not.toHaveBeenCalled();
    expect(target.recordProgress).not.toHaveBeenCalled();
  });

  it("records and rejects a missing artifact for any declared planning phase", async () => {
    const target = createTarget({ planningError: new Error("Artifact is missing.") });

    await expect(target.application.validate({ ...input, planningArtifactRequired: true }))
      .rejects.toThrow("Phase 731 worker returned without the required planning artifact. Artifact is missing.");
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      currentStep: "Phase 731 blocked: missing planning artifact",
      status: "blocked",
    }));
  });

  it("records an explicit recovery boundary and returns its terminal route", async () => {
    const target = createTarget({ recoveryComplete: true });

    await expect(target.application.validate(input)).resolves.toEqual({
      kind: "recovery_complete",
      summary: "Phase 731 recovery gate completed. Continue Implementing can resume normal phase work.",
    });
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });
});
