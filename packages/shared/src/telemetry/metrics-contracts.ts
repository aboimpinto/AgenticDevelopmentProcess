export type MetricsGroupDimension = "feat" | "phase" | "workflowCommand" | "agentRole" | "model";

export interface RunMetricsRequest {
  readonly projectId: string;
  readonly cardKey?: string;
  readonly groupBy?: readonly MetricsGroupDimension[];
  readonly filters?: {
    readonly cardKey?: string;
    readonly phaseNumber?: number;
    readonly workflowCommand?: string;
    readonly agentRole?: string;
    readonly model?: string;
    readonly startedAfter?: string;
    readonly startedBefore?: string;
  };
}

export interface MetricsTotals {
  readonly totalInvocations: number;
  readonly totalDurationMs: number | null;
  readonly avgDurationMs: number | null;
  readonly medianDurationMs: number | null;
  readonly maxDurationMs: number | null;
  readonly missingDurationCount: number;
  readonly retryCount: number;
  readonly reviewLoopCount: number;
  readonly recoveryLoopCount: number;
  readonly successfulCommandCount: number;
  readonly failedCommandCount: number;
  readonly timedOutCommandCount: number;
  readonly cancelledCommandCount: number;
  readonly unknownOutcomeCount: number;
  readonly timeoutCount: number;
  readonly findingsCount: number | null;
  readonly findingsUnavailable: boolean;
}

export interface GroupedMetricsRow {
  readonly groupKey: string;
  readonly groupLabel: string;
  readonly groupDimension: MetricsGroupDimension;
  readonly invocationCount: number;
  readonly totalDurationMs: number | null;
  readonly avgDurationMs: number | null;
  readonly medianDurationMs: number | null;
  readonly maxDurationMs: number | null;
  readonly missingDurationCount: number;
  readonly retryCount: number;
  readonly reviewLoopCount: number;
  readonly recoveryLoopCount: number;
  readonly repeatedReviewAttempt: boolean;
  readonly repeatedRecoveryLoop: boolean;
  readonly successfulCount: number;
  readonly failedCount: number;
  readonly timedOutCount: number;
  readonly cancelledCount: number;
  readonly unknownOutcomeCount: number;
  readonly timeoutCount: number;
  readonly findingsCount: number | null;
}

export interface OutlierRow {
  readonly groupKey: string;
  readonly groupLabel: string;
  readonly groupDimension: MetricsGroupDimension;
  readonly durationMs: number | null;
  readonly threshold: string;
  readonly isOutlier: boolean;
  readonly rank: number;
}

export interface ModelComparisonRow {
  readonly model: string;
  readonly provider: string | null;
  readonly totalInvocations: number;
  readonly totalDurationMs: number | null;
  readonly avgDurationMs: number | null;
  readonly retryCount: number;
  readonly recoveryLoopCount: number;
  readonly failedCount: number;
  readonly timedOutCount: number;
  readonly findingsCount: number | null;
}

export interface PartialDataSummary {
  readonly missingDurationCount: number;
  readonly missingModelCount: number;
  readonly missingStatusCount: number;
  readonly unknownOutcomeCount: number;
  readonly findingsUnavailable: boolean;
}

export interface RunMetricsResponse {
  readonly projectId: string;
  readonly cardKey?: string;
  readonly totals: MetricsTotals;
  readonly grouped: readonly GroupedMetricsRow[];
  readonly outliers: readonly OutlierRow[];
  readonly modelComparisons: readonly ModelComparisonRow[];
  readonly partialData: PartialDataSummary;
}
