import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseReviewLifecycleApplication } from "../src/workflows/reviews/phase-review-lifecycle-application.js";
import type { PhaseReviewInvocationPlan } from "../src/workflows/reviews/phase-review-invocation-planner.js";

function fixture() {
  const phase = {
    documentPath: "/project/feature/phase.md", fileName: "phase.md", number: 812,
    status: "AWAITING_REVIEW", title: "Arbitrary Work",
  } as PhaseSummary & { number: number };
  const feature = { externalId: "WORK", folderPath: "/project/feature", title: "Work" } as WorkItemCard;
  const project = { id: "project", name: "Project", rootPath: "/project" } as StoredProject;
  const invocation = {
    artifactId: "artifact", databasePath: "/project/.hepha/hepha.sqlite", dispatchReviewer: true,
    rerun: false,
    scope: { featureId: "work", phaseNumber: phase.number, projectId: project.id, reviewGateId: "code-review" },
  } as PhaseReviewInvocationPlan;
  const executeReview = vi.fn(async () => ({ lineage: { kind: "not_required" as const }, reviewOutput: "RAW" }));
  const repairReview = vi.fn(async () => ({
    review: { state: "V1_VALIDATED" as const, manifest: { result: "APPROVED" }, projection: {} },
    reviewOutput: "REPAIRED",
    summary: "contract repaired",
  }));
  const publishReview = vi.fn(async () => ({
    gateApproved: true,
    receipt: { contentHash: "hash", databasePath: invocation.databasePath, scope: invocation.scope },
    reportPath: "/project/report.md",
    reviewSummary: "approved",
    route: "phase_exit" as const,
    summaries: ["published"],
  }));
  const recordProgress = vi.fn(async () => undefined);
  const application = new PhaseReviewLifecycleApplication({ executeReview, publishReview, recordProgress, repairReview });
  const input = {
    branchName: "feature/work", cardKey: "feature:WORK", command: "continue-implementing" as const,
    feature, invocation, model: handoffPlan("review-model"), phase, phaseRef: "Phase 812", phaseTitle: phase.title,
    project, runId: "run",
  };
  return { application, executeReview, input, invocation, publishReview, recordProgress, repairReview };
}

describe("phase review lifecycle application", () => {
  it("executes, repairs, and publishes one authoritative review in order", async () => {
    const target = fixture();
    const result = await target.application.execute(target.input);
    expect(target.executeReview).toHaveBeenCalledWith(target.input);
    expect(target.repairReview).toHaveBeenCalledWith(expect.objectContaining({
      artifactId: target.invocation.artifactId,
      reviewOutput: "RAW",
    }));
    expect(target.publishReview).toHaveBeenCalledWith(expect.objectContaining({
      databasePath: target.invocation.databasePath,
      review: expect.objectContaining({ state: "V1_VALIDATED" }),
    }));
    expect(result).toEqual(expect.objectContaining({
      route: "phase_exit",
      summaries: ["contract repaired", "published"],
    }));
  });

  it("publishes directly when representation repair has no summary", async () => {
    const target = fixture();
    target.repairReview.mockResolvedValueOnce({
      review: { state: "V1_VALIDATED", manifest: { result: "APPROVED" }, projection: {} },
      reviewOutput: "RAW",
      summary: null,
    });
    const result = await target.application.execute(target.input);
    expect(result.summaries).toEqual(["published"]);
  });

  it("records a blocked result and refuses publication after exhausted contract repair", async () => {
    const target = fixture();
    target.repairReview.mockResolvedValueOnce({
      review: { state: "V1_REJECTED", rejection: { valid: false, code: "SCHEMA_INVALID", message: "invalid" } },
      reviewOutput: "INVALID",
      summary: "repair stopped",
    });
    await expect(target.application.execute(target.input)).rejects.toThrow(
      "REVIEW_CONTRACT_V1_VALIDATION_DENIED (SCHEMA_INVALID)",
    );
    expect(target.publishReview).not.toHaveBeenCalled();
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      status: "blocked",
      summary: expect.stringContaining("REVIEW_CONTRACT_V1_VALIDATION_DENIED"),
    }));
  });
});
