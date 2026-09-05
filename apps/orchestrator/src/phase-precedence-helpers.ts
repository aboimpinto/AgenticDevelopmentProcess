/**
 * FEAT-035: Phase Precedence Helpers — Pure Precedence Resolution
 *
 * Resolves phase status using the documented precedence:
 * 1. Durable phase lifecycle events
 * 2. Phase document status
 * 3. Card metadata
 * 4. FeatureTasks.md planning rows
 *
 * All functions are deterministic and side-effect free:
 * - No filesystem access
 * - No database writes
 * - No process spawning
 * - No mutable module state
 * - No implicit clock reads
 */

import type {
  PhaseLifecycleStatus,
  PhaseLifecycleEventType,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A phase lifecycle event as consumed by the precedence resolver.
 */
export interface PhaseLifecycleEventInput {
  /** ISO 8601 timestamp of when the event occurred. */
  readonly occurredAt: string;
  /** Phase number this event refers to. */
  readonly phaseNumber: number;
  /** Phase lifecycle event type. */
  readonly eventType: PhaseLifecycleEventType;
  /** Phase status string if provided by the event. */
  readonly phaseStatus?: string;
}

/**
 * Input to the precedence resolver for one phase.
 */
export interface ResolvePhaseStatusInput {
  /** Phase number to resolve. */
  readonly phaseNumber: number;
  /** Durable phase lifecycle events for this FEAT (all phases). */
  readonly durableEvents: readonly PhaseLifecycleEventInput[];
  /** Status parsed from the phase Markdown document (e.g., "COMPLETED", "PENDING"). */
  readonly phaseDocumentStatus: string | null;
  /** Status from ImplementationPhaseRunSummary (orchestrator workflow record). */
  readonly implementationPhaseStatus: string | null;
  /** Card metadata phase status string, if any. */
  readonly cardMetadataStatus: string | null;
  /** Status from FeatureTasks.md planning row, if any. */
  readonly featureTasksStatus: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a raw phase status string to the canonical PhaseLifecycleStatus.
 *
 * Handles both uppercase (COMPLETED) and title-case (Completed) inputs,
 * plus any known variations from phase documents or metadata.
 */
export function normalizePhaseStatus(raw: string | null): PhaseLifecycleStatus {
  if (!raw) {
    return "unknown";
  }

  const upper = raw.trim().toUpperCase().replace(/\s+/g, "_");

  switch (upper) {
    case "COMPLETED":
    case "COMPLETE":
      return "completed";
    case "PENDING":
    case "NOT_STARTED":
      return "pending";
    case "IN_PROGRESS":
    case "IN PROGRESS":
    case "IN-PROGRESS":
      return "in-progress";
    case "SKIPPED":
    case "N/A":
      return "skipped";
    case "BLOCKED":
    case "BLOCKER":
      return "blocked";
    case "FAILED":
    case "FAILURE":
      return "failed";
    case "CHECKPOINT_IN_PROGRESS":
    case "AWAITING_REVIEW":
    case "CODE_REVIEW_IN_PROGRESS":
    case "AWAITING_USER_ACCEPTANCE":
      return "in-progress";
    default:
      return "unknown";
  }
}

/**
 * Map a phase lifecycle event type to a canonical PhaseLifecycleStatus.
 */
export function mapEventTypeToStatus(
  eventType: PhaseLifecycleEventType,
): PhaseLifecycleStatus {
  switch (eventType) {
    case "phase.started":
      return "in-progress";
    case "phase.completed":
      return "completed";
    case "phase.skipped":
      return "skipped";
    case "phase.blocked":
      return "blocked";
    case "phase.failed":
      return "failed";
    case "phase.quality-gate-opened":
    case "phase.quality-gate-resolved":
      return "in-progress";
    default:
      return "unknown";
  }
}

/**
 * Get the most recent phase lifecycle event for a specific phase number.
 * Events are ordered by occurredAt (newest first).
 */
export function getMostRecentLifecycleEvent(
  phaseNumber: number,
  events: readonly PhaseLifecycleEventInput[],
): PhaseLifecycleEventInput | null {
  const matches = events
    .filter((e) => e.phaseNumber === phaseNumber)
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

  return matches[0] ?? null;
}

/**
 * Resolve phase status using the documented precedence:
 *
 * 1. Durable phase lifecycle events (most recent for this phase number)
 * 2. Phase document status (extractPhaseStatus from Markdown)
 * 3. Card metadata
 * 4. FeatureTasks.md planning rows
 *
 * @returns The resolved PhaseLifecycleStatus string.
 */
export function resolvePhaseStatus(
  input: ResolvePhaseStatusInput,
): PhaseLifecycleStatus {
  const { phaseNumber, durableEvents } = input;

  // Precedence 1: Durable phase lifecycle events
  const latestEvent = getMostRecentLifecycleEvent(phaseNumber, durableEvents);
  if (latestEvent) {
    // Prefer the event's explicit phaseStatus if available
    if (latestEvent.phaseStatus) {
      return normalizePhaseStatus(latestEvent.phaseStatus);
    }
    // Otherwise map the event type
    return mapEventTypeToStatus(latestEvent.eventType);
  }

  // Precedence 2: Phase document status
  if (input.phaseDocumentStatus) {
    return normalizePhaseStatus(input.phaseDocumentStatus);
  }

  // Precedence 3: Implementation phase run status (orchestrator workflow record)
  if (input.implementationPhaseStatus) {
    return normalizePhaseStatus(input.implementationPhaseStatus);
  }

  // Precedence 4: Card metadata
  if (input.cardMetadataStatus) {
    return normalizePhaseStatus(input.cardMetadataStatus);
  }

  // Precedence 5: FeatureTasks.md planning rows
  if (input.featureTasksStatus) {
    return normalizePhaseStatus(input.featureTasksStatus);
  }

  return "unknown";
}
