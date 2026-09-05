import { describe, expect, it } from "vitest";

import {
  selectPersistedReviewTransition,
  selectReviewResumeRoute,
} from "../src/review-resume-route-policy.js";

const ready = {
  reviewRequired: true,
  workReadyForReview: true,
  latestReportHasFindings: true,
  awaitingBaselineReview: false,
  awaitingIndependentRerun: false,
} as const;

describe("durable reviewed-work resume routing", () => {
  it("dispatches the fixer for a new NEEDS_CHANGES review with no successor", () => {
    expect(selectReviewResumeRoute({
      ...ready,
      currentDurableArtifactKind: "review_manifest",
      currentDurableManifestResult: "NEEDS_CHANGES",
    })).toBe("fixer");
  });

  it("dispatches the independent reviewer after the fixer records the rerun handoff", () => {
    expect(selectReviewResumeRoute({
      ...ready,
      awaitingIndependentRerun: true,
    })).toBe("reviewer");
  });

  it("recovers the fixer when a response exists without its verification receipt", () => {
    expect(selectReviewResumeRoute({
      ...ready,
      currentDurableArtifactKind: "remediation_response",
    })).toBe("fixer");
  });

  it("dispatches the reviewer only after the verification receipt is durable", () => {
    expect(selectReviewResumeRoute({
      ...ready,
      currentDurableArtifactKind: "verification_receipt",
    })).toBe("reviewer");
  });

  it("allows a newer reviewer decision to open another bounded fixer cycle", () => {
    expect(selectReviewResumeRoute({
      ...ready,
      // This marker belongs to the fixer handoff that caused the review. It
      // can still be present when the newer reviewer decision is committed.
      awaitingIndependentRerun: true,
      currentDurableArtifactKind: "review_manifest",
      currentDurableManifestResult: "NEEDS_CHANGES",
    })).toBe("fixer");
  });

  it("stops when a newer BLOCKED manifest supersedes a stale rerun marker", () => {
    expect(selectReviewResumeRoute({
      ...ready,
      awaitingIndependentRerun: true,
      currentDurableArtifactKind: "review_manifest",
      currentDurableManifestResult: "BLOCKED",
    })).toBe("blocked");
  });

  it("routes a durable approval directly to phase exit after restart", () => {
    expect(selectReviewResumeRoute({
      ...ready,
      currentDurableArtifactKind: "review_manifest",
      currentDurableManifestResult: "APPROVED",
      currentDurableGateState: "APPROVED",
    })).toBe("phase_exit");
  });

  it("recovers the same review task when an approved manifest has nonterminal authority", () => {
    expect(selectReviewResumeRoute({
      ...ready,
      currentDurableArtifactKind: "review_manifest",
      currentDurableManifestResult: "APPROVED",
      currentDurableGateState: "PENDING",
    })).toBe("fixer");
  });

  it("uses one persisted-result transition table for initial and repeated reviews", () => {
    expect(selectPersistedReviewTransition("NEEDS_CHANGES", "REJECTED")).toBe("fixer");
    expect(selectPersistedReviewTransition("APPROVED", "APPROVED")).toBe("phase_exit");
    expect(selectPersistedReviewTransition("APPROVED", "PENDING")).toBe("fixer");
    expect(selectPersistedReviewTransition("APPROVED", "REJECTED")).toBe("blocked");
    expect(selectPersistedReviewTransition("APPROVED", "BLOCKED")).toBe("blocked");
    expect(selectPersistedReviewTransition("BLOCKED", "BLOCKED")).toBe("blocked");
  });

  it("does not infer replanning from repeated review cycles", () => {
    for (let cycle = 0; cycle < 5; cycle += 1) {
      expect(selectReviewResumeRoute({
        ...ready,
        awaitingIndependentRerun: cycle > 0,
        currentDurableArtifactKind: "review_manifest",
        currentDurableManifestResult: "NEEDS_CHANGES",
      })).toBe("fixer");
    }
  });

  it("does not manufacture review work before implementation is review-ready", () => {
    expect(selectReviewResumeRoute({
      ...ready,
      workReadyForReview: false,
      awaitingIndependentRerun: true,
      currentDurableArtifactKind: "verification_receipt",
    })).toBe("implementation");
  });
});
