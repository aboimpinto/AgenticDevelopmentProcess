import type { FeatureFindingStatus, ImplementationAgentRunStatus, ImplementationPhaseRunStatus, ImplementationTaskRunStatus, StoredFeatureFinding, StoredFeatureFindingEvent, StoredImplementationAgentRun, StoredImplementationPhaseRun, StoredImplementationTaskRun } from "../../contracts/workflow-contracts.js";
import { normalizeJsonArray, toIsoString } from "../value-normalizers.js";

export interface StoredFeatureFindingRow {
  agent_run_id: string | null;
  card_key: string;
  closed_at: string | null;
  created_at: string;
  current_step: string | null;
  error: string | null;
  events: unknown;
  id: string;
  project_id: string;
  status: FeatureFindingStatus;
  summary: string | null;
  title: string;
  updated_at: string;
}

export interface StoredImplementationPhaseRunRow {
  agent: string | null;
  card_key: string;
  completed_at: string | null;
  current_step: string | null;
  error: string | null;
  model: string | null;
  phase_number: number;
  phase_title: string;
  project_id: string;
  report_path: string | null;
  started_at: string | null;
  status: ImplementationPhaseRunStatus;
  summary: string | null;
  updated_at: string;
  workflow_run_id: string;
}

export interface StoredImplementationTaskRunRow {
  card_key: string;
  completed_at: string | null;
  current_step: string | null;
  error: string | null;
  phase_number: number;
  phase_title: string;
  project_id: string;
  section: string;
  source_line: number | null;
  started_at: string | null;
  status: ImplementationTaskRunStatus;
  summary: string | null;
  task_id: string;
  task_index: number;
  task_title: string;
  updated_at: string;
  workflow_run_id: string;
}

export interface StoredImplementationAgentRunRow {
  agent_name: string;
  agent_role: string;
  card_key: string;
  completed_at: string | null;
  current_step: string | null;
  error: string | null;
  id: string;
  model: string;
  phase_number: number | null;
  phase_title: string | null;
  project_id: string;
  report_path: string | null;
  started_at: string;
  status: ImplementationAgentRunStatus;
  summary: string | null;
  updated_at: string;
  workflow_run_id: string;
}

export function mapFeatureFindingRow(row: StoredFeatureFindingRow): StoredFeatureFinding {
  return {
    cardKey: row.card_key,
    closedAt: toIsoString(row.closed_at),
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    currentStep: row.current_step,
    error: row.error,
    events: normalizeFeatureFindingEvents(row.events),
    id: row.id,
    projectId: row.project_id,
    runId: row.agent_run_id,
    status: row.status,
    summary: row.summary,
    title: row.title,
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

export function normalizeFeatureFindingEvents(value: unknown): StoredFeatureFindingEvent[] {
  return normalizeJsonArray(value)
    .map((event): StoredFeatureFindingEvent | null => {
      if (!event || typeof event !== "object") {
        return null;
      }

      const record = event as Record<string, unknown>;
      const role = record.role;
      const kind = record.kind;

      if (
        typeof record.id !== "string" ||
        typeof record.content !== "string" ||
        typeof record.createdAt !== "string" ||
        (role !== "user" && role !== "agent" && role !== "system") ||
        (kind !== "finding" && kind !== "follow_up" && kind !== "solution" && kind !== "status")
      ) {
        return null;
      }

      return {
        content: record.content,
        createdAt: record.createdAt,
        id: record.id,
        kind,
        role,
      };
    })
    .filter((event): event is StoredFeatureFindingEvent => Boolean(event));
}

export function mapImplementationPhaseRunRow(row: StoredImplementationPhaseRunRow): StoredImplementationPhaseRun {
  return {
    agent: row.agent,
    cardKey: row.card_key,
    completedAt: toIsoString(row.completed_at),
    currentStep: row.current_step,
    error: row.error,
    model: row.model,
    phaseNumber: row.phase_number,
    phaseTitle: row.phase_title,
    projectId: row.project_id,
    reportPath: row.report_path,
    startedAt: toIsoString(row.started_at),
    status: row.status,
    summary: row.summary,
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
    workflowRunId: row.workflow_run_id,
  };
}

export function mapImplementationAgentRunRow(row: StoredImplementationAgentRunRow): StoredImplementationAgentRun {
  return {
    agentName: row.agent_name,
    agentRole: row.agent_role,
    cardKey: row.card_key,
    completedAt: toIsoString(row.completed_at),
    currentStep: row.current_step,
    error: row.error,
    id: row.id,
    model: row.model,
    phaseNumber: row.phase_number,
    phaseTitle: row.phase_title,
    projectId: row.project_id,
    reportPath: row.report_path,
    startedAt: toIsoString(row.started_at) ?? new Date().toISOString(),
    status: row.status,
    summary: row.summary,
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
    workflowRunId: row.workflow_run_id,
  };
}

export function mapImplementationTaskRunRow(row: StoredImplementationTaskRunRow): StoredImplementationTaskRun {
  return {
    cardKey: row.card_key,
    completedAt: toIsoString(row.completed_at),
    currentStep: row.current_step,
    error: row.error,
    phaseNumber: row.phase_number,
    phaseTitle: row.phase_title,
    projectId: row.project_id,
    section: row.section,
    sourceLine: row.source_line,
    startedAt: toIsoString(row.started_at),
    status: row.status,
    summary: row.summary,
    taskId: row.task_id,
    taskIndex: row.task_index,
    taskTitle: row.task_title,
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
    workflowRunId: row.workflow_run_id,
  };
}

// ---------------------------------------------------------------------------
