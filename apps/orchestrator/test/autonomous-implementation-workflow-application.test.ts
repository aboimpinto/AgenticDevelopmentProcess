import { describe, expect, it, vi } from "vitest";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { AutonomousImplementationWorkflowApplication } from "../src/workflows/implementation/autonomous-implementation-workflow-application.js";

function harness() {
  const phase = { documentPath: "/memory/Phases/phase-8-any-name.md", number: 8, status: "Pending", title: "Any phase" } as any;
  const feature = { externalId: "ITEM-ANY", kind: "feature", phases: [phase] } as any;
  const input = {
    agentAction: "continue-implementing",
    autonomous: true,
    branchMessage: "ready",
    branchName: "feat/any",
    cardKey: "feature:any",
    command: "continue-implementing",
    feature,
    forcedRecoveryPhaseNumber: null,
    previousFailureBrief: null,
    project: { id: "project", memoryBankPath: "/memory", rootPath: "/project" },
    recoveryAttempt: 0,
    runId: "run",
  } as any;
  const dependencies = {
    assertBranches: vi.fn(),
    captureDurableProgress: vi.fn(() => "durable-fingerprint"),
    complete: { complete: vi.fn(async () => "completed") },
    configuredDatabasePath: vi.fn(() => undefined),
    databasePath: vi.fn(() => "/project/.hepha/hepha.sqlite"),
    directImplementation: { execute: vi.fn(async () => "legacy recovered") },
    entry: { prepare: vi.fn(async () => ({ feature, kind: "skip", phase, summaries: [], summary: "skipped" })) },
    exit: { execute: vi.fn() },
    failure: { record: vi.fn(async () => undefined) },
    findCurrentFeature: vi.fn(async () => feature),
    humanReview: { execute: vi.fn(async () => "human review") },
    isCancelled: vi.fn(() => false),
    knowledge: {
      capturePhase: vi.fn(async () => "phase lessons"),
      writeFeatureLessons: vi.fn(async () => "feature lessons"),
    },
    routeResolver: { resolvePlan: vi.fn((actionId: string) => {
      const models: Record<string, string> = {
        "code-review": "review-model",
        "continue-implementing": "workflow-model",
        "phase-worker": "implement-model",
        "resolve-review-findings": "fix-model",
      };
      return handoffPlan(models[actionId] ?? "plan-model", actionId as any);
    }) },
    normalizePhaseStatus: vi.fn((status: string) => status),
    planning: { prepare: vi.fn() },
    planningArtifactRequired: vi.fn(() => false),
    postWorkerReview: { prepare: vi.fn() },
    postWorkerValidation: { validate: vi.fn() },
    preReview: { route: vi.fn() },
    queue: { prepare: vi.fn(() => ({
      contract: null, forcedRecoveryPhaseNumber: null, kind: "execute_phases",
      phases: [phase], usesOrderedPhaseWorkflow: false,
    })) },
    review: { dispatch: vi.fn() },
    selectDeveloperAgent: vi.fn(() => "Developer"),
    settleTask: { settle: vi.fn() },
    workerEntry: { enter: vi.fn() },
    workerExecution: { execute: vi.fn() },
    workerResult: { process: vi.fn() },
    yieldControl: vi.fn(async () => undefined),
  };
  return {
    application: new AutonomousImplementationWorkflowApplication(dependencies as any),
    dependencies,
    feature,
    input,
    phase,
  };
}

