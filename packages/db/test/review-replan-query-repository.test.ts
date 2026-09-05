import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ReviewReplanQueryRepository } from "../src/review-governance/replan-query-repository.js";
import { applyReviewGovernanceMigrations } from "../src/review-governance/migrations/index.js";

const reviewScope = { projectId: "project-alpha", featureId: "work-item-alpha", phaseNumber: 2, reviewGateId: "review-gate" };
const scope = { ...reviewScope, defectClass: "contract-drift" };

function createFixture() {
  const database = new DatabaseSync(":memory:");
  applyReviewGovernanceMigrations(database);
  database.prepare(`insert into hepha_review_artifacts
    (content_hash, artifact_id, artifact_kind, schema_version, project_id, feature_id, phase_number,
     review_gate_id, feature_root_path, artifact_relative_path, canonical_json, source_mode, ingested_at)
    values (?, 'manifest-alpha', 'review_manifest', 1, ?, ?, ?, ?, 'MemoryBank/current',
     'artifacts/manifest.json', '{}', 'v1_validated_ingress', '2026-07-21T07:59:00Z')`)
    .run("a".repeat(64), scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId);
  database.prepare(`insert into hepha_review_defect_class_observations
    (observation_event_id, aggregate_id, project_id, feature_id, phase_number, review_gate_id,
     defect_class, observation_kind, trigger_manifest_hash, basis_manifest_hash, created_at)
    values ('observation-event-alpha', 'aggregate-alpha', ?, ?, ?, ?, ?, 'FINDING_EXHAUSTIVENESS', ?, ?, '2026-07-21T08:00:00Z')`)
    .run(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, scope.defectClass,
      "a".repeat(64), "a".repeat(64));
  database.prepare(`insert into hepha_review_replan_transition_events
    (transition_id, aggregate_id, project_id, feature_id, phase_number, review_gate_id, defect_class,
     from_state, to_state, reason_code, trigger_record_id, expected_version, resulting_version, transitioned_at)
    values ('transition-alpha', 'aggregate-alpha', ?, ?, ?, ?, ?, 'NORMAL_REMEDIATION',
     'REMEDIATION_REPLAN_REQUIRED', 'threshold', 'observation-event-alpha', 0, 1, '2026-07-21T08:01:00Z')`)
    .run(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, scope.defectClass);
  database.prepare(`insert into hepha_review_replan_transition_events
    (transition_id, aggregate_id, project_id, feature_id, phase_number, review_gate_id, defect_class,
     from_state, to_state, reason_code, trigger_record_id, expected_version, resulting_version, transitioned_at)
    values ('transition-beta', 'aggregate-beta', ?, ?, ?, ?, 'scope-expansion', 'NORMAL_REMEDIATION',
     'REVIEW_PENDING', 'accepted', 'decision-beta', 0, 1, '2026-07-21T09:00:00Z')`)
    .run(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId);
  return { database, repository: new ReviewReplanQueryRepository(database) };
}

describe("review replan query repository", () => {
  it("reconstructs immutable aggregate state and evidence", () => {
    const { database, repository } = createFixture();
    expect(repository.getAggregate(scope, "aggregate-alpha")).toMatchObject({
      scope, aggregateId: "aggregate-alpha", eventVersion: 1,
      state: "REMEDIATION_REPLAN_REQUIRED",
      observations: [expect.objectContaining({ observationEventId: "observation-event-alpha" })],
      transitions: [expect.objectContaining({ transitionId: "transition-alpha", resultingVersion: 1 })],
    });
    database.close();
  });

  it("returns an empty default projection for an absent valid aggregate", () => {
    const { database, repository } = createFixture();
    expect(repository.getAggregate(scope, "aggregate-missing")).toMatchObject({
      state: "NORMAL_REMEDIATION", eventVersion: 0, observations: [], transitions: [],
    });
    database.close();
  });

  it("discovers exact-scope and project aggregates deterministically", () => {
    const { database, repository } = createFixture();
    expect(repository.listAggregates(reviewScope).map(({ aggregateId }) => aggregateId))
      .toEqual(["aggregate-alpha", "aggregate-beta"]);
    expect(repository.listForProject(scope.projectId).map(({ aggregateId }) => aggregateId))
      .toEqual(["aggregate-alpha", "aggregate-beta"]);
    expect(repository.listForProject("project-missing")).toEqual([]);
    database.close();
  });

  it.each([
    ["aggregate scope", (repository: ReviewReplanQueryRepository) => repository.getAggregate({ ...scope, extra: true }, "aggregate-alpha")],
    ["aggregate identity", (repository: ReviewReplanQueryRepository) => repository.getAggregate(scope, "Aggregate Wrong")],
    ["review scope", (repository: ReviewReplanQueryRepository) => repository.listAggregates({ ...reviewScope, phaseNumber: -1 })],
    ["project identity", (repository: ReviewReplanQueryRepository) => repository.listForProject("")],
  ])("rejects malformed %s reads", (_label, operation) => {
    const { database, repository } = createFixture();
    expect(() => operation(repository)).toThrow(/^INVALID_INPUT$/);
    database.close();
  });
});
