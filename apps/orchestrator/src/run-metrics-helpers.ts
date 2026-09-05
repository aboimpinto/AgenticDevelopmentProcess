/**
 * FEAT-037: Run Metrics Aggregation Helpers
 *
 * Pure, deterministic, side-effect-free aggregation functions that
 * transform StoredAgentInvocation arrays into RunMetricsResponse
 * read models for the analytics dashboard.
 *
 * All functions are deterministic and side-effect free:
 * - No filesystem access
 * - No database writes
 * - No process spawning
 * - No mutable module state
 * - No implicit clock reads
 */
import type {
  StoredAgentInvocation,
  MetricsGroupDimension,
  MetricsTotals,
  GroupedMetricsRow,
  OutlierRow,
  ModelComparisonRow,
  PartialDataSummary,
  RunMetricsResponse,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Duration Statistics
// ---------------------------------------------------------------------------

/**
 * Compute duration statistics from an array of invocations.
 *
 * Pure function: operates only on the provided array.
 */
export function computeDurationStats(
  invocations: StoredAgentInvocation[],
): {
  totalDurationMs: number | null;
  avgDurationMs: number | null;
  medianDurationMs: number | null;
  maxDurationMs: number | null;
  missingDurationCount: number;
} {
  const durations = invocations
    .map((inv) => inv.durationMs)
    .filter((d): d is number => d !== null);

  const missingDurationCount = invocations.length - durations.length;

  if (durations.length === 0) {
    return {
      totalDurationMs: null,
      avgDurationMs: null,
      medianDurationMs: null,
      maxDurationMs: null,
      missingDurationCount,
    };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const totalDurationMs = sorted.reduce((sum, d) => sum + d, 0);
  const avgDurationMs = totalDurationMs / sorted.length;
  const maxDurationMs = sorted[sorted.length - 1]!;

  // Median
  const mid = Math.floor(sorted.length / 2);
  const medianDurationMs =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;

  return {
    totalDurationMs,
    avgDurationMs,
    medianDurationMs,
    maxDurationMs,
    missingDurationCount,
  };
}

// ---------------------------------------------------------------------------
// Retry / Loop Detection
// ---------------------------------------------------------------------------

/**
 * Compute retry count: number of repeated invocations with the same
 * (cardKey, phaseNumber, workflowCommand, agentRole) grouping.
 *
 * Pure function: operates only on the provided array.
 */
export function computeRetryCount(invocations: StoredAgentInvocation[]): number {
  if (invocations.length <= 1) return 0;

  const groups = new Map<string, StoredAgentInvocation[]>();

  for (const inv of invocations) {
    const key = `${inv.cardKey ?? ""}|${inv.phaseNumber ?? 0}|${inv.workflowCommand ?? ""}|${inv.agentRole ?? ""}`;
    const group = groups.get(key) ?? [];
    group.push(inv);
    groups.set(key, group);
  }

  let retryCount = 0;

  for (const [, group] of groups) {
    if (group.length > 1) {
      // Sort by startedAt
      group.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      // Count sequential same-role invocations beyond the first as retries
      for (let i = 1; i < group.length; i++) {
        retryCount++;
      }
    }
  }

  return retryCount;
}

/**
 * Count invocations with a review-related agent role.
 */
export function computeReviewLoopCount(invocations: StoredAgentInvocation[]): number {
  return invocations.filter(
    (inv) =>
      inv.agentRole !== null &&
      (inv.agentRole.toLowerCase().includes("review") ||
        inv.agentRole.toLowerCase().includes("code-review")),
  ).length;
}

/**
 * Count recovery attempts: invocations that follow a failed/timed_out
 * invocation with the same (cardKey, phaseNumber, workflowCommand) group.
 */
export function computeRecoveryLoopCount(invocations: StoredAgentInvocation[]): number {
  if (invocations.length <= 1) return 0;

  const sorted = [...invocations].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt),
  );

  let recoveryCount = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;

    // Check if previous invocation failed/timed out and they share the same context
    if (
      (prev.status === "failed" || prev.status === "timed_out") &&
      prev.cardKey === curr.cardKey &&
      prev.phaseNumber === curr.phaseNumber &&
      prev.workflowCommand === curr.workflowCommand
    ) {
      recoveryCount++;
    }
  }

  return recoveryCount;
}

