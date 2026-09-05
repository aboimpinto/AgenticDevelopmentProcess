import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { RuntimeKnowledgeWorkerLifecycleApplication } from "../src/workflows/knowledge/runtime-knowledge-worker-lifecycle-application.js";

const featureContract = readFileSync(new URL("./feat-062-worker-execution.feature", import.meta.url), "utf8");
const context = {
  cardKey: "FEAT-any",
  feature: { externalId: "FEAT-any" },
  parentPlan: handoffPlan("parent-model"),
  project: { id: "project", memoryBankPath: "/project/MemoryBank", rootPath: "/project" },
  runId: "workflow-any",
  selectedLessonIds: ["lesson-b", "lesson-a", "lesson-a"],
} as never;

function target() {
  const runFeatureLessonsWriter = vi.fn(async () => "feature lessons");
  const runPhaseLessonsCapture = vi.fn(async () => "phase lessons");
  const runPostCompleteLessonsCurator = vi.fn(async () => "curated");
  return {
    application: new RuntimeKnowledgeWorkerLifecycleApplication({
      runFeatureLessonsWriter,
      runPhaseLessonsCapture,
      runPostCompleteLessonsCurator,
    }),
    runFeatureLessonsWriter,
    runPhaseLessonsCapture,
    runPostCompleteLessonsCurator,
  };
}

describe("runtime knowledge worker lifecycle", () => {
  it("binds the independent nested knowledge scenarios to the public lifecycle", () => {
    for (const tag of ["E011-NEST-002", "E011-NEST-003", "E011-NEST-004"]) {
      expect(featureContract).toContain(`@${tag}`);
    }
    expect(featureContract).toContain("Scenario: Post-complete curation waits for a successful completion receipt");
  });

  it("dispatches phase capture with exact lineage and no rule-promotion authority", async () => {
    const current = target();
    await expect(current.application.capturePhase({
      ...context,
      phaseExecutionContractId: "runtime-contract",
      phaseNumber: 4,
      phaseTitle: "Runtime",
    })).resolves.toBe("phase lessons");
    expect(current.runPhaseLessonsCapture).toHaveBeenCalledWith(expect.objectContaining({
      cardKey: "FEAT-any",
      phaseExecutionContractId: "runtime-contract",
      phaseNumber: 4,
      runId: "workflow-any",
      selectedLessonIds: ["lesson-a", "lesson-b"],
      prompt: expect.stringContaining("Do not promote project rules"),
    }));
  });

  it("dispatches the raw feature writer without Active-rule or export authority", async () => {
    const current = target();
    await expect(current.application.writeFeatureLessons(context)).resolves.toBe("feature lessons");
    expect(current.runFeatureLessonsWriter).toHaveBeenCalledWith(expect.objectContaining({
      runId: "workflow-any",
      selectedLessonIds: ["lesson-a", "lesson-b"],
      prompt: expect.stringMatching(/raw per-feature audit document[\s\S]*Do not mutate project Active rules/),
    }));
  });

  it("adapts a successful detached completion without losing its approved parent plan", async () => {
    const current = target();
    const { parentPlan, ...detachedContext } = context as any;

    await expect(current.application.curateDetachedCompletion({
      ...detachedContext,
      plan: parentPlan,
    })).resolves.toBeUndefined();

    expect(current.runPostCompleteLessonsCurator).toHaveBeenCalledWith(expect.objectContaining({
      plan: parentPlan,
      runId: "workflow-any",
      selectedLessonIds: ["lesson-a", "lesson-b"],
    }));
  });

  it("dispatches post-complete curation with project-only effects and immutable FEAT scope", async () => {
    const current = target();
    await expect(current.application.curatePostComplete(context)).resolves.toBe("curated");
    expect(current.runPostCompleteLessonsCurator).toHaveBeenCalledWith(expect.objectContaining({
      runId: "workflow-any",
      selectedLessonIds: ["lesson-a", "lesson-b"],
      prompt: expect.stringMatching(/project-level Active rules[\s\S]*FEAT is immutable[\s\S]*Do not create or export/),
    }));
  });
});
