import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ImplementationAutoRecoveryApplication,
  isRecoveryPhaseDerivedCompleted,
} from "../src/workflows/recovery/implementation-auto-recovery-application.js";
import { handoffPlan } from "./support/handoff-plan-fixture.js";

function harness() {
  const feature = { externalId: "ITEM-ANY", kind: "feature", phases: [] } as any;
  const input = { autonomous: true, cardKey: "feature:item", command: "continue-implementing", feature,
    forcedRecoveryPhaseNumber: null, previousFailureBrief: null, project: { id: "project" }, recoveryAttempt: 0, runId: "run" } as any;
  const dependencies = {
    appendAnalysis: vi.fn(() => "analysis brief"), appendHostRecovery: vi.fn(() => "host brief"),
    createFailureBrief: vi.fn(() => "failure brief"), extractFailurePhase: vi.fn(() => null),
    findCurrentFeature: vi.fn(async (_input: unknown, fallback: unknown) => fallback),
    isCodeReviewFailure: vi.fn(() => false), isFatalFailure: vi.fn(() => false),
    isProviderPromptRefusalFailure: vi.fn(() => false), isRecoverableFailure: vi.fn(() => true),
    isReviewFindingResolutionFailure: vi.fn(() => false),
    parseRecoveryResult: vi.fn(() => "retry"),
    prepareRecovery: vi.fn(() => ({ canRetry: true, skipRecoveryAgent: false, summary: "prepared" })),
    recordFeatureProgress: vi.fn(async () => undefined), recordRecoveryProgress: vi.fn(async () => undefined),
    resolveRecoveryModel: vi.fn(() => handoffPlan("model")),
    retry: vi.fn(async () => ({ errorMessage: "original", failureBrief: null, output: "retried", recovered: true })),
    runRecoveryWorker: vi.fn(async () => ({ output: "Recovery Result: RETRY", revertedPaths: [] })),
    summarizeOutput: vi.fn((output: string) => output),
  };
  return { application: new ImplementationAutoRecoveryApplication(dependencies), dependencies, feature, input };
}

function createTempRoot(): string {
  return mkdtempSync(join(tmpdir(), "hepha-recovery-dispatch-"));
}

