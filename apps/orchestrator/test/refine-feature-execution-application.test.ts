import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { RefineFeatureExecutionApplication } from "../src/application/features/refine-feature-execution-application.js";
import { parseRefineFeatureWorkerResult } from "../src/application/features/refine-feature-worker-result.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const completedOutput = JSON.stringify({
  outcome: "COMPLETED",
  summary: "refined output",
  files: ["FeatureTasks.md", "planning-analysis-report.md", "PhaseExecutionContract.json", "ArchitectureDebtTouchPlan.json", "Phases/phase-0-any.md"],
});

function harness(options: { recoveryReady?: boolean; validationError?: boolean; workerError?: Error; workerOutput?: string; nonPromptNode?: boolean } = {}) {
  const feature = { externalId: "ITEM-ANY", folderPath: "/feature", kind: "feature", stateFolder: "01_SUBMITTED" } as WorkItemCard;
  const ready = { ...feature, stateFolder: "02_READY_TO_DEVELOP" } as WorkItemCard;
  const project = { id: "project", rootPath: "/project" } as StoredProject;
  const phaseContract = { schemaVersion: "hepha-phase-execution/v3" as const, phases: [] };
  let targetReads = 0;
  const dependencies = {
    buildPrompt: vi.fn(() => "refine-feature target"),
    confirmReadiness: vi.fn(async () => undefined),
    createDeepDiveHandoff: vi.fn(async () => undefined),
    createRecoveredSummary: vi.fn(() => "recovered refinement"),
    createTransitionContext: vi.fn(() => ({ context: [], packRefs: [] })),
    failureBriefPresenter: { create: vi.fn(() => "failure brief") },
    metadataStore: {
      recordFeatureWorkflowCompletion: vi.fn(async () => undefined),
      recordFeatureWorkflowRun: vi.fn(async () => undefined),
    },
    notifyChanged: vi.fn(),
    parseWorkerResult: parseRefineFeatureWorkerResult,
    phaseContract: { require: vi.fn(() => phaseContract) },
    requireFinalCheckpointCoverage: vi.fn(),
    requireModel: vi.fn(() => "required-model"),
    maxRuntimeMs: null,
    stallTimeoutMs: 42,
    summarizeOutput: vi.fn(() => "refined output"),
    targets: {
      findCurrentFeature: vi.fn(async () => {
        targetReads += 1;
        if (targetReads === 1) return feature;
        if (options.nonPromptNode) return feature;
        if (targetReads === 2 || options.recoveryReady) return ready;
        return feature;
      }),
    },
    validateArtifacts: vi.fn(() => options.validationError
      ? { errors: [{ code: "missing", message: "required", path: "artifact" }], valid: false }
      : { errors: [], valid: true }),
    validateTransitionReceipt: vi.fn(() => undefined),
    worker: { execute: vi.fn(async (args: { onPiEvent?: (event: unknown) => void }) => { args.onPiEvent?.({ type: "progress", detail: "step" }); if (options.workerError) throw options.workerError; return options.workerOutput ?? completedOutput; }) },
    workflowCoordinator: {
      createFeatureRunner: vi.fn(() => ({
        runNode: async (_nodeId: string, _input: unknown, operation: (node: { agentAction?: string; kind: string }, rendered: { status: string; summary: string }) => unknown) =>
          operation(
            options.nonPromptNode
              ? { agentAction: "refine-feature", kind: "skill" }
              : { agentAction: "refine-feature", kind: "prompt" },
            { status: "running", summary: "step" },
          ),
      })),
    },
  };
  return { application: new RefineFeatureExecutionApplication(dependencies), dependencies, feature, phaseContract, project, ready };
}

