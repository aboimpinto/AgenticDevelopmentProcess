import { describe, expect, it } from "vitest";

import { selectPersistedReviewTransition } from "../src/review-resume-route-policy.js";

describe("post-ingestion authoritative review routing", () => {
  it("routes every NEEDS_CHANGES review directly to the fixer", () => {
    expect(selectPersistedReviewTransition("NEEDS_CHANGES", "REJECTED")).toBe("fixer");
  });

  it("routes terminal authoritative approval to phase exit", () => {
    expect(selectPersistedReviewTransition("APPROVED", "APPROVED")).toBe("phase_exit");
  });

  it("routes a nonterminal approval back to evidence recovery", () => {
    expect(selectPersistedReviewTransition("APPROVED", "PENDING")).toBe("fixer");
  });

  it("stops an explicitly blocked review", () => {
    expect(selectPersistedReviewTransition("BLOCKED", "BLOCKED")).toBe("blocked");
  });
});
