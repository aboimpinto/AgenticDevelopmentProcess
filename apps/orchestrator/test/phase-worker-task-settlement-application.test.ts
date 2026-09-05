import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MANUAL_TEST_SKIP_REASON, readManualTestObligations } from "../src/manual-test-obligation.js";
import { PhaseWorkerTaskSettlementApplication } from "../src/workflows/phases/phase-worker-task-settlement-application.js";

const phase = { number: 731, status: "IN_PROGRESS", title: "Arbitrary work" } as never;
const refreshedPhase = { number: 731, status: "AWAITING_REVIEW", title: "Arbitrary work" } as never;
const feature = { externalId: "arbitrary-feature" } as never;
const refreshedFeature = { externalId: "arbitrary-feature", phases: [refreshedPhase] } as never;
const project = { id: "arbitrary-project" } as never;
const task = { id: "arbitrary-ledger-task" } as never;

function createTarget(transition: { kind: "complete_current_task" | "retry_current_task" | "blocked" } | null = null) {
  const completeTask = vi.fn(async () => undefined);
  const skipTask = vi.fn(async () => undefined);
  return {
    application: new PhaseWorkerTaskSettlementApplication({
      completeTask,
      refreshFeature: async () => refreshedFeature,
      resolvePhase: () => refreshedPhase,
      selectTransition: () => transition as never,
      skipTask,
      summarize: (output, fallback) => output.trim() || fallback,
      toOrderedTasks: () => [{ id: "arbitrary-contract-task", executor: "agent", required: true }],
    }),
    completeTask,
    skipTask,
  };
}

const input = {
  activeTask: task,
  cardKey: "arbitrary-card",
  command: "continue_implementing" as const,
  contract: null,
  feature,
  nextContractTask: null,
  observedProductionChange: false,
  output: "Worker summary.",
  phase,
  phaseRef: "Phase 731",
  project,
  resolvingReviewFindings: false,
  runId: "arbitrary-run",
};

describe("PhaseWorkerTaskSettlementApplication", () => {
  it("completes an ordinary task and returns refreshed durable state", async () => {
    const target = createTarget();

    await expect(target.application.settle(input)).resolves.toEqual({
      feature: refreshedFeature,
      phase: refreshedPhase,
      summary: "Phase 731: Worker summary.",
    });
    expect(target.completeTask).toHaveBeenCalledWith(expect.objectContaining({
      activeTask: task,
      summary: "Worker summary.",
    }));
  });

  it("settles a successful declared task through the same completion port", async () => {
    const target = createTarget({ kind: "complete_current_task" });

    await target.application.settle({
      ...input,
      contract: { tasks: [] } as never,
      nextContractTask: { id: "arbitrary-contract-task" } as never,
      observedProductionChange: true,
    });

    expect(target.completeTask).toHaveBeenCalledOnce();
  });

  it("settles a validated manual-test deferral as SKIPPED and persists its pack obligation", async () => {
    const target = createTarget();
    const folderPath = mkdtempSync(join(tmpdir(), "hepha-settlement-manual-"));
    const deferral = {
      schemaVersion: "hepha-manual-test-deferral/v1",
      id: "MT-PHYSICAL-001",
      title: "Physical qualification",
      reason: MANUAL_TEST_SKIP_REASON,
      phaseNumber: 731,
      taskId: "arbitrary-ledger-task",
      preconditions: ["Qualified target"],
      steps: ["Execute qualification"],
      expectedResult: "Qualification passes",
      evidenceRequirements: ["Secret-safe evidence"],
    };

    await target.application.settle({
      ...input,
      feature: { ...feature, folderPath } as never,
      output: `Worker explanation.\nHEPHA_MANUAL_TEST_DEFERRAL_V1 ${JSON.stringify(deferral)}`,
    });

    expect(target.completeTask).not.toHaveBeenCalled();
    expect(target.skipTask).toHaveBeenCalledWith(expect.objectContaining({
      activeTask: task,
      summary: expect.stringContaining("HEPHA_MANUAL_TEST_DEFERRAL_V1"),
    }));
    expect(readManualTestObligations(folderPath)?.obligations[0]?.id).toBe("MT-PHYSICAL-001");
  });

  it("does not let an explicit declared-task blocker become completion", async () => {
    const target = createTarget({ kind: "blocked" });

    await expect(target.application.settle({
      ...input,
      contract: { tasks: [] } as never,
      nextContractTask: { id: "arbitrary-contract-task" } as never,
    })).rejects.toThrow("Phase 731: the current declared task returned an explicit blocker.");
    expect(target.completeTask).not.toHaveBeenCalled();
  });

  it("keeps a fixer-success retry transition open for independent review", async () => {
    const target = createTarget({ kind: "retry_current_task" });

    await expect(target.application.settle({
      ...input,
      contract: { tasks: [] } as never,
      nextContractTask: { id: "arbitrary-contract-task" } as never,
      resolvingReviewFindings: true,
    })).resolves.toEqual(expect.objectContaining({ summary: "Phase 731: Worker summary." }));
    expect(target.completeTask).not.toHaveBeenCalled();
  });
});
