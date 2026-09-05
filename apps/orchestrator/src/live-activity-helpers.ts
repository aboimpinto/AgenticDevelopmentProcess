/**
 * FEAT-034: Live Activity Helpers — Pure Helper Functions
 *
 * Pure, deterministic helpers for creating live activity event envelopes,
 * cursor comparison and replay selection, deduplication, category routing,
 * and file-change coalescing.
 *
 * All functions are side-effect free:
 * - No filesystem access
 * - No database writes
 * - No process spawning
 * - No mutable module state
 * - No implicit clock reads (timestamps are caller-supplied)
 */
import type {
  LiveActivityCategory,
  LiveActivityConnectionState,
  LiveActivityEvent,
  LiveActivityStatus,
  PhaseLifecycleEventType,
  ReplayBatchPayload,
  ReplayUnavailablePayload,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Event Envelope Builders
// ---------------------------------------------------------------------------

/**
 * Build a live activity event envelope from the provided inputs.
 */
export function createLiveActivityEvent(
  id: string,
  projectId: string,
  category: LiveActivityCategory,
  type: string,
  occurredAt: string,
  summary: string,
  replayable: boolean,
  options?: {
    readonly cardId?: string;
    readonly runId?: string;
    readonly phaseNumber?: number;
    readonly phaseTitle?: string;
    readonly phaseStatus?: string;
    readonly metadata?: Record<string, unknown>;
  },
): LiveActivityEvent {
  const event: LiveActivityEvent = {
    id,
    projectId,
    category,
    type,
    occurredAt,
    summary,
    replayable,
    ...(options?.cardId !== undefined && { cardId: options.cardId }),
    ...(options?.runId !== undefined && { runId: options.runId }),
    ...(options?.phaseNumber !== undefined && { phaseNumber: options.phaseNumber }),
    ...(options?.phaseTitle !== undefined && { phaseTitle: options.phaseTitle }),
    ...(options?.phaseStatus !== undefined && { phaseStatus: options.phaseStatus }),
    ...(options?.metadata !== undefined && { metadata: options.metadata }),
  };

  return event;
}

/**
 * Build a phase lifecycle live activity event.
 */
export function createPhaseLifecycleEvent(
  id: string,
  projectId: string,
  eventType: PhaseLifecycleEventType,
  occurredAt: string,
  summary: string,
  options?: {
    readonly cardId?: string;
    readonly runId?: string;
    readonly phaseNumber?: number;
    readonly phaseTitle?: string;
    readonly phaseStatus?: string;
    readonly metadata?: Record<string, unknown>;
  },
): LiveActivityEvent {
  return createLiveActivityEvent(
    id,
    projectId,
    "phase",
    eventType,
    occurredAt,
    summary,
    true,
    options,
  );
}

/**
 * Build a best-effort (non-replayable) live activity event.
 */
export function createBestEffortEvent(
  id: string,
  projectId: string,
  category: LiveActivityCategory,
  type: string,
  occurredAt: string,
  summary: string,
  options?: {
    readonly cardId?: string;
    readonly runId?: string;
    readonly metadata?: Record<string, unknown>;
  },
): LiveActivityEvent {
  return createLiveActivityEvent(
    id,
    projectId,
    category,
    type,
    occurredAt,
    summary,
    false,
    options,
  );
}

// ---------------------------------------------------------------------------
// Cursor Comparison and Replay Selection
// ---------------------------------------------------------------------------

/**
 * Compare two event occurrences by (occurredAt, id).
 * Returns negative if a occurred before b, positive if after, 0 if equal.
 */
export function compareEventOrder(
  a: { readonly occurredAt: string; readonly id: string },
  b: { readonly occurredAt: string; readonly id: string },
): number {
  const timeCompare = a.occurredAt.localeCompare(b.occurredAt);

  if (timeCompare !== 0) {
    return timeCompare;
  }

  return a.id.localeCompare(b.id);
}

/**
 * Filter events to only those that occurred after the given cursor event.
 * Events are returned in deterministic (occurredAt, id) order.
 */
export function selectEventsAfterCursor(
  events: readonly LiveActivityEvent[],
  cursorId: string,
  cursorOccurredAt: string,
): LiveActivityEvent[] {
  return events
    .filter((event) => {
      const timeCompare = event.occurredAt.localeCompare(cursorOccurredAt);

      if (timeCompare > 0) {
        return true;
      }

      if (timeCompare === 0) {
        return event.id.localeCompare(cursorId) > 0;
      }

      return false;
    })
    .sort((a, b) => compareEventOrder(a, b));
}

/**
 * Build a replay batch payload from a set of events.
 */
export function buildReplayBatch(events: readonly LiveActivityEvent[]): ReplayBatchPayload {
  return { events: [...events] };
}

/**
 * Build a replay-unavailable payload with the given reason.
 */
export function buildReplayUnavailable(reason: string): ReplayUnavailablePayload {
  return { reason };
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Deduplicate events by id. The first occurrence of each id is kept.
 */
export function deduplicateEvents(events: readonly LiveActivityEvent[]): LiveActivityEvent[] {
  const seen = new Set<string>();
  const result: LiveActivityEvent[] = [];

  for (const event of events) {
    if (!seen.has(event.id)) {
      seen.add(event.id);
      result.push(event);
    }
  }

  return result;
}

/**
 * Check whether an event should be ignored because it belongs to a
 * different project (cross-project safety).
 */
export function filterEventsByProject(
  events: readonly LiveActivityEvent[],
  projectId: string,
): LiveActivityEvent[] {
  return events.filter((event) => event.projectId === projectId);
}

// ---------------------------------------------------------------------------
// Event Classification
// ---------------------------------------------------------------------------

/**
 * Classification result for how an event should be handled by the dashboard.
 */
export interface EventClassification {
  /** Whether this event should trigger a targeted refresh instead of full board refresh. */
  readonly isTargetedRefresh: boolean;
  /** Whether this event should trigger an attention update (polite announcement). */
  readonly isAttentionUpdate: boolean;
  /** Whether this event should update the live activity row display. */
  readonly isActivityRow: boolean;
  /** Whether this event should update the durable cursor. */
  readonly isCursorUpdate: boolean;
  /** Whether this event should be ignored entirely. */
  readonly isIgnored: boolean;
}

const ATTENTION_EVENT_TYPES = new Set<string>([
  "deep-dive.completed",
  "finding.submitted",
  "quality-gate-opened",
  "quality-gate-resolved",
  "phase.blocked",
  "phase.failed",
  "workflow.failed",
  "workflow.human-review",
]);

const ACTIVITY_ROW_EVENT_TYPES = new Set<string>([
  "workflow.started",
  "workflow.progress",
  "workflow.completed",
  "phase.started",
  "phase.completed",
  "phase.skipped",
  "phase.quality-gate-opened",
  "phase.quality-gate-resolved",
  "epic.submitted",
  "epic.completed",
  "feature.submitted",
]);

/**
 * Classify how a live activity event should be handled by the dashboard.
 */
export function classifyEvent(event: LiveActivityEvent): EventClassification {
  const isPhaseEvent = event.category === "phase";
  const isFileChange = event.category === "file-change";

  // Tool events and routine file changes are the most common and should
  // not trigger announcements or full refreshes.
  if (event.category === "tool") {
    return {
      isTargetedRefresh: false,
      isAttentionUpdate: false,
      isActivityRow: false,
      isCursorUpdate: false,
      isIgnored: true,
    };
  }

  return {
    isTargetedRefresh: isFileChange || isPhaseEvent,
    isAttentionUpdate: ATTENTION_EVENT_TYPES.has(event.type),
    isActivityRow: ACTIVITY_ROW_EVENT_TYPES.has(event.type),
    isCursorUpdate: isPhaseEvent,
    isIgnored: false,
  };
}

// ---------------------------------------------------------------------------
// File-Change Coalescing
// ---------------------------------------------------------------------------

/**
 * Coalescing window in milliseconds for file-change events.
 * File-change events within this window are merged into a single refresh.
 */
export const FILE_CHANGE_COALESCE_WINDOW_MS = 300;

/**
 * State holder for file-change coalescing.
 * Pure in the sense that it manages state externally; the helper functions
 * process state explicitly rather than mutating module-global state.
 */
export interface FileChangeCoalesceState {
  /** Timer id when coalescing is active. */
  readonly timerId: ReturnType<typeof setTimeout> | null;
  /** Accumulated event ids in the current coalesce window. */
  readonly pendingEventIds: readonly string[];
  /** Latest occurredAt within the coalesce window. */
  readonly latestOccurredAt: string | null;
  /** Callback that fires when the coalesce window expires. */
  readonly onFlush: (eventIds: readonly string[]) => void;
  /** Timestamp (Date.now()) when the current window started. */
  readonly windowStartedAt: number | null;
}

/**
 * Create an initial file-change coalesce state.
 */
export function createFileChangeCoalesceState(
  onFlush: (eventIds: readonly string[]) => void,
): FileChangeCoalesceState {
  return {
    timerId: null,
    pendingEventIds: [],
    latestOccurredAt: null,
    onFlush,
    windowStartedAt: null,
  };
}

/**
 * Accept a new file-change event into the coalesce state.
 * Returns updated state and whether the caller should expect a flush.
 */
export function acceptFileChangeEvent(
  state: FileChangeCoalesceState,
  eventId: string,
  occurredAt: string,
  now: number,
): FileChangeCoalesceState {
  if (state.timerId !== null) {
    clearTimeout(state.timerId);
  }

  const windowStartedAt = state.windowStartedAt ?? now;

  const nextState: FileChangeCoalesceState = {
    ...state,
    pendingEventIds: [...state.pendingEventIds, eventId],
    latestOccurredAt: occurredAt > (state.latestOccurredAt ?? "") ? occurredAt : (state.latestOccurredAt ?? occurredAt),
    windowStartedAt,
    timerId: setTimeout(() => {
      const ids = [...state.pendingEventIds, eventId];

      state.onFlush(ids);
    }, FILE_CHANGE_COALESCE_WINDOW_MS),
  };

  return nextState;
}

/**
 * Flush any pending file-change events and clear the coalesce window.
 */
export function flushFileChangeCoalesce(
  state: FileChangeCoalesceState,
): FileChangeCoalesceState {
  if (state.timerId !== null) {
    clearTimeout(state.timerId);
  }

  return {
    ...state,
    timerId: null,
    pendingEventIds: [],
    latestOccurredAt: null,
    windowStartedAt: null,
  };
}

// ---------------------------------------------------------------------------
// FEAT-034 - Presentation Logic: SSE Response Mappers
// ---------------------------------------------------------------------------

/**
 * Serialize a LiveActivityEvent into an SSE-compatible JSON object.
 * Strips undefined optionals to keep SSE payloads compact.
 */
export function serializeLiveActivityEvent(event: LiveActivityEvent): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: event.id,
    projectId: event.projectId,
    category: event.category,
    type: event.type,
    occurredAt: event.occurredAt,
    summary: event.summary,
    replayable: event.replayable,
  };

  if (event.cardId !== undefined) {
    payload.cardId = event.cardId;
  }

  if (event.runId !== undefined) {
    payload.runId = event.runId;
  }

  if (event.phaseNumber !== undefined) {
    payload.phaseNumber = event.phaseNumber;
  }

  if (event.phaseTitle !== undefined) {
    payload.phaseTitle = event.phaseTitle;
  }

  if (event.phaseStatus !== undefined) {
    payload.phaseStatus = event.phaseStatus;
  }

  if (event.metadata !== undefined) {
    payload.metadata = event.metadata;
  }

  return payload;
}

