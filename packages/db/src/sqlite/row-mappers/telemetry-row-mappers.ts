import type { AgentInvocationStatus, NormalizedEventName, StoredAgentInvocation, StoredNormalizedEvent, StoredPhaseLifecycleEvent } from "../../contracts/telemetry-contracts.js";
import { toIsoString } from "../value-normalizers.js";

// FEAT-033: Agent invocation and normalized event row types and mappers
// ---------------------------------------------------------------------------

export interface AgentInvocationRow {
  id: string;
  project_id: string;
  card_key: string | null;
  workflow_run_id: string | null;
  workflow_command: string | null;
  workflow_node_id: string | null;
  phase_number: number | null;
  phase_title: string | null;
  agent_role: string | null;
  agent_name: string | null;
  model: string | null;
  provider: string | null;
  status: AgentInvocationStatus;
  exit_code: number | null;
  error_message: string | null;
  timeout_marker: number;
  parent_invocation_id: string | null;
  log_path: string | null;
  receipt_path: string | null;
  review_report_path: string | null;
  raw_ref_json: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface NormalizedEventRow {
  id: string;
  invocation_id: string | null;
  project_id: string;
  card_key: string | null;
  workflow_run_id: string | null;
  event_type: NormalizedEventName;
  timestamp: string;
  workflow_command: string | null;
  workflow_node: string | null;
  phase: string | null;
  agent_role: string | null;
  model: string | null;
  pid: number | null;
  log_path: string | null;
  receipt_path: string | null;
  raw_ref_json: string | null;
  error_message: string | null;
  exit_code: number | null;
  metadata_json: string | null;
  created_at: string;
}

export function mapAgentInvocationRow(row: AgentInvocationRow): StoredAgentInvocation {
  return {
    id: row.id,
    projectId: row.project_id,
    cardKey: row.card_key,
    workflowRunId: row.workflow_run_id,
    workflowCommand: row.workflow_command,
    workflowNodeId: row.workflow_node_id,
    phaseNumber: row.phase_number,
    phaseTitle: row.phase_title,
    agentRole: row.agent_role,
    agentName: row.agent_name,
    model: row.model,
    provider: row.provider,
    status: row.status,
    exitCode: row.exit_code,
    errorMessage: row.error_message,
    timeoutMarker: row.timeout_marker === 1,
    parentInvocationId: row.parent_invocation_id,
    logPath: row.log_path,
    receiptPath: row.receipt_path,
    reviewReportPath: row.review_report_path,
    rawRefJson: row.raw_ref_json,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

export interface PhaseLifecycleEventRow {
  id: string;
  project_id: string;
  category: string;
  event_type: string;
  occurred_at: string;
  card_id: string | null;
  run_id: string | null;
  phase_number: number | null;
  phase_title: string | null;
  phase_status: string | null;
  summary: string;
  metadata: string | null;
  created_at: string;
}

export function mapPhaseLifecycleEventRow(row: PhaseLifecycleEventRow): StoredPhaseLifecycleEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    category: row.category,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    cardId: row.card_id,
    runId: row.run_id,
    phaseNumber: row.phase_number,
    phaseTitle: row.phase_title,
    phaseStatus: row.phase_status,
    summary: row.summary,
    metadata: row.metadata,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  };
}

export function mapNormalizedEventRow(row: NormalizedEventRow): StoredNormalizedEvent {
  return {
    id: row.id,
    invocationId: row.invocation_id,
    projectId: row.project_id,
    cardKey: row.card_key,
    workflowRunId: row.workflow_run_id,
    eventType: row.event_type,
    timestamp: row.timestamp,
    workflowCommand: row.workflow_command,
    workflowNode: row.workflow_node,
    phase: row.phase,
    agentRole: row.agent_role,
    model: row.model,
    pid: row.pid,
    logPath: row.log_path,
    receiptPath: row.receipt_path,
    rawRefJson: row.raw_ref_json,
    errorMessage: row.error_message,
    exitCode: row.exit_code,
    metadataJson: row.metadata_json,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  };
}
