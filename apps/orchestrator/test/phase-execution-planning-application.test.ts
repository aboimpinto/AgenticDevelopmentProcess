import { describe, expect, it, vi } from "vitest";
import { PhaseExecutionPlanningApplication } from "../src/workflows/phases/phase-execution-planning-application.js";
import { planPhaseWorkerDispatch } from "../src/workflows/phases/phase-worker-dispatch-planner.js";

const feature = { externalId: "arbitrary-work", folderPath: "/project/feature" } as never;
const phase = {
  documentPath: "/project/feature/Phases/phase-64-arbitrary.md",
  number: 64,
  recommendedAgent: "Specialist",
  status: "IN_PROGRESS",
  title: "Arbitrary work",
} as never;
const project = { id: "project", rootPath: "/project" } as never;
const contract = { number: 64, role: "implementation", tasks: [{ id: "task-a", kind: "implementation" }] } as never;
const nextTask = { id: "task-a", kind: "implementation" } as never;

function target(options: { repeat?: boolean; resolvingFindings?: boolean; ordered?: boolean } = {}) {
  const prepareReviewRequirement = vi.fn(async () => ({
    feature,
    kind: options.repeat ? "repeat_phase" as const : "continue" as const,
    phase,
    plan: {
      orderedReviewRequired: true,
      orderedTasksComplete: false,
      reviewRequiredNow: true,
    },
    summaries: options.repeat ? ["review task skipped"] : [],
  }));
  const resolveReviewState = vi.fn(() => ({
    durableEvidence: undefined,
    failureContext: null,
    latestReport: null,
    plan: { resolvingReviewFindings: options.resolvingFindings ?? false },
  }));
  const application = new PhaseExecutionPlanningApplication({
    getChangedFiles: () => ["src/arbitrary.ts"],
    getContract: () => contract,
    getNextTask: () => nextTask,
    isCodePhase: () => true,
    isOrderedTaskWorkflow: () => options.ordered ?? true,
    planWorker: planPhaseWorkerDispatch,
    prepareReviewRequirement: prepareReviewRequirement as never,
    resolveReviewState: resolveReviewState as never,
    selectDeveloperAgent: () => "Fallback Agent",
  });
  return { application, prepareReviewRequirement, resolveReviewState };
}

const input = {
  cardKey: "feature:arbitrary-work",
  databasePath: "/project/.hepha/hepha.sqlite",
  feature,
  implementationModel: "implementation-model",
  missingQualityGates: ["unit-tests"],
  phase,
  planningModel: "planning-model",
  previousFailureBrief: null,
  project,
  resolveFindingsModel: "fixer-model",
  runId: "run",
};

describe("PhaseExecutionPlanningApplication", () => {
  it("projects changed files and the next declared task into durable review planning", async () => {
    const fixture = target();
    const result = await fixture.application.prepare(input);

    expect(result).toMatchObject({
      codePhase: true,
      kind: "execute",
      nextOrderedTask: nextTask,
      observedChangedFiles: ["src/arbitrary.ts"],
      worker: { agent: "Specialist", model: "implementation-model" },
    });
    expect(fixture.prepareReviewRequirement).toHaveBeenCalledWith(expect.objectContaining({
      nextOrderedTask: nextTask,
      observedChangedFiles: ["src/arbitrary.ts"],
      phaseRef: "Phase 64",
    }));
  });

  it("does not project an ordered task for a non-ordered contract", async () => {
    const fixture = target({ ordered: false });
    const result = await fixture.application.prepare(input);

    expect(result).toMatchObject({ kind: "execute", nextOrderedTask: null });
  });

  it("routes review findings to the fixer model", async () => {
    const fixture = target({ resolvingFindings: true });
    const result = await fixture.application.prepare(input);

    expect(result).toMatchObject({
      kind: "execute",
      worker: { model: "fixer-model", step: "Resolve Code Review Findings Phase 64" },
    });
  });

  it("returns immediately when a conditional review task was durably skipped", async () => {
    const fixture = target({ repeat: true });
    const result = await fixture.application.prepare(input);

    expect(result).toEqual({
      feature,
      kind: "repeat_phase",
      phase,
      summaries: ["review task skipped"],
    });
    expect(fixture.resolveReviewState).not.toHaveBeenCalled();
  });
});
