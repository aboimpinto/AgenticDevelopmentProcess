import { describe, expect, it } from "vitest";

import {
  addUntrackedFileLines,
  evaluateChangedLineCoverage,
  parseChangedLines,
  parseLcov,
  selectCoverageBaseline,
} from "../src/test-coverage-telemetry.js";

const declaration = {
  reportPath: "coverage/lcov.info",
  format: "lcov" as const,
  include: ["src/**/*.ts"],
  exclude: ["src/**/*.test.ts", "src/**/types.ts"],
  minimumPercent: 80,
  targetPercent: 95,
  improvementAttempts: 3,
};

describe("generic changed-production-line coverage telemetry", () => {
  it("selects and normalizes a durable non-rolled-back StartFeature baseline", () => {
    expect(selectCoverageBaseline([
      { startCommit: "bad", rolledBack: false, transitionStatus: "prerequisites_ready" },
      { startCommit: "a".repeat(40), rolledBack: true, transitionStatus: "branch_ready" },
      { startCommit: ` ${"b".repeat(40)}\n`, rolledBack: false, transitionStatus: "prerequisites_ready" },
    ])).toBe("b".repeat(40));
  });

  it("does not select failed or rolled-back transition records", () => {
    expect(selectCoverageBaseline([
      { startCommit: "a".repeat(40), rolledBack: false, transitionStatus: "transition_failed" },
      { startCommit: "b".repeat(40), rolledBack: true, transitionStatus: "transition_completed" },
    ])).toBeNull();
  });

  it("parses only added and modified destination lines from Git diff", () => {
    const changed = parseChangedLines([
      "diff --git a/src/service.ts b/src/service.ts",
      "--- a/src/service.ts",
      "+++ b/src/service.ts",
      "@@ -4,2 +4,3 @@",
      "@@ -20 +21,0 @@",
    ].join("\n"));
    expect([...changed.get("src/service.ts")!]).toEqual([4, 5, 6]);
  });

  it("treats every line of a new untracked production file as FEAT-owned", () => {
    const changed = addUntrackedFileLines(new Map(), ["src/new-service.ts"], () => "first\nsecond\n");
    expect([...changed.get("src/new-service.ts")!]).toEqual([1, 2]);
  });

  it("parses absolute LCOV source paths into project-relative line hits", () => {
    const report = parseLcov("SF:/workspace/src/service.ts\nDA:4,1\nDA:5,0\nend_of_record\n", "/workspace", ".");
    expect([...report.get("src/service.ts")!.entries()]).toEqual([[4, 1], [5, 0]]);
  });

  it("classifies the 80 percent advisory reference as OK and reports the 95 percent target", () => {
    const changed = new Map([["src/service.ts", new Set([1, 2, 3, 4, 5])]]);
    const lcov = new Map([["src/service.ts", new Map([[1, 1], [2, 1], [3, 1], [4, 1], [5, 0]])]]);
    const result = evaluateChangedLineCoverage({ declaration, changedLines: changed, lcov });
    expect(result.kind).toBe("passed");
    expect(result.summary).toContain("80%");
    expect(result.summary).toContain("target 95% not yet achieved");
  });

  it("returns a non-blocking advisory when changed FEAT code is below 80 percent", () => {
    const changed = new Map([
      ["src/service.ts", new Set([1, 2, 3, 4, 5])],
      ["src/other.ts", new Set([1, 2])],
    ]);
    const lcov = new Map([
      ["src/service.ts", new Map([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]])],
      ["src/other.ts", new Map([[1, 1], [2, 0]])],
    ]);
    const result = evaluateChangedLineCoverage({ declaration, changedLines: changed, lcov });
    expect(result.kind).toBe("advisory");
    expect(result.summary).toContain("src/other.ts 50%");
    expect(result.summary).toContain("does not fail the phase");
    expect(result.measurement?.overall.percent).toBeCloseTo(85.71, 2);
  });

  it("blocks when a changed production file has no report entry", () => {
    const result = evaluateChangedLineCoverage({
      declaration,
      changedLines: new Map([["src/uninstrumented.ts", new Set([1])]]),
      lcov: new Map(),
    });
    expect(result.kind).toBe("blocked");
    expect(result.summary).toContain("no instrumentation record");
  });

  it("ignores excluded non-production and type-only paths", () => {
    const result = evaluateChangedLineCoverage({
      declaration,
      changedLines: new Map([
        ["src/service.test.ts", new Set([1])],
        ["src/domain/types.ts", new Set([1])],
      ]),
      lcov: new Map(),
    });
    expect(result.kind).toBe("passed");
    expect(result.summary).toContain("not applicable");
  });
});
