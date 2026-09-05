import { describe, expect, it, vi } from "vitest";
import { StartImplementationApplication } from "../src/application/features/start-implementation-application.js";

function harness(overrides: { ready?: boolean; seedError?: boolean; valid?: boolean } = {}) {
  const feature = { externalId: "ITEM-ANY", featureWorkflow: { hasRefinementArtifacts: true }, folderName: "capability", folderPath: "/feature", kind: "feature", stateFolder: "02_READY_TO_DEVELOP" } as any;
  const project = { id: "project", rootPath: "/project" } as any;
  const dependencies = {
    appendSnapshot: vi.fn(() => "snapshot"), classifyConflicts: vi.fn(() => ({ hasConflict: false })),
    classifyPrerequisites: vi.fn(() => ({ blockingReasons: [], readyToProceed: true })), clearCancellation: vi.fn(),
    createCardKey: vi.fn(() => "feature:item"), createId: vi.fn(() => "run"), deriveBranchName: vi.fn(() => "feat/item"),
    evaluateReadiness: vi.fn(() => ({ ready: overrides.ready ?? true, reasons: overrides.ready === false ? [{ blocking: true, code: "blocked", message: "Not ready" }] : [] })),
    execute: vi.fn(async () => undefined), findFailurePhase: vi.fn(() => null),
    metadataStore: { recordFeatureWorkflowRun: vi.fn(async () => undefined) }, notifyChanged: vi.fn(),
    readGit: vi.fn((_root, args) => args.includes("--abbrev-ref") ? "master\n" : "commit\n"),
    receiptPolicy: { createContext: vi.fn(() => ({ context: [], packRefs: [] })), validate: vi.fn(() => undefined) },
    resolveDeliveryPolicy: vi.fn(() => "direct_merge"), resolveImplementation: vi.fn(async () => ({ feature, project })),
    resolvePreviousFailure: vi.fn(() => null), scanProject: vi.fn(async () => [feature]),
    seedManualTestSkips: vi.fn(async () => {
      if (overrides.seedError) throw new Error("MANUAL_TEST_DEFERRAL_INVALID: orphaned task");
      return 0;
    }), toProjectSummary: vi.fn(() => ({ id: "project" })),
    validateRefinement: vi.fn(() => ({ valid: overrides.valid ?? true, errors: [{ code: "invalid", message: "Bad", path: "plan" }] })),
  };
  return { application: new StartImplementationApplication(dependencies as any), dependencies };
}

describe("Start Implementation application", () => {
  it("validates, authorizes, persists, and dispatches an autonomous start", async () => {
    const current = harness();
    await current.application.start({ cardId: "ITEM-ANY", projectId: "project" });
    expect(current.dependencies.receiptPolicy.validate).toHaveBeenCalledWith(expect.objectContaining({ nextState: "03_IN_PROGRESS" }));
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ status: "running", summary: "snapshot" }));
    expect(current.dependencies.seedManualTestSkips).toHaveBeenCalledWith(expect.objectContaining({ cardKey: "feature:item", runId: "workflow-run" }));
    expect(current.dependencies.execute).toHaveBeenCalledWith(expect.objectContaining({
      baseBranch: "master", branchName: "feat/item", startCommit: "commit", transitionOnly: false,
    }));
  });

  it("blocks invalid refinement before durable workflow state", async () => {
    const current = harness({ valid: false });
    await expect(current.application.start({ cardId: "ITEM-ANY", projectId: "project" })).rejects.toThrow("Refinement artifacts failed validation");
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).not.toHaveBeenCalled();
  });

  it("rejects invalid manual-test traceability before durable workflow state", async () => {
    const current = harness({ seedError: true });
    await expect(current.application.start({ cardId: "ITEM-ANY", projectId: "project" })).rejects.toThrow("orphaned task");
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).not.toHaveBeenCalled();
    expect(current.dependencies.execute).not.toHaveBeenCalled();
  });

  it("blocks failed readiness before receipt authorization", async () => {
    const current = harness({ ready: false });
    await expect(current.application.start({ cardId: "ITEM-ANY", projectId: "project" })).rejects.toThrow("[blocked] Not ready");
    expect(current.dependencies.receiptPolicy.validate).not.toHaveBeenCalled();
  });
});
