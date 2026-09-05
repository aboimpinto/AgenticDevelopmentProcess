/**
 * FEAT-037: Run Metrics Presentation Helpers
 *
 * Pure display helpers for metrics labels, duration/stat formatting,
 * outlier severity labels, grouping names, model/runtime comparison copy,
 * command outcome badges, and empty-state/accessibility text.
 *
 * No React dependency — safe to use from both orchestrator and web
 * packages. All functions are deterministic and side-effect free.
 */
import type {
  MetricsTotals,
  GroupedMetricsRow,
  OutlierRow,
  ModelComparisonRow,
  PartialDataSummary,
  MetricsGroupDimension,
} from "./index.js";
import { formatDuration, formatDurationAria } from "./trace-presentation.js";

// ---------------------------------------------------------------------------
// Metrics Totals Formatting
// ---------------------------------------------------------------------------

/**
 * Format total invocations for display.
 */
export function formatTotalInvocations(total: number): string {
  return `${total} invocation${total === 1 ? "" : "s"}`;
}

/**
 * Format a duration value with appropriate precision.
 * Returns "—" for null/undefined durations.
 */
export function formatMetricsDuration(
  durationMs: number | null | undefined,
): string {
  return formatDuration(durationMs);
}

/**
 * Format duration for accessibility.
 */
export function formatMetricsDurationAria(
  durationMs: number | null | undefined,
): string {
  return formatDurationAria(durationMs);
}

/**
 * Format a metrics totals summary for compact display.
 */
