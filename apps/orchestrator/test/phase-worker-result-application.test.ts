import { describe, expect, it, vi } from "vitest";
import { PhaseWorkerResultApplication } from "../src/workflows/phases/phase-worker-result-application.js";

const phase = { number: 731, documentPath: "/arbitrary/phase.md" } as never;
const feature = { externalId: "arbitrary-feature" } as never;
const project = { id: "arbitrary-project" } as never;
const input = {
  activeTask: null,
  agent: "Arbitrary Agent",
  cardKey: "arbitrary-card",
  command: "continue_implementing" as const,
  failurePolicy: "repair_and_rerun",
  feature,
  model: "arbitrary-model",
  output: "Worker output",
  phase,
  phaseRef: "Phase 731",
  project,
  runId: "arbitrary-run",
  successorHandoff: null,
  testCoverage: { kind: "allowed" as const },
};

function createTarget() {
  const applyGateEvidence = vi.fn(() => ({ kind: "satisfied" as const }));
  const prepareRepair = vi.fn(async ({ repair }: { repair: { detail: string; trigger: string } }) => ({
    brief: `Repair ${repair.trigger}`,
    summary: repair.detail,
  }));
  const publishSuccessor = vi.fn(() => ({ kind: "published" as const, summary: "Successor published" }));
  return {
    application: new PhaseWorkerResultApplication({
      applyGateEvidence,
      prepareRepair: prepareRepair as never,
      publishSuccessor,
    }),
    applyGateEvidence,
    prepareRepair,
    publishSuccessor,
  };
}

describe("PhaseWorkerResultApplication", () => {
  it("repeats the phase immediately when test coverage was restored", async () => {
    const target = createTarget();

    await expect(target.application.process({
      ...input,
      testCoverage: { kind: "restored", message: "Coverage removed", violations: [] },
    })).resolves.toEqual({
      brief: "Repair test_coverage_restored",
      kind: "repeat_phase",
      summaries: ["Coverage removed"],
    });
    expect(target.applyGateEvidence).not.toHaveBeenCalled();
  });

  it("repeats the phase when declared gate evidence fails", async () => {
    const target = createTarget();
    target.applyGateEvidence.mockReturnValue({ kind: "repair_required", detail: "Build failed" });

    await expect(target.application.process(input)).resolves.toEqual({
      brief: "Repair quality_gate_failed",
      kind: "repeat_phase",
      summaries: ["Build failed"],
    });
  });

  it("repeats the phase when an authoritative successor handoff is invalid", async () => {
    const target = createTarget();
    target.publishSuccessor.mockReturnValue({ kind: "repair_required", detail: "Invalid binding" });

    await expect(target.application.process({ ...input, successorHandoff: { id: "handoff" } })).resolves.toEqual({
      brief: "Repair authoritative_handoff_invalid",
      kind: "repeat_phase",
      summaries: ["Invalid binding"],
    });
  });

  it("publishes a valid successor and continues to task settlement", async () => {
    const target = createTarget();

    await expect(target.application.process({ ...input, successorHandoff: { id: "handoff" } })).resolves.toEqual({
      kind: "continue",
      summaries: ["Successor published"],
    });
    expect(target.prepareRepair).not.toHaveBeenCalled();
  });
});
