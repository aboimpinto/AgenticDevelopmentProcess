import { describe, expect, it, vi } from "vitest";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { DirectImplementationSkillApplication } from "../src/workflows/implementation/direct-implementation-skill-application.js";

function harness(command: "start-implementing" | "continue-implementing" = "start-implementing") {
  const feature = { externalId: "ITEM-ANY", kind: "feature" } as any;
  const currentFeature = { ...feature, specMarkdown: "current" } as any;
  const agentAction = command === "start-implementing" ? "start-feature" : "continue-implementing";
  const input = {
    agentAction,
    cardKey: "feature:item",
    command,
    feature,
    project: { id: "project", rootPath: "/project" },
    runId: "run",
  } as any;
  const dependencies = {
    buildPrompt: vi.fn(() => "prompt"),
    resolveModel: vi.fn(() => handoffPlan("model", agentAction)),
    targets: { findCurrentFeature: vi.fn(async () => currentFeature) },
    worker: { execute: vi.fn(async () => "output") },
  };
  return { application: new DirectImplementationSkillApplication(dependencies), currentFeature, dependencies, input };
}

describe("direct implementation skill application", () => {
  it("runs the Start Feature skill with the current feature", async () => {
    const current = harness();
    await expect(current.application.execute(current.input, "repair gates")).resolves.toBe("output");
    expect(current.dependencies.worker.execute).toHaveBeenCalledWith(expect.objectContaining({
      agentRole: "start-feature",
      feature: current.currentFeature,
      agentAction: "start-feature",
      plan: handoffPlan("model", "start-feature"),
      phaseNumber: null,
      prompt: "prompt",
      step: "repair gates",
    }));
  });

  it("runs the Continue Implementation skill for continuation commands", async () => {
    const current = harness("continue-implementing");
    await current.application.execute(current.input, "repair gates");
    expect(current.dependencies.worker.execute).toHaveBeenCalledWith(
      expect.objectContaining({ agentAction: "continue-implementing", agentRole: "continue-implementation" }),
    );
  });

  it("propagates worker failure without inventing completion", async () => {
    const current = harness();
    current.dependencies.worker.execute.mockRejectedValueOnce(new Error("skill failed"));
    await expect(current.application.execute(current.input, "repair gates")).rejects.toThrow("skill failed");
  });
});