/**
 * Serialize a replay batch for SSE delivery.
 */
export function serializeReplayBatch(
  events: readonly LiveActivityEvent[],
): Record<string, unknown> {
  return {
    events: events.map(serializeLiveActivityEvent),
  };
}

/**
 * Serialize a replay-unavailable signal for SSE delivery.
 */
export function serializeReplayUnavailable(reason: string): Record<string, unknown> {
  return { reason };
}

/**
 * Serialize an error payload for SSE delivery.
 */
export function serializeError(errorMessage: string): Record<string, unknown> {
  return { error: errorMessage };
}

/**
 * Serialize a connected event payload for SSE delivery.
 */
export function serializeConnected(
  projectId: string,
  serverTime: string,
): Record<string, unknown> {
  return { projectId, serverTime };
}

// ---------------------------------------------------------------------------
// FEAT-034 - Presentation Logic: Client Status Reducer
// ---------------------------------------------------------------------------

/**
 * Create the initial live activity status state.
 */
export function createInitialLiveActivityStatus(): LiveActivityStatus {
  return {
    connectionState: "disabled",
    lastEventTimestamp: null,
    lastPhaseCursor: null,
    isReplayUnavailable: false,
    errorMessage: null,
  };
}

/**
 * Valid state transitions for connection states.
 */
