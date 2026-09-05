import type { AdapterResult } from "../src/final-verification-adapter.js";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import type { PhaseTaskLedgerItem } from "../src/workflows/phases/phase-task-ledger.js";
import { DeclaredVerificationTaskApplication } from "../src/workflows/phases/declared-verification-task-application.js";

const featurePath = fileURLToPath(new URL("./generic-declared-verification-task.feature", import.meta.url));
const verification = (status: "failed" | "passed"): AdapterResult => ({ aggregate: { blockedReason: null, checks: [], duration: 1, failedRequiredChecks: status === "failed" ? ["test"] : [], persistenceWarning: null, startedAt: "now", status }, persistenceWarning: null, summaryLine: status });

describe("generic declared verification task Gherkin integration", () => {
  it("keeps one arbitrary task active through multiple repair cycles and completes it on green", async () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const project = { id: "project" } as StoredProject;
    const phase = { number: 73, title: "Unpredictable audit" } as PhaseSummary & { number: number };
    const feature = { externalId: "WORK", title: "Anything" } as WorkItemCard;
    const activeTask = { id: "stable-task" } as PhaseTaskLedgerItem;
    const completeTask = vi.fn(async () => undefined);
    const runRepairWorker = vi.fn(async () => "Verification Repair Result: REPAIRED");
    const runVerification = vi.fn()
      .mockResolvedValueOnce(verification("failed"))
      .mockResolvedValueOnce(verification("failed"))
      .mockResolvedValueOnce(verification("passed"));
    const application = new DeclaredVerificationTaskApplication({
      buildRepairPrompt: () => "exact failure evidence",
      completeTask,
      persistProjection: () => undefined,
      recordProgress: async () => undefined,
      runRepairWorker,
      runVerification,
      yieldControl: async () => undefined,
    });
    await application.execute({ activeTask, cardKey: "card", command: "continue-implementing", feature, implementationModel: "model", phase, phaseRole: "final_checkpoint", profile: "full", project, reviewArtifactHash: null, runId: "run", taskId: "full-check" });
    expect(runRepairWorker).toHaveBeenCalledTimes(2);
    expect(runVerification).toHaveBeenCalledTimes(3);
    expect(completeTask).toHaveBeenCalledOnce();
    expect(completeTask).toHaveBeenCalledWith(expect.objectContaining({ activeTask }));
  });
});
