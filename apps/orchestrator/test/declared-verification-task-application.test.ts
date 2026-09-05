import type { AdapterResult } from "../src/final-verification-adapter.js";
import type { AggregateVerificationStatus } from "../src/final-verification-types.js";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import type { PhaseTaskLedgerItem } from "../src/workflows/phases/phase-task-ledger.js";
import { DeclaredVerificationTaskApplication } from "../src/workflows/phases/declared-verification-task-application.js";

function result(status: AggregateVerificationStatus, summaryLine = status): AdapterResult {
  return {
    aggregate: { blockedReason: null, checks: [], duration: 1, failedRequiredChecks: status === "passed" ? [] : ["build"], persistenceWarning: null, startedAt: "now", status },
    persistenceWarning: null,
    summaryLine,
  };
}

function coverageAdvisory(limit = 2): AdapterResult {
  return {
    aggregate: {
      blockedReason: null,
      checks: [{
        advisoryRepairLimit: limit,
        checkId: "coverage",
        command: ["test", "--coverage"],
        description: "FEAT changed coverage",
        duration: 1,
        exitCode: 0,
        intent: "coverage",
        outcome: "advisory",
        outputSummary: "FEAT coverage 70%",
        required: true,
        startedAt: "now",
        workingDirectory: ".",
      }],
      duration: 1,
      failedRequiredChecks: [],
      persistenceWarning: null,
      startedAt: "now",
      status: "passed",
    },
    persistenceWarning: null,
    summaryLine: "all commands green; FEAT coverage remains advisory",
  };
}

function coverageUnavailable(): AdapterResult {
  return {
    aggregate: {
      blockedReason: null,
      checks: [{
        checkId: "coverage",
        command: ["test", "--coverage"],
        description: "FEAT changed coverage",
        duration: 1,
        exitCode: 2,
        intent: "coverage",
        outcome: "coverage-unavailable",
        outputSummary: "Test coverage was not measured. Reason: report unavailable.",
        required: true,
        startedAt: "now",
        workingDirectory: ".",
      }],
      duration: 1,
      failedRequiredChecks: [],
      persistenceWarning: null,
      startedAt: "now",
      status: "passed",
    },
    persistenceWarning: null,
    summaryLine: "all executable gates green; coverage remark recorded",
  };
}

function fixture() {
  const project = { id: "project", name: "Project", rootPath: "/work" } as StoredProject;
  const phase = { documentPath: "/work/phase.md", number: 12, status: "IN_PROGRESS", title: "Random checkpoint" } as PhaseSummary & { number: number };
  const feature = { externalId: "WORK", phases: [phase], title: "Work" } as WorkItemCard;
  const activeTask = { checked: false, id: "ledger-task", lineNumber: 5, section: "Tasks", taskIndex: 1, text: "Verify" } as PhaseTaskLedgerItem;
  const dependencies = {
    buildRepairPrompt: vi.fn(() => "repair evidence"),
    completeTask: vi.fn(async () => undefined),
    persistProjection: vi.fn(),
    recordProgress: vi.fn(async () => undefined),
    runRepairWorker: vi.fn(async () => "Verification Repair Result: REPAIRED"),
    runVerification: vi.fn(async () => result("passed", "all green")),
    yieldControl: vi.fn(async () => undefined),
  };
  const application = new DeclaredVerificationTaskApplication(dependencies);
  const input = { activeTask, cardKey: "card", command: "continue-implementing" as const, feature, implementationModel: "model", phase, phaseRole: "final_checkpoint", profile: "full" as const, project, reviewArtifactHash: "hash", runId: "run", taskId: "verify-all" };
  return { application, dependencies, input };
}

