import type {
  ImplementationAgentRunSummary,
  PhaseSummary,
  WorkItemCard,
} from "@hepha/shared";
import {
  buildFeatureTimingAnalytics,
  formatDuration,
  formatEffortEstimateRange,
} from "@hepha/shared";

export interface HistoricalTimingCandidate {
  readonly externalId: string;
  readonly title: string;
  readonly stateFolder: string;
  readonly phases: readonly PhaseSummary[];
  readonly implementationCompleted: boolean;
  readonly implementationAgentRuns: readonly ImplementationAgentRunSummary[];
}

export interface EstimationCalibrationSample {
  readonly featureId: string;
  readonly title: string;
  readonly phaseCount: number;
  readonly humanEstimate: string;
  readonly aiEstimate: string;
  readonly actualAiDuration: string;
  readonly actualToAiEstimateRatio: number;
  readonly aiMidpointErrorPercent: number;
  readonly agentRunCount: number;
  readonly recoveryRunCount: number;
  readonly models: readonly string[];
}

export interface EstimationCalibrationEvidence {
  readonly samples: readonly EstimationCalibrationSample[];
  readonly medianActualToAiEstimateRatio: number | null;
  readonly meanAbsoluteAiPredictionErrorPercent: number | null;
}

export function toHistoricalTimingCandidate(item: WorkItemCard): HistoricalTimingCandidate {
  return {
    externalId: item.externalId,
    title: item.title,
    stateFolder: item.stateFolder,
    phases: item.phases,
    implementationCompleted: item.featureWorkflow?.implementationCompleted ?? false,
    implementationAgentRuns: item.featureWorkflow?.implementationAgentRuns ?? [],
  };
}

export function buildEstimationCalibrationEvidence(
  candidates: readonly HistoricalTimingCandidate[],
  targetFeatureId: string,
  sampleLimit = 8,
): EstimationCalibrationEvidence {
  const samples = candidates
    .filter((candidate) => candidate.externalId !== targetFeatureId)
    .filter((candidate) => candidate.stateFolder === "04_COMPLETED" && candidate.implementationCompleted)
    .map(toCalibrationSample)
    .filter((sample): sample is EstimationCalibrationSample => sample !== null)
    .slice(-sampleLimit);
  const ratios = samples.map((sample) => sample.actualToAiEstimateRatio).sort((left, right) => left - right);

  return {
    samples,
    medianActualToAiEstimateRatio: ratios.length > 0 ? median(ratios) : null,
    meanAbsoluteAiPredictionErrorPercent: samples.length > 0
      ? samples.reduce((total, sample) => total + Math.abs(sample.aiMidpointErrorPercent), 0) / samples.length
      : null,
  };
}

export function formatEstimationCalibrationContext(evidence: EstimationCalibrationEvidence): string {
  if (evidence.samples.length === 0) {
    return "No comparable completed FEAT timing samples are available. Estimate from scope and explicitly state uncertainty.";
  }

  return [
    `Comparable completed FEAT samples: ${evidence.samples.length}.`,
    `Median actual/predicted-AI midpoint ratio: ${evidence.medianActualToAiEstimateRatio!.toFixed(2)}x.`,
    `Mean absolute AI prediction error: ${evidence.meanAbsoluteAiPredictionErrorPercent!.toFixed(0)}%.`,
    ...evidence.samples.map((sample) =>
      `- ${sample.featureId} (${sample.phaseCount} phases, ${sample.agentRunCount} agent runs, ${sample.recoveryRunCount} recovery/review runs): AI ${sample.aiEstimate}; actual ${sample.actualAiDuration}; ratio ${sample.actualToAiEstimateRatio.toFixed(2)}x; human ${sample.humanEstimate}; models ${sample.models.join(", ") || "unknown"}.`,
    ),
  ].join("\n");
}

