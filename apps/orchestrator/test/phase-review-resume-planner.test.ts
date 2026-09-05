import { describe, expect, it } from "vitest";
import {
  planPhaseReviewResume,
  createPhaseReviewResumePlanningInput,
} from "../src/workflows/phases/phase-review-resume-planner.js";

const baseline = {
  awaitingIndependentRerun: false,
  awaitingReview: false,
  failureContextPhaseNumber: null,
  latestReportResult: null,
  missingQualityGates: [] as string[],
  nextOrderedTaskKind: null,
  orderedTaskWorkflow: false,
  phaseNumber: 17,
  reviewRequired: true,
  workReadyForReview: true,
};

describe("phase review resume planner", () => {
  it("routes an ordered review task to the baseline reviewer", () => {
    const plan = planPhaseReviewResume({
      ...baseline,
      nextOrderedTaskKind: "code_review",
      orderedTaskWorkflow: true,
    });
    expect(plan.reviewResumeRoute).toBe("reviewer");
    expect(plan.phaseReadyForCodeReviewBaseline).toBe(true);
    expect(plan.phaseReadyForReviewGate).toBe(true);
  });

  it("routes legacy missing review-gate evidence to the baseline reviewer", () => {
    const plan = planPhaseReviewResume({ ...baseline, missingQualityGates: ["code_review"] });
    expect(plan.reviewResumeRoute).toBe("reviewer");
    expect(plan.phaseReadyForCodeReviewBaseline).toBe(true);
  });

  it("routes durable findings to the fixer only for a review-required phase", () => {
    const plan = planPhaseReviewResume({
      ...baseline,
      failureContextPhaseNumber: 17,
      latestReportResult: "NEEDS_CHANGES",
    });
    expect(plan.phaseHasReviewFindings).toBe(true);
    expect(plan.resolvingReviewFindings).toBe(true);
    expect(plan.reviewResumeRoute).toBe("fixer");

    const noReview = planPhaseReviewResume({ ...baseline, latestReportResult: "BLOCKED", reviewRequired: false });
    expect(noReview.phaseHasReviewFindings).toBe(false);
    expect(noReview.reviewResumeRoute).toBe("implementation");
  });

  it("routes the explicit rerun handoff back to an independent reviewer", () => {
    const plan = planPhaseReviewResume({ ...baseline, awaitingIndependentRerun: true });
    expect(plan.phaseReadyForCodeReviewRerun).toBe(true);
    expect(plan.reviewResumeRoute).toBe("reviewer");
  });

  it("routes a newer durable approval directly to phase exit", () => {
    const plan = planPhaseReviewResume({
      ...baseline,
      awaitingIndependentRerun: true,
      currentDurableArtifactKind: "review_manifest",
      currentDurableManifestResult: "APPROVED",
      currentDurableGateState: "APPROVED",
    });
    expect(plan.reviewResumeRoute).toBe("phase_exit");
    expect(plan.resumingAtPhaseExit).toBe(true);
    expect(plan.phaseHasTerminalReviewDecision).toBe(true);
  });

  it("keeps an approved but nonterminal review on the current fixer task", () => {
    const plan = planPhaseReviewResume({
      ...baseline,
      currentDurableArtifactKind: "review_manifest",
      currentDurableManifestResult: "APPROVED",
      currentDurableGateState: "PENDING",
    });
    expect(plan.reviewResumeRoute).toBe("fixer");
    expect(plan.resolvingReviewFindings).toBe(true);
    expect(plan.phaseHasTerminalReviewDecision).toBe(false);
    expect(plan.resumingAtPhaseExit).toBe(false);
  });

  it("routes a newer durable blocker to the terminal blocked path", () => {
    const plan = planPhaseReviewResume({
      ...baseline,
      currentDurableArtifactKind: "review_manifest",
      currentDurableManifestResult: "BLOCKED",
    });
    expect(plan.reviewResumeRoute).toBe("blocked");
    expect(plan.resumingBlockedReview).toBe(true);
    expect(plan.phaseHasTerminalReviewDecision).toBe(true);
  });

  it("does not manufacture review work before durable tasks are ready", () => {
    const plan = planPhaseReviewResume({
      ...baseline,
      awaitingIndependentRerun: true,
      latestReportResult: "NEEDS_CHANGES",
      workReadyForReview: false,
    });
    expect(plan.reviewResumeRoute).toBe("implementation");
    expect(plan.phaseReadyForCodeReviewRerun).toBe(false);
  });

  it("rejects the impossible state where baseline and rerun are both true for the same phase", () => {
    // The next ordered task is code-review (creating a baseline route),
    // AND unrelated session/prompt text is misread as a rerun marker.
    // A phase awaiting its first code review cannot also be awaiting a rerun.
    const plan = planPhaseReviewResume({
      ...baseline,
      awaitingIndependentRerun: true,
      nextOrderedTaskKind: "code_review",
      orderedTaskWorkflow: true,
    });
    expect(plan.phaseReadyForCodeReviewBaseline).toBe(true);
    expect(plan.phaseReadyForCodeReviewRerun).toBe(false);
  });
});

describe("createPhaseReviewResumePlanningInput", () => {
  it("clamps awaitingIndependentRerun to false when next ordered task is code_review and no prior review exists", () => {
    const input = {
      ...baseline,
      awaitingIndependentRerun: true,
      nextOrderedTaskKind: "code_review",
      orderedTaskWorkflow: true,
    };
    const result = createPhaseReviewResumePlanningInput(input);
    expect(result.awaitingIndependentRerun).toBe(false);
    expect(result.nextOrderedTaskKind).toBe("code_review");
  });

  it("preserves awaitingIndependentRerun when prior review evidence exists as failure context", () => {
    const input = {
      ...baseline,
      awaitingIndependentRerun: true,
      failureContextPhaseNumber: 17,
      nextOrderedTaskKind: "code_review",
      orderedTaskWorkflow: true,
    };
    const result = createPhaseReviewResumePlanningInput(input);
    expect(result.awaitingIndependentRerun).toBe(true);
  });

  it("preserves awaitingIndependentRerun when prior review evidence exists as report result", () => {
    const input = {
      ...baseline,
      awaitingIndependentRerun: true,
      latestReportResult: "NEEDS_CHANGES",
      nextOrderedTaskKind: "code_review",
      orderedTaskWorkflow: true,
    };
    const result = createPhaseReviewResumePlanningInput(input);
    expect(result.awaitingIndependentRerun).toBe(true);
  });

  it("preserves awaitingIndependentRerun when a durable artifact exists", () => {
    const input = {
      ...baseline,
      awaitingIndependentRerun: true,
      currentDurableArtifactKind: "remediation_response" as const,
      nextOrderedTaskKind: "code_review",
      orderedTaskWorkflow: true,
    };
    const result = createPhaseReviewResumePlanningInput(input);
    expect(result.awaitingIndependentRerun).toBe(true);
  });

  it("passes through normal input unchanged", () => {
    const input = { ...baseline };
    const result = createPhaseReviewResumePlanningInput(input);
    expect(result).toBe(input);
  });
});
