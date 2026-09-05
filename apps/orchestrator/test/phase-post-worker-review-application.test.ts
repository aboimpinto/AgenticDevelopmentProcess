import { describe, expect, it, vi } from "vitest";
import { PhasePostWorkerReviewApplication } from "../src/workflows/reviews/phase-post-worker-review-application.js";

const feature = { externalId: "arbitrary-feature" } as never;
const phase = { number: 731 } as never;
const project = { id: "arbitrary-project" } as never;
const input = {
  cardKey: "arbitrary-card",
  command: "continue_implementing" as const,
  contract: null,
  fallbackReportPath: null,
  feature,
  model: "arbitrary-model",
  onRepairStarted: vi.fn(),
  phase,
  phaseRef: "Phase 731",
  phaseTitle: "Arbitrary",
  project,
  resolvingReviewFindings: false,
  runId: "arbitrary-run",
};

function createTarget() {
  const findLatestReportPath = vi.fn((): string | null => null);
  const getNextTask = vi.fn(() => ({ id: "next-task" }));
  const planReviewRequirement = vi.fn(() => ({ reviewRequiredNow: true }));
  const repairFixerResponse = vi.fn(async () => ({
    feature: { externalId: "refreshed-feature" },
    phase: { number: 731, status: "AWAITING_REVIEW" },
    summaries: ["Responses repaired"],
  }));
  return {
    application: new PhasePostWorkerReviewApplication({
      exists: () => true,
      findLatestReportPath,
      getChangedFiles: () => ["src/arbitrary.ts"],
      getNextTask: getNextTask as never,
      isOrderedTaskWorkflow: (contract) => contract !== null,
      planReviewRequirement: planReviewRequirement as never,
      repairFixerResponse: repairFixerResponse as never,
    }),
    findLatestReportPath,
    getNextTask,
    planReviewRequirement,
    repairFixerResponse,
  };
}

describe("PhasePostWorkerReviewApplication", () => {
  it("recomputes review need without inventing fixer work", async () => {
    const target = createTarget();

    await expect(target.application.prepare(input)).resolves.toEqual({
      feature,
      phase,
      reviewRequired: true,
      summaries: [],
    });
    expect(target.repairFixerResponse).not.toHaveBeenCalled();
  });

  it("uses the next declared task when the contract is ordered", async () => {
    const target = createTarget();

    await target.application.prepare({ ...input, contract: {} as never });

    expect(target.getNextTask).toHaveBeenCalledWith(phase, {});
    expect(target.planReviewRequirement).toHaveBeenCalledWith(expect.objectContaining({
      nextOrderedTask: { id: "next-task" },
    }));
  });

  it("repairs the latest fixer response report before review rerun", async () => {
    const target = createTarget();
    target.findLatestReportPath.mockReturnValue("/arbitrary/latest-review.md");

    await expect(target.application.prepare({ ...input, resolvingReviewFindings: true })).resolves.toEqual({
      feature: { externalId: "refreshed-feature" },
      phase: { number: 731, status: "AWAITING_REVIEW" },
      reviewRequired: true,
      summaries: ["Responses repaired"],
    });
    expect(target.repairFixerResponse).toHaveBeenCalledWith(expect.objectContaining({
      reportPath: "/arbitrary/latest-review.md",
    }));
  });

  it("uses persisted failure context only when no latest report exists", async () => {
    const target = createTarget();

    await target.application.prepare({
      ...input,
      fallbackReportPath: "/arbitrary/fallback-review.md",
      resolvingReviewFindings: true,
    });

    expect(target.repairFixerResponse).toHaveBeenCalledWith(expect.objectContaining({
      reportPath: "/arbitrary/fallback-review.md",
    }));
  });
});
