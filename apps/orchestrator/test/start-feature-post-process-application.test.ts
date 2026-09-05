import { describe, expect, it, vi } from "vitest";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { StartFeaturePostProcessApplication } from "../src/workflows/implementation/start-feature-post-process-application.js";

function harness(timingError?: Error) {
  const feature = { externalId: "ITEM-ANY", kind: "feature" } as any;
  const updated = { ...feature, specMarkdown: "updated" } as any;
  const input = { cardKey: "feature:item", command: "start-implementing", feature, previousFailureBrief: null, project: { id: "project" }, runId: "run" } as any;
  let reads = 0;
  const dependencies = {
    assertTimingComplete: vi.fn(() => { if (timingError) throw timingError; }),
    buildContext: vi.fn(() => "context"), buildPrompt: vi.fn(() => "prompt"), notifyChanged: vi.fn(),
    scanProject: vi.fn(async () => [feature]),
    targets: { findCurrentFeature: vi.fn(async () => ++reads === 1 ? feature : updated) },
    worker: { execute: vi.fn(async () => "output") },
    workflowCoordinator: { recordFeatureProgress: vi.fn(async () => undefined) },
  };
  return { application: new StartFeaturePostProcessApplication(dependencies), dependencies, input, updated };
}

describe("Start Feature post-process application", () => {
  it("records routing work, executes the worker, and authorizes calibrated timing", async () => {
    const current = harness();
    await expect(current.application.execute(current.input, handoffPlan("model"))).resolves.toEqual(current.updated);
    expect(current.dependencies.worker.execute).toHaveBeenCalledWith(expect.objectContaining({ agentRole: "start-feature-postprocess", plan: handoffPlan("model"), prompt: "prompt" }));
    expect(current.dependencies.assertTimingComplete).toHaveBeenCalledWith(current.updated);
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.postprocess", "ITEM-ANY");
  });

  it("does not announce post-processing when timing evidence remains incomplete", async () => {
    const current = harness(new Error("timing incomplete"));
    await expect(current.application.execute(current.input, handoffPlan("model"))).rejects.toThrow("timing incomplete");
    expect(current.dependencies.notifyChanged).not.toHaveBeenCalled();
  });
});