describe("Autonomous implementation workflow application", () => {
  it("returns immediately when the generic queue is complete", async () => {
    const current = harness();
    current.dependencies.queue.prepare.mockReturnValueOnce({
      contract: null, forcedRecoveryPhaseNumber: null, kind: "complete", usesOrderedPhaseWorkflow: false,
    } as any);
    await expect(current.application.execute(current.input)).resolves.toBe(
      "All implementation phases are already completed or skipped.",
    );
    expect(current.dependencies.complete.complete).not.toHaveBeenCalled();
  });

  it("delegates a legacy quality-gate recovery without entering the phase loop", async () => {
    const current = harness();
    current.dependencies.queue.prepare.mockReturnValueOnce({
      contract: null, forcedRecoveryPhaseNumber: null, kind: "recover_legacy_gate",
      phaseNumber: 8, usesOrderedPhaseWorkflow: false,
    } as any);
    await expect(current.application.execute(current.input)).resolves.toBe("legacy recovered");
    expect(current.dependencies.directImplementation.execute).toHaveBeenCalledWith(
      current.input,
      "Resolving missing quality gates for Phase 8",
    );
  });

  it("delegates a human-review queue entry to its dedicated application", async () => {
    const current = harness();
    current.dependencies.queue.prepare.mockReturnValueOnce({
      contract: null, forcedRecoveryPhaseNumber: null, kind: "execute_human_review",
      phase: current.phase, usesOrderedPhaseWorkflow: false,
    } as any);
    await expect(current.application.execute(current.input)).resolves.toBe("human review");
    expect(current.dependencies.humanReview.execute).toHaveBeenCalledWith(expect.objectContaining({
      plan: handoffPlan("fix-model", "resolve-review-findings"), phase: current.phase,
    }));
  });

  it("skips resolved queue entries and invokes generic implementation completion", async () => {
    const current = harness();
    await expect(current.application.execute(current.input)).resolves.toBe("completed");
    expect(current.dependencies.yieldControl).toHaveBeenCalledWith("run");
    expect(current.dependencies.assertBranches).toHaveBeenCalledWith({
      branchName: "feat/any", memoryBankPath: "/memory", projectRoot: "/project",
    });
    expect(current.dependencies.complete.complete).toHaveBeenCalledWith(expect.objectContaining({
      summaries: ["skipped"], usesOrderedPhaseWorkflow: false,
    }));
  });

  it("routes reconciled phase completion through exit before compiling feature lessons", async () => {
    const current = harness();
    current.dependencies.entry.prepare.mockResolvedValueOnce({
      feature: current.feature, kind: "continue", missingQualityGates: [], phase: current.phase, summaries: [],
    } as any);
    current.dependencies.planning.prepare.mockResolvedValueOnce({
      codePhase: true,
      contract: { id: "phase-contract", failurePolicy: "repair_and_rerun", gitCheckpoint: "commit_and_push" },
      feature: current.feature,
      nextOrderedTask: null,
      observedChangedFiles: ["src/runtime.ts"],
      phase: current.phase,
      phaseRef: "Phase 8",
      phaseTitle: current.phase.title,
      reviewRequirement: { orderedReviewRequired: false, orderedTasksComplete: true, reviewRequiredNow: false },
      reviewState: {
        durableEvidence: null,
        failureContext: null,
        plan: {
          phaseHasReviewFindings: false,
          phaseHasTerminalReviewDecision: false,
          phaseReadyForCodeReviewBaseline: false,
          phaseReadyForCodeReviewRerun: false,
          phaseReadyForReviewGate: false,
          resolvingReviewFindings: false,
          resumingAtPhaseExit: false,
          resumingBlockedReview: false,
        },
      },
      summaries: [],
      worker: { agent: "Developer", failureStep: "implement", failureSummary: "failed", model: handoffPlan("implement-model"), step: "Implement" },
    } as any);
    current.dependencies.workerEntry.enter.mockResolvedValueOnce({ kind: "review_route", summary: "Worker already settled." } as any);
    current.dependencies.preReview.route.mockResolvedValueOnce({
      awaitsBaseline: false, awaitsRerun: false, feature: current.feature, kind: "advance_phase", phase: current.phase, summaries: [],
    } as any);
    current.dependencies.review.dispatch.mockResolvedValueOnce({ kind: "continue", summaries: [] } as any);
    current.dependencies.exit.execute.mockResolvedValueOnce({
      feature: current.feature, kind: "completed", phase: current.phase, summaries: ["Phase completed."],
    } as any);

    await expect(current.application.execute(current.input)).resolves.toBe("completed");

    expect(current.dependencies.exit.execute).toHaveBeenCalledWith(expect.objectContaining({
      contract: expect.objectContaining({ gitCheckpoint: "commit_and_push" }),
      phase: current.phase,
    }));
    expect(current.dependencies.knowledge.capturePhase).toHaveBeenCalledWith(expect.objectContaining({
      cardKey: current.input.cardKey,
      parentPlan: handoffPlan("implement-model", "phase-worker"),
      phaseExecutionContractId: "phase-contract",
      phaseNumber: 8,
    }));
    expect(current.dependencies.knowledge.writeFeatureLessons).toHaveBeenCalledWith(expect.objectContaining({
      cardKey: current.input.cardKey,
      feature: current.feature,
      parentPlan: handoffPlan("implement-model", "phase-worker"),
    }));
    expect(current.dependencies.complete.complete).toHaveBeenCalledWith(expect.objectContaining({
      summaries: expect.arrayContaining([
        "Phase 8: phase lessons captured by an independently routed worker.",
        "Raw feature lessons compiled by an independently routed worker.",
      ]),
    }));
  });

  it("fails a repeated host transition when durable phase evidence does not change", async () => {
    const current = harness();
    current.dependencies.entry.prepare.mockResolvedValue({
      feature: current.feature, kind: "continue", missingQualityGates: [], phase: current.phase, summaries: [],
    } as any);
    current.dependencies.planning.prepare.mockResolvedValue({
      codePhase: false,
      contract: { id: "phase-contract", failurePolicy: "repair_and_rerun", gitCheckpoint: "commit_and_push" },
      feature: current.feature,
      nextOrderedTask: null,
      observedChangedFiles: [],
      phase: current.phase,
      phaseRef: "Phase 8",
      phaseTitle: current.phase.title,
      reviewRequirement: { orderedReviewRequired: false, orderedTasksComplete: true, reviewRequiredNow: false },
      reviewState: {
        durableEvidence: null,
        failureContext: null,
        plan: {
          phaseHasReviewFindings: false,
          phaseHasTerminalReviewDecision: false,
          phaseReadyForCodeReviewBaseline: false,
          phaseReadyForCodeReviewRerun: false,
          phaseReadyForReviewGate: false,
          resolvingReviewFindings: false,
          resumingAtPhaseExit: false,
          resumingBlockedReview: false,
        },
      },
      summaries: [],
      worker: { agent: "Developer", failureStep: "implement", failureSummary: "failed", model: handoffPlan("implement-model"), step: "Implement" },
    } as any);
    current.dependencies.workerEntry.enter.mockResolvedValue({ kind: "review_route", summary: "Every task is settled." } as any);
    current.dependencies.preReview.route.mockResolvedValue({
      awaitsBaseline: false,
      awaitsRerun: false,
      feature: current.feature,
      kind: "repeat_phase",
      phase: current.phase,
      summaries: ["The same completed task was selected again."],
    } as any);

    await expect(current.application.execute(current.input)).rejects.toThrow(
      /WORKFLOW_AWAITING_USER_DECISION: Phase 8 returned to the pre_review transition/,
    );

    expect(current.dependencies.preReview.route).toHaveBeenCalledTimes(2);
    expect(current.dependencies.workerExecution.execute).not.toHaveBeenCalled();
    expect(current.dependencies.failure.record).toHaveBeenCalledWith(expect.objectContaining({
      activePhase: current.phase,
      error: expect.objectContaining({ message: expect.stringContaining("Durable fingerprint: durable-fingerprint") }),
    }));
  });

  it("records a non-cancellation phase failure and preserves the original error", async () => {
    const current = harness();
    const failure = new Error("entry failed");
    current.dependencies.entry.prepare.mockRejectedValueOnce(failure);
    await expect(current.application.execute(current.input)).rejects.toBe(failure);
    expect(current.dependencies.failure.record).toHaveBeenCalledWith(expect.objectContaining({
      activePhase: current.phase, error: failure, fallbackModel: "implement-model",
    }));
  });

  it("does not persist cancellation as a phase failure", async () => {
    const current = harness();
    const cancellation = new Error("cancelled");
    current.dependencies.entry.prepare.mockRejectedValueOnce(cancellation);
    current.dependencies.isCancelled.mockReturnValueOnce(true);
    await expect(current.application.execute(current.input)).rejects.toBe(cancellation);
    expect(current.dependencies.failure.record).not.toHaveBeenCalled();
  });
});
