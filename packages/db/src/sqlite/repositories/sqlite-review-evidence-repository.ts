import type {
  ReviewFindingDecisionRecord,
  ReviewFindingLedgerRecord,
  ReviewFingerprintDecisionRecord,
  ReviewRepairAttemptRecord,
} from "../../contracts/index.js";
import {
  mapReviewFindingDecisionRow,
  mapReviewFindingLedgerRow,
  mapReviewFingerprintDecisionRow,
  mapReviewRepairAttemptRow,
  type ReviewFindingDecisionRow,
  type ReviewFindingLedgerRow,
  type ReviewFingerprintDecisionRow,
  type ReviewRepairAttemptRow,
} from "../row-mappers/review-row-mappers.js";
import type { SqliteQueryContext } from "../sqlite-query-context.js";

export class SqliteReviewEvidenceRepository {
  constructor(private readonly context: SqliteQueryContext) {}

  async createReviewFindingLedgerEntry(
    record: ReviewFindingLedgerRecord,
  ): Promise<ReviewFindingLedgerRecord> {
    this.context.ensure();
    this.context.run(
      `
      insert or replace into hepha_review_finding_ledger (
        id, project_id, card_key, phase_number, phase_title,
        workflow_run_id, review_report_path, agent_invocation_id, timeline_entry_id,
        finding_index, finding_summary, finding_text, affected_area, severity,
        fingerprint, decision_classification, resolution_state, decision_rationale,
        superseded_by, created_at, updated_at, resolved_at
      ) values (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
      `,
      [
        record.id,
        record.projectId,
        record.cardKey,
        record.phaseNumber,
        record.phaseTitle,
        record.workflowRunId,
        record.reviewReportPath,
        record.agentInvocationId,
        record.timelineEntryId,
        record.findingIndex,
        record.findingSummary,
        record.findingText,
        record.affectedArea,
        record.severity,
        record.fingerprint,
        record.decisionClassification,
        record.resolutionState,
        record.decisionRationale,
        record.supersededBy,
        record.createdAt,
        record.updatedAt,
        record.resolvedAt,
      ],
    );
    return record;
  }

  async listReviewFindingLedgerEntries(
    projectId: string,
    cardKey: string,
    phaseNumber?: number,
  ): Promise<ReviewFindingLedgerRecord[]> {
    this.context.ensure();
    const rows = this.context.all<ReviewFindingLedgerRow>(
      phaseNumber !== undefined
        ? `
          select * from hepha_review_finding_ledger
          where project_id = ? and card_key = ? and phase_number = ?
          order by finding_index asc
        `
        : `
          select * from hepha_review_finding_ledger
          where project_id = ? and card_key = ?
          order by phase_number asc, finding_index asc
        `,
      phaseNumber !== undefined
        ? [projectId, cardKey, phaseNumber]
        : [projectId, cardKey],
    );
    return rows.map(mapReviewFindingLedgerRow);
  }

  async listReviewFindingLedgerEntriesByReport(
    reviewReportPath: string,
  ): Promise<ReviewFindingLedgerRecord[]> {
    this.context.ensure();
    const rows = this.context.all<ReviewFindingLedgerRow>(
      `
      select * from hepha_review_finding_ledger
      where review_report_path = ?
      order by finding_index asc
      `,
      [reviewReportPath],
    );
    return rows.map(mapReviewFindingLedgerRow);
  }

  async updateReviewFindingLedgerDecision(
    id: string,
    classification: string,
    resolutionState: string,
    rationale: string | null,
    updatedAt: string,
  ): Promise<ReviewFindingLedgerRecord | null> {
    this.context.ensure();
    this.context.run(
      `
      update hepha_review_finding_ledger
      set decision_classification = ?, resolution_state = ?, decision_rationale = ?, updated_at = ?
      where id = ?
      `,
      [classification, resolutionState, rationale, updatedAt, id],
    );
    return this.getReviewFindingLedgerEntryById(id);
  }

  private async getReviewFindingLedgerEntryById(
    id: string,
  ): Promise<ReviewFindingLedgerRecord | null> {
    this.context.ensure();
    const row = this.context.get<ReviewFindingLedgerRow>(
      "select * from hepha_review_finding_ledger where id = ?",
      [id],
    );
    return row ? mapReviewFindingLedgerRow(row) : null;
  }

  async createReviewFindingDecision(
    record: ReviewFindingDecisionRecord,
  ): Promise<ReviewFindingDecisionRecord> {
    this.context.ensure();
    this.context.run(
      `
      insert or replace into hepha_review_finding_decisions (
        id, finding_ledger_id, project_id, card_key, classification,
        rationale, decided_by, workflow_run_id, created_at, superseded_at
      ) values (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
      `,
      [
        record.id,
        record.findingLedgerId,
        record.projectId,
        record.cardKey,
        record.classification,
        record.rationale,
        record.decidedBy,
        record.workflowRunId,
        record.createdAt,
        record.supersededAt,
      ],
    );
    return record;
  }

  async listReviewFindingDecisions(
    findingLedgerId: string,
  ): Promise<ReviewFindingDecisionRecord[]> {
    this.context.ensure();
    const rows = this.context.all<ReviewFindingDecisionRow>(
      `
      select * from hepha_review_finding_decisions
      where finding_ledger_id = ?
      order by created_at asc
      `,
      [findingLedgerId],
    );
    return rows.map(mapReviewFindingDecisionRow);
  }

