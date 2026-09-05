import { describe, expect, it } from "vitest";
import {
  renderPhaseGateEvidenceHandoffRule,
  renderPhaseMachineOwnedStateRule,
  renderPhaseQualityGateEvidenceRules,
} from "../src/workflows/prompts/phase-gate-evidence-prompt.js";

describe("phase gate evidence prompt policy", () => {
  it("protects every machine-owned workflow field", () => {
    const rule = renderPhaseMachineOwnedStateRule();
    expect(rule).toContain("`**Status:**`");
    expect(rule).toContain("FeatureTasks.md Status cells");
    expect(rule).toContain("entire Phase Task Ledger");
    expect(rule).toContain("`## Hepha Task State`");
    expect(rule).toContain("Quality Gate Evidence cell");
    expect(rule).toContain("Hepha writes those deterministically");
  });

  it("defines the complete canonical decision vocabulary", () => {
    const rules = renderPhaseQualityGateEvidenceRules().join("\n");
    expect(rules).toContain("`missing`, `satisfied`, `waived`, or `not applicable`");
    expect(rules).toContain("Do not write `pass`, `passed`, `recorded`, `complete`, `approved`");
    expect(rules).toContain("exactly the three template columns");
    expect(rules).toContain("one physical Markdown table row");
    expect(rules).toContain("`IN_PROGRESS`, `AWAITING_REVIEW`");
  });

  it("requires the exact machine-readable handoff and failure semantics", () => {
    const rule = renderPhaseGateEvidenceHandoffRule().join("\n");
    expect(rule).toContain("`## Hepha Gate Evidence Handoff`");
    expect(rule).toContain("`| Gate | Result | Evidence |`");
    expect(rule).toContain("`| Changed files | recorded |");
    expect(rule).toContain("`| Tests | passed/failed/not_applicable |");
    expect(rule).toContain("`| Gherkin/Playwright E2E | passed/failed/not_applicable |");
    expect(rule).toContain("timed-out, skipped, or crashing required check must be `failed`");
    expect(rule).toContain("malformed handoff also fails before task completion");
  });
});
