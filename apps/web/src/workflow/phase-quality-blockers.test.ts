import { describe, expect, it } from "vitest";
import type { FeaturePhaseQualitySummary } from "@hepha/shared";
import { buildPhaseQualityBlockers, buildPhaseQualityWarnings } from "./phase-quality-blockers.js";

describe("phase quality blocker explanations", () => {
  const phase = { phaseNumber: 4, phaseTitle: "Presentation", phaseStatus: "COMPLETED", gates: [
    { gate: "tests", status: "missing", justification: "No execution record", evidencePaths: ["test-results/report.json"] },
    { gate: "code_review", status: "unknown", justification: null, evidencePaths: [] },
    { gate: "gherkin_e2e", status: "waived", justification: " ", evidencePaths: [] },
  ] } as FeaturePhaseQualitySummary;
  it("retains evidence and diagnostic details without inventing failed test outcomes", () => {
    const blockers = buildPhaseQualityBlockers([phase]);
    expect(blockers).toHaveLength(3);
    expect(blockers[0]).toMatchObject({ title: "Phase 4 — Automated tests", recordedReason: "No execution record", evidencePaths: ["test-results/report.json"] });
    expect(blockers[0]!.explanation).toContain("not a recorded failure");
    expect(blockers[1]!.steps.join(" ")).toContain("existing review");
    expect(blockers[2]!.explanation).toContain("no recorded justification");
  });
  it("explains structured build and lint results without calling them missing tests", () => {
    for (const gate of ["build", "lint"] as const) {
      const [blocker] = buildPhaseQualityWarnings([{ ...phase, gates: [{ gate, status: "missing", justification: "Observed warning despite exit zero", evidencePaths: ["phase.md.verification.json"] }] }]);
      expect(blocker?.explanation).toContain("Non-blocking warning");
      expect(blocker?.steps.join(" ")).toContain("errors or warnings");
      expect(blocker?.steps.join(" ")).not.toContain("Zero matching tests");
    }
  });
  it("does not manufacture completion blockers for planned phases or justified waivers", () => {
    expect(buildPhaseQualityBlockers([{ ...phase, phaseStatus: "PENDING" }])).toEqual([]);
    expect(buildPhaseQualityBlockers([{ ...phase, gates: [{ gate: "tests", status: "waived", justification: "Approved documentation-only scope", evidencePaths: [] }] }])).toEqual([]);
  });
});
