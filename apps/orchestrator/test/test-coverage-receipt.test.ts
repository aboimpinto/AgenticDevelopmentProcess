import { describe, expect, it, vi } from "vitest";
import {
  parseTestCoverageMeasurement,
  projectTestCoverageSummary,
  readLatestTestCoverageSummary,
  serializeTestCoverageMeasurement,
} from "../src/test-coverage-receipt.js";

const measurement = {
  feature: { assessment: "needs_improvement" as const, comment: "Increase FEAT coverage.", coveredLines: 7, executableLines: 10, percent: 70 },
  overall: { assessment: "ok" as const, comment: "Overall coverage is OK.", coveredLines: 85, executableLines: 100, percent: 85 },
  minimumPercent: 80,
  targetPercent: 95,
};

describe("test coverage receipt", () => {
  it("round-trips the controlled machine-readable receipt", () => {
    expect(parseTestCoverageMeasurement(serializeTestCoverageMeasurement(measurement))).toEqual(measurement);
    expect(parseTestCoverageMeasurement("ordinary command output")).toBeNull();
  });

  it("combines disjoint coverage checks into FEAT and overall totals", () => {
    const second = {
      ...measurement,
      feature: { ...measurement.feature, coveredLines: 18, executableLines: 20, percent: 90 },
      overall: { ...measurement.overall, coveredLines: 190, executableLines: 200, percent: 95 },
    };
    const summary = projectTestCoverageSummary([
      { intent: "coverage", outputSummary: serializeTestCoverageMeasurement(measurement), startedAt: "2026-07-23T10:00:00.000Z" },
      { intent: "coverage", outputSummary: serializeTestCoverageMeasurement(second), startedAt: "2026-07-23T10:01:00.000Z" },
    ]);
    expect(summary?.feature).toMatchObject({ coveredLines: 25, executableLines: 30, percent: 83.33, assessment: "needs_improvement" });
    expect(summary?.overall).toMatchObject({ coveredLines: 275, executableLines: 300, percent: 91.67, assessment: "ok" });
    expect(summary?.measuredAt).toBe("2026-07-23T10:01:00.000Z");
  });

  it("skips newer runs without coverage and returns the newest durable receipt", async () => {
    const store = {
      listFinalVerificationRuns: vi.fn(async () => [{ id: "new" }, { id: "covered" }]),
      listFinalVerificationChecks: vi.fn(async (runId: string) => runId === "new" ? [] : [
        { intent: "coverage", outputSummary: serializeTestCoverageMeasurement(measurement), startedAt: "2026-07-23T10:00:00.000Z" },
      ]),
    };
    await expect(readLatestTestCoverageSummary(store as never, "project", "feature:WORK")).resolves.toMatchObject({ feature: { percent: 70 } });
    expect(store.listFinalVerificationChecks).toHaveBeenCalledTimes(2);
  });
});