// ---------------------------------------------------------------------------
// Command Outcome Counting
// ---------------------------------------------------------------------------

/**
 * Count command outcomes by status.
 */
export function computeCommandOutcomes(invocations: StoredAgentInvocation[]): {
  successfulCount: number;
  failedCount: number;
  timedOutCount: number;
  cancelledCount: number;
  unknownOutcomeCount: number;
  timeoutCount: number;
} {
  let successfulCount = 0;
  let failedCount = 0;
  let timedOutCount = 0;
  let cancelledCount = 0;
  let unknownOutcomeCount = 0;

  for (const inv of invocations) {
    switch (inv.status) {
      case "completed":
        successfulCount++;
        break;
      case "failed":
        failedCount++;
        break;
      case "timed_out":
        timedOutCount++;
        break;
      case "running":
        // Not yet completed — count separately if needed
        break;
      default:
        unknownOutcomeCount++;
        break;
    }
  }

  // Timeout count = timedOut status + timeoutMarker
  const timeoutMarkerCount = invocations.filter((inv) => inv.timeoutMarker).length;
  const timeoutCount = Math.max(timedOutCount, timeoutMarkerCount);

  return {
    successfulCount,
    failedCount,
    timedOutCount,
    cancelledCount,
    unknownOutcomeCount,
    timeoutCount,
  };
}

// ---------------------------------------------------------------------------
// Findings Counting
// ---------------------------------------------------------------------------

/**
 * Placeholder for findings counting.
 *
 * Currently returns `null` for findingsCount and `true` for findingsUnavailable
 * because FEAT-037 derives aggregated command/phase-level metrics and does not
 * store its own finding records. Future iterations may read from persisted finding
 * storage when available.
 *
 * Pure function: operates only on the provided array (findings are not
 * directly derivable from invocation records alone).
 */
export function computeFindingsCount(_invocations: StoredAgentInvocation[]): {
  findingsCount: number | null;
  findingsUnavailable: boolean;
} {
  // Findings require access to the card metadata store's finding records.
  // From invocation records alone, we cannot derive findings counts.
  // Return unavailable so the UI shows the correct empty state.
  return {
    findingsCount: null,
    findingsUnavailable: true,
  };
}

// ---------------------------------------------------------------------------
// Metrics Totals Builder
// ---------------------------------------------------------------------------

/**
 * Build aggregate metrics totals from an array of invocations.
 *
 * Pure function: operates only on the provided array.
 */
