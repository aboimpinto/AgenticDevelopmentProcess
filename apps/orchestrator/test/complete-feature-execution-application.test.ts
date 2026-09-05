import type { WorkItemCard } from "@hepha/shared";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { describe, expect, it, vi } from "vitest";
import { CompleteFeatureExecutionApplication } from "../src/application/features/complete-feature-execution-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

function harness(options: { finalizerError?: Error; ready?: boolean; receiptError?: Error } = {}) {
  const feature = { externalId: "ITEM-ANY", kind: "feature", title: "Capability" } as WorkItemCard;
  const refreshed = { ...feature, specMarkdown: "# Current" } as WorkItemCard;
  const project = { id: "project", name: "Project", rootPath: "/project" } as StoredProject;
  const dependencies = {
    buildPrompt: vi.fn(() => "complete feature prompt"),
    collectContext: vi.fn(() => "feature context"),
    createCardKey: vi.fn(() => "feature:item-any"),
    createId: vi.fn(() => "run-any"),
    failureBriefPresenter: { create: vi.fn(() => "durable failure brief") },
    finalizer: {
      launch: vi.fn(async () => {
        if (options.finalizerError) throw options.finalizerError;
      }),
    },
    metadataStore: { recordFeatureWorkflowRun: vi.fn(async () => undefined) },
    notifyChanged: vi.fn(),
    readiness: { canStart: vi.fn(() => options.ready ?? true) },
    receiptPolicy: {
      createContext: vi.fn(() => ({ context: [], packRefs: [] })),
      validate: vi.fn(() => options.receiptError),
    },
    requireModel: vi.fn(() => handoffPlan("required-model")),
    scanProject: vi.fn(async () => [refreshed]),
    targets: { findCurrentFeature: vi.fn(async () => refreshed) },
    workflowCoordinator: {
      createFeatureRunner: vi.fn(() => ({
        runNode: async (
          nodeId: string,
          _input: unknown,
          operation: (node: { model?: string }, rendered: { status: string }) => unknown,
        ) => operation({ model: nodeId === "finalize-feature" ? "declared-model" : undefined }, { status: "running" }),
      })),
    },
  };
  return {
    application: new CompleteFeatureExecutionApplication(dependencies),
    dependencies,
    feature,
    project,
  };
}

describe("Complete Feature execution application", () => {
  it("authorizes completion through the workflow transition receipt", () => {
    const current = harness();
    current.application.assertTransitionAllowed(current.project, current.feature);
    expect(current.dependencies.receiptPolicy.validate).toHaveBeenCalledWith(expect.objectContaining({
      command: "complete-feature",
      nextState: "04_COMPLETED",
      status: "complete",
    }));
  });

  it("rejects a completion transition denied by its receipt", () => {
    const current = harness({ receiptError: new Error("receipt denied") });
    expect(() => current.application.assertTransitionAllowed(current.project, current.feature)).toThrow("receipt denied");
  });

  it("does not start completion before readiness is satisfied", async () => {
    const current = harness({ ready: false });
    await expect(current.application.start(current.project, current.feature)).resolves.toBe(false);
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).not.toHaveBeenCalled();
  });

  it("records and schedules a ready completion workflow", async () => {
    const current = harness();
    const execute = vi.spyOn(current.application, "execute").mockResolvedValue();
    await expect(current.application.start(current.project, current.feature)).resolves.toBe(true);
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({
      command: "complete-feature",
      runId: "workflow-run-any",
      status: "running",
    }));
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ runId: "workflow-run-any" }));
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.started", "ITEM-ANY");
  });

  it("collects current context and launches detached finalization", async () => {
    const current = harness();
    await current.application.execute({
      cardKey: "feature:item-any",
      feature: current.feature,
      project: current.project,
      runId: "run-any",
    });
    expect(current.dependencies.collectContext).toHaveBeenCalledWith(
      current.project,
      expect.objectContaining({ specMarkdown: "# Current" }),
      [expect.objectContaining({ externalId: "ITEM-ANY" })],
    );
    expect(current.dependencies.requireModel).toHaveBeenCalledWith(
      undefined,
      "complete-feature finalize-feature node",
    );
    expect(current.dependencies.finalizer.launch).toHaveBeenCalledWith(expect.objectContaining({
      agentRole: "complete-feature",
      plan: handoffPlan("required-model"),
      prompt: "complete feature prompt",
    }));
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.detached", "ITEM-ANY");
  });

  it("contains finalization failures as durable workflow state", async () => {
    const current = harness({ finalizerError: new Error("provider unavailable") });
    await expect(current.application.execute({
      cardKey: "feature:item-any",
      feature: current.feature,
      project: current.project,
      runId: "run-any",
    })).resolves.toBeUndefined();
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({
      error: "provider unavailable",
      status: "failed",
      summary: "durable failure brief",
    }));
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.failed", "ITEM-ANY");
  });
});
