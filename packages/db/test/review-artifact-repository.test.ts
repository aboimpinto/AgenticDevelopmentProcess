import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ReviewArtifactRepository } from "../src/review-governance/artifact-repository.js";
import { applyReviewGovernanceMigrations } from "../src/review-governance/migrations/index.js";

const scope = {
  projectId: "project-alpha",
  featureId: "work-item-alpha",
  phaseNumber: 2,
  reviewGateId: "review-gate",
};

function createFixture() {
  const database = new DatabaseSync(":memory:");
  applyReviewGovernanceMigrations(database);
  const firstHash = "a".repeat(64);
  const secondHash = "b".repeat(64);
  const insertArtifact = database.prepare(
    `insert into hepha_review_artifacts
     (content_hash, artifact_id, artifact_kind, schema_version, project_id, feature_id,
      phase_number, review_gate_id, feature_root_path, artifact_relative_path,
      canonical_json, source_mode, ingested_at)
     values (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, '{}', 'v1_validated_ingress', ?)`,
  );
  insertArtifact.run(
    firstHash, "manifest-alpha", "review_manifest", scope.projectId, scope.featureId,
    scope.phaseNumber, scope.reviewGateId, "MemoryBank/Features/current/work-item",
    `MemoryBank/Features/current/work-item/code-reviews/artifacts/review_manifest/${firstHash}.json`,
    "2026-07-21T08:00:00Z",
  );
  insertArtifact.run(
    secondHash, "receipt-alpha", "verification_receipt", scope.projectId, scope.featureId,
    scope.phaseNumber, scope.reviewGateId, "MemoryBank/Features/current/work-item",
    `MemoryBank/Features/current/work-item/code-reviews/artifacts/verification_receipt/${secondHash}.json`,
    "2026-07-21T09:00:00Z",
  );
  database.prepare(
    `insert into hepha_review_runs
     (review_run_id, manifest_hash, project_id, feature_id, phase_number, review_gate_id,
      manifest_result, workflow_run_id, agent_invocation_id, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "run-alpha", firstHash, scope.projectId, scope.featureId, scope.phaseNumber,
    scope.reviewGateId, "APPROVED", "workflow-alpha", "invocation-alpha", "2026-07-21T08:00:00Z",
  );
  database.prepare(
    `insert into hepha_review_artifact_lineage (artifact_hash, predecessor_hash, relation_kind)
     values (?, ?, 'predecessor')`,
  ).run(secondHash, firstHash);
  return { database, repository: new ReviewArtifactRepository(database), firstHash, secondHash };
}

describe("review artifact repository", () => {
  it("reads complete artifact projections and returns null for an absent hash", () => {
    const { database, repository, firstHash } = createFixture();
    expect(repository.getByHash(firstHash)).toMatchObject({
      contentHash: firstHash,
      artifactId: "manifest-alpha",
      artifactKind: "review_manifest",
      ...scope,
    });
    expect(repository.getByHash("c".repeat(64))).toBeNull();
    database.close();
  });

  it("lists exact-scope artifacts newest first", () => {
    const { database, repository, firstHash, secondHash } = createFixture();
    expect(repository.listByScope(scope).map(({ contentHash }) => contentHash))
      .toEqual([secondHash, firstHash]);
    expect(repository.listByScope({ ...scope, featureId: "work-item-other" })).toEqual([]);
    database.close();
  });

  it("reads review-run provenance and ordered lineage", () => {
    const { database, repository, firstHash, secondHash } = createFixture();
    expect(repository.getRunByManifestHash(firstHash)).toMatchObject({
      reviewRunId: "run-alpha",
      workflowRunId: "workflow-alpha",
      agentInvocationId: "invocation-alpha",
    });
    expect(repository.listLineageByArtifactHash(secondHash)).toEqual([{
      artifactHash: secondHash,
      predecessorHash: firstHash,
      relationKind: "predecessor",
    }]);
    database.close();
  });

  it.each([
    () => new ReviewArtifactRepository(new DatabaseSync(":memory:")).getByHash("invalid"),
    () => new ReviewArtifactRepository(new DatabaseSync(":memory:")).getRunByManifestHash(null),
    () => new ReviewArtifactRepository(new DatabaseSync(":memory:")).listLineageByArtifactHash("A".repeat(64)),
    () => new ReviewArtifactRepository(new DatabaseSync(":memory:")).listByScope({ ...scope, unknown: true }),
  ])("rejects malformed identities before querying", (operation) => {
    expect(operation).toThrow(/^INVALID_INPUT$/);
  });
});
