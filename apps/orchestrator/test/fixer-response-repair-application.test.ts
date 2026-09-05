import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { FixerResponseRepairApplication } from "../src/workflows/reviews/fixer-response-repair-application.js";

function fixture() {
  const phase = { documentPath: "/project/phase.md", number: 864, title: "Work" } as PhaseSummary & { number: number };
  const feature = { externalId: "WORK", folderPath: "/project/feature", phases: [phase] } as WorkItemCard;
  const project = { id: "project", name: "Project", rootPath: "/project" } as StoredProject;
  let report = "incomplete";
  const assess = vi.fn((value: string) => value === "complete"
    ? { missingResponses: [], readyForRerun: true }
    : { missingResponses: ["F1"], readyForRerun: false });
  const recordProgress = vi.fn(async () => undefined);
  const runWorker = vi.fn(async () => { report = "complete"; return "repair output"; });
  const markAwaitingRerun = vi.fn();
  const onRepairStarted = vi.fn();
  const application = new FixerResponseRepairApplication({
    assess,
    buildPrompt: (_project, _feature, input) => `repair ${input.missingResponseIds.join(",")}`,
    exists: () => true,
    markAwaitingRerun,
    maximumRepairAttempts: 5,
    plan: ({ maximumRepairAttempts, missingResponseIds, repairAttempts }) => repairAttempts >= maximumRepairAttempts
      ? { kind: "capped", missingResponseIds, repairAttempt: repairAttempts }
      : { kind: "repair", missingResponseIds, repairAttempt: repairAttempts + 1 },
    read: () => report,
    recordProgress,
    refreshFeature: async () => feature,
    resolvePhase: () => phase,
    runWorker,
    summarize: () => "repaired",
    yieldControl: async () => undefined,
  });
  const input = {
    cardKey: "feature:WORK", command: "continue-implementing" as const, feature, model: handoffPlan("model"),
    onRepairStarted, phase, phaseRef: "Phase 864", phaseTitle: phase.title, project,
    reportPath: "/project/report.md", runId: "run",
  };
  return { application, assess, input, markAwaitingRerun, onRepairStarted, recordProgress, runWorker };
}

describe("fixer response repair application", () => {
  it("repairs only missing entries, revalidates, and reopens independent review", async () => {
    const target = fixture();
    const result = await target.application.repair(target.input);
    expect(target.runWorker).toHaveBeenCalledWith(expect.objectContaining({ prompt: "repair F1" }));
    expect(target.onRepairStarted).toHaveBeenCalledWith(expect.objectContaining({ agent: "Fixer Response Repair Agent" }));
    expect(target.markAwaitingRerun).toHaveBeenCalled();
    expect(result.summaries).toEqual(["Phase 864: repaired"]);
    expect(target.recordProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: "checkpoint" }));
  });

  it("reopens review immediately when the report is already complete", async () => {
    const target = fixture();
    target.assess.mockReturnValueOnce({ missingResponses: [], readyForRerun: true });
    const result = await target.application.repair(target.input);
    expect(target.runWorker).not.toHaveBeenCalled();
    expect(target.markAwaitingRerun).toHaveBeenCalled();
    expect(result.summaries).toEqual([]);
  });

  it("records a blocked result when the bounded repair cap is exhausted", async () => {
    const target = fixture();
    const capped = new FixerResponseRepairApplication({
      assess: () => ({ missingResponses: ["F1"], readyForRerun: false }),
      buildPrompt: () => "repair", exists: () => true, markAwaitingRerun: target.markAwaitingRerun,
      maximumRepairAttempts: 0,
      plan: ({ missingResponseIds }) => ({ kind: "capped", missingResponseIds, repairAttempt: 0 }),
      read: () => "incomplete", recordProgress: target.recordProgress,
      refreshFeature: async () => target.input.feature, resolvePhase: () => target.input.phase,
      runWorker: target.runWorker, summarize: () => "", yieldControl: async () => undefined,
    });
    await expect(capped.repair(target.input)).rejects.toThrow("repair cap reached");
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "blocked" }));
    expect(target.runWorker).not.toHaveBeenCalled();
  });

  it("fails closed if repair removes the authoritative report", async () => {
    const target = fixture();
    const missing = new FixerResponseRepairApplication({
      assess: () => ({ missingResponses: ["F1"], readyForRerun: false }),
      buildPrompt: () => "repair", exists: () => false, markAwaitingRerun: target.markAwaitingRerun,
      maximumRepairAttempts: 5,
      plan: ({ missingResponseIds }) => ({ kind: "repair", missingResponseIds, repairAttempt: 1 }),
      read: () => "incomplete", recordProgress: target.recordProgress,
      refreshFeature: async () => target.input.feature, resolvePhase: () => target.input.phase,
      runWorker: target.runWorker, summarize: () => "", yieldControl: async () => undefined,
    });
    await expect(missing.repair(target.input)).rejects.toThrow("removed the latest review report");
    expect(target.markAwaitingRerun).not.toHaveBeenCalled();
  });
});
