import { describe, expect, it } from "vitest";
import {
  countMissingPhaseQualityGates,
  getFirstMissingPhaseQualityGate,
  getMissingPhaseQualityGates,
  getObservedPhaseChangedFiles,
  getPhaseQualityGates,
  isResolvedPhaseQualitySummary,
} from "../src/workflows/phases/phase-quality-evidence-policy.js";
import type { WorkItemCard } from "@hepha/shared";

function feature(): WorkItemCard {
  return {
    implementationEvidence: {
      changedFiles: [
        { path: "/repo/src/a.ts", phases: [2], relativePath: "src/a.ts" },
        { path: "/repo/src/shared.ts", phases: [2, 7], relativePath: null },
        { path: "/repo/src/later.ts", phases: [7], relativePath: "src/later.ts" },
      ],
      phaseQualityGates: [
        { phaseNumber: 1, phaseStatus: "IN_PROGRESS", phaseTitle: "Unresolved", gates: [{ gate: "tests", status: "missing" }] },
        { phaseNumber: 2, phaseStatus: "completed", phaseTitle: "Resolved", gates: [
          { gate: "tests", status: "satisfied" },
          { gate: "review", status: "missing" },
        ] },
        { phaseNumber: 3, phaseStatus: "SKIPPED", phaseTitle: "Skipped", gates: [{ gate: "waiver", status: "missing" }] },
      ],
    },
  } as WorkItemCard;
}

describe("phase quality evidence policy", () => {
  it("counts missing gates only for resolved or skipped phase summaries", () => {
    expect(countMissingPhaseQualityGates(feature())).toBe(2);
    expect(isResolvedPhaseQualitySummary({ phaseStatus: "completed" } as never)).toBe(true);
    expect(isResolvedPhaseQualitySummary({ phaseStatus: "SKIPPED" } as never)).toBe(true);
    expect(isResolvedPhaseQualitySummary({ phaseStatus: "IN_PROGRESS" } as never)).toBe(false);
  });

  it("selects the first missing gate from an eligible phase", () => {
    expect(getFirstMissingPhaseQualityGate(feature())).toEqual({
      gates: ["review"],
      phaseNumber: 2,
      phaseTitle: "Resolved",
    });
  });

  it("projects one phase's gate decisions and missing gate names", () => {
    expect(getPhaseQualityGates(feature(), 2)).toEqual([
      { gate: "tests", status: "satisfied" },
      { gate: "review", status: "missing" },
    ]);
    expect(getMissingPhaseQualityGates(feature(), 2)).toEqual(["review"]);
    expect(getPhaseQualityGates(feature(), 99)).toEqual([]);
  });

  it("uses only durable phase-attributed changed-file evidence", () => {
    expect(getObservedPhaseChangedFiles({ rootPath: "/repo" } as never, feature(), 2)).toEqual([
      "src/a.ts",
      "/repo/src/shared.ts",
    ]);
  });
});
