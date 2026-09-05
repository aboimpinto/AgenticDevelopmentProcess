import type {
  ImplementationAgentRunSummary,
  PhaseSummary,
  WorkItemCard,
} from "./index.js";

export interface EffortEstimateRange {
  readonly minimumMs: number;
  readonly maximumMs: number;
  readonly midpointMs: number;
}

export type AiEstimateAssessment = "under" | "within" | "over";

export interface FeatureTimingAnalytics {
  readonly humanEstimate: EffortEstimateRange | null;
  readonly aiEstimate: EffortEstimateRange | null;
  readonly actualAiDurationMs: number | null;
  readonly aiEstimateAssessment: AiEstimateAssessment | null;
  /** Signed distance from the nearest range boundary; zero when in range. */
  readonly aiBoundaryDeltaMs: number | null;
  /** Signed error against the original estimate midpoint. */
  readonly aiMidpointErrorPercent: number | null;
  readonly estimatedHumanTimeSavedMinimumMs: number | null;
  readonly estimatedHumanTimeSavedMaximumMs: number | null;
  readonly estimatedHumanTimeSavedMidpointMs: number | null;
  readonly humanAccelerationMidpoint: number | null;
  readonly actualToAiEstimateRatio: number | null;
}

export interface PortfolioTimingAnalytics {
  readonly featureCount: number;
  readonly comparableFeatureCount: number;
  readonly totalHumanEstimate: EffortEstimateRange | null;
  readonly totalAiEstimate: EffortEstimateRange | null;
  readonly totalActualAiDurationMs: number | null;
  readonly estimatedHumanTimeSavedMinimumMs: number | null;
  readonly estimatedHumanTimeSavedMaximumMs: number | null;
  readonly estimatedHumanTimeSavedMidpointMs: number | null;
  readonly humanAccelerationMidpoint: number | null;
  readonly medianActualToAiEstimateRatio: number | null;
  readonly meanAbsoluteAiPredictionErrorPercent: number | null;
}

/**
 * Parse compact estimates written by Start Feature and their rendered form.
 * Supports `30m`, `1.5h`, `2-3h`, `30m-1h`, and `1h 30m–2h 15m`.
 */
export function parseEffortEstimate(value: string | null | undefined): EffortEstimateRange | null {
  if (!value?.trim()) return null;

  const rangeParts = value.trim().split(/\s*[-–—]\s*/);
  if (rangeParts.length > 2) return null;

  const inferredUnit = rangeParts
    .map((part) => /(?:d|h|m)\s*$/i.exec(part)?.[0]?.trim().toLowerCase())
    .find(Boolean) ?? null;
  const minimumMs = parseEffortDuration(rangeParts[0]!, inferredUnit);
  const maximumMs = parseEffortDuration(rangeParts[1] ?? rangeParts[0]!, inferredUnit);

  if (minimumMs === null || maximumMs === null || minimumMs > maximumMs) return null;

  return {
    minimumMs,
    maximumMs,
    midpointMs: (minimumMs + maximumMs) / 2,
  };
}

export function aggregateEffortEstimates(
  values: readonly (string | null | undefined)[],
): EffortEstimateRange | null {
  if (values.length === 0) return null;

  const ranges = values.map(parseEffortEstimate);
  if (ranges.some((range) => range === null)) return null;

  return sumEstimateRanges(ranges as EffortEstimateRange[]);
}

export function formatEffortEstimateRange(range: EffortEstimateRange | null): string | null {
  if (!range) return null;

  const minimum = formatEffortDuration(range.minimumMs);
  const maximum = formatEffortDuration(range.maximumMs);
  return range.minimumMs === range.maximumMs ? minimum : `${minimum}–${maximum}`;
}

