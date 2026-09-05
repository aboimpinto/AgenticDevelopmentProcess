// Behavior suite: replan governance.
import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

import { ReviewGovernanceSqliteStore } from "../src/review-governance-store.js";

const scope = { projectId: "hepha", featureId: "feat-066", phaseNumber: 2, reviewGateId: "code-review", defectClass: "replan-governance" };
const manifestHash = "a".repeat(64);
const planHash = "b".repeat(64);
const followUpManifestHash = "c".repeat(64);
const now = "2026-07-17T00:00:00.000Z";
let counter = 0;

function createStore(): ReviewGovernanceSqliteStore {
  const path = resolve(tmpdir(), `feat-066-store-${process.pid}-${++counter}`, "hepha.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  const store = new ReviewGovernanceSqliteStore(path, { currentActiveRuleSnapshots: [{ schemaVersion: 1, catalogSchemaVersion: 1, ruleId: "replan-governance", ruleVersion: "1.0.0", category: "architecture", scope: "review-governance", title: "Replan Governance", source: { document: "docs/architecture.md", section: "V1" }, catalogPath: ".hepha/architecture-rules.yaml", catalogSourceHash: "d".repeat(64), ruleHash: "e".repeat(64) }] });
  (store as unknown as { __testPath: string }).__testPath = path;
  return store;
}

function seedPredecessors(store: ReviewGovernanceSqliteStore, selectedScope = scope, suffix = "v1"): void {
  const database = store["database"];
  const artifact = database.prepare(`insert into hepha_review_artifacts
    (content_hash, artifact_id, artifact_kind, schema_version, project_id, feature_id, phase_number, review_gate_id, feature_root_path, artifact_relative_path, canonical_json, source_mode, ingested_at)
    values (?, ?, ?, 1, ?, ?, ?, ?, 'MemoryBank/Features/03_IN_PROGRESS/FEAT-066-defect-class-replan-workflow-and-approval-govern', ?, '{}', 'v1_validated_ingress', ?) `);
  const hashes = suffix === "v1" ? [manifestHash, planHash, followUpManifestHash] : ["f".repeat(63) + "1", "f".repeat(63) + "2", "f".repeat(63) + "3"];
  artifact.run(hashes[0], `manifest-${suffix}`, "review_manifest", selectedScope.projectId, selectedScope.featureId, selectedScope.phaseNumber, selectedScope.reviewGateId, `artifacts/${suffix}-manifest.json`, now);
  artifact.run(hashes[1], `plan-${suffix}`, "replan_plan", selectedScope.projectId, selectedScope.featureId, selectedScope.phaseNumber, selectedScope.reviewGateId, `artifacts/${suffix}-plan.json`, now);
  artifact.run(hashes[2], `follow-up-${suffix}`, "review_manifest", selectedScope.projectId, selectedScope.featureId, selectedScope.phaseNumber, selectedScope.reviewGateId, `artifacts/${suffix}-follow-up.json`, now);
  database.prepare(`insert into hepha_review_runs (review_run_id, manifest_hash, project_id, feature_id, phase_number, review_gate_id, manifest_result, agent_invocation_id, created_at)
    values (?, ?, ?, ?, ?, ?, 'NEEDS_CHANGES', 'review-agent-1', ?)`)
    .run(`run-${suffix}`, hashes[0], selectedScope.projectId, selectedScope.featureId, selectedScope.phaseNumber, selectedScope.reviewGateId, now);
  database.prepare(`insert into hepha_review_findings (review_run_id, finding_id, project_id, feature_id, phase_number, review_gate_id, disposition, claim_type, severity, defect_class, summary)
    values (?, ?, ?, ?, ?, ?, 'SCOPE_EXPANSION', 'architecture', 'required', ?, 'Scope expansion.')`)
    .run(`run-${suffix}`, `finding-${suffix}`, selectedScope.projectId, selectedScope.featureId, selectedScope.phaseNumber, selectedScope.reviewGateId, selectedScope.defectClass);
  database.prepare(`insert into hepha_review_finding_observations (observation_id, review_run_id, finding_id, surface_json, remediation_items_json, test_matrix_json, created_at)
    values (?, ?, ?, '[]', '[]', '[]', ?)`)
    .run(`finding-observation-${suffix}`, `run-${suffix}`, `finding-${suffix}`, now);
  database.prepare(`insert into hepha_review_remediation_cycles (cycle_id, project_id, feature_id, phase_number, review_gate_id, basis_manifest_hash, cycle_state, created_at)
    values (?, ?, ?, ?, ?, ?, 'REVIEW_PENDING', ?)`)
    .run(`cycle-${suffix}`, selectedScope.projectId, selectedScope.featureId, selectedScope.phaseNumber, selectedScope.reviewGateId, hashes[0], now);
  database.prepare(`insert into hepha_review_runs (review_run_id, manifest_hash, project_id, feature_id, phase_number, review_gate_id, manifest_result, created_at)
    values (?, ?, ?, ?, ?, ?, 'NEEDS_CHANGES', ?)`)
    .run(`follow-up-run-${suffix}`, hashes[2], selectedScope.projectId, selectedScope.featureId, selectedScope.phaseNumber, selectedScope.reviewGateId, now);
}

function hashesFor(suffix = "v1"): readonly [string, string, string] {
  return suffix === "v1" ? [manifestHash, planHash, followUpManifestHash] : ["f".repeat(63) + "1", "f".repeat(63) + "2", "f".repeat(63) + "3"];
}

function commit(store: ReviewGovernanceSqliteStore, kind: string, records: Record<string, unknown>): void {
  store.commitReplanGovernanceOperation({ kind, records });
}

function threshold(store: ReviewGovernanceSqliteStore, selectedScope = scope, aggregateId = "aggregate-v1", suffix = "v1"): void {
  const [manifest] = hashesFor(suffix);
  const eventSuffix = selectedScope === scope ? suffix : `${suffix}-${selectedScope.defectClass}-${selectedScope.phaseNumber}`;
  commit(store, "THRESHOLD_MANIFESTATION", {
    observation: { ...selectedScope, aggregateId, observationEventId: `observation-${eventSuffix}`, observationKind: "POST_FIX_MANIFESTATION", triggerManifestHash: manifest, basisManifestHash: manifest, remediationCycleId: `cycle-${suffix}`, createdAt: now },
    transition: { ...selectedScope, aggregateId, transitionId: `transition-threshold-${eventSuffix}`, fromState: "NORMAL_REMEDIATION", toState: "REMEDIATION_REPLAN_REQUIRED", reasonCode: "threshold-reached", triggerRecordId: `observation-${eventSuffix}`, triggerHash: manifest, expectedVersion: 0, resultingVersion: 1, transitionedAt: now },
  });
}

function operationBundle(kind: string): Record<string, Record<string, unknown>> {
  const base = { ...scope, aggregateId: "coherent-aggregate" };
  const transition = { ...base, transitionId: "transition-one", fromState: "NORMAL_REMEDIATION", toState: "REMEDIATION_REPLAN_REQUIRED", reasonCode: "coherent", triggerRecordId: "", expectedVersion: 0, resultingVersion: 1, transitionedAt: now };
  switch (kind) {
    case "THRESHOLD_MANIFESTATION": {
      const observation = { ...base, observationEventId: "observation-one" };
      return { observation, transition: { ...transition, triggerRecordId: observation.observationEventId } };
    }
    case "SCOPE_EXPANSION_ACCEPTED": {
      const decision = { ...base, decisionId: "decision-one", findingObservationId: "finding-one" };
      const observation = { ...base, observationEventId: "observation-one", decisionId: decision.decisionId, findingObservationId: decision.findingObservationId };
      return { decision, observation, transition: { ...transition, triggerRecordId: observation.observationEventId } };
    }
    case "SCOPE_EXPANSION_ACCEPTED_NO_THRESHOLD":
    case "SCOPE_EXPANSION_REJECTED": {
      const decision = { ...base, decisionId: "decision-one", findingObservationId: "finding-one" };
      return { decision, transition: { ...transition, triggerRecordId: decision.decisionId } };
    }
    case "PLAN_REQUEST": {
      const request = { ...base, requestId: "request-one" };
      return { request, transition: { ...transition, triggerRecordId: request.requestId } };
    }
    case "REPLAN_DECISION": {
      const decision = { ...base, decisionId: "decision-one" };
      return { decision, transition: { ...transition, triggerRecordId: decision.decisionId } };
    }
    case "DISPATCH_STARTED": {
      const dispatch = { ...base, attemptEventId: "attempt-one" };
      return { dispatch, transition: { ...transition, triggerRecordId: dispatch.attemptEventId } };
    }
    case "REVIEW_ASSESSMENT": {
      const assessment = { ...base, assessmentId: "assessment-one" };
      return { assessment, transition: { ...transition, triggerRecordId: assessment.assessmentId } };
    }
    default:
      throw new Error(`unexpected operation kind ${kind}`);
  }
}

describe("FEAT-066 V3 ReviewGovernanceSqliteStore", () => {
  it("commits each authoritative operation atomically and reconstructs assessment coverage after reopen", () => {
    const store = createStore();
    seedPredecessors(store);
    const aggregateId = "aggregate-v1";
    threshold(store, scope, aggregateId);
    expect(() => commit(store, "PLAN_REQUEST", {
      request: { ...scope, aggregateId, requestId: "rollback-request", triggerEventId: "observation-v1", planHash, planVersion: 1, proposalAuthorActor: "review-agent-1", producerInvocationId: "rollback-invocation", policyId: "replan-governance-v1", policyVersion: 1, requestedAt: now },
      transition: { ...scope, aggregateId, transitionId: "rollback-transition", fromState: "NORMAL_REMEDIATION", toState: "REPLAN_PENDING_APPROVAL", reasonCode: "rollback", triggerRecordId: "rollback-request", expectedVersion: 1, resultingVersion: 2, transitionedAt: now },
    })).toThrow("INVALID_INPUT");
    expect(store.getReplanGovernanceAggregate(scope, aggregateId).requests).toEqual([]);
    commit(store, "PLAN_REQUEST", {
      request: { ...scope, aggregateId, requestId: "request-v1", triggerEventId: "observation-v1", planHash, planVersion: 1, proposalAuthorActor: "review-agent-1", producerInvocationId: "invocation-v1", policyId: "replan-governance-v1", policyVersion: 1, requestedAt: now },
      transition: { ...scope, aggregateId, transitionId: "transition-request-v1", fromState: "REMEDIATION_REPLAN_REQUIRED", toState: "REPLAN_PENDING_APPROVAL", reasonCode: "request-created", triggerRecordId: "request-v1", expectedVersion: 1, resultingVersion: 2, transitionedAt: now },
    });
    commit(store, "REPLAN_DECISION", {
      decision: { ...scope, aggregateId, decisionId: "decision-v1", requestId: "request-v1", planHash, planVersion: 1, outcome: "APPROVE", actorId: "steward-1", policyId: "replan-governance-v1", policyVersion: 1, reason: "Approved bounded plan.", expectedVersion: 2, resultingVersion: 3, decidedAt: now },
      transition: { ...scope, aggregateId, transitionId: "transition-decision-v1", fromState: "REPLAN_PENDING_APPROVAL", toState: "REPLAN_APPROVED", reasonCode: "replan-approved", triggerRecordId: "decision-v1", expectedVersion: 2, resultingVersion: 3, transitionedAt: now },
    });
    commit(store, "DISPATCH_STARTED", {
      dispatch: { ...scope, aggregateId, attemptEventId: "attempt-start-v1", dispatchId: "dispatch-v1", requestId: "request-v1", planHash, planVersion: 1, approvalDecisionId: "decision-v1", approvalEventVersion: 3, outcome: "STARTED", workflowRunId: "workflow-v1", attemptedAt: now },
      transition: { ...scope, aggregateId, transitionId: "transition-dispatch-v1", fromState: "REPLAN_APPROVED", toState: "BOUNDED_REMEDIATION_DISPATCHED", reasonCode: "dispatch-started", triggerRecordId: "attempt-start-v1", expectedVersion: 3, resultingVersion: 4, transitionedAt: now },
    });
    commit(store, "REVIEW_ASSESSMENT", {
      assessment: { ...scope, aggregateId, assessmentId: "assessment-v1", dispatchId: "dispatch-v1", reviewManifestHash: followUpManifestHash, reviewRunId: "follow-up-run-v1", planHash, planVersion: 1, outcome: "APPROVED", assessedSurfaceIds: ["surface-one", "surface-two"], assessedRemediationItemIds: ["item-one"], assessedTestIds: ["test-one"], createdAt: now },
      transition: { ...scope, aggregateId, transitionId: "transition-assessment-v1", fromState: "BOUNDED_REMEDIATION_DISPATCHED", toState: "REVIEW_PENDING", reasonCode: "assessment-recorded", triggerRecordId: "assessment-v1", expectedVersion: 4, resultingVersion: 5, transitionedAt: now },
    });
    expect(store.getReplanGovernanceAggregate(scope, aggregateId)).toMatchObject({ state: "REVIEW_PENDING", eventVersion: 5, decisions: [{ authorizedRole: "ARCHITECTURE_STEWARD" }], reviewAssessments: [{ assessedSurfaceIds: ["surface-one", "surface-two"], assessedRemediationItemIds: ["item-one"], assessedTestIds: ["test-one"] }] });
    const dbPath = (store as unknown as { __testPath: string }).__testPath;
    store.close();
    const reopened = new ReviewGovernanceSqliteStore(dbPath, { currentActiveRuleSnapshots: [{ schemaVersion: 1, catalogSchemaVersion: 1, ruleId: "replan-governance", ruleVersion: "1.0.0", category: "architecture", scope: "review-governance", title: "Replan Governance", source: { document: "docs/architecture.md", section: "V1" }, catalogPath: ".hepha/architecture-rules.yaml", catalogSourceHash: "d".repeat(64), ruleHash: "e".repeat(64) }] });
    expect(reopened.getReplanGovernanceAggregate(scope, aggregateId).reviewAssessments[0]).toMatchObject({ assessedSurfaceIds: ["surface-one", "surface-two"], assessedRemediationItemIds: ["item-one"], assessedTestIds: ["test-one"] });
    reopened.close(); rmSync(dirname(dbPath), { recursive: true, force: true });
  });

  it("isolates same aggregate IDs by exact class and review scope", () => {
    const store = createStore();
    seedPredecessors(store);
    const classScope = { ...scope, defectClass: "another-class" };
    const phaseScope = { ...scope, phaseNumber: 3 };
    seedPredecessors(store, phaseScope, "phase-three");
    threshold(store, scope, "shared-id");
    threshold(store, classScope, "shared-id");
    threshold(store, phaseScope, "shared-id", "phase-three");
    expect(store.getReplanGovernanceAggregate(scope, "shared-id")).toMatchObject({ eventVersion: 1, state: "REMEDIATION_REPLAN_REQUIRED" });
    expect(store.getReplanGovernanceAggregate(classScope, "shared-id")).toMatchObject({ eventVersion: 1, state: "REMEDIATION_REPLAN_REQUIRED" });
    expect(store.getReplanGovernanceAggregate(phaseScope, "shared-id")).toMatchObject({ eventVersion: 1, state: "REMEDIATION_REPLAN_REQUIRED" });
    const before = store.getReplanGovernanceAggregate(scope, "shared-id");
    expect(() => commit(store, "THRESHOLD_MANIFESTATION", { observation: { ...scope, aggregateId: "shared-id", observationEventId: "foreign-observation", observationKind: "POST_FIX_MANIFESTATION", triggerManifestHash: "f".repeat(63) + "1", basisManifestHash: "f".repeat(63) + "1", remediationCycleId: "cycle-v1", createdAt: now }, transition: { ...scope, aggregateId: "shared-id", transitionId: "foreign-transition", fromState: "REMEDIATION_REPLAN_REQUIRED", toState: "REPLAN_PENDING_APPROVAL", reasonCode: "foreign", triggerRecordId: "foreign-observation", expectedVersion: 1, resultingVersion: 2, transitionedAt: now } })).toThrow("INVALID_INPUT");
    expect(store.getReplanGovernanceAggregate(scope, "shared-id")).toEqual(before);
    store.close();
  });

  it("rejects incoherent operation bundles before any row mutation", () => {
    const store = createStore();
    const before = store.getReplanGovernanceAggregate(scope, "coherent-aggregate");
    const multiRowKinds = ["THRESHOLD_MANIFESTATION", "SCOPE_EXPANSION_ACCEPTED", "SCOPE_EXPANSION_ACCEPTED_NO_THRESHOLD", "SCOPE_EXPANSION_REJECTED", "PLAN_REQUEST", "REPLAN_DECISION", "DISPATCH_STARTED", "REVIEW_ASSESSMENT"]; 
    const scopeMismatches: ReadonlyArray<readonly [string, unknown]> = [["projectId", "other-project"], ["featureId", "other-feature"], ["phaseNumber", 3], ["reviewGateId", "other-gate"], ["defectClass", "other-class"], ["aggregateId", "other-aggregate"]];
    for (const kind of multiRowKinds) {
      for (const sibling of Object.keys(operationBundle(kind)).slice(1)) {
        for (const [field, value] of scopeMismatches) {
          const records = operationBundle(kind);
          records[sibling]![field] = value;
          expect(() => commit(store, kind, records)).toThrow("INVALID_INPUT");
          expect(store.getReplanGovernanceAggregate(scope, "coherent-aggregate")).toEqual(before);
        }
      }
      const records = operationBundle(kind);
      if ("transition" in records) records.transition!.triggerRecordId = "unrelated-trigger";
      else records.observation!.decisionId = "unrelated-decision";
      expect(() => commit(store, kind, records)).toThrow("INVALID_INPUT");
      expect(store.getReplanGovernanceAggregate(scope, "coherent-aggregate")).toEqual(before);
    }
    store.close();
  });

  it("rejects caller-supplied roles and invalid assessment coverage without mutation", () => {
    const store = createStore();
    seedPredecessors(store);
    const aggregateId = "aggregate-v2";
    threshold(store, scope, aggregateId);
    const before = store.getReplanGovernanceAggregate(scope, aggregateId);
    for (const authorizedRole of ["FEATURE_OWNER", "ARCHITECTURE_STEWARD", null, 1]) {
      expect(() => commit(store, "SCOPE_EXPANSION_REJECTED", { decision: { ...scope, aggregateId, decisionId: `role-${String(authorizedRole)}`, findingObservationId: "finding-observation-v1", outcome: "REJECT", actorId: "feature-owner-1", authorizedRole, policyId: "replan-governance-v1", policyVersion: 1, reason: "Reject.", expectedVersion: 1, resultingVersion: 2, decidedAt: now } })).toThrow("INVALID_INPUT");
      expect(() => commit(store, "REPLAN_DECISION", { decision: { ...scope, aggregateId, decisionId: `replan-role-${String(authorizedRole)}`, requestId: "missing-request", planHash, planVersion: 1, outcome: "REJECT", actorId: "steward-1", authorizedRole, policyId: "replan-governance-v1", policyVersion: 1, reason: "Reject.", expectedVersion: 1, resultingVersion: 2, decidedAt: now }, transition: { ...scope, aggregateId, transitionId: `replan-role-transition-${String(authorizedRole)}`, fromState: "REMEDIATION_REPLAN_REQUIRED", toState: "REPLAN_REJECTED", reasonCode: "replan-rejected", triggerRecordId: `replan-role-${String(authorizedRole)}`, expectedVersion: 1, resultingVersion: 2, transitionedAt: now } })).toThrow("INVALID_INPUT");
    }
    const assessment = { ...scope, aggregateId, assessmentId: "bad-assessment", dispatchId: "dispatch-none", reviewManifestHash: followUpManifestHash, reviewRunId: "follow-up-run-v1", planHash, planVersion: 1, outcome: "APPROVED", assessedSurfaceIds: ["surface-one"], assessedRemediationItemIds: ["item-one"], assessedTestIds: ["test-one"], createdAt: now };
    for (const [field, maximum] of [["assessedSurfaceIds", 128], ["assessedRemediationItemIds", 64], ["assessedTestIds", 64]] as const) {
      for (const invalid of [undefined, null, "not-an-array", [], ["duplicate", "duplicate"], Array.from({ length: maximum + 1 }, (_, index) => `value-${index}`)]) {
        expect(() => commit(store, "REVIEW_ASSESSMENT", { assessment: { ...assessment, [field]: invalid }, transition: { ...scope, aggregateId, transitionId: "bad-transition", fromState: "REMEDIATION_REPLAN_REQUIRED", toState: "REVIEW_PENDING", reasonCode: "bad-assessment", triggerRecordId: "bad-assessment", expectedVersion: 1, resultingVersion: 2, transitionedAt: now } })).toThrow("INVALID_INPUT");
      }
    }
    expect(store.getReplanGovernanceAggregate(scope, aggregateId)).toEqual(before);
    store.close();
  });

  it("commits a replan rejection with its matching transition", () => {
    const store = createStore();
    seedPredecessors(store);
    const aggregateId = "reject-aggregate";
    threshold(store, scope, aggregateId);
    commit(store, "PLAN_REQUEST", { request: { ...scope, aggregateId, requestId: "reject-request", triggerEventId: "observation-v1", planHash, planVersion: 1, proposalAuthorActor: "review-agent-1", producerInvocationId: "reject-invocation", policyId: "replan-governance-v1", policyVersion: 1, requestedAt: now }, transition: { ...scope, aggregateId, transitionId: "reject-request-transition", fromState: "REMEDIATION_REPLAN_REQUIRED", toState: "REPLAN_PENDING_APPROVAL", reasonCode: "request-created", triggerRecordId: "reject-request", expectedVersion: 1, resultingVersion: 2, transitionedAt: now } });
    commit(store, "REPLAN_DECISION", { decision: { ...scope, aggregateId, decisionId: "reject-decision", requestId: "reject-request", planHash, planVersion: 1, outcome: "REJECT", actorId: "steward-reject", policyId: "replan-governance-v1", policyVersion: 1, reason: "Reject plan.", expectedVersion: 2, resultingVersion: 3, decidedAt: now }, transition: { ...scope, aggregateId, transitionId: "reject-decision-transition", fromState: "REPLAN_PENDING_APPROVAL", toState: "REPLAN_REJECTED", reasonCode: "replan-rejected", triggerRecordId: "reject-decision", expectedVersion: 2, resultingVersion: 3, transitionedAt: now } });
    expect(store.getReplanGovernanceAggregate(scope, aggregateId)).toMatchObject({ state: "REPLAN_REJECTED", eventVersion: 3, decisions: [{ outcome: "REJECT", authorizedRole: "ARCHITECTURE_STEWARD" }] });
    store.close();
  });

  it("commits non-threshold and accepted-expansion evidence without a public row-by-row fallback", () => {
    const store = createStore();
    seedPredecessors(store);
    commit(store, "OBSERVATION", { observation: { ...scope, aggregateId: "normal-aggregate", observationEventId: "normal-observation", observationKind: "POST_FIX_MANIFESTATION", triggerManifestHash: manifestHash, basisManifestHash: manifestHash, remediationCycleId: "cycle-v1", createdAt: now } });
    commit(store, "SCOPE_EXPANSION_ACCEPTED_NO_THRESHOLD", {
      decision: { ...scope, aggregateId: "expansion-aggregate", decisionId: "expansion-decision", findingObservationId: "finding-observation-v1", outcome: "ACCEPT", actorId: "feature-owner-1", policyId: "replan-governance-v1", policyVersion: 1, reason: "Accepted expansion.", expectedVersion: 0, resultingVersion: 1, decidedAt: now },
      transition: { ...scope, aggregateId: "expansion-aggregate", transitionId: "expansion-decision-transition", fromState: "NORMAL_REMEDIATION", toState: "NORMAL_REMEDIATION", reasonCode: "scope-expansion-accepted", triggerRecordId: "expansion-decision", expectedVersion: 0, resultingVersion: 1, transitionedAt: now },
    });
    commit(store, "OBSERVATION", {
      observation: { ...scope, aggregateId: "expansion-aggregate", observationEventId: "expansion-observation", observationKind: "SCOPE_EXPANSION_ACCEPTED", triggerManifestHash: manifestHash, basisManifestHash: manifestHash, findingObservationId: "finding-observation-v1", decisionId: "expansion-decision", createdAt: now },
    });
    expect(store.getReplanGovernanceAggregate(scope, "normal-aggregate")).toMatchObject({ state: "NORMAL_REMEDIATION", eventVersion: 0, observations: [{ observationKind: "POST_FIX_MANIFESTATION" }] });
    expect(store.getReplanGovernanceAggregate(scope, "expansion-aggregate")).toMatchObject({ state: "NORMAL_REMEDIATION", eventVersion: 1, scopeExpansionDecisions: [{ authorizedRole: "FEATURE_OWNER" }], observations: [{ observationKind: "SCOPE_EXPANSION_ACCEPTED" }] });
    store.close();
  });

  it("records START_FAILED only after its matching durable STARTED reservation and consumes the plan", () => {
    const store = createStore();
    seedPredecessors(store);
    const aggregateId = "aggregate-v3";
    threshold(store, scope, aggregateId);
    commit(store, "PLAN_REQUEST", { request: { ...scope, aggregateId, requestId: "request-v3", triggerEventId: "observation-v1", planHash, planVersion: 1, proposalAuthorActor: "review-agent-1", producerInvocationId: "invocation-v3", policyId: "replan-governance-v1", policyVersion: 1, requestedAt: now }, transition: { ...scope, aggregateId, transitionId: "request-transition-v3", fromState: "REMEDIATION_REPLAN_REQUIRED", toState: "REPLAN_PENDING_APPROVAL", reasonCode: "request-created", triggerRecordId: "request-v3", expectedVersion: 1, resultingVersion: 2, transitionedAt: now } });
    commit(store, "REPLAN_DECISION", { decision: { ...scope, aggregateId, decisionId: "decision-v3", requestId: "request-v3", planHash, planVersion: 1, outcome: "APPROVE", actorId: "steward-3", policyId: "replan-governance-v1", policyVersion: 1, reason: "Approve.", expectedVersion: 2, resultingVersion: 3, decidedAt: now }, transition: { ...scope, aggregateId, transitionId: "decision-transition-v3", fromState: "REPLAN_PENDING_APPROVAL", toState: "REPLAN_APPROVED", reasonCode: "replan-approved", triggerRecordId: "decision-v3", expectedVersion: 2, resultingVersion: 3, transitionedAt: now } });
    const started = { ...scope, aggregateId, attemptEventId: "attempt-start-v3", dispatchId: "dispatch-v3", requestId: "request-v3", planHash, planVersion: 1, approvalDecisionId: "decision-v3", approvalEventVersion: 3, outcome: "STARTED", workflowRunId: "workflow-v3", attemptedAt: now };
    expect(() => commit(store, "DISPATCH_FAILED", { dispatch: { ...started, attemptEventId: "failure-first", outcome: "START_FAILED" } })).toThrow("INVALID_INPUT");
    commit(store, "DISPATCH_STARTED", { dispatch: started, transition: { ...scope, aggregateId, transitionId: "dispatch-transition-v3", fromState: "REPLAN_APPROVED", toState: "BOUNDED_REMEDIATION_DISPATCHED", reasonCode: "dispatch-started", triggerRecordId: "attempt-start-v3", expectedVersion: 3, resultingVersion: 4, transitionedAt: now } });
    commit(store, "DISPATCH_FAILED", { dispatch: { ...started, attemptEventId: "attempt-failed-v3", outcome: "START_FAILED", reasonCode: "launch-failed" } });
    expect(store.getReplanGovernanceAggregate(scope, aggregateId).dispatchAttempts.map((attempt) => attempt.outcome)).toEqual(["STARTED", "START_FAILED"]);
    expect(() => commit(store, "DISPATCH_STARTED", { dispatch: { ...started, attemptEventId: "attempt-retry-v3", dispatchId: "new-dispatch", workflowRunId: "new-workflow" }, transition: { ...scope, aggregateId, transitionId: "retry-transition-v3", fromState: "BOUNDED_REMEDIATION_DISPATCHED", toState: "BOUNDED_REMEDIATION_DISPATCHED", reasonCode: "retry", triggerRecordId: "attempt-retry-v3", expectedVersion: 4, resultingVersion: 5, transitionedAt: now } })).toThrow("INVALID_INPUT");
    store.close();
  });
});
