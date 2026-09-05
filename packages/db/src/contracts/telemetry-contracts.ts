export type AgentInvocationStatus = "running" | "completed" | "failed" | "timed_out";

export type NormalizedEventName =
  | "agent.started"
  | "agent.finished"
  | "agent.failed"
  | "agent.timeout";

export interface AgentInvocationRecord {
  id: string;
  projectId: string;
  cardKey?: string;
  workflowRunId?: string;
  workflowCommand?: string;
  workflowNodeId?: string;
  phaseNumber?: number;
  phaseTitle?: string;
  agentRole?: string;
  agentName?: string;
  model?: string;
  provider?: string;
  status: AgentInvocationStatus;
  exitCode?: number;
  errorMessage?: string;
  timeoutMarker?: boolean;
  parentInvocationId?: string;
  logPath?: string;
  receiptPath?: string;
  reviewReportPath?: string;
  rawRefJson?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface StoredAgentInvocation {
  id: string;
  projectId: string;
  cardKey: string | null;
  workflowRunId: string | null;
  workflowCommand: string | null;
  workflowNodeId: string | null;
  phaseNumber: number | null;
  phaseTitle: string | null;
  agentRole: string | null;
  agentName: string | null;
  model: string | null;
  provider: string | null;
  status: AgentInvocationStatus;
  exitCode: number | null;
  errorMessage: string | null;
  timeoutMarker: boolean;
  parentInvocationId: string | null;
  logPath: string | null;
  receiptPath: string | null;
  reviewReportPath: string | null;
  rawRefJson: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NormalizedEventRecord {
  id: string;
  invocationId?: string;
  projectId: string;
  cardKey?: string;
  workflowRunId?: string;
  eventType: NormalizedEventName;
  timestamp: string;
  workflowCommand?: string;
  workflowNode?: string;
  phase?: string;
  agentRole?: string;
  model?: string;
  pid?: number;
  logPath?: string;
  receiptPath?: string;
  rawRefJson?: string;
  errorMessage?: string;
  exitCode?: number;
  metadataJson?: string;
}

export interface StoredNormalizedEvent {
  id: string;
  invocationId: string | null;
  projectId: string;
  cardKey: string | null;
  workflowRunId: string | null;
  eventType: NormalizedEventName;
  timestamp: string;
  workflowCommand: string | null;
  workflowNode: string | null;
  phase: string | null;
  agentRole: string | null;
  model: string | null;
  pid: number | null;
  logPath: string | null;
  receiptPath: string | null;
  rawRefJson: string | null;
  errorMessage: string | null;
  exitCode: number | null;
  metadataJson: string | null;
  createdAt: string;
}

export interface InvocationFilter {
  projectId: string;
  cardKey?: string;
  workflowRunId?: string;
  phaseNumber?: number;
  agentRole?: string;
  agentName?: string;
  model?: string;
  parentInvocationId?: string;
  status?: AgentInvocationStatus;
  startedAfter?: string;
  startedBefore?: string;
  limit?: number;
  offset?: number;
}

export interface EventFilter {
  projectId: string;
  cardKey?: string;
  workflowRunId?: string;
  invocationId?: string;
  eventType?: NormalizedEventName;
  startedAfter?: string;
  startedBefore?: string;
  limit?: number;
  offset?: number;
}

export interface PhaseLifecycleEventRecord {
  readonly id: string;
  readonly projectId: string;
  readonly category: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly cardId?: string;
  readonly runId?: string;
  readonly phaseNumber?: number;
  readonly phaseTitle?: string;
  readonly phaseStatus?: string;
  readonly summary: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Fully stored phase lifecycle event row.
 */
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

// -------------------------------------------------------------------------
// FEAT-044: Final Verification Runner — evidence store types
// -------------------------------------------------------------------------
