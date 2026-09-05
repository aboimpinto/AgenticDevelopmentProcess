import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseReviewExecutionApplication } from "../src/workflows/reviews/phase-review-execution-application.js";
import type { PhaseReviewInvocationPlan } from "../src/workflows/reviews/phase-review-invocation-planner.js";

function fixture(rerun = false) {
  const phase = {
    documentPath: "/project/feature/phase.md", fileName: "phase.md", number: 731,
    status: "AWAITING_REVIEW", title: "Any Name",
  } as PhaseSummary & { number: number };
  const feature = {
    externalId: "WORK", folderPath: "/project/feature", title: "Arbitrary Feature",
  } as WorkItemCard;
  const project = { id: "arbitrary-project", name: "Arbitrary Project", rootPath: "/project" } as StoredProject;
  const scope = { featureId: "arbitrary-feature", phaseNumber: 731, projectId: project.id, reviewGateId: "code-review" as const };
  const invocation = {
    artifactId: "artifact",
    databasePath: "/project/.hepha/hepha.sqlite",
    dispatchReviewer: true,
    rerun,
    scope,
  } as PhaseReviewInvocationPlan;
  const buildContext = vi.fn(async () => "SCOPED CONTEXT");
  const readLineage = vi.fn(() => ({ kind: "not_required" as const }));
  const recordProgress = vi.fn(async () => undefined);
  const renderFollowUp = vi.fn(() => "FOLLOW-UP");
  const runNestedWorker = vi.fn(async () => "REVIEW OUTPUT");
  const application = new PhaseReviewExecutionApplication({
    buildContext,
    canonicalFeatureId: () => scope.featureId,
    policies: {
      cargoTimeoutSafetyRule: "CARGO TIMEOUT",
      cargoValidationLadderRule: "CARGO LADDER",
      serializedBuildCommandsSkillRule: "SERIAL BUILD",
      sharedCodeQualityAssumptionsRule: "QUALITY",
      validationEvidenceAccountingRule: "EVIDENCE",
    },
    readLineage,
    recordProgress,
    renderFollowUp,
    runNestedWorker,
  });
  const input = {
    branchName: "feature/arbitrary",
    cardKey: "feature:WORK",
    command: "continue-implementing" as const,
    feature,
    invocation,
    model: handoffPlan("review-model"),
    phase,
    phaseRef: "Phase 731",
    phaseTitle: phase.title,
    previousFailureBrief: "PREVIOUS",
    project,
    runId: "run",
  };
  return { application, buildContext, input, readLineage, recordProgress, renderFollowUp, runNestedWorker, scope };
}

describe("phase review execution application", () => {
  it("dispatches a scoped baseline reviewer without predecessor lineage", async () => {
    const target = fixture();
    const result = await target.application.execute(target.input);
    expect(result).toEqual({ lineage: { kind: "not_required" }, reviewOutput: "REVIEW OUTPUT" });
    expect(target.readLineage).not.toHaveBeenCalled();
    expect(target.buildContext).toHaveBeenCalledWith(expect.objectContaining({ previousFailureBrief: "PREVIOUS" }));
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      status: "code_review",
      summary: "Code review started from the phase review gate.",
    }));
    expect(target.runNestedWorker).toHaveBeenCalledWith("code-review", expect.objectContaining({
      agentRole: "code-review",
      prompt: expect.stringContaining("SCOPED CONTEXT"),
    }));
  });

  it("binds a rerun prompt to the exact authoritative predecessor", async () => {
    const target = fixture(true);
    const predecessor = {
      artifactKind: "review_manifest" as const,
      artifactId: "previous",
      contentHash: "a".repeat(64),
      relativePath: "reviews/previous.json",
    };
    target.readLineage.mockReturnValue({ kind: "required", predecessor, findings: [] });
    const result = await target.application.execute(target.input);
    expect(result.lineage).toEqual({ kind: "required", predecessor, findings: [] });
    expect(target.readLineage).toHaveBeenCalledWith({
      databasePath: target.input.invocation.databasePath,
      expectedScope: target.scope,
      projectRoot: target.input.project.rootPath,
    });
    expect(target.runNestedWorker).toHaveBeenCalledWith("code-review", expect.objectContaining({
      prompt: expect.stringContaining('"artifactId":"previous"'),
    }));
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      summary: "Code review rerun started after review fixes were applied.",
    }));
  });

  it("fails closed before reviewer dispatch when rerun lineage is unavailable", async () => {
    const target = fixture(true);
    target.readLineage.mockReturnValue({ kind: "unavailable" });
    await expect(target.application.execute(target.input)).rejects.toThrow("REVIEW_CONTRACT_V1_RERUN_LINEAGE_UNAVAILABLE");
    expect(target.runNestedWorker).not.toHaveBeenCalled();
    expect(target.recordProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: "blocked" }));
  });
});
