import { describe, expect, it } from "vitest";
import { renderPhaseCodeReviewAdjudicationRules } from "../src/workflows/prompts/phase-code-review-adjudication-prompt.js";

describe("phase code-review adjudication prompt", () => {
  const rules = renderPhaseCodeReviewAdjudicationRules().join("\n");

  it("reserves exact final decisions for the reviewer", () => {
    expect(rules).toContain("Reviewer Decision");
    expect(rules).toContain("FIX_ACCEPTED");
    expect(rules).toContain("REBUTTAL_ACCEPTED_DEFERRED");
    expect(rules).toContain("REBUTTAL_REJECTED");
    expect(rules).toContain("FINDING_OPEN");
  });

  it("makes scope arbitration bounded and terminal", () => {
    expect(rules).toContain("OUTSIDE_OF_SCOPE");
    expect(rules).toContain("REFRAME_INTO_SCOPE");
    expect(rules).toContain("A reframe is permitted once only");
    expect(rules).toContain("REJECT_REFRAME");
    expect(rules).toContain("terminal developer scope decision");
  });

  it("protects settled finding identities from reuse or expansion", () => {
    expect(rules).toContain("finding ID is settled");
    expect(rules).toContain("Do not reuse it for a different defect");
    expect(rules).toContain("only the outstanding acceptance evidence");
    expect(rules).toContain("Do not create `NEW`, `SCOPE_EXPANSION`, or `OUT_OF_SCOPE`");
  });

  it("distinguishes repeated identity from remediation progress", () => {
    expect(rules).toContain("Progress since predecessor: REDUCED|UNCHANGED|REGRESSED|RESOLVED");
    expect(rules).toContain("Accepted this cycle");
    expect(rules).toContain("Still outstanding");
    expect(rules).toContain("only a stable identity label");
    expect(rules).toContain("bounded presentation reports");
    expect(rules).toContain("best-effort presentation text only");
    expect(rules).toContain("not a schema field, workflow state, gate input, acceptance prerequisite, or parser contract");
    expect(rules).toContain("must never invalidate or repair an otherwise valid manifest, fail a phase");
  });
});
