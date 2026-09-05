import type { WorkItemCard } from "@hepha/shared";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { describe, expect, it, vi } from "vitest";
import { DesignFeatureExecutionApplication } from "../src/application/features/design-feature-execution-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

function harness(options: { artifactError?: Error; workerError?: Error } = {}) {
  const feature = { externalId: "ITEM-ANY", kind: "feature", title: "Capability" } as WorkItemCard;
  const refreshed = { ...feature, specMarkdown: "# Current" } as WorkItemCard;
  const project = { id: "project", name: "Project", rootPath: "/project" } as StoredProject;
  let targetReads = 0;
  const dependencies = {
    artifactPolicy: { assertComplete: vi.fn(() => { if (options.artifactError) throw options.artifactError; }) },
    buildPrompt: vi.fn(() => "design-feature project target"),
    failureBriefPresenter: { create: vi.fn(() => "durable failure brief") },
    metadataStore: {
      recordFeatureWorkflowCompletion: vi.fn(async () => undefined),
      recordFeatureWorkflowRun: vi.fn(async () => undefined),
    },
    notifyChanged: vi.fn(),
    requireModel: vi.fn(() => handoffPlan("required-model")),
    summarizeOutput: vi.fn(() => "bounded output"),
    targets: {
      findCurrentFeature: vi.fn(async () => {
        targetReads += 1;
        return targetReads === 1 ? feature : refreshed;
      }),
    },
    worker: {
      execute: vi.fn(async () => {
        if (options.workerError) throw options.workerError;
        return "worker output";
      }),
    },
    workflowCoordinator: {
      createFeatureRunner: vi.fn(() => ({
        runNode: async (_nodeId: string, _input: unknown, operation: (node: { agentAction: "design-feature"; kind: "prompt" }, rendered: { status: string; summary: string }) => unknown) =>
          operation({ agentAction: "design-feature", kind: "prompt" }, { status: "running", summary: "step" }),
      })),
    },
  };
  return { application: new DesignFeatureExecutionApplication(dependencies), dependencies, feature, project };
}

describe("Design Feature execution application", () => {
  it("runs declared nodes, validates artifacts, and records terminal completion", async () => {
    const current = harness();
    await current.application.execute({ cardKey: "feature:item-any", feature: current.feature, project: current.project, runId: "run-any" });

    expect(current.dependencies.workflowCoordinator.createFeatureRunner).toHaveBeenCalledWith(expect.objectContaining({ command: "design-feature" }));
    expect(current.dependencies.requireModel).toHaveBeenCalledWith(undefined, "design-feature generate-design-artifacts node");
    expect(current.dependencies.worker.execute).toHaveBeenCalledWith(expect.objectContaining({ agentRole: "design-feature", plan: handoffPlan("required-model") }));
    expect(current.dependencies.artifactPolicy.assertComplete).toHaveBeenCalled();
    expect(current.dependencies.metadataStore.recordFeatureWorkflowCompletion).toHaveBeenCalledWith(expect.objectContaining({ summary: "bounded output" }));
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.completed", "ITEM-ANY");
  });

  it("contains worker failures as durable workflow failure state", async () => {
    const current = harness({ workerError: new Error("provider unavailable") });
    await expect(current.application.execute({ cardKey: "feature:item-any", feature: current.feature, project: current.project, runId: "run-any" })).resolves.toBeUndefined();

    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ error: "provider unavailable", status: "failed", summary: "durable failure brief" }));
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.failed", "ITEM-ANY");
  });

  it("treats incomplete generated artifacts as a recoverable workflow failure", async () => {
    const current = harness({ artifactError: new Error("design artifacts missing") });
    await current.application.execute({ cardKey: "feature:item-any", feature: current.feature, project: current.project, runId: "run-any" });
    expect(current.dependencies.metadataStore.recordFeatureWorkflowCompletion).not.toHaveBeenCalled();
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ error: "design artifacts missing" }));
  });
});