export function buildMetricsTotals(
  invocations: StoredAgentInvocation[],
): MetricsTotals {
  const durationStats = computeDurationStats(invocations);
  const outcomes = computeCommandOutcomes(invocations);
  const findings = computeFindingsCount(invocations);

  return {
    totalInvocations: invocations.length,
    totalDurationMs: durationStats.totalDurationMs,
    avgDurationMs: durationStats.avgDurationMs,
    medianDurationMs: durationStats.medianDurationMs,
    maxDurationMs: durationStats.maxDurationMs,
    missingDurationCount: durationStats.missingDurationCount,
    retryCount: computeRetryCount(invocations),
    reviewLoopCount: computeReviewLoopCount(invocations),
    recoveryLoopCount: computeRecoveryLoopCount(invocations),
    successfulCommandCount: outcomes.successfulCount,
    failedCommandCount: outcomes.failedCount,
    timedOutCommandCount: outcomes.timedOutCount,
    cancelledCommandCount: outcomes.cancelledCount,
    unknownOutcomeCount: outcomes.unknownOutcomeCount,
    timeoutCount: outcomes.timeoutCount,
    findingsCount: findings.findingsCount,
    findingsUnavailable: findings.findingsUnavailable,
  };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Extract a grouping key and label for a given dimension from an invocation.
 */
function extractGroupInfo(
  inv: StoredAgentInvocation,
  dimension: MetricsGroupDimension,
): { key: string; label: string } {
  switch (dimension) {
    case "feat":
      return {
        key: `feat-${inv.cardKey ?? "unknown"}`,
        label: inv.cardKey ?? "Unknown FEAT",
      };
    case "phase":
      return {
        key: `phase-${inv.phaseNumber ?? 0}`,
        label: inv.phaseTitle
          ? `Phase ${inv.phaseNumber ?? 0}: ${inv.phaseTitle}`
          : `Phase ${inv.phaseNumber ?? 0}`,
      };
    case "workflowCommand":
      return {
        key: `cmd-${inv.workflowCommand ?? "unknown"}`,
        label: inv.workflowCommand ?? "Unknown Command",
      };
    case "agentRole":
      return {
        key: `role-${inv.agentRole ?? "unknown"}`,
        label: inv.agentRole ?? "Unknown Role",
      };
    case "model":
      return {
        key: `model-${inv.model ?? "unknown"}`,
        label: inv.model ?? "Unknown Model",
      };
  }
}

/**
 * Build grouped metrics rows for the specified dimensions.
 *
 * Pure function: operates only on the provided arrays.
 */
export function buildGroupedRows(
  invocations: StoredAgentInvocation[],
  groupBy: readonly MetricsGroupDimension[],
): GroupedMetricsRow[] {
  if (groupBy.length === 0) {
    // Default: group by phase
    return buildGroupedRows(invocations, ["phase" as const]);
  }

  // Build combined group key from all dimensions
  const groups = new Map<string, StoredAgentInvocation[]>();

  for (const inv of invocations) {
    const parts = groupBy.map((dim) => extractGroupInfo(inv, dim));
    const combinedKey = parts.map((p) => p.key).join("|");
    const group = groups.get(combinedKey) ?? [];
    group.push(inv);
    groups.set(combinedKey, group);
  }

  const rows: GroupedMetricsRow[] = [];

  for (const [, groupInvocations] of groups) {
    const durationStats = computeDurationStats(groupInvocations);
    const outcomes = computeCommandOutcomes(groupInvocations);
    const findings = computeFindingsCount(groupInvocations);
    const retryCount = computeRetryCount(groupInvocations);
    const reviewLoopCount = computeReviewLoopCount(groupInvocations);
    const recoveryLoopCount = computeRecoveryLoopCount(groupInvocations);

    // Use the first dimension for display (primary grouping)
    const firstDim = groupBy[0]!;
    const firstInv = groupInvocations[0]!;
    const groupInfo = extractGroupInfo(firstInv, firstDim);

    rows.push({
      groupKey: groupInfo.key,
      groupLabel: groupInfo.label,
      groupDimension: firstDim,
      invocationCount: groupInvocations.length,
      totalDurationMs: durationStats.totalDurationMs,
      avgDurationMs: durationStats.avgDurationMs,
      medianDurationMs: durationStats.medianDurationMs,
      maxDurationMs: durationStats.maxDurationMs,
      missingDurationCount: durationStats.missingDurationCount,
      retryCount,
      reviewLoopCount,
      recoveryLoopCount,
      repeatedReviewAttempt: reviewLoopCount > 1,
      repeatedRecoveryLoop: recoveryLoopCount > 1,
      successfulCount: outcomes.successfulCount,
      failedCount: outcomes.failedCount,
      timedOutCount: outcomes.timedOutCount,
      cancelledCount: outcomes.cancelledCount,
      unknownOutcomeCount: outcomes.unknownOutcomeCount,
      timeoutCount: outcomes.timeoutCount,
      findingsCount: findings.findingsCount,
    });
  }

  // Sort by invocation count descending (most active first)
  rows.sort((a, b) => b.invocationCount - a.invocationCount);

  return rows;
}

// ---------------------------------------------------------------------------
// Outlier Detection
// ---------------------------------------------------------------------------

/** Default threshold: 95th percentile */
const OUTLIER_P95_THRESHOLD = 0.95;
/** Minimum sample size for statistical outlier labels */
const MIN_SAMPLE_SIZE = 5;
/** Alternative threshold: 2x median */
const OUTLIER_2X_MEDIAN_THRESHOLD = 2;

/**
 * Detect outliers within grouped rows based on duration.
 *
 * Pure function: operates only on the provided arrays.
 * Grouping-based: compares against the overall dataset or within-group.
 *
 * @param rows - Grouped metrics rows to analyze.
 * @returns Outlier rows sorted by severity (highest rank first).
 */
export function detectOutliers(rows: GroupedMetricsRow[]): OutlierRow[] {
  // Collect all non-null totalDurationMs values for percentile calculation
  const durations = rows
    .map((r) => r.totalDurationMs)
    .filter((d): d is number => d !== null);

  if (durations.length < MIN_SAMPLE_SIZE) {
    // Small sample: rank by duration descending, label as observations
    const sorted = [...rows]
      .filter((r) => r.totalDurationMs !== null)
      .sort((a, b) => (b.totalDurationMs ?? 0) - (a.totalDurationMs ?? 0));

    return sorted.map((row, index) => ({
      groupKey: row.groupKey,
      groupLabel: row.groupLabel,
      groupDimension: row.groupDimension,
      durationMs: row.totalDurationMs,
      threshold: `small_sample_rank_${MIN_SAMPLE_SIZE}`,
      isOutlier: false,
      rank: index + 1,
    }));
  }

  // Compute 95th percentile
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const p95Index = Math.ceil(sortedDurations.length * OUTLIER_P95_THRESHOLD) - 1;
  const p95 = sortedDurations[Math.max(0, p95Index)]!;

  // Also compute median for 2x median threshold
  const mid = Math.floor(sortedDurations.length / 2);
  const median =
    sortedDurations.length % 2 === 0
      ? (sortedDurations[mid - 1]! + sortedDurations[mid]!) / 2
      : sortedDurations[mid]!;

  const twoXMedian = median * OUTLIER_2X_MEDIAN_THRESHOLD;

  // Identify outliers
  const outliers: OutlierRow[] = rows
    .filter((r) => r.totalDurationMs !== null)
    .map((row) => {
      const duration = row.totalDurationMs!;
      const aboveP95 = duration > p95;
      const aboveTwoXMedian = duration > twoXMedian;

      // Use the stricter threshold
      const threshold = aboveP95 ? "p95" : aboveTwoXMedian ? "2x_median" : "none";
      const isOutlier = aboveP95 || aboveTwoXMedian;

      return {
        groupKey: row.groupKey,
        groupLabel: row.groupLabel,
        groupDimension: row.groupDimension,
        durationMs: row.totalDurationMs,
        threshold,
        isOutlier,
        rank: 0, // Will be assigned after sorting
      };
    });

  // Sort outliers: true outliers first, then by duration descending
  outliers.sort((a, b) => {
    if (a.isOutlier !== b.isOutlier) return a.isOutlier ? -1 : 1;
    return (b.durationMs ?? 0) - (a.durationMs ?? 0);
  });

  // Assign ranks
  for (let i = 0; i < outliers.length; i++) {
    outliers[i] = { ...outliers[i], rank: i + 1 };
  }

  // Return only rows that are actual outliers (or top items in small sample)
  if (durations.length >= MIN_SAMPLE_SIZE) {
    return outliers.filter((o) => o.isOutlier);
  }

  return outliers;
}

// ---------------------------------------------------------------------------
// Model/Runtime Comparison
// ---------------------------------------------------------------------------

/**
 * Build model/runtime comparison rows.
 *
 * Pure function: operates only on the provided array.
 */
export function buildModelComparisons(
  invocations: StoredAgentInvocation[],
): ModelComparisonRow[] {
  const groups = new Map<string, StoredAgentInvocation[]>();

  for (const inv of invocations) {
    const model = inv.model ?? "unknown";
    const provider = inv.provider ?? null;
    const key = `${model}|${provider ?? ""}`;
    const group = groups.get(key) ?? [];
    group.push(inv);
    groups.set(key, group);
  }

  const rows: ModelComparisonRow[] = [];

  for (const [, groupInvocations] of groups) {
    const durationStats = computeDurationStats(groupInvocations);
    const outcomes = computeCommandOutcomes(groupInvocations);
    const findings = computeFindingsCount(groupInvocations);

    const firstInv = groupInvocations[0]!;

    rows.push({
      model: firstInv.model ?? "unknown",
      provider: firstInv.provider ?? null,
      totalInvocations: groupInvocations.length,
      totalDurationMs: durationStats.totalDurationMs,
      avgDurationMs: durationStats.avgDurationMs,
      retryCount: computeRetryCount(groupInvocations),
      recoveryLoopCount: computeRecoveryLoopCount(groupInvocations),
      failedCount: outcomes.failedCount,
      timedOutCount: outcomes.timedOutCount,
      findingsCount: findings.findingsCount,
    });
  }

  // Sort by invocation count descending
  rows.sort((a, b) => b.totalInvocations - a.totalInvocations);

  return rows;
}

// ---------------------------------------------------------------------------
// Partial Data Summary
// ---------------------------------------------------------------------------

/**
 * Build a summary of missing/partial data.
 *
 * Pure function: operates only on the provided array.
 */
export function buildPartialDataSummary(
  invocations: StoredAgentInvocation[],
): PartialDataSummary {
  return {
    missingDurationCount: invocations.filter((inv) => inv.durationMs === null).length,
    missingModelCount: invocations.filter((inv) => inv.model === null).length,
    missingStatusCount: invocations.filter(
      (inv) => inv.status === "running",
    ).length,
    unknownOutcomeCount: invocations.filter(
      (inv) =>
        inv.status !== "completed" &&
        inv.status !== "failed" &&
        inv.status !== "timed_out" &&
        inv.status !== "running",
    ).length,
    findingsUnavailable: true, // Findings require store access
  };
}

// ---------------------------------------------------------------------------
// Top-Level Metrics Builder
// ---------------------------------------------------------------------------

/**
 * Build a complete RunMetricsResponse from stored agent invocations.
 *
 * Pure function: operates only on the provided arrays.
 *
 * @param projectId - Project identifier.
 * @param invocations - Agent invocation records to analyze.
 * @param groupBy - Dimensions to group by (defaults to ["phase"]).
 * @param cardKey - Optional card/feature key for scoping.
 */
export function buildRunMetrics(
  projectId: string,
  invocations: StoredAgentInvocation[],
  groupBy?: readonly MetricsGroupDimension[],
  cardKey?: string,
): RunMetricsResponse {
  const resolvedGroupBy = groupBy && groupBy.length > 0 ? groupBy : (["phase"] as const);

  // Filter out running invocations from duration calculations
  // but keep them for counts
  const settledInvocations = invocations.filter(
    (inv) => inv.status !== "running",
  );

  const totals = buildMetricsTotals(settledInvocations);
  const grouped = buildGroupedRows(settledInvocations, resolvedGroupBy);
  const outliers = detectOutliers(grouped);
  const modelComparisons = buildModelComparisons(settledInvocations);
  const partialData = buildPartialDataSummary(invocations);

  return {
    projectId,
    cardKey,
    totals,
    grouped,
    outliers,
    modelComparisons,
    partialData,
  };
}
