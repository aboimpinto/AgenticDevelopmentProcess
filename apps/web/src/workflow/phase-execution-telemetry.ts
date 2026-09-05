import type {
  ImplementationAgentRunSummary,
  ImplementationPhaseRunSummary,
  PhaseSummary,
} from "@hepha/shared";

interface PhaseExecutionTelemetry {
  readonly actualDurationMs: number | null;
  readonly agentRuns: readonly ImplementationAgentRunSummary[];
  readonly latestAgentRun: ImplementationAgentRunSummary | null;
}

/**
 * Projects phase-scoped AI execution without turning telemetry into lifecycle
 * authority. Explicit phase identities win. Compatibility runs that predate
 * phase identity are reconciled only from durable artifact timestamps.
 */
export function buildPhaseExecutionTelemetry(
  phases: readonly (PhaseSummary & { number: number })[],
  implementationPhases: readonly ImplementationPhaseRunSummary[],
  implementationAgentRuns: readonly ImplementationAgentRunSummary[],
  refineCompletedAt: string | null,
): ReadonlyMap<number, PhaseExecutionTelemetry> {
  const phaseAgentRuns = attributeAgentRunsToPhases(phases, implementationAgentRuns, refineCompletedAt);
  return new Map(phases.map((phase) => {
    const agentRuns = phaseAgentRuns.get(phase.number) ?? [];
    return [phase.number, {
      actualDurationMs: phaseActualDurationMs(implementationPhases, agentRuns, phase.number),
      agentRuns,
      latestAgentRun: latestAgentRun(agentRuns),
    }];
  }));
}

export function completedDurationMs(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return null;
  const duration = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function phaseActualDurationMs(
  implementationPhases: readonly ImplementationPhaseRunSummary[],
  agentRuns: readonly ImplementationAgentRunSummary[],
  phaseNumber: number,
) {
  // Agent runs are the complete AI-execution ledger and include continuation,
  // review, and recovery attempts. Older records predate that ledger, so phase
  // run timing remains a compatibility fallback rather than being double-counted.
  const agentDurations = agentRuns
    .map((attempt) => completedDurationMs(attempt.startedAt, attempt.completedAt))
    .filter((duration): duration is number => duration !== null);
  if (agentDurations.length > 0) return agentDurations.reduce((total, duration) => total + duration, 0);

  const phaseDurations = implementationPhases
    .filter((attempt) => attempt.phaseNumber === phaseNumber)
    .map((attempt) => completedDurationMs(attempt.startedAt, attempt.completedAt))
    .filter((duration): duration is number => duration !== null);
  return phaseDurations.length > 0 ? phaseDurations.reduce((total, duration) => total + duration, 0) : null;
}

function attributeAgentRunsToPhases(
  phases: readonly (PhaseSummary & { number: number })[],
  agentRuns: readonly ImplementationAgentRunSummary[],
  refineCompletedAt: string | null,
): ReadonlyMap<number, readonly ImplementationAgentRunSummary[]> {
  const attributed = new Map<number, ImplementationAgentRunSummary[]>();
  const phaseNumbers = new Set(phases.map((phase) => phase.number));
  const refinementBoundary = refineCompletedAt ? Date.parse(refineCompletedAt) : Number.NaN;

  for (const run of agentRuns) {
    if (isMcpImplementationRun(run, refinementBoundary)) {
      for (const segment of splitMcpRunAcrossPhases(run, phases)) add(attributed, segment.phaseNumber, segment.run);
      continue;
    }
    if (run.phaseNumber !== null && phaseNumbers.has(run.phaseNumber)) add(attributed, run.phaseNumber, run);
  }
  return attributed;
}

function add(
  attributed: Map<number, ImplementationAgentRunSummary[]>,
  phaseNumber: number,
  run: ImplementationAgentRunSummary,
) {
  const runs = attributed.get(phaseNumber) ?? [];
  runs.push(run);
  attributed.set(phaseNumber, runs);
}

function isMcpImplementationRun(run: ImplementationAgentRunSummary, refinementBoundary: number) {
  const startedAt = Date.parse(run.startedAt);
  return run.agentRole === "devcycle-mcp-compatibility"
    && run.completedAt !== null
    && Number.isFinite(refinementBoundary)
    && Number.isFinite(startedAt)
    && startedAt >= refinementBoundary;
}

function splitMcpRunAcrossPhases(
  run: ImplementationAgentRunSummary,
  phases: readonly (PhaseSummary & { number: number })[],
): readonly { readonly phaseNumber: number; readonly run: ImplementationAgentRunSummary }[] {
  const startedAt = Date.parse(run.startedAt);
  const completedAt = Date.parse(run.completedAt ?? "");
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) return [];

  const explicitIndex = run.phaseNumber === null ? -1 : phases.findIndex((phase) => phase.number === run.phaseNumber);
  // Pre-fix MCP records have no phase identity. The first phase artifact
  // changed after dispatch is the narrowest durable starting-phase evidence.
  const startIndex = explicitIndex >= 0
    ? explicitIndex
    : phases.findIndex((phase) => {
      const phaseUpdatedAt = Date.parse(phase.updatedAt);
      return Number.isFinite(phaseUpdatedAt) && phaseUpdatedAt >= startedAt;
    });
  if (startIndex < 0) return [];

  const segments: Array<{ phaseNumber: number; run: ImplementationAgentRunSummary }> = [];
  let cursor = startedAt;
  for (let index = startIndex; index < phases.length && cursor < completedAt; index += 1) {
    const phase = phases[index];
    const artifactBoundary = Date.parse(phase.updatedAt);
    const segmentEnd = Number.isFinite(artifactBoundary) && artifactBoundary > cursor && artifactBoundary < completedAt
      ? artifactBoundary
      : completedAt;
    segments.push({
      phaseNumber: phase.number,
      run: {
        ...run,
        completedAt: new Date(segmentEnd).toISOString(),
        id: `${run.id}:phase:${phase.number}`,
        phaseNumber: phase.number,
        phaseTitle: phase.title,
        startedAt: new Date(cursor).toISOString(),
      },
    });
    cursor = segmentEnd;
  }
  return segments;
}

function latestAgentRun(runs: readonly ImplementationAgentRunSummary[]) {
  if (runs.length === 0) return null;
  return runs.reduce((latest, candidate) =>
    Date.parse(candidate.updatedAt) > Date.parse(latest.updatedAt) ? candidate : latest,
  );
}
