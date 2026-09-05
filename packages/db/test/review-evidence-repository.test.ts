import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ReviewEvidenceRepository } from "../src/review-governance/evidence-repository.js";
import { applyReviewGovernanceMigrations } from "../src/review-governance/migrations/index.js";

const scope = { projectId: "project-alpha", featureId: "work-item-alpha", phaseNumber: 2, reviewGateId: "review-gate" };
const manifestHash = "a".repeat(64);

function createFixture() {
  const database = new DatabaseSync(":memory:");
  applyReviewGovernanceMigrations(database);
  database.prepare(`insert into hepha_review_artifacts
    (content_hash, artifact_id, artifact_kind, schema_version, project_id, feature_id, phase_number,
     review_gate_id, feature_root_path, artifact_relative_path, canonical_json, source_mode, ingested_at)
    values (?, 'manifest-alpha', 'review_manifest', 1, ?, ?, ?, ?, 'MemoryBank/current',
     'artifacts/manifest.json', '{}', 'v1_validated_ingress', '2026-07-21T08:00:00Z')`)
    .run(manifestHash, scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId);
  database.prepare(`insert into hepha_review_runs
    (review_run_id, manifest_hash, project_id, feature_id, phase_number, review_gate_id, manifest_result, created_at)
    values ('run-alpha', ?, ?, ?, ?, ?, 'NEEDS_CHANGES', '2026-07-21T08:00:00Z')`)
    .run(manifestHash, scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId);
  database.prepare(`insert into hepha_review_findings
    (review_run_id, finding_id, project_id, feature_id, phase_number, review_gate_id, disposition,
     claim_type, severity, defect_class, summary, rule_reference)
    values ('run-alpha', 'finding-alpha', ?, ?, ?, ?, 'IN_SCOPE_BLOCKER', 'quality', 'required',
     'contract-drift', 'Repair the contract', 'rule-alpha')`)
    .run(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId);
  database.prepare(`insert into hepha_review_finding_observations
    (observation_id, review_run_id, finding_id, surface_json, remediation_items_json, test_matrix_json,
     root_cause, scope_rationale, created_at)
    values ('observation-alpha', 'run-alpha', 'finding-alpha', '[]', '[]', '[]',
     'stale projection', null, '2026-07-21T08:05:00Z')`).run();
  database.prepare(`insert into hepha_review_remediation_cycles
    (cycle_id, project_id, feature_id, phase_number, review_gate_id, basis_manifest_hash,
     cycle_state, reason_code, created_at)
    values ('cycle-alpha', ?, ?, ?, ?, ?, 'OPEN', 'findings-open', '2026-07-21T08:10:00Z')`)
    .run(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, manifestHash);
  database.prepare(`insert into hepha_review_remediation_items
    (item_event_id, cycle_id, review_run_id, finding_id, remediation_item_id, event_kind,
     response_hash, decision, outcome_summary, created_at)
    values ('item-event-alpha', 'cycle-alpha', 'run-alpha', 'finding-alpha', 'item-alpha',
     'response', ?, 'APPLIED', 'fixed', '2026-07-21T08:15:00Z')`).run(manifestHash);
  database.prepare(`insert into hepha_review_verification_receipts
    (receipt_event_id, cycle_id, receipt_hash, review_run_id, finding_id, subject_kind,
     subject_id, outcome, evidence_summary, created_at)
    values ('receipt-event-alpha', 'cycle-alpha', ?, 'run-alpha', 'finding-alpha', 'test',
     'test-alpha', 'PASSED', 'green', '2026-07-21T08:20:00Z')`).run(manifestHash);
  return { database, repository: new ReviewEvidenceRepository(database) };
}

describe("review evidence repository", () => {
  it("reads findings and their immutable observation context", () => {
    const { database, repository } = createFixture();
    expect(repository.listFindingsByRun("run-alpha")).toEqual([expect.objectContaining({
      findingId: "finding-alpha", defectClass: "contract-drift", ruleReference: "rule-alpha", ruleId: null,
    })]);
    expect(repository.getObservationContext("observation-alpha")).toMatchObject({ ...scope, manifestHash, disposition: "IN_SCOPE_BLOCKER" });
    expect(repository.getObservationContext("observation-missing")).toBeNull();
    database.close();
  });

  it("reads observations and exact-scope remediation cycles", () => {
    const { database, repository } = createFixture();
    expect(repository.listObservationsByRun("run-alpha")).toEqual([expect.objectContaining({
      observationId: "observation-alpha", rootCause: "stale projection", scopeRationale: null,
    })]);
    expect(repository.listCyclesByScope(scope)).toEqual([expect.objectContaining({
      cycleId: "cycle-alpha", cycleState: "OPEN", predecessorCycleId: null,
    })]);
    expect(repository.listCyclesByScope({ ...scope, featureId: "work-item-missing" })).toEqual([]);
    database.close();
  });

  it("reads ordered remediation and verification evidence", () => {
    const { database, repository } = createFixture();
    expect(repository.listRemediationItemsByRun("run-alpha")).toEqual([expect.objectContaining({
      itemEventId: "item-event-alpha", decision: "APPLIED", responseHash: manifestHash,
    })]);
    expect(repository.listVerificationReceiptsByRun("run-alpha")).toEqual([expect.objectContaining({
      receiptEventId: "receipt-event-alpha", subjectKind: "test", outcome: "PASSED",
    })]);
    expect(repository.listFindingsByRun("run-missing")).toEqual([]);
    database.close();
  });

  it.each([
    ["finding run", (repository: ReviewEvidenceRepository) => repository.listFindingsByRun("")],
    ["observation run", (repository: ReviewEvidenceRepository) => repository.listObservationsByRun(null)],
    ["cycle scope", (repository: ReviewEvidenceRepository) => repository.listCyclesByScope({ ...scope, extra: true })],
    ["item run", (repository: ReviewEvidenceRepository) => repository.listRemediationItemsByRun("x".repeat(257))],
    ["receipt run", (repository: ReviewEvidenceRepository) => repository.listVerificationReceiptsByRun([])],
    ["observation identity", (repository: ReviewEvidenceRepository) => repository.getObservationContext("Observation Wrong")],
  ])("rejects malformed %s identities", (_label, operation) => {
    const { database, repository } = createFixture();
    expect(() => operation(repository)).toThrow(/^INVALID_INPUT$/);
    database.close();
  });
});
