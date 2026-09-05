// Behavior suite: run metrics.
/**
 * FEAT-037: Run Metrics — Data Layer / Aggregation Helper Tests
 *
 * Tests the pure aggregation functions in run-metrics-helpers.ts.
 * All functions are deterministic and side-effect free; no database
 * or filesystem access is needed.
 */
import { describe, it, expect } from "vitest";
import type { StoredAgentInvocation } from "@hepha/shared";
import {
  buildRunMetrics,
  buildMetricsTotals,
  buildGroupedRows,
  detectOutliers,
  buildModelComparisons,
  buildPartialDataSummary,
  computeDurationStats,
  computeRetryCount,
  computeReviewLoopCount,
  computeRecoveryLoopCount,
  computeCommandOutcomes,
} from "../src/run-metrics-helpers.js";

// ---------------------------------------------------------------------------
// Fixture Helpers
// ---------------------------------------------------------------------------

function makeInvocation(overrides: Partial<StoredAgentInvocation> & { id: string }): StoredAgentInvocation {
  const now = new Date().toISOString();
  return {
    id: overrides.id,
    projectId: overrides.projectId ?? "test-project",
    cardKey: overrides.cardKey ?? null,
    workflowRunId: overrides.workflowRunId ?? null,
    workflowCommand: overrides.workflowCommand ?? null,
    workflowNodeId: overrides.workflowNodeId ?? null,
    phaseNumber: overrides.phaseNumber ?? null,
    phaseTitle: overrides.phaseTitle ?? null,
    agentRole: overrides.agentRole ?? null,
    agentName: overrides.agentName ?? null,
    model: overrides.model ?? null,
    provider: overrides.provider ?? null,
    status: overrides.status ?? "completed",
    exitCode: overrides.exitCode ?? null,
    errorMessage: overrides.errorMessage ?? null,
    timeoutMarker: overrides.timeoutMarker ?? false,
    parentInvocationId: overrides.parentInvocationId ?? null,
    logPath: overrides.logPath ?? null,
    receiptPath: overrides.receiptPath ?? null,
    reviewReportPath: overrides.reviewReportPath ?? null,
    rawRefJson: overrides.rawRefJson ?? null,
    startedAt: overrides.startedAt ?? now,
    completedAt: overrides.completedAt ?? now,
    durationMs: overrides.durationMs ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

// ---------------------------------------------------------------------------
// computeDurationStats
// ---------------------------------------------------------------------------

describe("computeDurationStats", () => {
  it("returns null stats for empty array", () => {
    const stats = computeDurationStats([]);
    expect(stats.totalDurationMs).toBeNull();
    expect(stats.avgDurationMs).toBeNull();
    expect(stats.medianDurationMs).toBeNull();
    expect(stats.maxDurationMs).toBeNull();
    expect(stats.missingDurationCount).toBe(0);
  });

  it("returns null stats when all durations are null", () => {
    const invocations = [
      makeInvocation({ id: "1", durationMs: null }),
      makeInvocation({ id: "2", durationMs: null }),
    ];
    const stats = computeDurationStats(invocations);
    expect(stats.totalDurationMs).toBeNull();
    expect(stats.missingDurationCount).toBe(2);
  });

  it("computes correct stats for populated durations", () => {
    const invocations = [
      makeInvocation({ id: "1", durationMs: 100 }),
      makeInvocation({ id: "2", durationMs: 200 }),
      makeInvocation({ id: "3", durationMs: 300 }),
      makeInvocation({ id: "4", durationMs: 400 }),
      makeInvocation({ id: "5", durationMs: 500 }),
    ];
    const stats = computeDurationStats(invocations);
    expect(stats.totalDurationMs).toBe(1500);
    expect(stats.avgDurationMs).toBe(300);
    expect(stats.medianDurationMs).toBe(300);
    expect(stats.maxDurationMs).toBe(500);
    expect(stats.missingDurationCount).toBe(0);
  });

  it("handles mixed null and populated durations", () => {
    const invocations = [
      makeInvocation({ id: "1", durationMs: 100 }),
      makeInvocation({ id: "2", durationMs: null }),
      makeInvocation({ id: "3", durationMs: 200 }),
    ];
    const stats = computeDurationStats(invocations);
    expect(stats.totalDurationMs).toBe(300);
    expect(stats.avgDurationMs).toBe(150);
    expect(stats.medianDurationMs).toBe(150);
    expect(stats.maxDurationMs).toBe(200);
    expect(stats.missingDurationCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeRetryCount
// ---------------------------------------------------------------------------

describe("computeRetryCount", () => {
  it("returns 0 for empty array", () => {
    expect(computeRetryCount([])).toBe(0);
  });

  it("returns 0 for single invocation", () => {
    const invocations = [makeInvocation({ id: "1", cardKey: "FEAT-001", phaseNumber: 1, workflowCommand: "start-implementing", agentRole: "implementation" })];
    expect(computeRetryCount(invocations)).toBe(0);
  });

  it("counts retries for same group", () => {
    const invocations = [
      makeInvocation({ id: "1", cardKey: "FEAT-001", phaseNumber: 1, workflowCommand: "start-implementing", agentRole: "implementation", startedAt: "2026-01-01T00:00:00Z" }),
      makeInvocation({ id: "2", cardKey: "FEAT-001", phaseNumber: 1, workflowCommand: "start-implementing", agentRole: "implementation", startedAt: "2026-01-01T00:01:00Z" }),
      makeInvocation({ id: "3", cardKey: "FEAT-001", phaseNumber: 1, workflowCommand: "start-implementing", agentRole: "implementation", startedAt: "2026-01-01T00:02:00Z" }),
    ];
    expect(computeRetryCount(invocations)).toBe(2);
  });

  it("does not count different groups as retries", () => {
    const invocations = [
      makeInvocation({ id: "1", cardKey: "FEAT-001", phaseNumber: 1, workflowCommand: "start-implementing", agentRole: "implementation" }),
      makeInvocation({ id: "2", cardKey: "FEAT-001", phaseNumber: 2, workflowCommand: "continue-implementing", agentRole: "review" }),
    ];
    expect(computeRetryCount(invocations)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeReviewLoopCount
// ---------------------------------------------------------------------------

describe("computeReviewLoopCount", () => {
  it("returns 0 for empty array", () => {
    expect(computeReviewLoopCount([])).toBe(0);
  });

  it("counts review and code-review roles", () => {
    const invocations = [
      makeInvocation({ id: "1", agentRole: "implementation" }),
      makeInvocation({ id: "2", agentRole: "review" }),
      makeInvocation({ id: "3", agentRole: "code-review" }),
      makeInvocation({ id: "4", agentRole: "Code Review" }),
      makeInvocation({ id: "5", agentRole: "documentation" }),
    ];
    expect(computeReviewLoopCount(invocations)).toBe(3);
  });

  it("returns 0 when no review roles present", () => {
    const invocations = [
      makeInvocation({ id: "1", agentRole: "implementation" }),
      makeInvocation({ id: "2", agentRole: "verification" }),
    ];
    expect(computeReviewLoopCount(invocations)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeRecoveryLoopCount
// ---------------------------------------------------------------------------

describe("computeRecoveryLoopCount", () => {
  it("returns 0 for empty array", () => {
    expect(computeRecoveryLoopCount([])).toBe(0);
  });

  it("counts recovery after failure in same context", () => {
    const invocations = [
      makeInvocation({ id: "1", cardKey: "FEAT-001", phaseNumber: 1, workflowCommand: "start-implementing", status: "failed", startedAt: "2026-01-01T00:00:00Z" }),
      makeInvocation({ id: "2", cardKey: "FEAT-001", phaseNumber: 1, workflowCommand: "start-implementing", status: "completed", startedAt: "2026-01-01T00:01:00Z" }),
    ];
    expect(computeRecoveryLoopCount(invocations)).toBe(1);
  });

  it("counts multiple recovery attempts", () => {
    const invocations = [
      makeInvocation({ id: "1", cardKey: "FEAT-001", phaseNumber: 1, workflowCommand: "start-implementing", status: "failed", startedAt: "2026-01-01T00:00:00Z" }),
      makeInvocation({ id: "2", cardKey: "FEAT-001", phaseNumber: 1, workflowCommand: "start-implementing", status: "timed_out", startedAt: "2026-01-01T00:01:00Z" }),
      makeInvocation({ id: "3", cardKey: "FEAT-001", phaseNumber: 1, workflowCommand: "start-implementing", status: "completed", startedAt: "2026-01-01T00:02:00Z" }),
    ];
    expect(computeRecoveryLoopCount(invocations)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// computeCommandOutcomes
// ---------------------------------------------------------------------------

describe("computeCommandOutcomes", () => {
  it("returns all zeros for empty array", () => {
    const outcomes = computeCommandOutcomes([]);
    expect(outcomes.successfulCount).toBe(0);
    expect(outcomes.failedCount).toBe(0);
    expect(outcomes.timedOutCount).toBe(0);
    expect(outcomes.cancelledCount).toBe(0);
    expect(outcomes.unknownOutcomeCount).toBe(0);
    expect(outcomes.timeoutCount).toBe(0);
  });

  it("counts statuses correctly", () => {
    const invocations = [
      makeInvocation({ id: "1", status: "completed" }),
      makeInvocation({ id: "2", status: "completed" }),
      makeInvocation({ id: "3", status: "failed" }),
      makeInvocation({ id: "4", status: "timed_out" }),
      makeInvocation({ id: "5", status: "running" }),
      makeInvocation({ id: "6", status: "something_else" as any }),
    ];
    const outcomes = computeCommandOutcomes(invocations);
    expect(outcomes.successfulCount).toBe(2);
    expect(outcomes.failedCount).toBe(1);
    expect(outcomes.timedOutCount).toBe(1);
    expect(outcomes.unknownOutcomeCount).toBe(1);
    expect(outcomes.timeoutCount).toBe(1);
  });

  it("timeoutCount is at least the max of timedOutCount and timeoutMarker count", () => {
    const invocations = [
      makeInvocation({ id: "1", status: "completed", timeoutMarker: true }),
      makeInvocation({ id: "2", status: "timed_out", timeoutMarker: true }),
    ];
    const outcomes = computeCommandOutcomes(invocations);
    expect(outcomes.timeoutCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// buildMetricsTotals
// ---------------------------------------------------------------------------

describe("buildMetricsTotals", () => {
  it("builds totals for populated invocations", () => {
    const invocations = [
      makeInvocation({ id: "1", durationMs: 100, status: "completed", agentRole: "implementation", cardKey: "FEAT-001", phaseNumber: 1, workflowCommand: "start-implementing" }),
      makeInvocation({ id: "2", durationMs: 200, status: "completed", agentRole: "review", cardKey: "FEAT-001", phaseNumber: 1, workflowCommand: "start-implementing" }),
      makeInvocation({ id: "3", durationMs: 300, status: "failed", agentRole: "implementation", cardKey: "FEAT-002", phaseNumber: 1, workflowCommand: "start-implementing" }),
    ];
    const totals = buildMetricsTotals(invocations);
    expect(totals.totalInvocations).toBe(3);
    expect(totals.totalDurationMs).toBe(600);
    expect(totals.retryCount).toBe(0); // Different cardKeys and roles
    expect(totals.reviewLoopCount).toBe(1);
    expect(totals.successfulCommandCount).toBe(2);
    expect(totals.failedCommandCount).toBe(1);
  });

  it("handles empty array gracefully", () => {
    const totals = buildMetricsTotals([]);
    expect(totals.totalInvocations).toBe(0);
    expect(totals.totalDurationMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildGroupedRows
// ---------------------------------------------------------------------------

describe("buildGroupedRows", () => {
  it("returns empty array for empty invocations", () => {
    const rows = buildGroupedRows([], ["phase"]);
    expect(rows).toHaveLength(0);
  });

  it("groups by phase dimension", () => {
    const invocations = [
      makeInvocation({ id: "1", phaseNumber: 1, phaseTitle: "Health Check", agentRole: "implementation", durationMs: 100, status: "completed", cardKey: "FEAT-037" }),
      makeInvocation({ id: "2", phaseNumber: 1, phaseTitle: "Health Check", agentRole: "review", durationMs: 50, status: "completed", cardKey: "FEAT-037" }),
      makeInvocation({ id: "3", phaseNumber: 2, phaseTitle: "Planning", agentRole: "implementation", durationMs: 200, status: "completed", cardKey: "FEAT-037" }),
    ];
    const rows = buildGroupedRows(invocations, ["phase"]);
    expect(rows).toHaveLength(2);

    const phase1 = rows.find((r) => r.groupKey === "phase-1");
    expect(phase1).toBeDefined();
    expect(phase1!.invocationCount).toBe(2);
    expect(phase1!.totalDurationMs).toBe(150);

    const phase2 = rows.find((r) => r.groupKey === "phase-2");
    expect(phase2).toBeDefined();
    expect(phase2!.invocationCount).toBe(1);
  });

  it("groups by multiple dimensions", () => {
    const invocations = [
      makeInvocation({ id: "1", phaseNumber: 1, agentRole: "implementation", cardKey: "FEAT-037", durationMs: 100, status: "completed" }),
      makeInvocation({ id: "2", phaseNumber: 1, agentRole: "review", cardKey: "FEAT-037", durationMs: 50, status: "completed" }),
    ];
    const rows = buildGroupedRows(invocations, ["phase", "agentRole"]);
    expect(rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// detectOutliers
// ---------------------------------------------------------------------------

describe("detectOutliers", () => {
  it("returns empty array for empty rows", () => {
    expect(detectOutliers([])).toHaveLength(0);
  });

  it("returns ranked observations for small sample (< 5)", () => {
    const rows = [
      { groupKey: "phase-1", groupLabel: "Phase 1", groupDimension: "phase" as const, invocationCount: 3, totalDurationMs: 500, avgDurationMs: null, medianDurationMs: null, maxDurationMs: null, missingDurationCount: 0, retryCount: 0, reviewLoopCount: 0, recoveryLoopCount: 0, repeatedReviewAttempt: false, repeatedRecoveryLoop: false, successfulCount: 3, failedCount: 0, timedOutCount: 0, cancelledCount: 0, unknownOutcomeCount: 0, timeoutCount: 0, findingsCount: null },
      { groupKey: "phase-2", groupLabel: "Phase 2", groupDimension: "phase" as const, invocationCount: 1, totalDurationMs: 300, avgDurationMs: null, medianDurationMs: null, maxDurationMs: null, missingDurationCount: 0, retryCount: 0, reviewLoopCount: 0, recoveryLoopCount: 0, repeatedReviewAttempt: false, repeatedRecoveryLoop: false, successfulCount: 1, failedCount: 0, timedOutCount: 0, cancelledCount: 0, unknownOutcomeCount: 0, timeoutCount: 0, findingsCount: null },
    ];
    const outliers = detectOutliers(rows);
    expect(outliers).toHaveLength(2);
    expect(outliers[0]!.rank).toBe(1);
    expect(outliers[0]!.isOutlier).toBe(false);
    expect(outliers[0]!.threshold).toContain("small_sample");
  });

  it("detects outliers in large sample", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      groupKey: `phase-${i + 1}`,
      groupLabel: `Phase ${i + 1}`,
      groupDimension: "phase" as const,
      invocationCount: 1,
      totalDurationMs: i === 9 ? 10000 : (i + 1) * 100, // Last one is a huge outlier
      avgDurationMs: null,
      medianDurationMs: null,
      maxDurationMs: null,
      missingDurationCount: 0,
      retryCount: 0,
      reviewLoopCount: 0,
      recoveryLoopCount: 0,
      repeatedReviewAttempt: false,
      repeatedRecoveryLoop: false,
      successfulCount: 1,
      failedCount: 0,
      timedOutCount: 0,
      cancelledCount: 0,
      unknownOutcomeCount: 0,
      timeoutCount: 0,
      findingsCount: null,
    }));
    const outliers = detectOutliers(rows);
    expect(outliers.length).toBeGreaterThanOrEqual(1);
    expect(outliers.some((o) => o.isOutlier)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildModelComparisons
// ---------------------------------------------------------------------------

describe("buildModelComparisons", () => {
  it("returns empty array for empty invocations", () => {
    expect(buildModelComparisons([])).toHaveLength(0);
  });

  it("groups by model", () => {
    const invocations = [
      makeInvocation({ id: "1", model: "gpt-4", provider: "openai", status: "completed", durationMs: 100 }),
      makeInvocation({ id: "2", model: "gpt-4", provider: "openai", status: "completed", durationMs: 200 }),
      makeInvocation({ id: "3", model: "claude-3", provider: "anthropic", status: "failed", durationMs: 300 }),
    ];
    const comparisons = buildModelComparisons(invocations);
    expect(comparisons).toHaveLength(2);

    const gpt4 = comparisons.find((c) => c.model === "gpt-4");
    expect(gpt4).toBeDefined();
    expect(gpt4!.totalInvocations).toBe(2);
    expect(gpt4!.avgDurationMs).toBe(150);

    const claude = comparisons.find((c) => c.model === "claude-3");
    expect(claude).toBeDefined();
    expect(claude!.totalInvocations).toBe(1);
    expect(claude!.failedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildPartialDataSummary
// ---------------------------------------------------------------------------

describe("buildPartialDataSummary", () => {
  it("reports zero missing for fully populated data", () => {
    const invocations = [
      makeInvocation({ id: "1", durationMs: 100, model: "gpt-4", status: "completed" }),
      makeInvocation({ id: "2", durationMs: 200, model: "gpt-4", status: "completed" }),
    ];
    const summary = buildPartialDataSummary(invocations);
    expect(summary.missingDurationCount).toBe(0);
    expect(summary.missingModelCount).toBe(0);
    expect(summary.missingStatusCount).toBe(0);
  });

  it("counts missing data correctly", () => {
    const invocations = [
      makeInvocation({ id: "1", durationMs: null, model: null, status: "running" }),
      makeInvocation({ id: "2", durationMs: 100, model: "gpt-4", status: "completed" }),
    ];
    const summary = buildPartialDataSummary(invocations);
    expect(summary.missingDurationCount).toBe(1);
    expect(summary.missingModelCount).toBe(1);
    expect(summary.missingStatusCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildRunMetrics (integration of all helpers)
// ---------------------------------------------------------------------------

describe("buildRunMetrics", () => {
  it("returns empty metrics for empty invocations", () => {
    const metrics = buildRunMetrics("test-project", []);
    expect(metrics.projectId).toBe("test-project");
    expect(metrics.totals.totalInvocations).toBe(0);
    expect(metrics.grouped).toHaveLength(0);
    expect(metrics.outliers).toHaveLength(0);
    expect(metrics.modelComparisons).toHaveLength(0);
  });

  it("builds metrics for populated invocations", () => {
    const invocations = [
      makeInvocation({ id: "1", cardKey: "FEAT-037", phaseNumber: 0, phaseTitle: "Health Check", agentRole: "implementation", workflowCommand: "start-implementing", durationMs: 100, status: "completed", model: "gpt-4" }),
      makeInvocation({ id: "2", cardKey: "FEAT-037", phaseNumber: 0, phaseTitle: "Health Check", agentRole: "review", workflowCommand: "start-implementing", durationMs: 50, status: "completed", model: "gpt-4" }),
      makeInvocation({ id: "3", cardKey: "FEAT-037", phaseNumber: 1, phaseTitle: "Planning", agentRole: "implementation", workflowCommand: "continue-implementing", durationMs: 200, status: "completed", model: "claude-3" }),
    ];
    const metrics = buildRunMetrics("test-project", invocations, ["phase"], "FEAT-037");
    expect(metrics.cardKey).toBe("FEAT-037");
    expect(metrics.totals.totalInvocations).toBe(3);
    expect(metrics.totals.totalDurationMs).toBe(350);
    expect(metrics.grouped).toHaveLength(2);
    expect(metrics.outliers.length).toBeGreaterThanOrEqual(0);
    expect(metrics.modelComparisons).toHaveLength(2);
  });
});
