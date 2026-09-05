import { describe, expect, it, vi } from "vitest";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { InteractiveImplementationHandoffApplication } from "../src/workflows/implementation/interactive-implementation-handoff-application.js";

function harness(command: "start-implementing" | "continue-implementing" = "start-implementing") {
  const feature = { externalId: "ITEM-ANY", kind: "feature" } as any;
  const currentFeature = { ...feature, specMarkdown: "current" } as any;
  const input = {
    branchMessage: "branch ready",
    cardKey: "feature:item",
    command,
    feature,
    previousFailureBrief: null,
    project: { id: "project", rootPath: "/project" },
    runId: "run",
  } as any;
  const dependencies = {
    buildContext: vi.fn(() => "context"),
    buildPrompt: vi.fn(() => "prompt"),
    resolveImplementationModel: vi.fn(() => handoffPlan("model")),
    scanProject: vi.fn(async () => [feature]),
    targets: { findCurrentFeature: vi.fn(async () => currentFeature) },
    worker: { execute: vi.fn(async () => "worker output") },
    workflowCoordinator: { recordFeatureProgress: vi.fn(async () => undefined) },
  };
  return { application: new InteractiveImplementationHandoffApplication(dependencies), dependencies, input, currentFeature };
}

describe("interactive implementation handoff application", () => {
  it("records and executes a start handoff with the current feature", async () => {
    const current = harness();
    await expect(current.application.execute(current.input)).resolves.toBe("worker output");
    expect(current.dependencies.workflowCoordinator.recordFeatureProgress).toHaveBeenCalledWith(
      expect.objectContaining({ currentStep: "Preparing implementation handoff", feature: current.currentFeature }),
    );
    expect(current.dependencies.worker.execute).toHaveBeenCalledWith(expect.objectContaining({
      agentRole: "implementation-handoff",
      feature: current.currentFeature,
      plan: handoffPlan("model"),
      prompt: "prompt",
      step: "Preparing implementation handoff",
    }));
  });

  it("uses continuation progress and prompt inputs for a continue handoff", async () => {
    const current = harness("continue-implementing");
    await current.application.execute(current.input);
    expect(current.dependencies.buildPrompt).toHaveBeenCalledWith(current.input, current.currentFeature, "context");
    expect(current.dependencies.worker.execute).toHaveBeenCalledWith(
      expect.objectContaining({ step: "Preparing implementation continuation" }),
    );
  });

  it("propagates worker failure after recording progress", async () => {
    const current = harness();
    current.dependencies.worker.execute.mockRejectedValueOnce(new Error("handoff failed"));
    await expect(current.application.execute(current.input)).rejects.toThrow("handoff failed");
    expect(current.dependencies.workflowCoordinator.recordFeatureProgress).toHaveBeenCalledOnce();
  });
});
