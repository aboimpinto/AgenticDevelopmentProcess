import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReviewArtifactRepository } from "../src/review-governance/artifact-repository.js";
import { ReviewReplanEventRepository } from "../src/review-governance/replan-event-repository.js";
import { applyReviewGovernanceMigrations } from "../src/review-governance/migrations/index.js";
import { ReviewReplanQueryRepository } from "../src/review-governance/replan-query-repository.js";

const scope = {
  projectId: "project-alpha", featureId: "work-item-alpha", phaseNumber: 4,
  reviewGateId: "review-gate", defectClass: "contract-drift",
};
const manifestHash = "a".repeat(64);
const createdAt = "2026-07-21T00:00:00.000Z";

describe("ReviewReplanEventRepository", () => {
  let database: DatabaseSync;
  let repository: ReviewReplanEventRepository;
  let queries: ReviewReplanQueryRepository;

  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    database.exec("pragma foreign_keys = on");
    applyReviewGovernanceMigrations(database);
    const artifacts = new ReviewArtifactRepository(database);
    queries = new ReviewReplanQueryRepository(database);
    repository = new ReviewReplanEventRepository(database, artifacts, queries);
    database.prepare(`insert into hepha_review_artifacts
      (content_hash, artifact_id, artifact_kind, schema_version, project_id, feature_id, phase_number, review_gate_id,
       feature_root_path, artifact_relative_path, canonical_json, source_mode, ingested_at)
      values (?, 'manifest-alpha', 'review_manifest', 1, ?, ?, ?, ?, 'MemoryBank/Features/work-item-alpha',
       'artifacts/manifest-alpha.json', '{}', 'v1_validated_ingress', ?)`).run(
      manifestHash, scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, createdAt,
    );
    database.prepare(`insert into hepha_review_remediation_cycles
      (cycle_id, project_id, feature_id, phase_number, review_gate_id, basis_manifest_hash, cycle_state, created_at)
      values ('cycle-alpha', ?, ?, ?, ?, ?, 'REVIEW_PENDING', ?)`).run(
      scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, manifestHash, createdAt,
    );
  });

  afterEach(() => database.close());

  function observation(id: string): Record<string, unknown> {
    return {
      ...scope, aggregateId: "aggregate-alpha", observationEventId: id,
      observationKind: "POST_FIX_MANIFESTATION", triggerManifestHash: manifestHash,
      basisManifestHash: manifestHash, remediationCycleId: "cycle-alpha", createdAt,
    };
  }

  it("commits a validated closed operation and returns its durable aggregate", () => {
    const aggregate = repository.commit({ kind: "OBSERVATION", records: { observation: observation("observation-alpha") } });
    expect(aggregate).toMatchObject({
      scope, aggregateId: "aggregate-alpha", eventVersion: 0,
      observations: [{ observationEventId: "observation-alpha" }],
    });
  });

  it("rolls the operation back when durable read-back verification fails", () => {
    expect(() => repository.commit(
      { kind: "OBSERVATION", records: { observation: observation("observation-rollback") } },
      () => false,
    )).toThrow(/^PERSISTENCE_FAILED$/);
    expect(queries.getAggregate(scope, "aggregate-alpha").observations).toEqual([]);
  });

  it("rejects malformed operation records before the first row write", () => {
    expect(() => repository.commit({
      kind: "OBSERVATION",
      records: { observation: { ...observation("observation-invalid"), unexpected: true } },
    })).toThrow(/^INVALID_INPUT$/);
    const count = database.prepare("select count(*) as total from hepha_review_defect_class_observations").get() as { total: number };
    expect(count.total).toBe(0);
  });
});
