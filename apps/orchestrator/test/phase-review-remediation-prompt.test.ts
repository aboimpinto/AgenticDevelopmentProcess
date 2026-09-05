import { describe, expect, it } from "vitest";
import { renderPhaseReviewRemediationRules } from "../src/workflows/prompts/phase-review-remediation-prompt.js";

describe("phase review remediation prompt", () => {
  const rules = renderPhaseReviewRemediationRules(["SUCCESSOR CONTRACT"]);
  const prompt = rules.join("\n");

  it("inserts the authoritative successor contract before ordinary recovery rules", () => {
    expect(rules.indexOf("SUCCESSOR CONTRACT")).toBeGreaterThan(1);
    expect(rules.indexOf("SUCCESSOR CONTRACT")).toBeLessThan(
      rules.findIndex((rule) => rule.includes("Code-review recovery work can be documentation-only")),
    );
  });

  it("makes reviewer findings immutable and requires canonical fixer responses", () => {
    expect(prompt).toContain("reviewer-owned finding text is immutable");
    expect(prompt).toContain("exact top-level `## Fixer Response`");
    expect(prompt).toContain("FIX_PROPOSED");
    expect(prompt).toContain("REBUTTAL_PROPOSED");
    expect(prompt).toContain("ACCEPT_REFRAME");
    expect(prompt).toContain("Acceptance evidence");
  });

  it("keeps scope arbitration bounded and terminal", () => {
    expect(prompt).toContain("Scope guardrail");
    expect(prompt).toContain("one detailed `REFRAME_INTO_SCOPE`");
    expect(prompt).toContain("A `REJECT_REFRAME` ends the review change path");
    expect(prompt).toContain("Never use `OUTSIDE_OF_SCOPE` after a reframe");
  });

  it("requires complete proposals before an independent rerun", () => {
    expect(prompt).toContain("do not submit a review rerun");
    expect(prompt).toContain("solely the next independent reviewer's decision");
    expect(prompt).toContain("Review Finding Decision Ledger");
    expect(prompt).toContain("false-evidence or overclaim");
  });

  it("supports documentation-only recovery without unnecessary builds", () => {
    expect(prompt).toContain("documentation-only, MemoryBank-only, git-state-only, or whitespace-only");
    expect(prompt).toContain("do not run Cargo");
    expect(prompt).toContain("documentation/source-audit checks");
  });

  it("requires durable artifacts but never pushes from phase remediation", () => {
    expect(prompt).toContain("untracked, unstaged, uncommitted");
    expect(prompt).toContain("make a focused local commit");
    expect(prompt).toContain("Never push during this workflow");
  });
});
