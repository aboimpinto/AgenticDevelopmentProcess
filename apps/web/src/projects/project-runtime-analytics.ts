import { buildFeatureTimingAnalytics, buildPortfolioTimingAnalytics, formatDuration } from "@hepha/shared";
import type { ProjectSummary, WorkItemCard } from "@hepha/shared";

export function getProjectFeatureCount(project: ProjectSummary) {
  return (
    project.counts["01_SUBMITTED"] +
    project.counts["02_READY_TO_DEVELOP"] +
    project.counts["03_IN_PROGRESS"] +
    project.counts["04_COMPLETED"] +
    project.counts["05_CANCELLED"]
  );
}

export function getProjectOpenFeatureCount(project: ProjectSummary) {
  return (
    project.counts["01_SUBMITTED"] +
    project.counts["02_READY_TO_DEVELOP"] +
    project.counts["03_IN_PROGRESS"]
  );
}

export function calculateProjectRuntimeStats(workItems: WorkItemCard[]) {
  const epics = workItems.filter((item) => item.kind === "epic");
  const features = workItems.filter((item) => item.kind === "feature");
  const phaseDurations: number[] = [];
  const featureImplementationDurations: number[] = [];
  const portfolioTiming = buildPortfolioTimingAnalytics(features);

  let activeRuns = 0;
  let blockedOrFailedPhases = 0;
  let completedPhaseRuns = 0;
  let completedFeatureImplementations = 0;
  let openFindings = 0;

  for (const feature of features) {
    const workflow = feature.featureWorkflow;

    if (!workflow) {
      continue;
    }

    if (workflow.activeRun) {
      activeRuns += 1;
    }

    openFindings += workflow.findings.filter((finding) => finding.status !== "closed").length;

    for (const phase of workflow.implementationPhases) {
      if (phase.status === "blocked" || phase.status === "failed") {
        blockedOrFailedPhases += 1;
      }

      const duration = getCompletedDurationMs(phase.startedAt, phase.completedAt);

      if (duration !== null) {
        phaseDurations.push(duration);
        completedPhaseRuns += 1;
      }
    }

    const implementationDuration = workflow.implementationCompleted
      ? buildFeatureTimingAnalytics(feature.phases, workflow.implementationAgentRuns ?? []).actualAiDurationMs
      : null;

    if (implementationDuration !== null) {
      featureImplementationDurations.push(implementationDuration);
      completedFeatureImplementations += 1;
    }
  }

  return {
    activeRuns,
    averageFeatureImplementationDurationMs: averageDuration(featureImplementationDurations),
    averagePhaseDurationMs: averageDuration(phaseDurations),
    blockedOrFailedPhases,
    completedFeatureImplementations,
    completedPhaseRuns,
    epicsNeedingValidation: epics.filter((item) => item.validation.needsValidationCount > 0).length,
    itemsNeedingValidation: workItems.filter((item) => item.validation.needsValidationCount > 0).length,
    openFindings,
    estimatedHumanTimeSavedMs: portfolioTiming.estimatedHumanTimeSavedMidpointMs,
    humanAccelerationMidpoint: portfolioTiming.humanAccelerationMidpoint,
    timingSampleCount: portfolioTiming.comparableFeatureCount,
  };
}

function getCompletedDurationMs(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) {
    return null;
  }

  const started = new Date(startedAt).getTime();
  const completed = new Date(completedAt).getTime();

  if (!Number.isFinite(started) || !Number.isFinite(completed)) {
    return null;
  }

  return Math.max(0, completed - started);
}

function averageDuration(durations: number[]) {
  if (durations.length === 0) {
    return null;
  }

  return Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length);
}

export function formatNullableDuration(durationMs: number | null) {
  return durationMs === null ? "-" : formatDuration(durationMs);
}

export function formatDurationGain(durationMs: number | null) {
  if (durationMs === null) return "-";
  return durationMs >= 0
    ? formatDuration(durationMs)
    : `-${formatDuration(Math.abs(durationMs))}`;
}
