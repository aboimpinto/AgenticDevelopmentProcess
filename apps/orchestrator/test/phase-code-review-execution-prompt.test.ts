import { describe, expect, it } from "vitest";
import {
  renderPhaseCodeReviewExecutionRules,
  renderPhaseCodeReviewResultRules,
} from "../src/workflows/prompts/phase-code-review-execution-prompt.js";

describe("phase code-review execution prompt", () => {
  it("preserves exact Cargo command boundaries and recovers reviewer syntax errors", () => {
    const rules = renderPhaseCodeReviewExecutionRules().join("\n");
    expect(rules).toContain("exact package/bin/filter and libtest separator");
    expect(rules).toContain("cargo test ... -- --test-threads=1");
    expect(rules).toContain("retry once with the corrected syntax");
    expect(rules).toContain("reviewer-tooling error");
    expect(rules).toContain("not turn a reviewer-owned shell typo into a project finding");
  });

  it("maps actionable severities to change-required results", () => {
    const rules = renderPhaseCodeReviewResultRules().join("\n");
    expect(rules).toContain("BLOCKER, REQUIRED, WITH_NOTES, NON_BLOCKING, POLISH, or OUT_OF_SCOPE");
    expect(rules).toContain("NEEDS_CHANGES only when at least one finding is BLOCKER or REQUIRED");
    expect(rules).toContain("APPROVED_WITH_NOTES");
  });

  it("keeps review production-only, resilient, and non-mutating", () => {
    const rules = renderPhaseCodeReviewResultRules().join("\n");
    expect(rules).toContain("do not review test code");
    expect(rules).toContain("optional diagnostic search may return no matches");
    expect(rules).toContain("Never end the review without one exact `Review Result:` line");
    expect(rules).toContain("Do not make code changes");
    expect(rules).toContain("Do not push to remotes");
  });
});
