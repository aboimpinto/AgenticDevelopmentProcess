// Behavior suite: run metrics.
/**
 * FEAT-037: Run Metrics Presentation Helper Tests
 *
 * Tests for the pure display helper functions in run-metrics-presentation.ts.
 */
import { describe, it, expect } from "vitest";
import type {
  MetricsTotals,
  GroupedMetricsRow,
  OutlierRow,
  ModelComparisonRow,
  PartialDataSummary,
} from "@hepha/shared";
import {
  formatTotalInvocations,
  formatMetricsDuration,
  formatMetricsDurationAria,
  formatMetricsTotalsSummary,
  formatOutlierSeverity,
  formatOutlierSeverityAria,
  formatOutlierSeverityCssClass,
  formatGroupDimension,
  formatGroupDimensionAria,
  formatCommandOutcome,
  formatCommandOutcomeAria,
  formatCommandOutcomeCssClass,
  formatLoopCount,
  formatRepeatedLoop,
  formatRepeatedLoopCssClass,
  formatModelComparisonSummary,
  formatPartialDataWarning,
  formatPartialDataWarningAria,
  getMetricsEmptyMessage,
  getGroupedMetricsEmptyMessage,
  getOutliersEmptyMessage,
  getModelComparisonsEmptyMessage,
  getGroupedMetricsRowAriaLabel,
  formatMetricsTotalsAria,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// formatTotalInvocations
// ---------------------------------------------------------------------------

describe("formatTotalInvocations", () => {
  it("formats singular", () => {
    expect(formatTotalInvocations(1)).toBe("1 invocation");
  });

  it("formats plural", () => {
    expect(formatTotalInvocations(5)).toBe("5 invocations");
  });

  it("formats zero", () => {
    expect(formatTotalInvocations(0)).toBe("0 invocations");
  });
});

// ---------------------------------------------------------------------------
// formatMetricsDuration
// ---------------------------------------------------------------------------

describe("formatMetricsDuration", () => {
  it("returns em-dash for null", () => {
    expect(formatMetricsDuration(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatMetricsDuration(undefined)).toBe("—");
  });

  it("formats milliseconds", () => {
    expect(formatMetricsDuration(500)).toBe("500ms");
  });

  it("formats seconds", () => {
    expect(formatMetricsDuration(1500)).toBe("1.5s");
  });

  it("formats minutes and seconds", () => {
    expect(formatMetricsDuration(125000)).toBe("2m 5s");
  });
});

// ---------------------------------------------------------------------------
// formatMetricsDurationAria
// ---------------------------------------------------------------------------

describe("formatMetricsDurationAria", () => {
  it("returns unavailable for null", () => {
    expect(formatMetricsDurationAria(null)).toBe("Duration not available");
  });

  it("formats milliseconds", () => {
    expect(formatMetricsDurationAria(500)).toBe("500 milliseconds");
  });

  it("formats seconds", () => {
    expect(formatMetricsDurationAria(1500)).toBe("1.5 seconds");
  });

  it("formats minutes", () => {
    expect(formatMetricsDurationAria(125000)).toBe("2 minutes and 5 seconds");
  });
});

// ---------------------------------------------------------------------------
// formatMetricsTotalsSummary
// ---------------------------------------------------------------------------

describe("formatMetricsTotalsSummary", () => {
  it("formats basic summary", () => {
    const totals: MetricsTotals = {
      totalInvocations: 10,
      totalDurationMs: 50000,
      avgDurationMs: 5000,
      medianDurationMs: null,
      maxDurationMs: null,
      missingDurationCount: 0,
      retryCount: 2,
      reviewLoopCount: 1,
      recoveryLoopCount: 0,
      successfulCommandCount: 8,
      failedCommandCount: 2,
      timedOutCommandCount: 0,
      cancelledCommandCount: 0,
      unknownOutcomeCount: 0,
      timeoutCount: 0,
      findingsCount: null,
      findingsUnavailable: true,
    };
    const result = formatMetricsTotalsSummary(totals);
    expect(result).toContain("10 invocations");
    expect(result).toContain("total");
    expect(result).toContain("avg");
  });

  it("handles null durations", () => {
    const totals: MetricsTotals = {
      totalInvocations: 0,
      totalDurationMs: null,
      avgDurationMs: null,
      medianDurationMs: null,
      maxDurationMs: null,
      missingDurationCount: 0,
      retryCount: 0,
      reviewLoopCount: 0,
      recoveryLoopCount: 0,
      successfulCommandCount: 0,
      failedCommandCount: 0,
      timedOutCommandCount: 0,
      cancelledCommandCount: 0,
      unknownOutcomeCount: 0,
      timeoutCount: 0,
      findingsCount: null,
      findingsUnavailable: true,
    };
    expect(formatMetricsTotalsSummary(totals)).toBe("0 invocations");
  });
});

// ---------------------------------------------------------------------------
// formatOutlierSeverity
// ---------------------------------------------------------------------------

describe("formatOutlierSeverity", () => {
  it("labels p95 outliers", () => {
    expect(formatOutlierSeverity("p95", true)).toBe("Above 95th percentile");
  });

  it("labels 2x median outliers", () => {
    expect(formatOutlierSeverity("2x_median", true)).toBe("Above 2× median");
  });

  it("labels small sample observations", () => {
    expect(formatOutlierSeverity("small_sample_rank_5", false)).toBe("Observation");
  });

  it("labels normal items", () => {
    expect(formatOutlierSeverity("none", false)).toBe("Normal");
  });
});

// ---------------------------------------------------------------------------
// formatGroupDimension
// ---------------------------------------------------------------------------

describe("formatGroupDimension", () => {
  it("formats feat dimension", () => {
    expect(formatGroupDimension("feat")).toBe("FEAT");
  });

  it("formats phase dimension", () => {
    expect(formatGroupDimension("phase")).toBe("Phase");
  });

  it("formats model dimension", () => {
    expect(formatGroupDimension("model")).toBe("Model");
  });
});

// ---------------------------------------------------------------------------
// formatCommandOutcome
// ---------------------------------------------------------------------------

describe("formatCommandOutcome", () => {
  it("formats count with type", () => {
    expect(formatCommandOutcome(3, "failed")).toBe("3 failed");
  });
});

// ---------------------------------------------------------------------------
// formatLoopCount
// ---------------------------------------------------------------------------

describe("formatLoopCount", () => {
  it("returns None for zero count", () => {
    expect(formatLoopCount(0, "review")).toBe("None");
    expect(formatLoopCount(0, "recovery")).toBe("None");
  });

  it("formats singular loop count", () => {
    expect(formatLoopCount(1, "review")).toBe("1 review loop");
    expect(formatLoopCount(1, "recovery")).toBe("1 recovery loop");
  });

  it("formats plural loop count", () => {
    expect(formatLoopCount(3, "review")).toBe("3 review loops");
    expect(formatLoopCount(3, "recovery")).toBe("3 recovery loops");
  });
});

// ---------------------------------------------------------------------------
// formatRepeatedLoop
// ---------------------------------------------------------------------------

describe("formatRepeatedLoop", () => {
  it("returns single attempt for non-repeated", () => {
    expect(formatRepeatedLoop(false, "review")).toBe("Single attempt");
  });

  it("indicates multiple attempts", () => {
    expect(formatRepeatedLoop(true, "review")).toBe("Multiple review attempts");
    expect(formatRepeatedLoop(true, "recovery")).toBe("Multiple recovery attempts");
  });
});

// ---------------------------------------------------------------------------
// formatModelComparisonSummary
// ---------------------------------------------------------------------------

describe("formatModelComparisonSummary", () => {
  it("formats basic comparison row", () => {
    const row: ModelComparisonRow = {
      model: "gpt-4",
      provider: "openai",
      totalInvocations: 10,
      totalDurationMs: 50000,
      avgDurationMs: 5000,
      retryCount: 2,
      recoveryLoopCount: 1,
      failedCount: 0,
      timedOutCount: 0,
      findingsCount: null,
    };
    const result = formatModelComparisonSummary(row);
    expect(result).toContain("gpt-4");
    expect(result).toContain("openai");
    expect(result).toContain("10 invocations");
  });

  it("includes failure info when present", () => {
    const row: ModelComparisonRow = {
      model: "claude-3",
      provider: null,
      totalInvocations: 5,
      totalDurationMs: null,
      avgDurationMs: null,
      retryCount: 1,
      recoveryLoopCount: 1,
      failedCount: 3,
      timedOutCount: 1,
      findingsCount: null,
    };
    const result = formatModelComparisonSummary(row);
    expect(result).toContain("3 failed");
    expect(result).toContain("1 timed out");
  });
});

// ---------------------------------------------------------------------------
// formatPartialDataWarning
// ---------------------------------------------------------------------------

describe("formatPartialDataWarning", () => {
  it("returns null when no partial data", () => {
    const summary: PartialDataSummary = {
      missingDurationCount: 0,
      missingModelCount: 0,
      missingStatusCount: 0,
      unknownOutcomeCount: 0,
      findingsUnavailable: false,
    };
    expect(formatPartialDataWarning(summary)).toBeNull();
  });

  it("reports missing durations", () => {
    const summary: PartialDataSummary = {
      missingDurationCount: 3,
      missingModelCount: 0,
      missingStatusCount: 0,
      unknownOutcomeCount: 0,
      findingsUnavailable: false,
    };
    const result = formatPartialDataWarning(summary);
    expect(result).toContain("3 invocations missing duration data");
  });

  it("reports unavailable findings", () => {
    const summary: PartialDataSummary = {
      missingDurationCount: 0,
      missingModelCount: 0,
      missingStatusCount: 0,
      unknownOutcomeCount: 0,
      findingsUnavailable: true,
    };
    const result = formatPartialDataWarning(summary);
    expect(result).toContain("Findings data is not available");
  });
});

// ---------------------------------------------------------------------------
// Empty State Messages
// ---------------------------------------------------------------------------

describe("empty state messages", () => {
  it("returns filtered empty message", () => {
    expect(getMetricsEmptyMessage(false, true)).toContain("adjusting your filter");
  });

  it("returns general empty message", () => {
    expect(getMetricsEmptyMessage(false, false)).toContain("No run metrics data");
  });

  it("returns empty grouped section message", () => {
    const msg = getGroupedMetricsEmptyMessage("phase");
    expect(msg).toBe("No phase metrics available.");
  });

  it("returns empty outliers message", () => {
    expect(getOutliersEmptyMessage()).toBe("No significant duration outliers detected.");
  });

  it("returns empty model comparison message", () => {
    expect(getModelComparisonsEmptyMessage()).toBe("No model comparison data available.");
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe("accessibility labels", () => {
  it("formats grouped row aria label", () => {
    const row: GroupedMetricsRow = {
      groupKey: "phase-1",
      groupLabel: "Phase 1: Health Check",
      groupDimension: "phase",
      invocationCount: 5,
      totalDurationMs: 25000,
      avgDurationMs: null,
      medianDurationMs: null,
      maxDurationMs: null,
      missingDurationCount: 0,
      retryCount: 1,
      reviewLoopCount: 1,
      recoveryLoopCount: 0,
      repeatedReviewAttempt: false,
      repeatedRecoveryLoop: false,
      successfulCount: 4,
      failedCount: 1,
      timedOutCount: 0,
      cancelledCount: 0,
      unknownOutcomeCount: 0,
      timeoutCount: 0,
      findingsCount: null,
    };
    const label = getGroupedMetricsRowAriaLabel(row);
    expect(label).toContain("Phase 1: Health Check");
    expect(label).toContain("5 invocations");
    expect(label).toContain("total duration");
    expect(label).toContain("1 failed");
  });

  it("formats totals aria label", () => {
    const totals: MetricsTotals = {
      totalInvocations: 10,
      totalDurationMs: 50000,
      avgDurationMs: null,
      medianDurationMs: null,
      maxDurationMs: null,
      missingDurationCount: 0,
      retryCount: 2,
      reviewLoopCount: 1,
      recoveryLoopCount: 3,
      successfulCommandCount: 7,
      failedCommandCount: 2,
      timedOutCommandCount: 1,
      cancelledCommandCount: 0,
      unknownOutcomeCount: 0,
      timeoutCount: 1,
      findingsCount: null,
      findingsUnavailable: true,
    };
    const label = formatMetricsTotalsAria(totals);
    expect(label).toContain("10 invocations");
    expect(label).toContain("2 retries");
    expect(label).toContain("1 review loops");
    expect(label).toContain("3 recovery loops");
    expect(label).toContain("2 failed commands");
    expect(label).toContain("1 timed out commands");
  });
});
