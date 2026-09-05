import type { DatabaseSync } from "node:sqlite";
import type {
  ReplanGovernanceReviewScope,
  StoredReviewArtifact,
  StoredReviewArtifactLineage,
  StoredReviewRun,
  ReviewStoreArtifactKind,
} from "./contracts.js";
import { scanSafeContent } from "./content-safety.js";

const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const SCOPE_KEYS = ["projectId", "featureId", "phaseNumber", "reviewGateId"] as const;

function rejectInput(): never {
  throw new Error("INVALID_INPUT");
}

function assertHash(value: unknown): asserts value is string {
  if (typeof value !== "string" || !SHA256_HEX_RE.test(value)) rejectInput();
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

function mapArtifactRow(row: Record<string, unknown>): StoredReviewArtifact {
  return {
    contentHash: String(row.content_hash),
    artifactId: String(row.artifact_id),
    artifactKind: String(row.artifact_kind) as ReviewStoreArtifactKind,
    schemaVersion: Number(row.schema_version),
    projectId: String(row.project_id),
    featureId: String(row.feature_id),
    phaseNumber: Number(row.phase_number),
    reviewGateId: String(row.review_gate_id),
    featureRootPath: String(row.feature_root_path),
    artifactRelativePath: String(row.artifact_relative_path),
    canonicalJson: String(row.canonical_json),
    sourceMode: String(row.source_mode),
    ingestedAt: String(row.ingested_at),
  };
}

/** Immutable artifact, review-run, and lineage read projections. */
export class ReviewArtifactRepository {
  constructor(private readonly database: DatabaseSync) {}

  getByHash(hash: unknown): StoredReviewArtifact | null {
    assertHash(hash);
    const row = this.database.prepare(
      `select content_hash, artifact_id, artifact_kind, schema_version,
              project_id, feature_id, phase_number, review_gate_id,
              feature_root_path, artifact_relative_path, canonical_json,
              source_mode, ingested_at
       from hepha_review_artifacts where content_hash = ?`,
    ).get(hash) as Record<string, unknown> | undefined;
    return row ? mapArtifactRow(row) : null;
  }

  listByScope(scope: unknown): StoredReviewArtifact[] {
    assertScope(scope);
    const rows = this.database.prepare(
      `select content_hash, artifact_id, artifact_kind, schema_version,
              project_id, feature_id, phase_number, review_gate_id,
              feature_root_path, artifact_relative_path, canonical_json,
              source_mode, ingested_at
       from hepha_review_artifacts
       where project_id = ? and feature_id = ? and phase_number = ? and review_gate_id = ?
       order by ingested_at desc`,
    ).all(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId) as Record<string, unknown>[];
    return rows.map(mapArtifactRow);
  }

  getRunByManifestHash(manifestHash: unknown): StoredReviewRun | null {
    assertHash(manifestHash);
    const row = this.database.prepare(
      `select review_run_id, manifest_hash, project_id, feature_id, phase_number,
              review_gate_id, manifest_result, workflow_run_id,
              agent_invocation_id, created_at
       from hepha_review_runs where manifest_hash = ?`,
    ).get(manifestHash) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      reviewRunId: String(row.review_run_id),
      manifestHash: String(row.manifest_hash),
      projectId: String(row.project_id),
      featureId: String(row.feature_id),
      phaseNumber: Number(row.phase_number),
      reviewGateId: String(row.review_gate_id),
      manifestResult: String(row.manifest_result),
      workflowRunId: row.workflow_run_id === null ? null : String(row.workflow_run_id),
      agentInvocationId: row.agent_invocation_id === null ? null : String(row.agent_invocation_id),
      createdAt: String(row.created_at),
    };
  }

  listLineageByArtifactHash(artifactHash: unknown): StoredReviewArtifactLineage[] {
    assertHash(artifactHash);
    const rows = this.database.prepare(
      `select artifact_hash, predecessor_hash, relation_kind from hepha_review_artifact_lineage
       where artifact_hash = ? order by relation_kind asc, predecessor_hash asc`,
    ).all(artifactHash) as Record<string, unknown>[];
    return rows.map((row) => ({
      artifactHash: String(row.artifact_hash),
      predecessorHash: String(row.predecessor_hash),
      relationKind: String(row.relation_kind) as "predecessor" | "supersedes",
    }));
  }
}
