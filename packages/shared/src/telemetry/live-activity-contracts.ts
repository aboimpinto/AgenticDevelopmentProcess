export type LiveActivityCategory =
  | "job"
  | "run"
  | "question"
  | "tool"
  | "phase"
  | "quality-gate"
  | "file-change";

export type PhaseLifecycleEventType =
  | "phase.started"
  | "phase.completed"
  | "phase.skipped"
  | "phase.blocked"
  | "phase.failed"
  | "phase.quality-gate-opened"
  | "phase.quality-gate-resolved";

export interface LiveActivityEvent {
  readonly id: string;
  readonly projectId: string;
  readonly category: LiveActivityCategory;
  readonly type: string;
  readonly occurredAt: string;
  readonly cardId?: string;
  readonly runId?: string;
  readonly phaseNumber?: number;
  readonly phaseTitle?: string;
  readonly phaseStatus?: string;
  readonly summary: string;
  readonly replayable: boolean;
  readonly metadata?: Record<string, unknown>;
}

export interface PhaseLifecycleEventRecord {
  readonly id: string;
  readonly projectId: string;
  readonly category: LiveActivityCategory;
  readonly eventType: PhaseLifecycleEventType;
  readonly occurredAt: string;
  readonly cardId?: string;
  readonly runId?: string;
  readonly phaseNumber?: number;
  readonly phaseTitle?: string;
  readonly phaseStatus?: string;
  readonly summary: string;
  readonly metadata?: Record<string, unknown>;
}

export interface StoredPhaseLifecycleEvent {
  readonly id: string;
  readonly projectId: string;
  readonly category: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly cardId: string | null;
  readonly runId: string | null;
  readonly phaseNumber: number | null;
  readonly phaseTitle: string | null;
  readonly phaseStatus: string | null;
  readonly summary: string;
  readonly metadata: string | null;
  readonly createdAt: string;
}

export interface PhaseLifecycleReplayQuery {
  readonly projectId: string;
  readonly cursorId: string;
}

export interface ReplayBatchPayload {
  readonly events: readonly LiveActivityEvent[];
}

export interface ReplayUnavailablePayload {
  readonly reason: string;
}

export type LiveActivityConnectionState =
  | "disabled"
  | "connecting"
  | "live"
  | "reconnecting"
  | "degraded"
  | "offline";

export interface LiveActivityStatus {
  readonly connectionState: LiveActivityConnectionState;
  readonly lastEventTimestamp: string | null;
  readonly lastPhaseCursor: string | null;
  readonly isReplayUnavailable: boolean;
  readonly errorMessage: string | null;
}