const VALID_TRANSITIONS: Record<
  LiveActivityConnectionState,
  readonly LiveActivityConnectionState[]
> = {
  disabled: ["connecting"],
  connecting: ["live", "degraded", "offline"],
  live: ["reconnecting", "offline"],
  reconnecting: ["live", "degraded", "offline"],
  degraded: ["live", "offline"],
  offline: ["connecting"],
};

/**
 * Transition the live activity status to a new connection state.
 * Returns the updated status. If the transition is invalid, logs a warning
 * but still applies the transition to avoid stuck state.
 */
export function transitionConnectionState(
  status: LiveActivityStatus,
  newState: LiveActivityConnectionState,
  options?: {
    readonly lastEventTimestamp?: string | null;
    readonly lastPhaseCursor?: string | null;
    readonly isReplayUnavailable?: boolean;
    readonly errorMessage?: string | null;
  },
): LiveActivityStatus {
  const allowed = VALID_TRANSITIONS[status.connectionState];

  if (!allowed.includes(newState)) {
    console.warn(
      `Invalid connection state transition: ${status.connectionState} -> ${newState}`,
    );
  }

  return {
    connectionState: newState,
    lastEventTimestamp:
      options?.lastEventTimestamp !== undefined
        ? options.lastEventTimestamp
        : status.lastEventTimestamp,
    lastPhaseCursor:
      options?.lastPhaseCursor !== undefined
        ? options.lastPhaseCursor
        : status.lastPhaseCursor,
    isReplayUnavailable:
      options?.isReplayUnavailable !== undefined
        ? options.isReplayUnavailable
        : status.isReplayUnavailable,
    errorMessage:
      options?.errorMessage !== undefined
        ? options.errorMessage
        : status.errorMessage,
  };
}

