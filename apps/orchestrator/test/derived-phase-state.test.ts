import { describe, expect, it } from "vitest";
import { derivePhaseState, type PhaseFacts } from "../src/workflows/phases/phase-lifecycle-policy.js";

function facts(overrides?: Partial<PhaseFacts>): PhaseFacts {
  return {
    allTasksCompleted: true,
    needCodeReview: false,
    codeReviewExists: false,
    codeReviewState: "N/A",
    isAutonomous: true,
    ...overrides,
  };
}

describe("derivePhaseState", () => {
  it("derives COMPLETED when all tasks done and no code review needed", () => {
    expect(derivePhaseState(facts({ needCodeReview: false }))).toBe("COMPLETED");
  });

  it("derives AWAITING_REVIEW when all tasks done, code review needed but not started", () => {
    expect(derivePhaseState(facts({
      needCodeReview: true,
      codeReviewExists: false,
      codeReviewState: "N/A",
    }))).toBe("AWAITING_REVIEW");
  });

  it("derives COMPLETED for autonomous workflow when code review is APPROVED", () => {
    expect(derivePhaseState(facts({
      needCodeReview: true,
      codeReviewExists: true,
      codeReviewState: "APPROVED",
      isAutonomous: true,
    }))).toBe("COMPLETED");
  });

  it("derives AWAITING_USER_ACCEPTANCE for non-autonomous workflow when code review is APPROVED", () => {
    expect(derivePhaseState(facts({
      needCodeReview: true,
      codeReviewExists: true,
      codeReviewState: "APPROVED",
      isAutonomous: false,
    }))).toBe("AWAITING_USER_ACCEPTANCE");
  });

  it("derives AWAITING_FIXES when code review requested changes", () => {
    expect(derivePhaseState(facts({
      needCodeReview: true,
      codeReviewExists: true,
      codeReviewState: "NEEDS_CHANGES",
    }))).toBe("AWAITING_FIXES");
  });

  it("derives IN_PROGRESS when not all tasks are complete", () => {
    expect(derivePhaseState(facts({ allTasksCompleted: false }))).toBe("IN_PROGRESS");
  });

  it("derives BLOCKED when code review is BLOCKED", () => {
    expect(derivePhaseState(facts({
      needCodeReview: true,
      codeReviewExists: true,
      codeReviewState: "BLOCKED",
    }))).toBe("BLOCKED");
  });

  it("derives AWAITING_REVIEW_RERUN when code review exists with N/A state", () => {
    expect(derivePhaseState(facts({
      needCodeReview: true,
      codeReviewExists: true,
      codeReviewState: "N/A",
    }))).toBe("AWAITING_REVIEW_RERUN");
  });

  it("never derives AWAITING_REVIEW when an approved review exists", () => {
    for (const isAutonomous of [true, false]) {
      expect(derivePhaseState(facts({
        needCodeReview: true,
        codeReviewExists: true,
        codeReviewState: "APPROVED",
        isAutonomous,
      }))).not.toBe("AWAITING_REVIEW");
    }
  });

  it("never derives COMPLETED when code review exists but needs changes", () => {
    expect(derivePhaseState(facts({
      needCodeReview: true,
      codeReviewExists: true,
      codeReviewState: "NEEDS_CHANGES",
    }))).toBe("AWAITING_FIXES");
  });
});
