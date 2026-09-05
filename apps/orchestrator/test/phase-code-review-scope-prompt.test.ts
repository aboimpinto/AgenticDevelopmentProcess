import { describe, expect, it } from "vitest";
import {
  renderPhaseCodeReviewScopeRules,
  renderReviewerRemediationPlanRules,
} from "../src/workflows/prompts/phase-code-review-scope-prompt.js";

describe("phase code-review scope prompt", () => {
  it("omits remediation planning during a normal review", () => {
    expect(renderReviewerRemediationPlanRules(false)).toEqual([]);
  });

  it("requires one complete bounded plan after repeated stable findings", () => {
    const rules = renderReviewerRemediationPlanRules(true).join("\n");
    expect(rules).toContain("Reviewer Remediation Plan run, not a normal rerun");
    expect(rules).toContain("complete in-scope production surface");
    expect(rules).toContain("every required and forbidden condition");
    expect(rules).toContain("Retain the existing finding ID");
    expect(rules).toContain("Review Result: NEEDS_CHANGES");
  });

  it("limits findings to phase-owned production targets", () => {
    const rules = renderPhaseCodeReviewScopeRules().join("\n");
    expect(rules).toContain("not the FEAT analyst, planner, or future-architecture designer");
    expect(rules).toContain("explicit phase boundary as normative");
    expect(rules).toContain("concern owned by a later phase is not a code-review defect");
    expect(rules).toContain("Review only the Production Code Review Target files");
    expect(rules).toContain("Never create a finding against");
    expect(rules).toContain("prior-review suggestions cannot create a new requirement");
  });
});
