import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { AutonomousPhaseQueueApplication } from "../src/workflows/phases/autonomous-phase-queue-application.js";
import { selectPhaseExecutionQueue } from "../src/workflows/phases/phase-execution-queue-policy.js";

const phase = (number: number, status = "PENDING") => ({
  documentPath: `/project/Phases/phase-${number}-anything.md`,
  fileName: `phase-${number}-anything.md`,
  number,
  status,
  title: `Arbitrary phase ${number}`,
}) as PhaseSummary & { number: number };

function fixture(options: {
  humanReviewPhase?: PhaseSummary & { number: number };
  missingGatePhaseNumber?: number | null;
  phases?: Array<PhaseSummary & { number: number }>;
  usesOrderedTasks?: boolean;
} = {}) {
  const phases = options.phases ?? [phase(41)];
  const feature = {
    externalId: "arbitrary-work",
    folderPath: "/project/feature",
    phases,
  } as WorkItemCard;
  const project = {
    id: "project",
    memoryBankPath: "/project/MemoryBank",
    name: "Project",
    rootPath: "/project",
  } as never;
  const assertBranches = vi.fn();
  const application = new AutonomousPhaseQueueApplication({
    assertBranches,
    contractUsesOrderedTasks: () => options.usesOrderedTasks ?? false,
    extractFailurePhaseNumber: (brief) => Number(brief.match(/\d+/)?.[0]) || null,
    firstMissingQualityGatePhaseNumber: () => options.missingGatePhaseNumber ?? null,
    getContractPhase: () => null,
    getHumanReviewPhase: () => options.humanReviewPhase ?? null,
    getMissingQualityGates: (_feature, phaseNumber) =>
      phaseNumber === options.missingGatePhaseNumber ? ["declared-gate"] : [],
    getNumberedPhases: () => phases,
    isGitCheckpointSatisfied: () => true,
    isPlanningArtifactMissing: () => false,
    isResolved: (candidate) => candidate.status === "COMPLETED",
    loadContract: () => null,
    orderPhases: (_contract, _folder, candidates) => candidates,
    requiresGitCheckpoint: () => false,
    selectQueue: selectPhaseExecutionQueue,
  });
  return { application, assertBranches, feature, project };
}

describe("AutonomousPhaseQueueApplication", () => {
  it("selects unresolved phases after asserting the feature branch", () => {
    const target = fixture();
    const result = target.application.prepare({
      branchName: "feature/arbitrary-work",
      feature: target.feature,
      previousFailureBrief: null,
      project: target.project,
    });

    expect(result).toMatchObject({ kind: "execute_phases", phases: [{ number: 41 }] });
    expect(target.assertBranches).toHaveBeenCalledWith({
      branchName: "feature/arbitrary-work",
      memoryBankPath: "/project/MemoryBank",
      projectRoot: "/project",
    });
  });

  it("selects a forced recovery phase even when durable phase state is completed", () => {
    const target = fixture({ phases: [phase(73, "COMPLETED")] });
    const result = target.application.prepare({
      branchName: "feature/arbitrary-work",
      feature: target.feature,
      previousFailureBrief: "Previous failure in Phase 73",
      project: target.project,
    });

    expect(result).toMatchObject({
      forcedRecoveryPhaseNumber: 73,
      kind: "execute_phases",
      phases: [{ number: 73 }],
    });
  });

  it("reselects a completed phase with an unresolved legacy gate before human review", () => {
    const humanReviewPhase = phase(92);
    const target = fixture({
      humanReviewPhase,
      missingGatePhaseNumber: 18,
      phases: [phase(18, "COMPLETED")],
    });
    const result = target.application.prepare({
      branchName: "feature/arbitrary-work",
      feature: target.feature,
      previousFailureBrief: null,
      project: target.project,
    });

    expect(result).toMatchObject({ kind: "execute_phases", phases: [{ number: 18 }] });
  });

  it("routes a durable human-review phase after implementation phases settle", () => {
    const humanReviewPhase = phase(92);
    const target = fixture({ humanReviewPhase, phases: [phase(18, "COMPLETED")] });
    const result = target.application.prepare({
      branchName: "feature/arbitrary-work",
      feature: target.feature,
      previousFailureBrief: null,
      project: target.project,
    });

    expect(result).toMatchObject({ kind: "execute_human_review", phase: humanReviewPhase });
  });

  it("rejects refinement output that contains no executable or human-review phase", () => {
    const target = fixture({ phases: [] });

    expect(() => target.application.prepare({
      branchName: "feature/arbitrary-work",
      feature: target.feature,
      previousFailureBrief: null,
      project: target.project,
    })).toThrow("requires phase files from refine-feature");
  });
});
