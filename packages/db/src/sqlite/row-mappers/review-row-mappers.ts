import type { FinalVerificationCheckRecord, FinalVerificationRunRecord, ReviewFindingDecisionRecord, ReviewFindingLedgerRecord, ReviewFingerprintDecisionRecord, ReviewRepairAttemptRecord } from "../../contracts/review-contracts.js";
import { toIsoString } from "../value-normalizers.js";

// --- FEAT-042: Review finding ledger row types and mappers ---

export interface ReviewFindingLedgerRow {
  id: string;
  project_id: string;
  card_key: string;
  phase_number: number;
  phase_title: string;
  workflow_run_id: string | null;
  review_report_path: string | null;
  agent_invocation_id: string | null;
  timeline_entry_id: string | null;
  finding_index: number;
  finding_summary: string;
  finding_text: string | null;
  affected_area: string | null;
  severity: string | null;
  fingerprint: string;
  decision_classification: string | null;
  resolution_state: string;
  decision_rationale: string | null;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export function mapReviewFindingLedgerRow(row: ReviewFindingLedgerRow): ReviewFindingLedgerRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    cardKey: row.card_key,
    phaseNumber: row.phase_number,
    phaseTitle: row.phase_title,
    workflowRunId: row.workflow_run_id,
    reviewReportPath: row.review_report_path,
    agentInvocationId: row.agent_invocation_id,
    timelineEntryId: row.timeline_entry_id,
    findingIndex: row.finding_index,
    findingSummary: row.finding_summary,
    findingText: row.finding_text,
    affectedArea: row.affected_area,
    severity: row.severity,
    fingerprint: row.fingerprint,
    decisionClassification: row.decision_classification,
    resolutionState: row.resolution_state,
    decisionRationale: row.decision_rationale,
    supersededBy: row.superseded_by,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
    resolvedAt: toIsoString(row.resolved_at) ?? null,
  };
}

export interface ReviewFindingDecisionRow {
  id: string;
  finding_ledger_id: string;
  project_id: string;
  card_key: string;
  classification: string;
  rationale: string | null;
  decided_by: string | null;
  workflow_run_id: string | null;
  created_at: string;
  superseded_at: string | null;
}

export function mapReviewFindingDecisionRow(row: ReviewFindingDecisionRow): ReviewFindingDecisionRecord {
  return {
    id: row.id,
    findingLedgerId: row.finding_ledger_id,
    projectId: row.project_id,
    cardKey: row.card_key,
    classification: row.classification,
    rationale: row.rationale,
    decidedBy: row.decided_by,
    workflowRunId: row.workflow_run_id,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    supersededAt: toIsoString(row.superseded_at) ?? null,
  };
}

export interface ReviewRepairAttemptRow {
  id: string;
  project_id: string;
  card_key: string;
  phase_number: number;
  repair_generated_at: string | null;
  repair_context_text: string | null;
  repair_workflow_run_id: string | null;
  rerun_review_report_path: string | null;
  rerun_result: string | null;
  unresolved_before_count: number;
  unresolved_after_count: number;
  escalated: number;
  escalation_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

export function mapReviewRepairAttemptRow(row: ReviewRepairAttemptRow): ReviewRepairAttemptRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    cardKey: row.card_key,
    phaseNumber: row.phase_number,
    repairGeneratedAt: toIsoString(row.repair_generated_at) ?? null,
    repairContextText: row.repair_context_text,
    repairWorkflowRunId: row.repair_workflow_run_id,
    rerunReviewReportPath: row.rerun_review_report_path,
    rerunResult: row.rerun_result,
    unresolvedBeforeCount: row.unresolved_before_count,
    unresolvedAfterCount: row.unresolved_after_count,
    escalated: row.escalated,
    escalationReason: row.escalation_reason,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    completedAt: toIsoString(row.completed_at) ?? null,
  };
}

export interface ReviewFingerprintDecisionRow {
  id: string;
  project_id: string;
  card_key: string;
  phase_number: number;
  review_gate_id: string;
  decision_classification: string;
  should_continue: number;
  unresolved_fingerprints_json: string;
  prior_same_gate_fingerprints_json: string | null;
  same_fingerprint_repeat_count: number;
  absolute_recovery_attempt_count: number;
  current_unresolved_count: number;
  prior_unresolved_count: number;
  added_fingerprint_count: number;
  removed_fingerprint_count: number;
  unchanged_fingerprint_count: number;
  reason_text: string;
  latest_report_path: string | null;
  created_at: string;
}

export function mapReviewFingerprintDecisionRow(row: ReviewFingerprintDecisionRow): ReviewFingerprintDecisionRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    cardKey: row.card_key,
    phaseNumber: row.phase_number,
    reviewGateId: row.review_gate_id,
    decisionClassification: row.decision_classification,
    shouldContinue: row.should_continue,
    unresolvedFingerprintsJson: row.unresolved_fingerprints_json,
    priorSameGateFingerprintsJson: row.prior_same_gate_fingerprints_json,
    sameFingerprintRepeatCount: row.same_fingerprint_repeat_count,
    absoluteRecoveryAttemptCount: row.absolute_recovery_attempt_count,
    currentUnresolvedCount: row.current_unresolved_count,
    priorUnresolvedCount: row.prior_unresolved_count,
    addedFingerprintCount: row.added_fingerprint_count,
    removedFingerprintCount: row.removed_fingerprint_count,
    unchangedFingerprintCount: row.unchanged_fingerprint_count,
    reasonText: row.reason_text,
    latestReportPath: row.latest_report_path,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// FEAT-044: Final verification runner row types and mappers
// ---------------------------------------------------------------------------

export interface FinalVerificationRunRow {
  id: string;
  project_id: string;
  card_key: string;
  workflow_run_id: string;
  execution_root: string;
  aggregate_status: string;
  blocked_reason: string | null;
  persistence_warning: string | null;
  duration: number;
  started_at: string;
  completed_at: string;
}

export interface FinalVerificationCheckRow {
  id: string;
  run_id: string;
  project_id: string;
  card_key: string;
  check_id: string;
  intent: string;
  description: string;
  command: string;
  working_directory: string;
  outcome: string;
  duration: number;
  exit_code: number | null;
  started_at: string;
  output_summary: string;
  required_check: number;
}

export function mapFinalVerificationRunRow(row: FinalVerificationRunRow): FinalVerificationRunRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    cardKey: row.card_key,
    workflowRunId: row.workflow_run_id,
    executionRoot: row.execution_root,
    aggregateStatus: row.aggregate_status,
    blockedReason: row.blocked_reason,
    persistenceWarning: row.persistence_warning,
    duration: row.duration,
    startedAt: toIsoString(row.started_at) ?? "",
    completedAt: toIsoString(row.completed_at) ?? "",
  };
}

export function mapFinalVerificationCheckRow(row: FinalVerificationCheckRow): FinalVerificationCheckRecord {
  return {
    id: row.id,
    runId: row.run_id,
    projectId: row.project_id,
    cardKey: row.card_key,
    checkId: row.check_id,
    intent: row.intent,
    description: row.description,
    command: row.command,
    workingDirectory: row.working_directory,
    outcome: row.outcome,
    duration: row.duration,
    exitCode: row.exit_code,
    startedAt: toIsoString(row.started_at) ?? "",
    outputSummary: row.output_summary,
    required: row.required_check === 1,
  };
}

// -------------------------------------------------------------------------