export function buildFeatureTimingAnalytics(
  phases: readonly PhaseSummary[],
  implementationAgentRuns: readonly ImplementationAgentRunSummary[] = [],
): FeatureTimingAnalytics {
  const numberedPhases = phases.filter((phase) => phase.number !== null && !isSkippedPhase(phase.status));
  const humanEstimate = aggregateEffortEstimates(numberedPhases.map((phase) => phase.estimatedHumanTime));
  const aiEstimate = aggregateEffortEstimates(numberedPhases.map((phase) => phase.estimatedAiTime));
  const completedDurations = implementationAgentRuns
    .map(getCompletedAgentRunDurationMs)
    .filter((duration): duration is number => duration !== null);
  const actualAiDurationMs = completedDurations.length > 0
    ? completedDurations.reduce((total, duration) => total + duration, 0)
    : null;

  return deriveTimingAnalytics(humanEstimate, aiEstimate, actualAiDurationMs);
}

export function buildTimingAnalyticsFromEstimates(
  humanEstimate: string | null | undefined,
  aiEstimate: string | null | undefined,
  actualAiDurationMs: number | null,
): FeatureTimingAnalytics {
  return deriveTimingAnalytics(
    parseEffortEstimate(humanEstimate),
    parseEffortEstimate(aiEstimate),
    actualAiDurationMs,
  );
}

/**
 * Aggregate completed, comparable FEATs. In-progress or estimate-incomplete
 * work is deliberately excluded from prediction feedback and gain claims.
 */
export function buildPortfolioTimingAnalytics(
  features: readonly WorkItemCard[],
): PortfolioTimingAnalytics {
  const featureItems = features.filter((item) => item.kind === "feature");
  const comparable = featureItems
    .filter((item) => item.featureWorkflow?.implementationCompleted)
    .map((item) => buildFeatureTimingAnalytics(item.phases, item.featureWorkflow?.implementationAgentRuns ?? []))
    .filter((analytics) =>
      analytics.actualAiDurationMs !== null &&
      analytics.humanEstimate !== null &&
      analytics.aiEstimate !== null,
    );

  if (comparable.length === 0) {
    return {
      featureCount: featureItems.length,
      comparableFeatureCount: 0,
      totalHumanEstimate: null,
      totalAiEstimate: null,
      totalActualAiDurationMs: null,
      estimatedHumanTimeSavedMinimumMs: null,
      estimatedHumanTimeSavedMaximumMs: null,
      estimatedHumanTimeSavedMidpointMs: null,
      humanAccelerationMidpoint: null,
      medianActualToAiEstimateRatio: null,
      meanAbsoluteAiPredictionErrorPercent: null,
    };
  }

  const totalHumanEstimate = sumEstimateRanges(comparable.map((item) => item.humanEstimate!));
  const totalAiEstimate = sumEstimateRanges(comparable.map((item) => item.aiEstimate!));
  const totalActualAiDurationMs = comparable.reduce((total, item) => total + item.actualAiDurationMs!, 0);
  const ratios = comparable.map((item) => item.actualToAiEstimateRatio!).sort((left, right) => left - right);
  const absoluteErrors = comparable.map((item) => Math.abs(item.aiMidpointErrorPercent!));
  const derived = deriveTimingAnalytics(totalHumanEstimate, totalAiEstimate, totalActualAiDurationMs);

  return {
    featureCount: featureItems.length,
    comparableFeatureCount: comparable.length,
    totalHumanEstimate,
    totalAiEstimate,
    totalActualAiDurationMs,
    estimatedHumanTimeSavedMinimumMs: derived.estimatedHumanTimeSavedMinimumMs,
    estimatedHumanTimeSavedMaximumMs: derived.estimatedHumanTimeSavedMaximumMs,
    estimatedHumanTimeSavedMidpointMs: derived.estimatedHumanTimeSavedMidpointMs,
    humanAccelerationMidpoint: derived.humanAccelerationMidpoint,
    medianActualToAiEstimateRatio: median(ratios),
    meanAbsoluteAiPredictionErrorPercent:
      absoluteErrors.reduce((total, error) => total + error, 0) / absoluteErrors.length,
  };
}