export function formatMetricsTotalsSummary(totals: MetricsTotals): string {
  const parts: string[] = [];

  parts.push(formatTotalInvocations(totals.totalInvocations));

  if (totals.totalDurationMs !== null) {
    parts.push(`total ${formatMetricsDuration(totals.totalDurationMs)}`);
  }

  if (totals.avgDurationMs !== null) {
    parts.push(`avg ${formatMetricsDuration(totals.avgDurationMs)}`);
  }

  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// Outlier Severity Labels
// ---------------------------------------------------------------------------

/**
 * Format outlier severity label.
 */
export function formatOutlierSeverity(
  threshold: string,
  isOutlier: boolean,
): string {
  if (!isOutlier && threshold.startsWith("small_sample")) {
    return "Observation";
  }

  if (!isOutlier) return "Normal";

  switch (threshold) {
    case "p95":
      return "Above 95th percentile";
    case "2x_median":
      return "Above 2× median";
    default:
      return "Outlier";
  }
}

/**
 * Format outlier severity for accessibility.
 */
export function formatOutlierSeverityAria(
  threshold: string,
  isOutlier: boolean,
): string {
  if (!isOutlier && threshold.startsWith("small_sample")) {
    return "This item is shown as an observation due to small sample size";
  }

  if (!isOutlier) return "This item is within normal range";

  switch (threshold) {
    case "p95":
      return "This item has duration above the 95th percentile";
    case "2x_median":
      return "This item has duration above two times the median";
    default:
      return "This item is flagged as an outlier";
  }
}

/**
 * Get CSS class for outlier severity (color-independent).
 */
export function formatOutlierSeverityCssClass(
  threshold: string,
  isOutlier: boolean,
): string {
  if (!isOutlier) return "metrics-outlier-normal";
  if (threshold === "p95" || threshold === "2x_median") return "metrics-outlier-high";
  return "metrics-outlier-medium";
}

// ---------------------------------------------------------------------------
// Grouping Dimension Labels
// ---------------------------------------------------------------------------

const GROUP_DIMENSION_LABELS: Record<MetricsGroupDimension, string> = {
  feat: "FEAT",
  phase: "Phase",
  workflowCommand: "Workflow Command",
  agentRole: "Agent Role",
  model: "Model",
};

/**
 * Get a human-readable label for a metrics group dimension.
 */
export function formatGroupDimension(dimension: MetricsGroupDimension): string {
  return GROUP_DIMENSION_LABELS[dimension] ?? dimension;
}

/**
 * Get an accessible description for a grouping dimension.
 */
export function formatGroupDimensionAria(dimension: MetricsGroupDimension): string {
  switch (dimension) {
    case "feat":
      return "Grouped by feature";
    case "phase":
      return "Grouped by implementation phase";
    case "workflowCommand":
      return "Grouped by workflow command";
    case "agentRole":
      return "Grouped by agent role";
    case "model":
      return "Grouped by model";
  }
}

// ---------------------------------------------------------------------------
// Command Outcome Badges
// ---------------------------------------------------------------------------

/**
 * Format a command outcome count for display.
 */
export function formatCommandOutcome(
  count: number,
  outcomeType: string,
): string {
  return `${count} ${outcomeType}`;
}

/**
 * Format command outcome for accessibility.
 */
export function formatCommandOutcomeAria(
  count: number,
  outcomeType: string,
): string {
  return `${count} ${outcomeType} ${count === 1 ? "invocation" : "invocations"}`;
}

/**
 * Get a CSS class for a command outcome type (color-independent).
 */
export function formatCommandOutcomeCssClass(outcomeType: string): string {
  switch (outcomeType) {
    case "successful":
      return "metrics-outcome-success";
    case "failed":
      return "metrics-outcome-failure";
    case "timed_out":
    case "timeout":
      return "metrics-outcome-timeout";
    case "cancelled":
      return "metrics-outcome-cancelled";
    default:
      return "metrics-outcome-unknown";
  }
}

// ---------------------------------------------------------------------------
// Loop Labels
// ---------------------------------------------------------------------------

/**
 * Format a review or recovery loop count for display.
 */
export function formatLoopCount(count: number, loopType: "review" | "recovery"): string {
  if (count === 0) return "None";

  const label = loopType === "review" ? "review loop" : "recovery loop";
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

/**
 * Format repeated loop indicator.
 */
export function formatRepeatedLoop(
  repeated: boolean,
  loopType: "review" | "recovery",
): string {
  if (!repeated) return "Single attempt";
  return `Multiple ${loopType === "review" ? "review" : "recovery"} attempts`;
}

/**
 * Get CSS class for repeated loop indicator.
 */
export function formatRepeatedLoopCssClass(
  repeated: boolean,
  loopType: "review" | "recovery",
): string {
  if (!repeated) return "metrics-loop-single";
  return loopType === "review"
    ? "metrics-loop-review-repeated"
    : "metrics-loop-recovery-repeated";
}

// ---------------------------------------------------------------------------
// Model Comparison Labels
// ---------------------------------------------------------------------------

/**
 * Format a model comparison row for display.
 */
export function formatModelComparisonSummary(row: ModelComparisonRow): string {
  const parts: string[] = [];

  parts.push(row.model);

  if (row.provider) {
    parts.push(`(${row.provider})`);
  }

  parts.push(`— ${row.totalInvocations} invocation${row.totalInvocations === 1 ? "" : "s"}`);

  if (row.avgDurationMs !== null) {
    parts.push(`avg ${formatMetricsDuration(row.avgDurationMs)}`);
  }

  if (row.failedCount > 0) {
    parts.push(`${row.failedCount} failed`);
  }

  if (row.timedOutCount > 0) {
    parts.push(`${row.timedOutCount} timed out`);
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Partial Data Labels
// ---------------------------------------------------------------------------

/**
 * Format partial data warning message.
 */
export function formatPartialDataWarning(summary: PartialDataSummary): string | null {
  const warnings: string[] = [];

  if (summary.missingDurationCount > 0) {
    warnings.push(
      `${summary.missingDurationCount} invocation${summary.missingDurationCount === 1 ? "" : "s"} missing duration data`,
    );
  }

  if (summary.missingModelCount > 0) {
    warnings.push(
      `${summary.missingModelCount} invocation${summary.missingModelCount === 1 ? "" : "s"} missing model info`,
    );
  }

  if (summary.findingsUnavailable) {
    warnings.push("Findings data is not available");
  }

  if (warnings.length === 0) return null;

  return `Partial data: ${warnings.join("; ")}.`;
}

/**
 * Format partial data warning for accessibility.
 */
export function formatPartialDataWarningAria(summary: PartialDataSummary): string | null {
  const warning = formatPartialDataWarning(summary);
  if (!warning) return null;
  return `Warning: ${warning}`;
}

// ---------------------------------------------------------------------------
// Empty State Labels
// ---------------------------------------------------------------------------

/**
 * Get an empty-state message for the metrics dashboard.
 */
export function getMetricsEmptyMessage(hasData: boolean, hasFilter: boolean): string {
  if (!hasData && hasFilter) {
    return "No metrics data matches the current filter. Try adjusting your filter criteria.";
  }

  if (!hasData) {
    return "No run metrics data available yet. Metrics will appear after workflow runs complete.";
  }

  return "";
}

/**
 * Get an empty-state message for a grouped section.
 */
export function getGroupedMetricsEmptyMessage(dimension: MetricsGroupDimension): string {
  return `No ${formatGroupDimension(dimension).toLowerCase()} metrics available.`;
}

/**
 * Get an empty-state message for outliers.
 */
export function getOutliersEmptyMessage(): string {
  return "No significant duration outliers detected.";
}

/**
 * Get an empty-state message for model comparisons.
 */
export function getModelComparisonsEmptyMessage(): string {
  return "No model comparison data available.";
}

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

/**
 * Get an accessible label for a grouped metrics row.
 */
export function getGroupedMetricsRowAriaLabel(row: GroupedMetricsRow): string {
  return `${row.groupLabel}: ${row.invocationCount} invocation${row.invocationCount === 1 ? "" : "s"}${
    row.totalDurationMs !== null
      ? `, total duration ${formatMetricsDurationAria(row.totalDurationMs)}`
      : ""
  }${
    row.failedCount > 0 ? `, ${row.failedCount} failed` : ""
  }${
    row.timedOutCount > 0 ? `, ${row.timedOutCount} timed out` : ""
  }${
    row.repeatedReviewAttempt ? ", repeated review attempts" : ""
  }${
    row.repeatedRecoveryLoop ? ", repeated recovery loops" : ""
  }`;
}

/**
 * Format a metrics totals summary for accessibility.
 */
export function formatMetricsTotalsAria(totals: MetricsTotals): string {
  return `Total: ${totals.totalInvocations} invocations. ${
    totals.totalDurationMs !== null
      ? `Total duration: ${formatMetricsDurationAria(totals.totalDurationMs)}. `
      : ""
  }${
    totals.retryCount > 0 ? `${totals.retryCount} retries. ` : ""
  }${
    totals.reviewLoopCount > 0 ? `${totals.reviewLoopCount} review loops. ` : ""
  }${
    totals.recoveryLoopCount > 0 ? `${totals.recoveryLoopCount} recovery loops. ` : ""
  }${
    totals.failedCommandCount > 0 ? `${totals.failedCommandCount} failed commands. ` : ""
  }${
    totals.timedOutCommandCount > 0 ? `${totals.timedOutCommandCount} timed out commands. ` : ""
  }`;
}
