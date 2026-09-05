import type { NormalizedEventName } from "./normalized-event-contracts.js";

export type AgentInvocationStatus = "running" | "completed" | "failed" | "timed_out";

export interface AgentInvocationRecord {
  readonly id: string;
  readonly projectId: string;
  readonly cardKey?: string;
  readonly workflowRunId?: string;
  readonly workflowCommand?: string;
  readonly workflowNodeId?: string;
  readonly phaseNumber?: number;
  readonly phaseTitle?: string;
  readonly agentRole?: string;
  readonly agentName?: string;
  readonly model?: string;
  readonly provider?: string;
  readonly status: AgentInvocationStatus;
  readonly exitCode?: number;
  readonly errorMessage?: string;
  readonly timeoutMarker?: boolean;
  readonly parentInvocationId?: string;
  readonly logPath?: string;
  readonly receiptPath?: string;
  readonly reviewReportPath?: string;
  readonly rawRefJson?: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
}

export interface StoredAgentInvocation {
  readonly id: string;
  readonly projectId: string;
  readonly cardKey: string | null;
  readonly workflowRunId: string | null;
  readonly workflowCommand: string | null;
  readonly workflowNodeId: string | null;
  readonly phaseNumber: number | null;
  readonly phaseTitle: string | null;
  readonly agentRole: string | null;
  readonly agentName: string | null;
  readonly model: string | null;
  readonly provider: string | null;
  readonly status: AgentInvocationStatus;
  readonly exitCode: number | null;
  readonly errorMessage: string | null;
  readonly timeoutMarker: boolean;
  readonly parentInvocationId: string | null;
  readonly logPath: string | null;
  readonly receiptPath: string | null;
  readonly reviewReportPath: string | null;
  readonly rawRefJson: string | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NormalizedEventRecord {
  readonly id: string;
  readonly invocationId?: string;
  readonly projectId: string;
  readonly cardKey?: string;
  readonly workflowRunId?: string;
  readonly eventType: NormalizedEventName;
  readonly timestamp: string;
  readonly workflowCommand?: string;
  readonly workflowNode?: string;
  readonly phase?: string;
  readonly agentRole?: string;
  readonly model?: string;
  readonly pid?: number;
  readonly logPath?: string;
  readonly receiptPath?: string;
  readonly rawRefJson?: string;
  readonly errorMessage?: string;
  readonly exitCode?: number;
  readonly metadataJson?: string;
}

export interface StoredNormalizedEvent {
  readonly id: string;
  readonly invocationId: string | null;
  readonly projectId: string;
  readonly cardKey: string | null;
  readonly workflowRunId: string | null;
  readonly eventType: NormalizedEventName;
  readonly timestamp: string;
  readonly workflowCommand: string | null;
  readonly workflowNode: string | null;
  readonly phase: string | null;
  readonly agentRole: string | null;
  readonly model: string | null;
  readonly pid: number | null;
  readonly logPath: string | null;
  readonly receiptPath: string | null;
  readonly rawRefJson: string | null;
  readonly errorMessage: string | null;
  readonly exitCode: number | null;
  readonly metadataJson: string | null;
  readonly createdAt: string;
}

export interface InvocationFilter {
  readonly projectId: string;
  readonly cardKey?: string;
  readonly workflowRunId?: string;
  readonly phaseNumber?: number;
  readonly agentRole?: string;
  readonly agentName?: string;
  readonly model?: string;
  readonly parentInvocationId?: string;
  readonly status?: AgentInvocationStatus;
  readonly startedAfter?: string;
  readonly startedBefore?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface EventFilter {
  readonly projectId: string;
  readonly cardKey?: string;
  readonly workflowRunId?: string;
  readonly invocationId?: string;
  readonly eventType?: NormalizedEventName;
  readonly startedAfter?: string;
  readonly startedBefore?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface PhaseTimelineEntry {
  readonly invocationId: string;
  readonly agentRole: string | null;
  readonly agentName: string | null;
  readonly model: string | null;
  readonly status: AgentInvocationStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  readonly workflowNodeId: string | null;
  readonly receiptPath: string | null;
  readonly logPath: string | null;
  readonly reviewReportPath: string | null;
  readonly parentInvocationId: string | null;
  readonly events: PhaseTimelineEventEntry[];
}

export interface PhaseTimelineEventEntry {
  readonly eventId: string;
  readonly eventType: NormalizedEventName;
  readonly timestamp: string;
  readonly errorMessage: string | null;
}

export interface PhaseTimelineResult {
  readonly projectId: string;
  readonly cardKey: string;
  readonly phaseNumber: number;
  readonly phaseTitle: string;
  readonly invocations: PhaseTimelineEntry[];
}

export interface FeatEvidenceInvocation {
  readonly id: string;
  readonly agentRole: string | null;
  readonly agentName: string | null;
  readonly model: string | null;
  readonly status: AgentInvocationStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  readonly errorMessage: string | null;
  readonly receiptPath: string | null;
  readonly reviewReportPath: string | null;
  readonly parentInvocationId: string | null;
}

export interface CompletedFeatEvidenceEntry {
  readonly runId: string;
  readonly command: string;
  readonly phaseNumber: number;
  readonly phaseTitle: string;
  readonly invocations: FeatEvidenceInvocation[];
}

export interface CompletedFeatTimelineResult {
  readonly projectId: string;
  readonly cardKey: string;
  readonly evid: CompletedFeatEvidenceEntry[];
}

export interface PhaseTimelineApiResponse extends PhaseTimelineResult {}

export interface CompletedFeatTimelineApiResponse {
  readonly projectId: string;
  readonly cardKey: string;
  readonly evid: CompletedFeatEvidenceEntry[];
}
