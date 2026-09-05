import { describe, expect, it } from "vitest";
import { renderPhaseCodeReviewFindingContractRules } from "../src/workflows/prompts/phase-code-review-finding-contract-prompt.js";

describe("phase code-review finding contract prompt", () => {
  it("makes every actionable finding a complete measurable contract", () => {
    const rules = renderPhaseCodeReviewFindingContractRules().join("\n");
    expect(rules).toContain("complete contract for the fixer, not a diagnosis");
    expect(rules).toContain("every required invariant");
    expect(rules).toContain("every forbidden case");
    expect(rules).toContain("exact negative regression cases");
    expect(rules).toContain("at least one valid positive control");
    expect(rules).toContain("Acceptance evidence required");
  });

  it("prevents serial discovery and reviewer-authored scope expansion", () => {
    const rules = renderPhaseCodeReviewFindingContractRules().join("\n");
    expect(rules).toContain("Do not split one field's contract across serial reviews");
    expect(rules).toContain("cannot be added to that finding on a rerun");
    expect(rules).toContain("only against the prior finding's recorded Acceptance Contract");
    expect(rules).toContain("Do not use a rerun to correct an incomplete reviewer analysis");
    expect(rules).toContain("BLOCKED_NEEDS_USER");
  });

  it("requires explicit compatibility and matrix decisions", () => {
    const rules = renderPhaseCodeReviewFindingContractRules().join("\n");
    expect(rules).toContain("compatibilityDecision");
    expect(rules).toContain("breaking_change_permitted");
    expect(rules).toContain("backward_compatibility_required");
    expect(rules).toContain("compatibilityApprovalSource");
    expect(rules).toContain("Acceptance Matrix");
    expect(rules).toContain("one row per value/case");
  });
});