export function buildSafeEstimationCalibrationContext(
  candidates: readonly HistoricalTimingCandidate[],
  targetFeatureId: string,
  sampleLimit = 8,
): string {
  try {
    return formatEstimationCalibrationContext(
      buildEstimationCalibrationEvidence(candidates, targetFeatureId, sampleLimit),
    );
  } catch {
    return [
      "Historical estimation calibration is unavailable for this run.",
      "Estimate from the current FEAT scope and explicitly state uncertainty.",
      "Calibration is advisory and its absence must not block Start Feature.",
    ].join(" ");
  }
}

export function formatFeatureEstimationRetrospective(candidate: HistoricalTimingCandidate): string {
  const analytics = buildFeatureTimingAnalytics(candidate.phases, candidate.implementationAgentRuns);
  if (!analytics.aiEstimate || !analytics.humanEstimate || analytics.actualAiDurationMs === null) {
    return "Deterministic estimation retrospective unavailable: estimates or completed agent timing are incomplete.";
  }

  const boundary = analytics.aiBoundaryDeltaMs === null
    ? "unavailable"
    : analytics.aiEstimateAssessment === "within"
      ? "within the original AI range"
      : `${formatDuration(Math.abs(analytics.aiBoundaryDeltaMs))} ${analytics.aiEstimateAssessment === "under" ? "faster" : "slower"} than the original AI range`;

  return [
    `Original human estimate: ${formatEffortEstimateRange(analytics.humanEstimate)}.`,
    `Original AI estimate: ${formatEffortEstimateRange(analytics.aiEstimate)}.`,
    `Actual AI execution: ${formatDuration(analytics.actualAiDurationMs)}.`,
    `Prediction result: ${boundary}; midpoint error ${analytics.aiMidpointErrorPercent!.toFixed(0)}%.`,
    `Estimated human-time comparison at midpoint: ${formatHumanTimeComparison(analytics.estimatedHumanTimeSavedMidpointMs)}.`,
    "These values are deterministic evidence. Any explanation of why the estimate differed must be labelled as analysis, not measurement.",
  ].join("\n");
}

export function formatFeatureEstimationRetrospectiveSafely(
  candidate: HistoricalTimingCandidate,
): string {
  try {
    return formatFeatureEstimationRetrospective(candidate);
  } catch {
    return [
      "Deterministic estimation retrospective unavailable because timing evidence could not be read.",
      "This optional retrospective must not block Complete Feature.",
    ].join(" ");
  }
}

function formatHumanTimeComparison(durationMs: number | null) {
  if (durationMs === null) return "unavailable";
  return durationMs >= 0
    ? `${formatDuration(durationMs)} saved`
    : `${formatDuration(Math.abs(durationMs))} over the human estimate`;
}

function toCalibrationSample(candidate: HistoricalTimingCandidate): EstimationCalibrationSample | null {
  const analytics = buildFeatureTimingAnalytics(candidate.phases, candidate.implementationAgentRuns);
  if (
    !analytics.aiEstimate ||
    !analytics.humanEstimate ||
    analytics.actualAiDurationMs === null ||
    analytics.actualToAiEstimateRatio === null ||
    analytics.aiMidpointErrorPercent === null
  ) return null;

  return {
    featureId: candidate.externalId,
    title: candidate.title,
    phaseCount: candidate.phases.filter((phase) => phase.number !== null).length,
    humanEstimate: formatEffortEstimateRange(analytics.humanEstimate)!,
    aiEstimate: formatEffortEstimateRange(analytics.aiEstimate)!,
    actualAiDuration: formatDuration(analytics.actualAiDurationMs),
    actualToAiEstimateRatio: analytics.actualToAiEstimateRatio,
    aiMidpointErrorPercent: analytics.aiMidpointErrorPercent,
    agentRunCount: candidate.implementationAgentRuns.length,
    recoveryRunCount: candidate.implementationAgentRuns.filter((run) =>
      /review|repair|recovery|fix/i.test(run.agentRole),
    ).length,
    models: [...new Set(candidate.implementationAgentRuns.map((run) => run.model).filter(Boolean))].sort(),
  };
}

function median(values: readonly number[]) {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1]! + values[middle]!) / 2
    : values[middle]!;
}
