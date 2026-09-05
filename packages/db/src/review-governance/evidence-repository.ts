import type { DatabaseSync } from "node:sqlite";
import type {
  ReplanGovernanceReviewScope,
  ReviewStoreCycleState,
  StoredReviewFinding,
  StoredReviewFindingObservation,
  StoredReviewFindingObservationContext,
  StoredReviewRemediationCycle,
  StoredReviewRemediationItemEvent,
  StoredReviewVerificationReceiptEvent,
} from "./contracts.js";
import { scanSafeContent } from "./content-safety.js";

const SCOPE_KEYS = ["projectId", "featureId", "phaseNumber", "reviewGateId"] as const;

function rejectInput(): never {
  throw new Error("INVALID_INPUT");
}

function assertSafeIdentifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) rejectInput();
  try {
    scanSafeContent(value);
  } catch {
    rejectInput();
  }
}

function assertKebabIdentifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128
    || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)) rejectInput();
}

function assertScope(value: unknown): asserts value is ReplanGovernanceReviewScope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) rejectInput();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== SCOPE_KEYS.length || SCOPE_KEYS.some((key) => !(key in record))) {
    rejectInput();
  }
  assertSafeIdentifier(record.projectId);
  assertSafeIdentifier(record.featureId);
  assertSafeIdentifier(record.reviewGateId);
  if (typeof record.phaseNumber !== "number" || !Number.isInteger(record.phaseNumber) || record.phaseNumber < 0) {
    rejectInput();
  }
}

/** Immutable review finding, remediation, and verification read projections. */
export class ReviewEvidenceRepository {
  constructor(private readonly database: DatabaseSync) {}

  listFindingsByRun(reviewRunId: unknown): StoredReviewFinding[] {
    assertSafeIdentifier(reviewRunId);
    const rows = this.database.prepare(
      `select review_run_id, finding_id, project_id, feature_id, phase_number,
              review_gate_id, disposition, claim_type, severity,
              defect_class, summary, rule_reference, rule_id, rule_version,
              rule_hash, ac_source_path, ac_section
       from hepha_review_findings where review_run_id = ? order by finding_id`,
    ).all(reviewRunId) as Record<string, unknown>[];
    return rows.map((row) => ({
      reviewRunId: String(row.review_run_id), findingId: String(row.finding_id),
      projectId: String(row.project_id), featureId: String(row.feature_id),
      phaseNumber: Number(row.phase_number), reviewGateId: String(row.review_gate_id),
      disposition: String(row.disposition), claimType: String(row.claim_type), severity: String(row.severity),
      defectClass: String(row.defect_class), summary: String(row.summary),
      ruleReference: row.rule_reference === null ? null : String(row.rule_reference),
      ruleId: row.rule_id === null ? null : String(row.rule_id),
      ruleVersion: row.rule_version === null ? null : String(row.rule_version),
      ruleHash: row.rule_hash === null ? null : String(row.rule_hash),
      acSourcePath: row.ac_source_path === null ? null : String(row.ac_source_path),
      acSection: row.ac_section === null ? null : String(row.ac_section),
    }));
  }

  listObservationsByRun(reviewRunId: unknown): StoredReviewFindingObservation[] {
    assertSafeIdentifier(reviewRunId);
    const rows = this.database.prepare(
      `select observation_id, review_run_id, finding_id, surface_json, remediation_items_json,
              test_matrix_json, root_cause, scope_rationale, created_at
       from hepha_review_finding_observations where review_run_id = ? order by observation_id asc`,
    ).all(reviewRunId) as Record<string, unknown>[];
    return rows.map((row) => ({
      observationId: String(row.observation_id), reviewRunId: String(row.review_run_id),
      findingId: String(row.finding_id), surfaceJson: String(row.surface_json),
      remediationItemsJson: String(row.remediation_items_json), testMatrixJson: String(row.test_matrix_json),
      rootCause: row.root_cause === null ? null : String(row.root_cause),
      scopeRationale: row.scope_rationale === null ? null : String(row.scope_rationale),
      createdAt: String(row.created_at),
    }));
  }

