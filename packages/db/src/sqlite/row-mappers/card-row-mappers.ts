import type { StoredCardMetadata } from "../../contracts/card-contracts.js";
import type { StoredDeepDiveSession } from "../../contracts/interactive-contracts.js";
import type { FeatureWorkflowCommand } from "../../contracts/workflow-contracts.js";
import { normalizeJsonArray, toIsoString } from "../value-normalizers.js";

export interface StoredDeepDiveSessionRow {
  agent_connection_status: string;
  card_external_id: string;
  card_id: string;
  card_key: string;
  card_kind: "epic" | "feature";
  card_title: string;
  completed_at: string | null;
  created_at: string;
  id: string;
  original_document: string;
  original_document_hash: string;
  original_document_mtime: string | null;
  original_document_path: string | null;
  project_id: string;
  questions: unknown;
  status: string;
  updated_at: string;
}

export function mapDeepDiveSessionRow(row: StoredDeepDiveSessionRow): StoredDeepDiveSession {
  return {
    agentConnectionStatus: row.agent_connection_status,
    cardExternalId: row.card_external_id,
    cardId: row.card_id,
    cardKey: row.card_key,
    cardKind: row.card_kind,
    cardTitle: row.card_title,
    completedAt: toIsoString(row.completed_at),
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    id: row.id,
    originalDocument: row.original_document,
    originalDocumentHash: row.original_document_hash,
    originalDocumentPath: row.original_document_path,
    originalDocumentUpdatedAt: toIsoString(row.original_document_mtime),
    projectId: row.project_id,
    questions: normalizeJsonArray(row.questions),
    status: row.status,
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

export interface StoredCardMetadataRow {
  card_key: string;
  design_feature_completed_at: string | null;
  last_hepha_deep_dive_at: string | null;
  last_hepha_deep_dive_run_id: string | null;
  last_hepha_deep_dive_source_hash: string | null;
  last_hepha_deep_dive_semantic_source: string | null;
  last_hepha_deep_dive_source_mtime: string | null;
  manual_tests_completed_at: string | null;
  refine_feature_completed_at: string | null;
  ui_requirement_checked_at: string | null;
  ui_requirement_decision: "requires_ui" | "no_ui" | null;
  ui_requirement_reason: string | null;
  ui_requirement_source_hash: string | null;
  user_code_review_completed_at: string | null;
  workflow_command: FeatureWorkflowCommand | null;
  workflow_completed_at: string | null;
  workflow_current_node_id: string | null;
  workflow_current_step: string | null;
  workflow_error: string | null;
  workflow_run_id: string | null;
  workflow_started_at: string | null;
  workflow_status: "running" | "completed" | "failed" | "blocked" | "cancelled" | null;
  workflow_summary: string | null;
  workflow_recovery_attempt_count: number | null;
  workflow_last_recovery_at: string | null;
}

export function mapStoredMetadataRow(row: StoredCardMetadataRow): StoredCardMetadata {
  return {
    cardKey: row.card_key,
    designFeatureCompletedAt: toIsoString(row.design_feature_completed_at),
    lastDeepDiveAt: toIsoString(row.last_hepha_deep_dive_at),
    lastDeepDiveRunId: row.last_hepha_deep_dive_run_id,
    lastDeepDiveSourceHash: row.last_hepha_deep_dive_source_hash,
    lastDeepDiveSemanticSource: row.last_hepha_deep_dive_semantic_source,
    lastDeepDiveSourceUpdatedAt: toIsoString(row.last_hepha_deep_dive_source_mtime),
    manualTestsCompletedAt: toIsoString(row.manual_tests_completed_at),
    refineFeatureCompletedAt: toIsoString(row.refine_feature_completed_at),
    uiRequirementCheckedAt: toIsoString(row.ui_requirement_checked_at),
    uiRequirementDecision: row.ui_requirement_decision,
    uiRequirementReason: row.ui_requirement_reason,
    uiRequirementSourceHash: row.ui_requirement_source_hash,
    userCodeReviewCompletedAt: toIsoString(row.user_code_review_completed_at),
    workflowCommand: row.workflow_command,
    workflowCompletedAt: toIsoString(row.workflow_completed_at),
    workflowCurrentNodeId: row.workflow_current_node_id,
    workflowCurrentStep: row.workflow_current_step,
    workflowError: row.workflow_error,
    workflowRunId: row.workflow_run_id,
    workflowStartedAt: toIsoString(row.workflow_started_at),
    workflowStatus: row.workflow_status,
    workflowSummary: row.workflow_summary,
    workflowRecoveryAttemptCount: row.workflow_recovery_attempt_count ?? 0,
    workflowLastRecoveryAt: toIsoString(row.workflow_last_recovery_at),
  };
}

// ---------------------------------------------------------------------------
