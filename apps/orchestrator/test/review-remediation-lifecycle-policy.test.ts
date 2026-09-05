import { describe, expect, it } from "vitest";
import {
  isRemediationLifecycleDisposition,
  projectReviewRemediationLifecycle,
  renderReviewRemediationLifecyclePromptRules,
} from "../src/review-remediation-lifecycle-policy.js";

describe("generic review remediation lifecycle policy", () => {
  it("separates actionable findings from audit-only findings without phase-specific knowledge", () => {
    expect(projectReviewRemediationLifecycle([
      { findingId: "settled-note", disposition: "OBSERVATION" },
      { findingId: "open-defect", disposition: "IN_SCOPE_BLOCKER" },
      { findingId: "planned-expansion", disposition: "SCOPE_EXPANSION" },
      { findingId: "recorded-debt", disposition: "ARCHITECTURE_DEBT" },
    ])).toEqual({
      requiredFindingIds: ["open-defect", "planned-expansion"],
      auditOnlyFindingIds: ["settled-note", "recorded-debt"],
    });
  });

  it("uses the same lifecycle predicate for blockers and scope expansions", () => {
    expect(isRemediationLifecycleDisposition("IN_SCOPE_BLOCKER")).toBe(true);
    expect(isRemediationLifecycleDisposition("SCOPE_EXPANSION")).toBe(true);
    expect(isRemediationLifecycleDisposition("OBSERVATION")).toBe(false);
    expect(isRemediationLifecycleDisposition("ARCHITECTURE_DEBT")).toBe(false);
  });

  it("renders exact required and excluded IDs and forbids empty audit responses", () => {
    const rules = renderReviewRemediationLifecyclePromptRules({
      requiredFindingIds: ["open-defect"],
      auditOnlyFindingIds: ["settled-note"],
    }).join("\n");

    expect(rules).toContain('["open-defect"]');
    expect(rules).toContain('["settled-note"]');
    expect(rules).toContain("never emit an empty response entry");
  });
});