  listCyclesByScope(scope: unknown): StoredReviewRemediationCycle[] {
    assertScope(scope);
    const rows = this.database.prepare(
      `select cycle_id, project_id, feature_id, phase_number, review_gate_id, basis_manifest_hash,
              predecessor_cycle_id, cycle_state, reason_code, created_at
       from hepha_review_remediation_cycles
       where project_id = ? and feature_id = ? and phase_number = ? and review_gate_id = ?
       order by created_at asc, cycle_id asc`,
    ).all(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId) as Record<string, unknown>[];
    return rows.map((row) => ({
      cycleId: String(row.cycle_id), projectId: String(row.project_id), featureId: String(row.feature_id),
      phaseNumber: Number(row.phase_number), reviewGateId: String(row.review_gate_id),
      basisManifestHash: String(row.basis_manifest_hash),
      predecessorCycleId: row.predecessor_cycle_id === null ? null : String(row.predecessor_cycle_id),
      cycleState: String(row.cycle_state) as ReviewStoreCycleState,
      reasonCode: row.reason_code === null ? null : String(row.reason_code), createdAt: String(row.created_at),
    }));
  }

  listRemediationItemsByRun(reviewRunId: unknown): StoredReviewRemediationItemEvent[] {
    assertSafeIdentifier(reviewRunId);
    const rows = this.database.prepare(
      `select item_event_id, cycle_id, review_run_id, finding_id, remediation_item_id, event_kind,
              response_hash, decision, outcome_summary, created_at
       from hepha_review_remediation_items where review_run_id = ? order by created_at asc, item_event_id asc`,
    ).all(reviewRunId) as Record<string, unknown>[];
    return rows.map((row) => ({
      itemEventId: String(row.item_event_id), cycleId: String(row.cycle_id),
      reviewRunId: String(row.review_run_id), findingId: String(row.finding_id),
      remediationItemId: String(row.remediation_item_id), eventKind: String(row.event_kind),
      responseHash: row.response_hash === null ? null : String(row.response_hash),
      decision: row.decision === null ? null : String(row.decision),
      outcomeSummary: row.outcome_summary === null ? null : String(row.outcome_summary),
      createdAt: String(row.created_at),
    }));
  }

  listVerificationReceiptsByRun(reviewRunId: unknown): StoredReviewVerificationReceiptEvent[] {
    assertSafeIdentifier(reviewRunId);
    const rows = this.database.prepare(
      `select receipt_event_id, cycle_id, receipt_hash, review_run_id, finding_id, subject_kind,
              subject_id, outcome, evidence_summary, created_at
       from hepha_review_verification_receipts where review_run_id = ? order by created_at asc, receipt_event_id asc`,
    ).all(reviewRunId) as Record<string, unknown>[];
    return rows.map((row) => ({
      receiptEventId: String(row.receipt_event_id), cycleId: String(row.cycle_id),
      receiptHash: String(row.receipt_hash), reviewRunId: String(row.review_run_id),
      findingId: String(row.finding_id), subjectKind: String(row.subject_kind) as "remediation_item" | "test",
      subjectId: String(row.subject_id), outcome: String(row.outcome),
      evidenceSummary: row.evidence_summary === null ? null : String(row.evidence_summary),
      createdAt: String(row.created_at),
    }));
  }

  getObservationContext(observationId: unknown): StoredReviewFindingObservationContext | null {
    assertKebabIdentifier(observationId);
    const row = this.database.prepare(
      `select o.observation_id, f.project_id, f.feature_id, f.phase_number, f.review_gate_id,
              f.defect_class, f.disposition, r.manifest_hash
       from hepha_review_finding_observations o
       join hepha_review_findings f on f.review_run_id = o.review_run_id and f.finding_id = o.finding_id
       join hepha_review_runs r on r.review_run_id = o.review_run_id
       where o.observation_id = ?`,
    ).get(observationId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      observationId: String(row.observation_id), projectId: String(row.project_id),
      featureId: String(row.feature_id), phaseNumber: Number(row.phase_number),
      reviewGateId: String(row.review_gate_id), defectClass: String(row.defect_class),
      disposition: String(row.disposition), manifestHash: String(row.manifest_hash),
    };
  }
}
