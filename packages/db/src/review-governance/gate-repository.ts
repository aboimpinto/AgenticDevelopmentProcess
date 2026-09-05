import type { DatabaseSync } from "node:sqlite";
import type {
  ReplanGovernanceReviewScope,
  ReviewStoreGateState,
  StoredReviewGateDecision,
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

function mapGateDecision(row: Record<string, unknown>): StoredReviewGateDecision {
  return {
    gateDecisionId: Number(row.gate_decision_id),
    projectId: String(row.project_id),
    featureId: String(row.feature_id),
    phaseNumber: Number(row.phase_number),
    reviewGateId: String(row.review_gate_id),
    triggerArtifactHash: String(row.trigger_artifact_hash),
    basisManifestHash: String(row.basis_manifest_hash),
    cycleId: row.cycle_id === null ? null : String(row.cycle_id),
    gateState: String(row.gate_state) as ReviewStoreGateState,
    reasonCode: String(row.reason_code),
    evidenceHashesJson: String(row.evidence_hashes_json),
    decidedAt: String(row.decided_at),
  };
}

const GATE_DECISION_PROJECTION = `select gate_decision_id, project_id, feature_id, phase_number, review_gate_id,
       trigger_artifact_hash, basis_manifest_hash, cycle_id,
       gate_state, reason_code, evidence_hashes_json, decided_at
from hepha_review_phase_gate_decisions`;

/** Authoritative gate-decision and exact review-scope read projections. */
export class ReviewGateRepository {
  constructor(private readonly database: DatabaseSync) {}

  getCurrent(scope: unknown): StoredReviewGateDecision | null {
    assertScope(scope);
    const row = this.database.prepare(
      `${GATE_DECISION_PROJECTION}
       where project_id = ? and feature_id = ? and phase_number = ? and review_gate_id = ?
       order by gate_decision_id desc limit 1`,
    ).get(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId) as
      | Record<string, unknown>
      | undefined;
    return row ? mapGateDecision(row) : null;
  }

  listDecisions(scope: unknown): StoredReviewGateDecision[] {
    assertScope(scope);
    const rows = this.database.prepare(
      `${GATE_DECISION_PROJECTION}
       where project_id = ? and feature_id = ? and phase_number = ? and review_gate_id = ?
       order by gate_decision_id desc`,
    ).all(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId) as Record<string, unknown>[];
    return rows.map(mapGateDecision);
  }

  listScopesForProject(projectId: unknown): readonly ReplanGovernanceReviewScope[] {
    assertSafeIdentifier(projectId);
    const rows = this.database.prepare(
      `select distinct feature_id, phase_number, review_gate_id
       from hepha_review_runs
       where project_id = ?
       order by feature_id asc, phase_number asc, review_gate_id asc`,
    ).all(projectId) as Record<string, unknown>[];
    return rows.map((row) => {
      const scope = {
        projectId,
        featureId: String(row.feature_id),
        phaseNumber: Number(row.phase_number),
        reviewGateId: String(row.review_gate_id),
      };
      assertScope(scope);
      return scope;
    });
  }
}