describe("declared verification task application", () => {
  it("persists a passing checkpoint and completes exactly the active task", async () => {
    const target = fixture();
    await expect(target.application.execute(target.input)).resolves.toBe("Phase 12: declared verification task 'verify-all' passed.");
    expect(target.dependencies.yieldControl).toHaveBeenCalledOnce();
    expect(target.dependencies.persistProjection).toHaveBeenCalledWith(target.input.phase, expect.objectContaining({ status: "passed" }), "hash");
    expect(target.dependencies.completeTask).toHaveBeenCalledWith(expect.objectContaining({ activeTask: target.input.activeTask, summary: "all green" }));
    expect(target.dependencies.runRepairWorker).not.toHaveBeenCalled();
  });

  it("repairs and reruns repeatedly without a fixed retry cap until the full profile passes", async () => {
    const target = fixture();
    target.dependencies.runVerification
      .mockResolvedValueOnce(result("failed"))
      .mockResolvedValueOnce(result("failed"))
      .mockResolvedValueOnce(result("blocked"))
      .mockResolvedValueOnce(result("passed"));
    await target.application.execute(target.input);
    expect(target.dependencies.runVerification).toHaveBeenCalledTimes(4);
    expect(target.dependencies.runRepairWorker).toHaveBeenCalledTimes(3);
    expect(target.dependencies.yieldControl).toHaveBeenCalledTimes(4);
    expect(target.dependencies.completeTask).toHaveBeenCalledOnce();
  });

  it("passes exact failed evidence to the repair prompt and worker", async () => {
    const target = fixture();
    target.dependencies.runVerification.mockResolvedValueOnce(result("failed")).mockResolvedValueOnce(result("passed"));
    await target.application.execute(target.input);
    expect(target.dependencies.buildRepairPrompt).toHaveBeenCalledWith(target.input.project, target.input.feature, target.input.phase, "verify-all", expect.objectContaining({ status: "failed" }));
    expect(target.dependencies.runRepairWorker).toHaveBeenCalledWith(expect.objectContaining({ agentRole: "verification-repair", prompt: "repair evidence", step: "Repair Phase 12 task verify-all" }));
  });

  it("stops only when the repair worker explicitly reports a genuine blocker", async () => {
    const target = fixture();
    target.dependencies.runVerification.mockResolvedValue(result("failed"));
    target.dependencies.runRepairWorker.mockResolvedValue("Verification Repair Result: BLOCKED\nCredentials required.");
    await expect(target.application.execute(target.input)).rejects.toThrow("reported a genuine blocker");
    expect(target.dependencies.completeTask).not.toHaveBeenCalled();
  });

  it("uses the configured FEAT coverage improvement attempts and then completes with an advisory", async () => {
    const target = fixture();
    target.dependencies.runVerification.mockResolvedValue(coverageAdvisory(2));
    await expect(target.application.execute(target.input)).resolves.toContain("completed with a non-blocking test-coverage advisory");
    expect(target.dependencies.runRepairWorker).toHaveBeenCalledTimes(2);
    expect(target.dependencies.runVerification).toHaveBeenCalledTimes(3);
    expect(target.dependencies.completeTask).toHaveBeenCalledWith(expect.objectContaining({
      summary: "all commands green; FEAT coverage remains advisory",
    }));
  });

  it("accepts a coverage advisory immediately when no further safe FEAT-scoped repair is available", async () => {
    const target = fixture();
    target.dependencies.runVerification.mockResolvedValue(coverageAdvisory(3));
    target.dependencies.runRepairWorker.mockResolvedValue("Verification Repair Result: ADVISORY_ACCEPTED\nNo valuable missing behavior tests remain.");
    await expect(target.application.execute(target.input)).resolves.toContain("completed with a non-blocking test-coverage advisory");
    expect(target.dependencies.runVerification).toHaveBeenCalledOnce();
    expect(target.dependencies.completeTask).toHaveBeenCalledOnce();
  });

  it("does not fail the phase when the optional coverage improvement worker errors", async () => {
    const target = fixture();
    target.dependencies.runVerification.mockResolvedValue(coverageAdvisory(3));
    target.dependencies.runRepairWorker.mockRejectedValue(new Error("worker unavailable"));
    await expect(target.application.execute(target.input)).resolves.toContain("completed with a non-blocking test-coverage advisory");
    expect(target.dependencies.completeTask).toHaveBeenCalledOnce();
  });

  it("records unavailable coverage without launching a repair worker or failing the phase", async () => {
    const target = fixture();
    target.dependencies.runVerification.mockResolvedValue(coverageUnavailable());
    await expect(target.application.execute(target.input)).resolves.toContain("passed");
    expect(target.dependencies.runVerification).toHaveBeenCalledOnce();
    expect(target.dependencies.runRepairWorker).not.toHaveBeenCalled();
    expect(target.dependencies.completeTask).toHaveBeenCalledWith(expect.objectContaining({
      summary: "all executable gates green; coverage remark recorded",
    }));
  });
});