function deriveTimingAnalytics(
  humanEstimate: EffortEstimateRange | null,
  aiEstimate: EffortEstimateRange | null,
  actualAiDurationMs: number | null,
): FeatureTimingAnalytics {
  let aiEstimateAssessment: AiEstimateAssessment | null = null;
  let aiBoundaryDeltaMs: number | null = null;

  if (aiEstimate && actualAiDurationMs !== null) {
    if (actualAiDurationMs < aiEstimate.minimumMs) {
      aiEstimateAssessment = "under";
      aiBoundaryDeltaMs = actualAiDurationMs - aiEstimate.minimumMs;
    } else if (actualAiDurationMs > aiEstimate.maximumMs) {
      aiEstimateAssessment = "over";
      aiBoundaryDeltaMs = actualAiDurationMs - aiEstimate.maximumMs;
    } else {
      aiEstimateAssessment = "within";
      aiBoundaryDeltaMs = 0;
    }
  }

  return {
    humanEstimate,
    aiEstimate,
    actualAiDurationMs,
    aiEstimateAssessment,
    aiBoundaryDeltaMs,
    aiMidpointErrorPercent:
      aiEstimate && actualAiDurationMs !== null && aiEstimate.midpointMs > 0
        ? ((actualAiDurationMs - aiEstimate.midpointMs) / aiEstimate.midpointMs) * 100
        : null,
    estimatedHumanTimeSavedMinimumMs:
      humanEstimate && actualAiDurationMs !== null
        ? humanEstimate.minimumMs - actualAiDurationMs
        : null,
    estimatedHumanTimeSavedMaximumMs:
      humanEstimate && actualAiDurationMs !== null
        ? humanEstimate.maximumMs - actualAiDurationMs
        : null,
    estimatedHumanTimeSavedMidpointMs:
      humanEstimate && actualAiDurationMs !== null
        ? humanEstimate.midpointMs - actualAiDurationMs
        : null,
    humanAccelerationMidpoint:
      humanEstimate && actualAiDurationMs !== null && actualAiDurationMs > 0
        ? humanEstimate.midpointMs / actualAiDurationMs
        : null,
    actualToAiEstimateRatio:
      aiEstimate && actualAiDurationMs !== null && aiEstimate.midpointMs > 0
        ? actualAiDurationMs / aiEstimate.midpointMs
        : null,
  };
}

function parseEffortDuration(value: string, inferredUnit: string | null): number | null {
  const normalized = /^\d+(?:\.\d+)?$/.test(value.trim()) && inferredUnit
    ? `${value.trim()}${inferredUnit}`
    : value.trim();
  const tokenPattern = /(\d+(?:\.\d+)?)\s*(d|h|m)/gi;
  let totalMinutes = 0;
  let tokenCount = 0;

  for (const match of normalized.matchAll(tokenPattern)) {
    tokenCount += 1;
    const amount = Number(match[1]);
    const unit = match[2]!.toLowerCase();
    totalMinutes += amount * (unit === "d" ? 24 * 60 : unit === "h" ? 60 : 1);
  }

  if (tokenCount === 0 || normalized.replace(tokenPattern, "").trim().length > 0) return null;
  return Math.round(totalMinutes * 60_000);
}

function formatEffortDuration(durationMs: number) {
  const totalMinutes = Math.round(durationMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

function sumEstimateRanges(ranges: readonly EffortEstimateRange[]): EffortEstimateRange {
  const minimumMs = ranges.reduce((total, range) => total + range.minimumMs, 0);
  const maximumMs = ranges.reduce((total, range) => total + range.maximumMs, 0);
  return { minimumMs, maximumMs, midpointMs: (minimumMs + maximumMs) / 2 };
}

function getCompletedAgentRunDurationMs(run: ImplementationAgentRunSummary) {
  if (!run.completedAt) return null;
  const duration = Date.parse(run.completedAt) - Date.parse(run.startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function isSkippedPhase(status: string) {
  return /^(skipped|n\/a)$/i.test(status.trim());
}

function median(values: readonly number[]) {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1]! + values[middle]!) / 2
    : values[middle]!;
}
