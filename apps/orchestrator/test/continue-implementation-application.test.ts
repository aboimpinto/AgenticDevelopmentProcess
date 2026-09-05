import { describe, expect, it, vi } from "vitest";
import { ContinueImplementationApplication } from "../src/application/features/continue-implementation-application.js";

function harness(options: {
  continuationArtifacts?: boolean;
  deepDive?: object;
  hasPhases?: boolean;
  ready?: boolean;
  refinementArtifacts?: boolean;
  stale?: boolean;
} = {}) {
  const feature = {
    externalId: "ITEM-ANY",
    featureWorkflow: {
      hasContinuationArtifacts: options.continuationArtifacts ?? true,
      hasRefinementArtifacts: options.refinementArtifacts ?? true,
    },
    folderName: "capability",
    kind: "feature",
    stateFolder: "03_IN_PROGRESS",
  } as any;
  const project = { id: "project", memoryBankPath: "/memory", rootPath: "/project" } as any;
  const dependencies = {
    allPhasesResolved: vi.fn(() => false), appendSnapshot: vi.fn(() => "snapshot"), assertBranches: vi.fn(),
    clearCancellation: vi.fn(), countGitCheckpoints: vi.fn(() => 0), countQualityGates: vi.fn(() => 1),
    createCardKey: vi.fn(() => "feature:item"), createId: vi.fn(() => "run"), deriveBranchName: vi.fn(() => "feat/item"),
    evaluateReadiness: vi.fn(() => ({ ready: options.ready ?? true, reasons: options.ready === false ? [{ blocking: true, code: "blocked", message: "Not ready" }] : [] })),
    execute: vi.fn(async () => undefined), findCurrentFeature: vi.fn(async () => feature), findFailurePhase: vi.fn(() => null),
    formatStaleness: vi.fn(() => "stale context"), hasHumanReviewPhase: vi.fn(() => false),
    hasNumberedPhases: vi.fn(() => options.hasPhases ?? true), hasUnresolvedHumanReview: vi.fn(() => false),
    metadataStore: { recordFeatureWorkflowRun: vi.fn(async () => undefined) }, notifyChanged: vi.fn(),
    readStaleness: vi.fn(() => options.stale ? [{}] : []),
    receiptPolicy: { createContext: vi.fn(() => ({ context: [], packRefs: [] })), validate: vi.fn(() => undefined) },
    recoverDeepDive: vi.fn(async () => options.deepDive), resolveImplementation: vi.fn(async () => ({ feature, project })),
    resolvePreviousFailure: vi.fn(() => null), scanProject: vi.fn(async () => [feature]), toProjectSummary: vi.fn(() => ({ id: "project" })),
  };
  return { application: new ContinueImplementationApplication(dependencies as any), dependencies };
}

describe("Continue Implementation application", () => {
  it("authorizes, persists, and dispatches a continuation", async () => {
    const current = harness();
    await current.application.continue({ cardId: "ITEM-ANY", projectId: "project" });
    expect(current.dependencies.assertBranches).toHaveBeenCalledWith(expect.anything(), "feat/item");
    expect(current.dependencies.receiptPolicy.validate).toHaveBeenCalledWith(expect.objectContaining({ nextState: "03_IN_PROGRESS" }));
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ currentStep: "Resolving missing phase quality gates", status: "running" }));
    expect(current.dependencies.execute).toHaveBeenCalledWith(expect.objectContaining({ command: "continue-implementing", recoveryAttempt: 0 }));
  });

  it("does not invoke source-hash Deep-Dive recovery for a marker-free continuation", async () => {
    const current = harness({ deepDive: { id: "session" } });
    const result = await current.application.continue({ cardId: "ITEM-ANY", projectId: "project" });
    expect(result.deepDiveRecoverySession).toBeUndefined();
    expect(current.dependencies.recoverDeepDive).not.toHaveBeenCalled();
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledOnce();
  });

  it("continues from the execution contract when a refinement-only satellite is invalid", async () => {
    const current = harness({ refinementArtifacts: false });
    await current.application.continue({ cardId: "ITEM-ANY", projectId: "project" });
    expect(current.dependencies.execute).toHaveBeenCalledOnce();
  });

  it("rejects continuation when the execution contract is invalid", async () => {
    const current = harness({ continuationArtifacts: false, refinementArtifacts: true });
    await expect(current.application.continue({ cardId: "ITEM-ANY", projectId: "project" }))
      .rejects.toThrow("valid execution contract");
    expect(current.dependencies.execute).not.toHaveBeenCalled();
  });

  it("requires a declared phase before continuation", async () => {
    const current = harness({ hasPhases: false });
    await expect(current.application.continue({ cardId: "ITEM-ANY", projectId: "project" })).rejects.toThrow("requires numbered phase files");
  });

  it("rejects stale context before durable workflow state", async () => {
    const current = harness({ stale: true });
    await expect(current.application.continue({ cardId: "ITEM-ANY", projectId: "project" })).rejects.toThrow("stale context");
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).not.toHaveBeenCalled();
  });
});
