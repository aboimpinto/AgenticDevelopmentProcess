/**
 * FEAT-033: Run Timeline Query Functions
 *
 * Pure read-model builders that transform stored agent invocation and
 * normalized event records into deterministic phase detail and
 * completed FEAT evidence timeline models.
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
  StoredNormalizedEvent,
  PhaseTimelineEntry,
  PhaseTimelineEventEntry,
  PhaseTimelineResult,
  FeatEvidenceInvocation,
  CompletedFeatEvidenceEntry,
  CompletedFeatTimelineResult,
  PhaseTimelineApiResponse,
  CompletedFeatTimelineApiResponse,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Phase Detail Timeline Builder
// ---------------------------------------------------------------------------

/**
 * Build a phase detail timeline result from stored invocation and event records.
 *
 * Pure function:
 * - Reads only the provided arrays (no database, filesystem, or process state).
 * - Returns deterministic results based solely on input data.
 *
 * @param projectId - Project identifier.
 * @param cardKey - Card/feature key.
 * @param phaseNumber - Phase number to build timeline for.
 * @param phaseTitle - Phase title to build timeline for.
 * @param invocations - Agent invocation records for this phase.
 * @param events - Normalized event records that may be linked to invocations.
 */
export function buildPhaseTimeline(
  projectId: string,
  cardKey: string,
  phaseNumber: number,
  phaseTitle: string,
  invocations: StoredAgentInvocation[],
  events: StoredNormalizedEvent[],
): PhaseTimelineResult {
  // Build a lookup of events by invocationId
  const eventsByInvocation = new Map<string, StoredNormalizedEvent[]>();

  for (const event of events) {
    if (!event.invocationId) continue;

    const existing = eventsByInvocation.get(event.invocationId) ?? [];
    existing.push(event);
    eventsByInvocation.set(event.invocationId, existing);
  }

  // Sort events within each invocation by timestamp
  for (const [, eventList] of eventsByInvocation) {
    eventList.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  // Build timeline entries, sorted by startedAt
  const sortedInvocations = [...invocations].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt),
  );

  const timelineEntries: PhaseTimelineEntry[] = sortedInvocations.map((inv) => {
    const invocationEvents = eventsByInvocation.get(inv.id) ?? [];

    const eventEntries: PhaseTimelineEventEntry[] = invocationEvents.map((evt) => ({
      eventId: evt.id,
      eventType: evt.eventType,
      timestamp: evt.timestamp,
      errorMessage: evt.errorMessage,
    }));

    return {
      invocationId: inv.id,
      agentRole: inv.agentRole,
      agentName: inv.agentName,
      model: inv.model,
      status: inv.status,
      startedAt: inv.startedAt,
      completedAt: inv.completedAt,
      durationMs: inv.durationMs,
      workflowNodeId: inv.workflowNodeId,
      receiptPath: inv.receiptPath,
      logPath: inv.logPath,
      reviewReportPath: inv.reviewReportPath,
      parentInvocationId: inv.parentInvocationId,
      events: eventEntries,
    };
  });

  return {
    projectId,
    cardKey,
    phaseNumber,
    phaseTitle,
    invocations: timelineEntries,
  };
}

// ---------------------------------------------------------------------------
// Completed FEAT Evidence Timeline Builder
// ---------------------------------------------------------------------------

/**
 * Build a completed FEAT evidence timeline result from stored invocation records.
 *
 * Pure function:
 * - Reads only the provided arrays (no database, filesystem, or process state).
 * - Groups invocations by workflow run for evidence context.
 *
 * @param projectId - Project identifier.
 * @param cardKey - Card/feature key.
 * @param invocations - All agent invocation records for this project/card.
 */
