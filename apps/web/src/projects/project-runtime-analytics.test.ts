import { describe, expect, it } from "vitest";
import type { ProjectSummary, WorkItemCard } from "@hepha/shared";
import {
  calculateProjectRuntimeStats,
  formatDurationGain,
  formatNullableDuration,
  getProjectFeatureCount,
  getProjectOpenFeatureCount,
} from "./project-runtime-analytics.js";

const counts: ProjectSummary["counts"] = {
  "00_EPICS": 2,
  "01_SUBMITTED": 3,
  "02_READY_TO_DEVELOP": 4,
  "03_IN_PROGRESS": 5,
  "04_COMPLETED": 6,
  "05_CANCELLED": 7,
};

describe("project runtime analytics", () => {
  it("separates all FEATs from the open delivery queue", () => {
    const project = { counts } as ProjectSummary;

    expect(getProjectFeatureCount(project)).toBe(25);
    expect(getProjectOpenFeatureCount(project)).toBe(12);
  });

  it("returns an empty, deterministic portfolio projection", () => {
    expect(calculateProjectRuntimeStats([])).toEqual({
      activeRuns: 0,
      averageFeatureImplementationDurationMs: null,
      averagePhaseDurationMs: null,
      blockedOrFailedPhases: 0,
      completedFeatureImplementations: 0,
      completedPhaseRuns: 0,
      epicsNeedingValidation: 0,
      estimatedHumanTimeSavedMs: null,
      humanAccelerationMidpoint: null,
      itemsNeedingValidation: 0,
      openFindings: 0,
      timingSampleCount: 0,
    });
  });

  it("counts active, failed, review, validation, and completed phase evidence", () => {
    const feature = {
      kind: "feature",
      phases: [],
      validation: { deepDiveStatus: "missing", needsValidationCount: 1 },
      featureWorkflow: {
        activeRun: { id: "run" },
        findings: [{ status: "open" }, { status: "closed" }],
        implementationCompleted: false,
        implementationPhases: [
          { completedAt: "2026-01-01T00:02:00.000Z", startedAt: "2026-01-01T00:00:00.000Z", status: "completed" },
          { completedAt: null, startedAt: null, status: "failed" },
        ],
      },
    } as unknown as WorkItemCard;

    expect(calculateProjectRuntimeStats([feature])).toMatchObject({
      activeRuns: 1,
      averagePhaseDurationMs: 120_000,
      blockedOrFailedPhases: 1,
      completedPhaseRuns: 1,
      itemsNeedingValidation: 1,
      openFindings: 1,
    });
  });

  it("formats unavailable, positive, and negative durations", () => {
    expect(formatNullableDuration(null)).toBe("-");
    expect(formatNullableDuration(65_000)).toBe("1m 5s");
    expect(formatDurationGain(null)).toBe("-");
    expect(formatDurationGain(65_000)).toBe("1m 5s");
    expect(formatDurationGain(-65_000)).toBe("-1m 5s");
  });
});
