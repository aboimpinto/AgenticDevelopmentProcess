import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { normalizeCoverageOutcome } from "../src/final-verification-policy.js";
import { evaluateChangedLineCoverage } from "../src/test-coverage-telemetry.js";

const featurePath = fileURLToPath(new URL("./generic-final-checkpoint-test-coverage.feature", import.meta.url));
const declaration = {
  reportPath: "coverage/lcov.info",
  format: "lcov" as const,
  include: ["application/**/*.ts"],
  exclude: ["application/**/*.test.ts"],
  minimumPercent: 80,
  targetPercent: 95,
  improvementAttempts: 3,
};

describe("generic final checkpoint coverage Gherkin integration", () => {
  it("binds the generic scenarios to the production coverage decision", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Scenario: Changed production code satisfies the advisory reference");
    expect(feature).toContain("Scenario: Changed FEAT production code is below the advisory reference");
    expect(feature).toContain("Scenario: FEAT and overall project coverage are presented separately");
    expect(feature).toContain("Scenario: Final-phase working-tree code belongs to the FEAT measurement");
    expect(feature).toContain("Scenario: Coverage execution or measurement is unavailable");
    expect(feature).toContain("Scenario: An earlier full verification does not run final coverage");
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);

    const result = evaluateChangedLineCoverage({
      declaration,
      changedLines: new Map([["application/arbitrary.ts", new Set([10, 11, 12, 13, 14])]]),
      lcov: new Map([["application/arbitrary.ts", new Map([[10, 1], [11, 1], [12, 1], [13, 1], [14, 0]])]]),
    });
    expect(result.kind).toBe("passed");
    expect(result.summary).toContain("reference 80%");
    expect(result.summary).toContain("target 95% not yet achieved");
  });

  it("binds below-reference coverage to an advisory rather than a lifecycle failure", () => {
    const result = evaluateChangedLineCoverage({
      declaration,
      changedLines: new Map([["application/arbitrary.ts", new Set([10, 11, 12, 13, 14])]]),
      lcov: new Map([
        ["application/arbitrary.ts", new Map([[10, 1], [11, 1], [12, 1], [13, 0], [14, 0]])],
        ["application/existing.ts", new Map([[1, 1], [2, 1], [3, 1], [4, 0]])],
      ]),
    });
    expect(result.kind).toBe("advisory");
    expect(result.measurement?.feature).toMatchObject({ percent: 60, assessment: "needs_improvement" });
    expect(result.measurement?.overall.percent).toBeCloseTo(66.67, 2);
    expect(result.summary).toContain("does not fail the phase");
  });

  it("binds unavailable coverage evidence to a remark without entering repair", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("no coverage improvement worker is launched without a successful measurement");
    expect(feature).toContain("the phase and FEAT can complete");
    expect(normalizeCoverageOutcome("coverage", "failed")).toBe("coverage-unavailable");
    expect(normalizeCoverageOutcome("coverage", "timed-out")).toBe("coverage-unavailable");
    expect(normalizeCoverageOutcome("test", "failed")).toBe("failed");
  });
});
