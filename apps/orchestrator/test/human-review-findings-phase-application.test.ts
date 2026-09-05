import { describe, expect, it, vi } from "vitest";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { HumanReviewFindingsPhaseApplication } from "../src/workflows/phases/human-review-findings-phase-application.js";

const phase = { number: 4, title: "Any findings", fileName: "phase-4-any.md" } as any;
const feature = { externalId: "ITEM" } as any;
const input = { branchName: "feat/item", cardKey: "card", command: "continue-implementing" as const, feature, plan: handoffPlan("model"), phase, project: {} as any, runId: "run" };

function target(overrides: Record<string, unknown> = {}) {
  const recordProgress = vi.fn();
  const runWorker = vi.fn().mockResolvedValue("READY");
  const refreshed = { ...feature, phases: [phase] } as any;
  return {
    application: new HumanReviewFindingsPhaseApplication({
      buildContext: () => "context", buildPrompt: () => "prompt", findHumanReviewPhase: () => phase,
      formatPhase: (item: any) => `Phase ${item.number}`, isAwaitingUser: () => true, isResolved: () => false,
      recordProgress, refreshFeature: async () => refreshed, runWorker, scanProject: async () => [],
      summarizeEvidence: () => ({ message: "ok", ok: true }), summarizeOutput: (output: string) => output,
      ...overrides,
    } as any),
    recordProgress,
    runWorker,
  };
}

describe("HumanReviewFindingsPhaseApplication", () => {
  it("records progress, launches the findings worker, refreshes, and returns validated evidence", async () => {
    const item = target();
    await expect(item.application.execute(input)).resolves.toBe("Human review findings phase: READY");
    expect(item.recordProgress).toHaveBeenCalledWith(expect.objectContaining({ summary: "Resolving human review findings." }));
    expect(item.runWorker).toHaveBeenCalledWith(expect.objectContaining({
      agentRole: "human-review-findings", plan: handoffPlan("model"), prompt: "prompt",
    }));
  });

  it("denies a worker result that leaves the phase outside either valid handoff state", async () => {
    const item = target({ isAwaitingUser: () => false, isResolved: () => false });
    await expect(item.application.execute(input)).rejects.toThrow(
      "did not move to AWAITING_USER_ACCEPTANCE or COMPLETED",
    );
  });

  it("denies incomplete durable finding evidence even in a valid status", async () => {
    const item = target({ summarizeEvidence: () => ({ message: "finding task remains", ok: false }) });
    await expect(item.application.execute(input)).rejects.toThrow("finding task remains");
  });

  it("allows a resolved phase without awaiting user acceptance", async () => {
    const item = target({ isAwaitingUser: () => false, isResolved: () => true });
    await expect(item.application.execute(input)).resolves.toContain("READY");
  });
});