  async createReviewRepairAttempt(
    record: ReviewRepairAttemptRecord,
  ): Promise<ReviewRepairAttemptRecord> {
    this.context.ensure();
    this.context.run(
      `
      insert or replace into hepha_review_repair_attempts (
        id, project_id, card_key, phase_number,
        repair_generated_at, repair_context_text, repair_workflow_run_id,
        rerun_review_report_path, rerun_result,
        unresolved_before_count, unresolved_after_count,
        escalated, escalation_reason,
        created_at, completed_at
      ) values (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?
      )
      `,
      [
        record.id,
        record.projectId,
        record.cardKey,
        record.phaseNumber,
        record.repairGeneratedAt,
        record.repairContextText,
        record.repairWorkflowRunId,
        record.rerunReviewReportPath,
        record.rerunResult,
        record.unresolvedBeforeCount,
        record.unresolvedAfterCount,
        record.escalated,
        record.escalationReason,
        record.createdAt,
        record.completedAt,
      ],
    );
    return record;
  }

  async listReviewRepairAttempts(
    projectId: string,
    cardKey: string,
    phaseNumber: number,
  ): Promise<ReviewRepairAttemptRecord[]> {
    this.context.ensure();
    const rows = this.context.all<ReviewRepairAttemptRow>(
      `
      select * from hepha_review_repair_attempts
      where project_id = ? and card_key = ? and phase_number = ?
      order by created_at asc
      `,
      [projectId, cardKey, phaseNumber],
    );
    return rows.map(mapReviewRepairAttemptRow);
  }

  async updateReviewRepairAttemptAfterRerun(
    id: string,
    rerunReviewReportPath: string,
    rerunResult: string,
    unresolvedAfterCount: number,
    completedAt: string,
  ): Promise<ReviewRepairAttemptRecord | null> {
    this.context.ensure();
    this.context.run(
      `
      update hepha_review_repair_attempts
      set rerun_review_report_path = ?, rerun_result = ?, unresolved_after_count = ?, completed_at = ?
      where id = ?
      `,
      [rerunReviewReportPath, rerunResult, unresolvedAfterCount, completedAt, id],
    );
    const row = this.context.get<ReviewRepairAttemptRow>(
      "select * from hepha_review_repair_attempts where id = ?",
      [id],
    );
    return row ? mapReviewRepairAttemptRow(row) : null;
  }

  async createReviewFingerprintDecision(
    record: ReviewFingerprintDecisionRecord,
  ): Promise<ReviewFingerprintDecisionRecord> {
    this.context.ensure();
    this.context.run(
      `
      insert or replace into hepha_review_fingerprint_decisions (
        id, project_id, card_key, phase_number,
        review_gate_id, decision_classification, should_continue,
        unresolved_fingerprints_json, prior_same_gate_fingerprints_json,
        same_fingerprint_repeat_count, absolute_recovery_attempt_count,
        current_unresolved_count, prior_unresolved_count,
        added_fingerprint_count, removed_fingerprint_count,
        unchanged_fingerprint_count,
        reason_text, latest_report_path,
        created_at
      ) values (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?,
        ?, ?,
        ?
      )
      `,
      [
        record.id,
        record.projectId,
        record.cardKey,
        record.phaseNumber,
        record.reviewGateId,
        record.decisionClassification,
        record.shouldContinue,
        record.unresolvedFingerprintsJson,
        record.priorSameGateFingerprintsJson,
        record.sameFingerprintRepeatCount,
        record.absoluteRecoveryAttemptCount,
        record.currentUnresolvedCount,
        record.priorUnresolvedCount,
        record.addedFingerprintCount,
        record.removedFingerprintCount,
        record.unchangedFingerprintCount,
        record.reasonText,
        record.latestReportPath,
        record.createdAt,
      ],
    );
    return record;
  }

  async getLatestReviewFingerprintDecision(
    projectId: string,
    cardKey: string,
    phaseNumber: number,
    reviewGateId: string,
  ): Promise<ReviewFingerprintDecisionRecord | null> {
    this.context.ensure();
    const row = this.context.get<ReviewFingerprintDecisionRow>(
      `
      select * from hepha_review_fingerprint_decisions
      where project_id = ? and card_key = ? and phase_number = ? and review_gate_id = ?
      order by created_at desc
      limit 1
      `,
      [projectId, cardKey, phaseNumber, reviewGateId],
    );
    return row ? mapReviewFingerprintDecisionRow(row) : null;
  }

  async listReviewFingerprintDecisions(
    projectId: string,
    cardKey: string,
    phaseNumber: number,
  ): Promise<ReviewFingerprintDecisionRecord[]> {
    this.context.ensure();
    const rows = this.context.all<ReviewFingerprintDecisionRow>(
      `
      select * from hepha_review_fingerprint_decisions
      where project_id = ? and card_key = ? and phase_number = ?
      order by created_at asc
      `,
      [projectId, cardKey, phaseNumber],
    );
    return rows.map(mapReviewFingerprintDecisionRow);
  }
}