describe("Refine Feature execution application", () => {
  it("validates generated artifacts and readiness before terminal completion", async () => {
    const current = harness();
    await current.application.execute({ cardKey: "feature:item-any", feature: current.feature, project: current.project, runId: "run-any" });

    expect(current.dependencies.requireModel).toHaveBeenCalledWith(undefined, "refine-feature generate-artifacts node");
    expect(current.dependencies.worker.execute).toHaveBeenCalledWith(expect.objectContaining({
      maxRuntimeMs: null,
      onPiEvent: expect.any(Function),
      stallTimeoutMs: 42,
      timeoutLabel: "Refine Feature Pi run",
    }));
    expect(current.dependencies.validateArtifacts).toHaveBeenCalledWith("/feature", { featureId: "item-any", projectId: "project" });
    expect(current.dependencies.requireFinalCheckpointCoverage).toHaveBeenCalledWith("/project", current.phaseContract);
    expect(current.dependencies.confirmReadiness).toHaveBeenCalledWith(expect.objectContaining({ feature: current.ready, previousFeature: current.feature }));
    expect(current.dependencies.validateTransitionReceipt).toHaveBeenCalledWith(expect.objectContaining({ stage: "refine-feature-promote-ready" }));
    expect(current.dependencies.metadataStore.recordFeatureWorkflowCompletion).toHaveBeenCalledWith(expect.objectContaining({ summary: "refined output" }));
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.completed", "ITEM-ANY");
  });

  it("records invalid generated artifacts as a durable workflow failure", async () => {
    const current = harness({ validationError: true });
    await current.application.execute({ cardKey: "feature:item-any", feature: current.feature, project: current.project, runId: "run-any" });
    expect(current.dependencies.metadataStore.recordFeatureWorkflowCompletion).not.toHaveBeenCalled();
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("Refinement artifacts failed validation"), status: "failed" }));
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.failed", "ITEM-ANY");
  });

  it("routes unresolved decisions to a durable Deep-Dive without validating artifacts or failing", async () => {
    const current = harness({ workerOutput: JSON.stringify({
      outcome: "NEEDS_DEEP_DIVE",
      reason: "The credential boundary requires a user decision.",
      questions: [{
        topic: "Credential boundary",
        prompt: "Which component owns authenticated discovery?",
        recommendedOptionLabel: "Scoped discovery port",
        options: [
          { label: "Scoped discovery port", description: "Expose only a bounded authenticated scan operation." },
          { label: "Move discovery", description: "Move authenticated discovery to the credential owner." },
          { label: "Defer providers", description: "Exclude authenticated providers from the current scope." },
        ],
      }],
    }) });

    await current.application.execute({ cardKey: "feature:item-any", feature: current.feature, project: current.project, runId: "run-any" });

    expect(current.dependencies.createDeepDiveHandoff).toHaveBeenCalledWith(expect.objectContaining({
      cardKey: "feature:item-any",
      questions: [expect.objectContaining({ topic: "Credential boundary", chatMessages: [] })],
    }));
    expect(current.dependencies.validateArtifacts).not.toHaveBeenCalled();
    expect(current.dependencies.confirmReadiness).not.toHaveBeenCalled();
    expect(current.dependencies.metadataStore.recordFeatureWorkflowCompletion).not.toHaveBeenCalled();
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({
      currentNodeId: "evaluate-result",
      status: "blocked",
      summary: "The credential boundary requires a user decision.",
    }));
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.blocked", "ITEM-ANY");
  });

  it("recovers an invalid result envelope when current durable artifacts already authorize readiness", async () => {
    const current = harness({
      recoveryReady: true,
      workerOutput: JSON.stringify({
        outcome: "COMPLETED",
        summary: "valid work with invalid path projection",
        files: ["MemoryBank/Features/02_READY_TO_DEVELOP/work-any/FeatureTasks.md"],
      }),
    });
    await current.application.execute({ cardKey: "feature:item-any", feature: current.feature, project: current.project, runId: "run-any" });

    expect(current.dependencies.createRecoveredSummary).toHaveBeenCalledWith(expect.objectContaining({
      errorMessage: expect.stringContaining("REFINE_FEATURE_RESULT_V1_INVALID"),
      feature: current.ready,
    }));
    expect(current.dependencies.metadataStore.recordFeatureWorkflowCompletion).toHaveBeenCalledWith(expect.objectContaining({
      summary: "recovered refinement",
    }));
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun.mock.calls.some(([record]) => record.status === "failed")).toBe(false);
  });

  it("records a durable failure when the workflow node has no prompt kind", async () => {
    const current = harness({ nonPromptNode: true });
    await current.application.execute({ cardKey: "feature:item-any", feature: current.feature, project: current.project, runId: "run-any" });

    expect(current.dependencies.worker.execute).not.toHaveBeenCalled();
    expect(current.dependencies.metadataStore.recordFeatureWorkflowCompletion).not.toHaveBeenCalled();
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({
      error: "AGENT_ACTION_MISSING",
      status: "failed",
    }));
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.failed", "ITEM-ANY");
  });

  it("recovers a worker stop when current durable artifacts already authorize readiness", async () => {
    const current = harness({ recoveryReady: true, workerError: new Error("provider stopped") });
    await current.application.execute({ cardKey: "feature:item-any", feature: current.feature, project: current.project, runId: "run-any" });
    expect(current.dependencies.createRecoveredSummary).toHaveBeenCalledWith({ errorMessage: "provider stopped", feature: current.ready });
    expect(current.dependencies.validateTransitionReceipt).toHaveBeenCalledWith(expect.objectContaining({ stage: "refine-feature-recovery" }));
    expect(current.dependencies.metadataStore.recordFeatureWorkflowCompletion).toHaveBeenCalledWith(expect.objectContaining({ summary: "recovered refinement" }));
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({
      currentStep: "Analysing feature and dependency context",
      status: "running",
    }));
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun.mock.calls.some(([record]) => record.status === "failed")).toBe(false);
  });
});