/**
 * Apply a received event to the live activity status.
 * Updates lastEventTimestamp and optionally lastPhaseCursor for phase events.
 */
export function applyReceivedEvent(
  status: LiveActivityStatus,
  event: LiveActivityEvent,
): LiveActivityStatus {
  return {
    ...status,
    lastEventTimestamp: event.occurredAt,
    lastPhaseCursor:
      event.category === "phase" ? event.id : status.lastPhaseCursor,
  };
}

// ---------------------------------------------------------------------------
// FEAT-034 - Presentation Logic: Label and Summary Helpers
// ---------------------------------------------------------------------------

/**
 * Get a user-facing label for a connection state.
 */
export function connectionStateLabel(state: LiveActivityConnectionState): string {
  switch (state) {
    case "disabled":
      return "Live updates disabled";
    case "connecting":
      return "Connecting to live updates";
    case "live":
      return "Live";
    case "reconnecting":
      return "Reconnecting";
    case "degraded":
      return "Live (degraded)";
    case "offline":
      return "Offline";
  }
}

/**
 * Get a short one-word status label for compact display.
 */
export function compactConnectionStateLabel(
  state: LiveActivityConnectionState,
): string {
  switch (state) {
    case "disabled":
      return "-";
    case "connecting":
      return "...";
    case "live":
      return "Live";
    case "reconnecting":
      return "↻";
    case "degraded":
      return "!";
    case "offline":
      return "✗";
  }
}

/**
 * Get a compact summary of the event for activity row display.
 */
export function eventActivitySummary(event: LiveActivityEvent): string {
  const prefix =
    event.category === "phase"
      ? `Phase ${event.phaseNumber ?? "?"}`
      : event.category;

  switch (event.type) {
    case "phase.started":
      return `${prefix} started`;
    case "phase.completed":
      return `${prefix} completed`;
    case "phase.skipped":
      return `${prefix} skipped`;
    case "phase.blocked":
      return `${prefix} blocked`;
    case "phase.failed":
      return `${prefix} failed`;
    case "phase.quality-gate-opened":
      return `${prefix} quality gate opened`;
    case "phase.quality-gate-resolved":
      return `${prefix} quality gate resolved`;
    case "workflow.started":
      return "Workflow started";
    case "workflow.completed":
      return "Workflow completed";
    case "workflow.failed":
      return "Workflow failed";
    case "deep-dive.completed":
      return "Deep-dive completed";
    case "finding.submitted":
      return "Finding submitted";
    default:
      return event.summary || `${event.category} ${event.type}`;
  }
}

/**
 * Get an accessibility announcement text for an event.
 * Returns undefined for events that should not trigger announcements.
 */
export function accessibilityAnnouncement(
  event: LiveActivityEvent,
): string | undefined {
  const classification = classifyEvent(event);

  if (!classification.isAttentionUpdate) {
    return undefined;
  }

  return eventActivitySummary(event);
}

// ---------------------------------------------------------------------------
// FEAT-034 - Presentation Logic: Error Response Mapping
// ---------------------------------------------------------------------------

/**
 * Map an error to a structured error response payload.
 */
export function toStructuredError(
  error: unknown,
): { readonly error: string } {
  if (error instanceof Error) {
    return { error: error.message };
  }

  if (typeof error === "string") {
    return { error };
  }

  return { error: "An unexpected error occurred" };
}
