export interface FeatureWorkflowCompletionRecord {
  cardKey: string;
  command: FeatureWorkflowCommand;
  projectId: string;
  runId: string;
  summary: string;
}

export interface FeatureWorkflowRunRecord {
  cardKey: string;
  command: FeatureWorkflowCommand;
  currentNodeId?: string | null;
  currentStep?: string | null;
  error?: string;
  projectId: string;
  runId: string;
  status: "running" | "completed" | "failed" | "blocked" | "cancelled";
  summary?: string;
}

export interface FeatureHumanReviewRecord {
  cardKey: string;
  check: "user-code-review" | "manual-tests";
  projectId: string;
}

export type FeatureFindingStatus = "open" | "agent_running" | "agent_response" | "closed";
export type FeatureFindingEventRole = "user" | "agent" | "system";
export type FeatureFindingEventKind = "finding" | "follow_up" | "solution" | "status";

export interface StoredFeatureFindingEvent {
  id: string;
  content: string;
  createdAt: string;
  kind: FeatureFindingEventKind;
  role: FeatureFindingEventRole;
}

export interface StoredFeatureFinding {
  cardKey: string;
  closedAt: string | null;
  createdAt: string;
  currentStep: string | null;
  error: string | null;
  events: StoredFeatureFindingEvent[];
  id: string;
  projectId: string;
  runId: string | null;
  status: FeatureFindingStatus;
  summary: string | null;
  title: string;
  updatedAt: string;
}

export interface FeatureFindingCreateRecord {
  cardKey: string;
  content: string;
  eventId: string;
  findingId: string;
  projectId: string;
  title: string;
}

export interface FeatureFindingDetailRecord {
  cardKey: string;
  content: string;
  eventId: string;
  findingId: string;
  projectId: string;
}

export interface FeatureFindingAgentRunRecord {
  cardKey: string;
  currentStep?: string | null;
  error?: string | null;
  event?: StoredFeatureFindingEvent;
  findingId: string;
  projectId: string;
  runId?: string | null;
  status: FeatureFindingStatus;
  summary?: string | null;
}

export interface FeatureFindingResolveRecord {
  cardKey: string;
  eventId: string;
  findingId: string;
  projectId: string;
}

export type ImplementationPhaseRunStatus =
  | "pending"
  | "planning"
  | "implementing"
  | "code_review"
  | "checkpoint"
  | "verifying"
  | "completed"
  | "blocked"
  | "failed";

export type ImplementationTaskRunStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";

export type FeatureWorkflowCommand =
  | "deep-dive-epic"
  | "deep-dive-feature"
  | "design-feature"
  | "refine-feature"
  | "start-implementing"
  | "continue-implementing"
  | "complete-feature";

export interface ImplementationPhaseRunRecord {
  agent?: string | null;
  cardKey: string;
  currentStep?: string | null;
  error?: string | null;
  model?: string | null;
  phaseNumber: number;
  phaseTitle: string;
  projectId: string;
  reportPath?: string | null;
  status: ImplementationPhaseRunStatus;
  summary?: string | null;
  workflowRunId: string;
}

export interface StoredImplementationPhaseRun extends Required<ImplementationPhaseRunRecord> {
  completedAt: string | null;
  startedAt: string | null;
  updatedAt: string;
}

export interface ImplementationTaskRunRecord {
  cardKey: string;
  completedAt?: string | null;
  currentStep?: string | null;
  error?: string | null;
  phaseNumber: number;
  phaseTitle: string;
  projectId: string;
  section: string;
  sourceLine?: number | null;
  startedAt?: string | null;
  status: ImplementationTaskRunStatus;
  summary?: string | null;
  taskId: string;
  taskIndex: number;
  taskTitle: string;
  workflowRunId: string;
}

export interface StoredImplementationTaskRun extends Required<ImplementationTaskRunRecord> {
  updatedAt: string;
}

export type ImplementationAgentRunStatus = "running" | "completed" | "failed" | "blocked";

export interface ImplementationAgentRunRecord {
  agentName: string;
  agentRole: string;
  cardKey: string;
  currentStep?: string | null;
  error?: string | null;
  id: string;
  /** Model selected by the immutable orchestrator command plan. */
  model: string;
  phaseNumber?: number | null;
  phaseTitle?: string | null;
  projectId: string;
  reportPath?: string | null;
  status: ImplementationAgentRunStatus;
  summary?: string | null;
  workflowRunId: string;
}

/** A durable agent execution record, including its wall-clock timestamps. */
export interface StoredImplementationAgentRun extends Required<ImplementationAgentRunRecord> {
  completedAt: string | null;
  startedAt: string;
  updatedAt: string;
}

// -------------------------------------------------------------------------
// FEAT-033: Run timeline storage types
// -------------------------------------------------------------------------
