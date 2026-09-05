import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ReviewGateRepository } from "../src/review-governance/gate-repository.js";
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
     values (?, ?, 'review_manifest', 1, ?, ?, ?, ?, 'MemoryBank/Features/current/work-item',
      ?, '{}', 'v1_validated_ingress', ?)`,
  );
  insertArtifact.run(firstHash, "manifest-alpha", scope.projectId, scope.featureId, scope.phaseNumber,
    scope.reviewGateId, `artifacts/${firstHash}.json`, "2026-07-21T08:00:00Z");
  insertArtifact.run(secondHash, "manifest-beta", scope.projectId, "work-item-beta", 1,
    "documentation", `artifacts/${secondHash}.json`, "2026-07-21T09:00:00Z");
  database.prepare(
    `insert into hepha_review_runs
     (review_run_id, manifest_hash, project_id, feature_id, phase_number, review_gate_id,
      manifest_result, created_at) values (?, ?, ?, ?, ?, ?, 'APPROVED', ?)`,
  ).run("run-alpha", firstHash, scope.projectId, scope.featureId, scope.phaseNumber,
    scope.reviewGateId, "2026-07-21T08:00:00Z");
  database.prepare(
    `insert into hepha_review_runs
     (review_run_id, manifest_hash, project_id, feature_id, phase_number, review_gate_id,
      manifest_result, created_at) values (?, ?, ?, ?, ?, ?, 'APPROVED', ?)`,
  ).run("run-beta", secondHash, scope.projectId, "work-item-beta", 1,
    "documentation", "2026-07-21T09:00:00Z");
  const insertDecision = database.prepare(
    `insert into hepha_review_phase_gate_decisions
     (project_id, feature_id, phase_number, review_gate_id, trigger_artifact_hash,
      basis_manifest_hash, gate_state, reason_code, evidence_hashes_json, decided_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertDecision.run(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId,
    firstHash, firstHash, "REJECTED", "findings-open", "[]", "2026-07-21T08:00:00Z");
  insertDecision.run(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId,
    firstHash, firstHash, "APPROVED", "verified", `["${firstHash}"]`, "2026-07-21T10:00:00Z");
  return { database, repository: new ReviewGateRepository(database) };
}

describe("review gate repository", () => {
  it("returns the greatest decision as current and null for an absent scope", () => {
    const { database, repository } = createFixture();
    expect(repository.getCurrent(scope)).toMatchObject({ gateDecisionId: 2, gateState: "APPROVED", reasonCode: "verified" });
    expect(repository.getCurrent({ ...scope, featureId: "work-item-missing" })).toBeNull();
    database.close();
  });

  it("lists complete gate history in descending decision order", () => {
    const { database, repository } = createFixture();
    expect(repository.listDecisions(scope).map(({ gateState }) => gateState)).toEqual(["APPROVED", "REJECTED"]);
    expect(repository.listDecisions(scope)[0]).toMatchObject({ cycleId: null, evidenceHashesJson: `["${"a".repeat(64)}"]` });
    database.close();
  });

  it("lists distinct exact project scopes in deterministic order", () => {
    const { database, repository } = createFixture();
    expect(repository.listScopesForProject(scope.projectId)).toEqual([
      { ...scope },
      { projectId: scope.projectId, featureId: "work-item-beta", phaseNumber: 1, reviewGateId: "documentation" },
    ]);
    expect(repository.listScopesForProject("project-missing")).toEqual([]);
    database.close();
  });

  it.each([
    ["current", (repository: ReviewGateRepository) => repository.getCurrent({ ...scope, extra: true })],
    ["history", (repository: ReviewGateRepository) => repository.listDecisions({ ...scope, phaseNumber: -1 })],
    ["project inventory", (repository: ReviewGateRepository) => repository.listScopesForProject("")],
  ])("rejects malformed identities for %s reads", (_label, operation) => {
    const { database, repository } = createFixture();
    expect(() => operation(repository)).toThrow(/^INVALID_INPUT$/);
    database.close();
  });
});