export function buildCompletedFeatTimeline(
  projectId: string,
  cardKey: string,
  invocations: StoredAgentInvocation[],
): CompletedFeatTimelineResult {
  // Group invocations by workflow run
  const groupedByRun = new Map<string, StoredAgentInvocation[]>();

  for (const inv of invocations) {
    const runKey = inv.workflowRunId ?? "unknown";
    const existing = groupedByRun.get(runKey) ?? [];
    existing.push(inv);
    groupedByRun.set(runKey, existing);
  }

  // Build evidence entries, sorted by run start time
  const evidenceEntries: CompletedFeatEvidenceEntry[] = [];

  for (const [runId, runInvocations] of groupedByRun) {
    // Sort invocations by startedAt
    const sorted = [...runInvocations].sort((a, b) =>
      a.startedAt.localeCompare(b.startedAt),
    );

    // Extract run-level metadata from the first invocation
    const firstInv = sorted[0]!;
    const command = firstInv.workflowCommand ?? "unknown";

    // Group by phase within the run
    const byPhase = new Map<string, StoredAgentInvocation[]>();

    for (const inv of sorted) {
      const phaseKey = `phase-${inv.phaseNumber ?? 0}-${inv.phaseTitle ?? "unknown"}`;
      const existing = byPhase.get(phaseKey) ?? [];
      existing.push(inv);
      byPhase.set(phaseKey, existing);
    }

    for (const [, phaseInvocations] of byPhase) {
      const firstPhaseInv = phaseInvocations[0]!;
      const phaseNumber = firstPhaseInv.phaseNumber ?? 0;
      const phaseTitle = firstPhaseInv.phaseTitle ?? "unknown";

      const invocationEntries: FeatEvidenceInvocation[] = phaseInvocations.map((inv) => ({
        id: inv.id,
        agentRole: inv.agentRole,
        agentName: inv.agentName,
        model: inv.model,
        status: inv.status,
        startedAt: inv.startedAt,
        completedAt: inv.completedAt,
        durationMs: inv.durationMs,
        errorMessage: inv.errorMessage,
        receiptPath: inv.receiptPath,
        reviewReportPath: inv.reviewReportPath,
        parentInvocationId: inv.parentInvocationId,
      }));

      evidenceEntries.push({
        runId,
        command,
        phaseNumber,
        phaseTitle,
        invocations: invocationEntries,
      });
    }
  }

  // Sort evidence entries by run then by phase number
  evidenceEntries.sort((a, b) => {
    const runCompare = a.runId.localeCompare(b.runId);
    if (runCompare !== 0) return runCompare;
    return a.phaseNumber - b.phaseNumber;
  });

  return {
    projectId,
    cardKey,
    evid: evidenceEntries,
  };
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

/**
 * Filter agent invocations by the provided predicate criteria.
 *
 * Pure function: operates only on the input array.
 *
 * @param invocations - Array of stored agent invocations to filter.
 * @param options - Filter criteria. Each field is optional; only present
 *   fields are matched. Undefined/null fields are ignored.
 */
export function filterInvocations(
  invocations: StoredAgentInvocation[],
  options: {
    agentRole?: string;
    agentName?: string;
    model?: string;
    status?: string;
    parentInvocationId?: string | null;
    startedAfter?: string;
    startedBefore?: string;
  },
): StoredAgentInvocation[] {
  return invocations.filter((inv) => {
    if (options.agentRole !== undefined && inv.agentRole !== options.agentRole) {
      return false;
    }

    if (options.agentName !== undefined && inv.agentName !== options.agentName) {
      return false;
    }

    if (options.model !== undefined && inv.model !== options.model) {
      return false;
    }

    if (options.status !== undefined && inv.status !== options.status) {
      return false;
    }

    if (options.parentInvocationId !== undefined) {
      if (options.parentInvocationId === null && inv.parentInvocationId !== null) {
        return false;
      }

      if (options.parentInvocationId !== null && inv.parentInvocationId !== options.parentInvocationId) {
        return false;
      }
    }

    if (options.startedAfter !== undefined && inv.startedAt < options.startedAfter) {
      return false;
    }

    if (options.startedBefore !== undefined && inv.startedAt > options.startedBefore) {
      return false;
    }

    return true;
  });
}

/**
 * Filter normalized events by the provided predicate criteria.
 *
 * Pure function: operates only on the input array.
 *
 * @param events - Array of stored normalized events to filter.
 * @param options - Filter criteria. Each field is optional; only present
 *   fields are matched.
 */
export function filterEvents(
  events: StoredNormalizedEvent[],
  options: {
    eventType?: string;
    invocationId?: string;
    startedAfter?: string;
    startedBefore?: string;
  },
): StoredNormalizedEvent[] {
  return events.filter((evt) => {
    if (options.eventType !== undefined && evt.eventType !== options.eventType) {
      return false;
    }

    if (options.invocationId !== undefined && evt.invocationId !== options.invocationId) {
      return false;
    }

    if (options.startedAfter !== undefined && evt.timestamp < options.startedAfter) {
      return false;
    }

    if (options.startedBefore !== undefined && evt.timestamp > options.startedBefore) {
      return false;
    }

    return true;
  });
}

/**
 * Compute duration in milliseconds between two ISO 8601 timestamp strings.
 * Returns null when either timestamp is missing or invalid.
 */
export function computeDurationMs(startedAt: string, completedAt: string | null): number | null {
  if (!completedAt) return null;

  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();

  if (isNaN(start) || isNaN(end)) return null;

  return end - start;
}

// ---------------------------------------------------------------------------
// Presentation Mappers — Read Model to API Response
// ---------------------------------------------------------------------------

/**
 * Map a PhaseTimelineResult read model to a PhaseTimelineApiResponse.
 * Currently a direct identity mapping since the read model already matches
 * the API response shape. Extend here when API response differs from the
 * internal read model.
 */
export function toPhaseTimelineApiResponse(
  result: PhaseTimelineResult,
): PhaseTimelineApiResponse {
  return {
    projectId: result.projectId,
    cardKey: result.cardKey,
    phaseNumber: result.phaseNumber,
    phaseTitle: result.phaseTitle,
    invocations: result.invocations,
  };
}

/**
 * Map a CompletedFeatTimelineResult read model to a CompletedFeatTimelineApiResponse.
 * Currently a direct identity mapping since the read model already matches
 * the API response shape.
 */
export function toCompletedFeatTimelineApiResponse(
  result: CompletedFeatTimelineResult,
): CompletedFeatTimelineApiResponse {
  return {
    projectId: result.projectId,
    cardKey: result.cardKey,
    evid: result.evid,
  };
}