describe("implementation automatic recovery application", () => {
  it("refuses fatal failures before reading mutable workflow state", async () => {
    const current = harness(); current.dependencies.isFatalFailure.mockReturnValueOnce(true);
    await expect(current.application.attempt({ errorMessage: "fatal", feature: current.feature, input: current.input }))
      .resolves.toEqual({ errorMessage: "fatal", failureBrief: null, output: "", recovered: false });
    expect(current.dependencies.findCurrentFeature).not.toHaveBeenCalled();
  });

  it("leaves an awaiting-user-decision workflow blocked without autonomous retry", async () => {
    const current = harness();
    const errorMessage = "WORKFLOW_AWAITING_USER_DECISION: durable state did not change";
    await expect(current.application.attempt({ errorMessage, feature: current.feature, input: current.input }))
      .resolves.toEqual({ errorMessage, failureBrief: null, output: "", recovered: false });
    expect(current.dependencies.findCurrentFeature).not.toHaveBeenCalled();
    expect(current.dependencies.runRecoveryWorker).not.toHaveBeenCalled();
    expect(current.dependencies.retry).not.toHaveBeenCalled();
  });

  it("routes code-review findings directly to the bounded fixer retry", async () => {
    const current = harness(); current.dependencies.isCodeReviewFailure.mockReturnValueOnce(true);
    await current.application.attempt({ errorMessage: "review blocked", feature: current.feature, input: current.input });
    expect(current.dependencies.runRecoveryWorker).not.toHaveBeenCalled();
    expect(current.dependencies.retry).toHaveBeenCalledWith(expect.objectContaining({ outputPrefix: "Direct code-review finding resolution" }));
  });

  it("retries a provider prompt refusal once through a fresh worker session", async () => {
    const current = harness();
    const durableFeature = { ...current.feature, featureWorkflow: { lastRun: { currentStep: "Resolve Code Review Findings" } } } as any;
    current.dependencies.isProviderPromptRefusalFailure.mockReturnValueOnce(true);
    current.dependencies.findCurrentFeature.mockResolvedValue(durableFeature);
    await current.application.attempt({
      errorMessage: "Invalid prompt: your prompt was flagged as potentially violating our usage policy.",
      feature: current.feature,
      input: { ...current.input, command: "start-implementing" },
    });
    expect(current.dependencies.runRecoveryWorker).not.toHaveBeenCalled();
    expect(current.dependencies.retry).toHaveBeenCalledWith(expect.objectContaining({
      outputPrefix: "Retry provider-refused task in a fresh session",
      retryFeature: durableFeature,
      retryInput: expect.objectContaining({ command: "continue-implementing", feature: durableFeature, recoveryAttempt: 1 }),
    }));
  });

  it("stops after the fresh session is also refused", async () => {
    const current = harness();
    current.dependencies.isProviderPromptRefusalFailure.mockReturnValue(true);
    const result = await current.application.attempt({
      errorMessage: "Invalid prompt: your prompt was flagged as potentially violating our usage policy.",
      feature: current.feature, input: { ...current.input, recoveryAttempt: 1 },
    });
    expect(result.recovered).toBe(false);
    expect(current.dependencies.retry).not.toHaveBeenCalled();
  });

  it("does not rerun review after a terminated fixer", async () => {
    const current = harness(); current.dependencies.isReviewFindingResolutionFailure.mockReturnValueOnce(true);
    const result = await current.application.attempt({ errorMessage: "Pi exited with code 143", feature: current.feature, input: current.input });
    expect(result.recovered).toBe(false); expect(result.errorMessage).toContain("no code-review rerun was started");
    expect(current.dependencies.retry).not.toHaveBeenCalled();
  });

  it("performs host-side recovery without launching the recovery agent", async () => {
    const current = harness();
    current.dependencies.prepareRecovery.mockReturnValueOnce({ canRetry: true, skipRecoveryAgent: true, summary: "host repaired" });
    await current.application.attempt({ errorMessage: "host failure", feature: current.feature, input: current.input });
    expect(current.dependencies.runRecoveryWorker).not.toHaveBeenCalled();
    expect(current.dependencies.retry).toHaveBeenCalledWith(expect.objectContaining({ outputPrefix: "Host-side recovery: host repaired" }));
  });

  it("returns a host-side refusal with its durable brief", async () => {
    const current = harness();
    current.dependencies.prepareRecovery.mockReturnValueOnce({ canRetry: false, skipRecoveryAgent: true, summary: "cannot repair" });
    const result = await current.application.attempt({ errorMessage: "host failure", feature: current.feature, input: current.input });
    expect(result).toEqual({ errorMessage: "host failure\n\ncannot repair", failureBrief: "host brief", output: "", recovered: false });
  });

  it("rejects a recovery-agent denial when policy cannot independently retry", async () => {
    const current = harness();
    current.dependencies.prepareRecovery.mockReturnValueOnce({ canRetry: false, skipRecoveryAgent: false, summary: "analyze" });
    current.dependencies.parseRecoveryResult.mockReturnValueOnce("blocked");
    const result = await current.application.attempt({ errorMessage: "worker failure", feature: current.feature, input: current.input });
    expect(result.recovered).toBe(false); expect(result.failureBrief).toBe("analysis brief");
    expect(current.dependencies.retry).not.toHaveBeenCalled();
  });

  it("reports and preserves machine-state restoration before retry", async () => {
    const current = harness();
    current.dependencies.runRecoveryWorker.mockResolvedValueOnce({ output: "Recovery Result: RETRY", revertedPaths: ["Phases/state.md"] });
    await current.application.attempt({ errorMessage: "worker failure", feature: current.feature, input: current.input });
    const retry = current.dependencies.retry.mock.calls[0]?.[0];
    expect(retry.retryInput.previousFailureBrief).toContain("analysis brief");
    expect(current.dependencies.appendAnalysis).toHaveBeenCalledWith("failure brief", expect.stringContaining("Host Recovery Guard"));
  });

  it("does not let an unrelated completed phase suppress recovery", async () => {
    const root = createTempRoot();
    const phaseDir = join(root, "Phases");
    const reviewsDir = join(root, "code-reviews");
    mkdirSync(phaseDir, { recursive: true });
    mkdirSync(reviewsDir, { recursive: true });
    const documentPath = join(phaseDir, "phase-2-data-layer.md");
    writeFileSync(documentPath, [
      "# Phase 2 — Test", "", "**Status:** AWAITING_REVIEW", "",
      "## Phase Task Ledger", "",
      "- [x] Implement task", "- [x] Verify task",
      "- [x] Review task", "- [x] Exit verify task",
    ].join("\n"), "utf8");
    writeFileSync(join(reviewsDir, "phase-2-review.md"), [
      "# Review", "", "## Result: ✅ APPROVED",
    ].join("\n"), "utf8");

    const current = harness();
    current.dependencies.extractFailurePhase.mockReturnValue(null);
    current.feature.phases = [
      { number: 0, title: "Complete" } as any,
      { number: 1, title: "Complete" } as any,
      { number: 2, title: "Completed phase", documentPath, fileName: "phase-2-data-layer.md", status: "AWAITING_REVIEW" },
    ];

    await current.application.attempt({
      errorMessage: "worker failure without a durable phase identity",
      feature: current.feature, input: current.input,
    });

    expect(current.dependencies.runRecoveryWorker).toHaveBeenCalledOnce();
    expect(current.dependencies.retry).toHaveBeenCalledOnce();
  });
});

describe("isRecoveryPhaseDerivedCompleted", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) rmSync(root, { force: true, recursive: true });
  });

  function tempPhase(overrides?: { allTasksChecked?: boolean; hasApprovedReview?: boolean; hasReview?: boolean }): string {
    const root = mkdtempSync(join(tmpdir(), "hepha-recovery-derived-"));
    tempRoots.push(root);
    const docs = join(root, "Phases");
    const reviews = join(root, "code-reviews");
    mkdirSync(docs, { recursive: true });
    const tasks = (overrides?.allTasksChecked ?? true)
      ? ["- [x] Task one", "- [x] Task two"]
      : ["- [x] Task one", "- [ ] Task two"];
    writeFileSync(join(docs, "phase-7.md"), [
      "# Phase 7 — Test", "", "**Status:** AWAITING_REVIEW", "",
      "## Phase Task Ledger", "", ...tasks,
    ].join("\n"), "utf8");
    if (overrides?.hasReview ?? true) {
      mkdirSync(reviews, { recursive: true });
      writeFileSync(join(reviews, "review.md"), [
        "# Review",
        overrides?.hasApprovedReview ?? true
          ? "## Result: ✅ APPROVED"
          : "## Result: NEEDS_CHANGES — fix lines 42-58",
      ].join("\n"), "utf8");
    }
    return join(docs, "phase-7.md");
  }

  it("returns true when all tasks checked and review is APPROVED", () => {
    const path = tempPhase({ allTasksChecked: true, hasApprovedReview: true });
    expect(isRecoveryPhaseDerivedCompleted({ number: 7, documentPath: path } as any)).toBe(true);
  });

  it("returns true when all tasks checked and no review directory exists", () => {
    const path = tempPhase({ allTasksChecked: true, hasReview: false });
    expect(isRecoveryPhaseDerivedCompleted({ number: 7, documentPath: path } as any)).toBe(true);
  });

  it("returns false when not all tasks are checked", () => {
    const path = tempPhase({ allTasksChecked: false, hasApprovedReview: true });
    expect(isRecoveryPhaseDerivedCompleted({ number: 7, documentPath: path } as any)).toBe(false);
  });

  it("returns false when review exists but is NEEDS_CHANGES", () => {
    const path = tempPhase({ allTasksChecked: true, hasApprovedReview: false });
    expect(isRecoveryPhaseDerivedCompleted({ number: 7, documentPath: path } as any)).toBe(false);
  });

  it("returns false when phase has no document path", () => {
    expect(isRecoveryPhaseDerivedCompleted(undefined)).toBe(false);
    expect(isRecoveryPhaseDerivedCompleted({ number: 7 } as any)).toBe(false);
  });

  it("returns false for a missing file", () => {
    expect(isRecoveryPhaseDerivedCompleted({ number: 7, documentPath: "/nonexistent/phase.md" } as any)).toBe(false);
  });
});
