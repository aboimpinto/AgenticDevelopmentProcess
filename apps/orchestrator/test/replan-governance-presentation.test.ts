// Behavior suite: replan governance.
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewGovernanceSqliteStore, type StoredReplanGovernanceAggregate } from "@hepha/db";

import {
  decideReplanApproval,
  decideScopeExpansion,
  projectReplanGovernance,
  renderReplanGovernance,
  resolveLoopbackGovernanceAuthority,
} from "../src/replan-governance-presentation.js";

const scope = { projectId: "hepha", featureId: "feat-066", phaseNumber: 4, reviewGateId: "code-review", defectClass: "replan-governance" };
const manifestHash = "a".repeat(64);
const planHash = "b".repeat(64);
const now = "2026-07-18T12:00:00.000Z";
let counter = 0;
const originalActor = process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID;
const originalRoles = process.env.HEPHA_LOCAL_GOVERNANCE_ROLES;

afterEach(() => {
  if (originalActor === undefined) delete process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID;
  else process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID = originalActor;
  if (originalRoles === undefined) delete process.env.HEPHA_LOCAL_GOVERNANCE_ROLES;
  else process.env.HEPHA_LOCAL_GOVERNANCE_ROLES = originalRoles;
});

function createStore(): ReviewGovernanceSqliteStore {
  const path = resolve(tmpdir(), `feat-066-presentation-${process.pid}-${++counter}`, "hepha.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  const store = new ReviewGovernanceSqliteStore(path, {
    currentActiveRuleSnapshots: [{ schemaVersion: 1, catalogSchemaVersion: 1, ruleId: "replan-governance", ruleVersion: "1.0.0", category: "architecture", scope: "review-governance", title: "Replan Governance", source: { document: "docs/architecture.md", section: "V1" }, catalogPath: ".hepha/architecture-rules.yaml", catalogSourceHash: "d".repeat(64), ruleHash: "e".repeat(64) }],
  });
  (store as unknown as { __testPath: string }).__testPath = path;
  return store;
}

function closeStore(store: ReviewGovernanceSqliteStore): void {
  const path = (store as unknown as { __testPath: string }).__testPath;
  store.close();
  rmSync(dirname(path), { recursive: true, force: true });
}

function seedPredecessors(
  store: ReviewGovernanceSqliteStore,
  selectedScope = scope,
  findingObservationId = "finding-observation-066",
  disposition = "SCOPE_EXPANSION",
): void {
  const database = (store as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
  const artifact = database.prepare(`insert into hepha_review_artifacts
    (content_hash, artifact_id, artifact_kind, schema_version, project_id, feature_id, phase_number, review_gate_id, feature_root_path, artifact_relative_path, canonical_json, source_mode, ingested_at)
    values (?, ?, ?, 1, ?, ?, ?, ?, 'MemoryBank/Features/03_IN_PROGRESS/FEAT-066-defect-class-replan-workflow-and-approval-govern', ?, '{}', 'v1_validated_ingress', ?)`);
  artifact.run(manifestHash, "manifest-066", "review_manifest", selectedScope.projectId, selectedScope.featureId, selectedScope.phaseNumber, selectedScope.reviewGateId, "artifacts/manifest.json", now);
  artifact.run(planHash, "plan-066", "replan_plan", selectedScope.projectId, selectedScope.featureId, selectedScope.phaseNumber, selectedScope.reviewGateId, "artifacts/plan.json", now);
  database.prepare(`insert into hepha_review_runs (review_run_id, manifest_hash, project_id, feature_id, phase_number, review_gate_id, manifest_result, agent_invocation_id, created_at)
    values ('run-066', ?, ?, ?, ?, ?, 'NEEDS_CHANGES', 'review-agent-1', ?)`)
    .run(manifestHash, selectedScope.projectId, selectedScope.featureId, selectedScope.phaseNumber, selectedScope.reviewGateId, now);
  database.prepare(`insert into hepha_review_findings (review_run_id, finding_id, project_id, feature_id, phase_number, review_gate_id, disposition, claim_type, severity, defect_class, summary)
    values ('run-066', 'finding-066', ?, ?, ?, ?, ?, 'architecture', 'required', ?, 'Scope expansion.')`)
    .run(selectedScope.projectId, selectedScope.featureId, selectedScope.phaseNumber, selectedScope.reviewGateId, disposition, selectedScope.defectClass);
  database.prepare(`insert into hepha_review_finding_observations (observation_id, review_run_id, finding_id, surface_json, remediation_items_json, test_matrix_json, created_at)
    values (?, 'run-066', 'finding-066', '[]', '[]', '[]', ?)`)
    .run(findingObservationId, now);
  database.prepare(`insert into hepha_review_remediation_cycles (cycle_id, project_id, feature_id, phase_number, review_gate_id, basis_manifest_hash, cycle_state, created_at)
    values ('cycle-066', ?, ?, ?, ?, ?, 'REVIEW_PENDING', ?)`)
    .run(selectedScope.projectId, selectedScope.featureId, selectedScope.phaseNumber, selectedScope.reviewGateId, manifestHash, now);
}

function seedPendingRequest(store: ReviewGovernanceSqliteStore, aggregateId = "replan-aggregate"): void {
  store.commitReplanGovernanceOperation({
    kind: "THRESHOLD_MANIFESTATION",
    records: {
      observation: { ...scope, aggregateId, observationEventId: "threshold-observation", observationKind: "POST_FIX_MANIFESTATION", triggerManifestHash: manifestHash, basisManifestHash: manifestHash, remediationCycleId: "cycle-066", createdAt: now },
      transition: { ...scope, aggregateId, transitionId: "threshold-transition", fromState: "NORMAL_REMEDIATION", toState: "REMEDIATION_REPLAN_REQUIRED", reasonCode: "threshold-reached", triggerRecordId: "threshold-observation", expectedVersion: 0, resultingVersion: 1, transitionedAt: now },
    },
  });
  store.commitReplanGovernanceOperation({
    kind: "PLAN_REQUEST",
    records: {
      request: { ...scope, aggregateId, requestId: "replan-request", triggerEventId: "threshold-observation", planHash, planVersion: 1, proposalAuthorActor: "review-agent-1", producerInvocationId: "review-invocation-066", policyId: "replan-governance-v1", policyVersion: 1, requestedAt: now },
      transition: { ...scope, aggregateId, transitionId: "request-transition", fromState: "REMEDIATION_REPLAN_REQUIRED", toState: "REPLAN_PENDING_APPROVAL", reasonCode: "request-created", triggerRecordId: "replan-request", expectedVersion: 1, resultingVersion: 2, transitionedAt: now },
    },
  });
}

function setAuthority(actorId: string, roles: string): void {
  process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID = actorId;
  process.env.HEPHA_LOCAL_GOVERNANCE_ROLES = roles;
}

function emptyAggregate(): StoredReplanGovernanceAggregate {
  return { scope, aggregateId: "projection-aggregate", eventVersion: 0, state: "NORMAL_REMEDIATION", observations: [], requests: [], scopeExpansionDecisions: [], decisions: [], transitions: [], dispatchAttempts: [], reviewAssessments: [] };
}

function aggregateForTransitionStates(states: readonly string[]): StoredReplanGovernanceAggregate {
  const base = emptyAggregate();
  const transitions = states.map((toState, index) => ({
    ...scope,
    aggregateId: base.aggregateId,
    transitionId: `transition-${index}`,
    fromState: index === 0 ? "NORMAL_REMEDIATION" : states[index - 1],
    toState,
    reasonCode: "transition",
    triggerRecordId: `trigger-${index}`,
    expectedVersion: index,
    resultingVersion: index + 1,
    transitionedAt: now,
  }));
  return { ...base, eventVersion: transitions.length, state: transitions.at(-1)?.toState ?? "NORMAL_REMEDIATION", transitions } as unknown as StoredReplanGovernanceAggregate;
}

describe("FEAT-066 public replan governance presentation", () => {
  it("projects only immutable allowlisted governance fields and refuses unsafe or malformed aggregates", () => {
    const source = emptyAggregate();
    const projection = projectReplanGovernance(source);
    expect(projection).toMatchObject({ kind: "replan_governance", authority: "presentation_only", scope, recurrence: { postFixManifestations: 0, acceptedScopeExpansions: 0 } });
    if (projection.kind === "replan_governance") {
      expect(Object.isFrozen(projection)).toBe(true);
      expect(Object.isFrozen(projection.scope)).toBe(true);
      expect("canonicalJson" in projection).toBe(false);
      expect("action" in projection).toBe(false);
    }
    const requestSource: StoredReplanGovernanceAggregate = {
      ...source,
      eventVersion: 2,
      state: "REPLAN_PENDING_APPROVAL",
      transitions: [
        { ...scope, aggregateId: source.aggregateId, transitionId: "projection-transition-one", fromState: "NORMAL_REMEDIATION", toState: "REMEDIATION_REPLAN_REQUIRED", reasonCode: "threshold-reached", triggerRecordId: "trigger-one", expectedVersion: 0, resultingVersion: 1, transitionedAt: now },
        { ...scope, aggregateId: source.aggregateId, transitionId: "projection-transition-two", fromState: "REMEDIATION_REPLAN_REQUIRED", toState: "REPLAN_PENDING_APPROVAL", reasonCode: "request-created", triggerRecordId: "trigger-two", expectedVersion: 1, resultingVersion: 2, transitionedAt: now },
      ],
      requests: [{ ...scope, aggregateId: source.aggregateId, requestId: "projection-request", triggerEventId: "trigger-one", planHash, planVersion: 1, proposalAuthorActor: "review-agent-1", producerInvocationId: "invocation-1", policyId: "replan-governance-v1", policyVersion: 1, eligibleRoles: ["ARCHITECTURE_STEWARD"], requestedAt: now }],
    };
    const requestProjection = projectReplanGovernance(requestSource);
    if (requestProjection.kind === "replan_governance" && requestProjection.request !== null) {
      expect(Object.keys(requestProjection.request).sort()).toEqual(["eligibleRoles", "planHash", "planVersion", "policyId", "policyVersion", "producerInvocationId", "proposalAuthorActor", "requestId", "requestedAt"].sort());
      expect(Object.isFrozen(requestProjection.request)).toBe(true);
      expect(Object.isFrozen(requestProjection.request.eligibleRoles)).toBe(true);
      expect(projectReplanGovernance({ ...requestSource, requests: [{ ...requestSource.requests[0]!, futurePersistedMember: "forged" }] })).toMatchObject({ kind: "presentation_refusal", code: "invalid_persisted_read_model" });
      requestSource.requests[0]!.proposalAuthorActor = "mutated-source";
      (requestSource.requests[0]!.eligibleRoles as unknown as string[])[0] = "mutated-role";
      expect(requestProjection.request).toMatchObject({ proposalAuthorActor: "review-agent-1", eligibleRoles: ["ARCHITECTURE_STEWARD"] });
      for (const forbidden of ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "triggerEventId", "canonicalJson", "futurePersistedMember"]) expect(forbidden in requestProjection.request).toBe(false);
    } else {
      throw new Error("expected the valid persisted request to project");
    }
    expect(projectReplanGovernance({ ...source, extra: "forged" })).toMatchObject({ kind: "presentation_refusal", code: "invalid_persisted_read_model" });
    expect(projectReplanGovernance({ ...source, scope: { ...scope, projectId: "api_key=unsafe" } })).toMatchObject({ kind: "presentation_refusal", code: "invalid_persisted_read_model" });
    expect(projectReplanGovernance({ ...source, eventVersion: 1 })).toMatchObject({ kind: "presentation_refusal", code: "invalid_persisted_read_model" });
    expect(renderReplanGovernance(source)).toMatchObject({ kind: "rendered" });
    const rendered = renderReplanGovernance(source);
    if (rendered.kind === "rendered") expect(rendered.markdown).toContain("cannot approve, reject, dispatch, or advance workflow");
  });

  it("reconstructs state and version only from an ordered transition chain before projecting or deciding", () => {
    const validChains = [[], ["NORMAL_REMEDIATION"], ["REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL"], ["REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL", "REPLAN_APPROVED", "BOUNDED_REMEDIATION_DISPATCHED", "REVIEW_PENDING"]];
    for (const states of validChains) {
      const aggregate = aggregateForTransitionStates(states);
      expect(projectReplanGovernance(aggregate)).toMatchObject({ kind: "replan_governance", state: aggregate.state, eventVersion: aggregate.eventVersion });
    }

    const malformed: StoredReplanGovernanceAggregate[] = [
      { ...emptyAggregate(), eventVersion: 1 },
      { ...emptyAggregate(), state: "REVIEW_PENDING" },
      { ...aggregateForTransitionStates(["NORMAL_REMEDIATION"]), transitions: [{ ...aggregateForTransitionStates(["NORMAL_REMEDIATION"]).transitions[0]!, expectedVersion: 1, resultingVersion: 2 }] },
      { ...aggregateForTransitionStates(["NORMAL_REMEDIATION"]), transitions: [{ ...aggregateForTransitionStates(["NORMAL_REMEDIATION"]).transitions[0]!, resultingVersion: 3 }] },
      { ...aggregateForTransitionStates(["NORMAL_REMEDIATION"]), transitions: [{ ...aggregateForTransitionStates(["NORMAL_REMEDIATION"]).transitions[0]!, fromState: "REVIEW_PENDING" }] },
      { ...aggregateForTransitionStates(["REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL"]), transitions: [aggregateForTransitionStates(["REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL"]).transitions[0]!, { ...aggregateForTransitionStates(["REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL"]).transitions[1]!, fromState: "NORMAL_REMEDIATION" }] },
      { ...aggregateForTransitionStates(["NORMAL_REMEDIATION"]), eventVersion: 0 },
      { ...aggregateForTransitionStates(["NORMAL_REMEDIATION"]), state: "REVIEW_PENDING" },
    ];
    const allowed: Record<string, readonly string[]> = {
      NORMAL_REMEDIATION: ["NORMAL_REMEDIATION", "REMEDIATION_REPLAN_REQUIRED"], REMEDIATION_REPLAN_REQUIRED: ["REPLAN_PENDING_APPROVAL"], REPLAN_PENDING_APPROVAL: ["REPLAN_APPROVED", "REPLAN_REJECTED"], REPLAN_APPROVED: ["BOUNDED_REMEDIATION_DISPATCHED"], REPLAN_REJECTED: ["REPLAN_PENDING_APPROVAL"], BOUNDED_REMEDIATION_DISPATCHED: ["REVIEW_PENDING"], REVIEW_PENDING: ["REVIEW_PENDING", "NORMAL_REMEDIATION", "REMEDIATION_REPLAN_REQUIRED"],
    };
    const prefixes: Record<string, readonly string[]> = {
      NORMAL_REMEDIATION: [], REMEDIATION_REPLAN_REQUIRED: ["REMEDIATION_REPLAN_REQUIRED"], REPLAN_PENDING_APPROVAL: ["REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL"], REPLAN_APPROVED: ["REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL", "REPLAN_APPROVED"], REPLAN_REJECTED: ["REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL", "REPLAN_REJECTED"], BOUNDED_REMEDIATION_DISPATCHED: ["REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL", "REPLAN_APPROVED", "BOUNDED_REMEDIATION_DISPATCHED"], REVIEW_PENDING: ["REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL", "REPLAN_APPROVED", "BOUNDED_REMEDIATION_DISPATCHED", "REVIEW_PENDING"],
    };
    for (const [fromState, permitted] of Object.entries(allowed)) {
      for (const toState of Object.keys(allowed).filter((candidate) => !permitted.includes(candidate))) malformed.push(aggregateForTransitionStates([...prefixes[fromState]!, toState]));
    }

    const store = createStore();
    try {
      setAuthority("non-author", "FEATURE_OWNER,ARCHITECTURE_STEWARD");
      for (const aggregate of malformed) {
        expect(projectReplanGovernance(aggregate)).toMatchObject({ kind: "presentation_refusal", code: "invalid_persisted_read_model" });
        expect(renderReplanGovernance(aggregate)).toMatchObject({ kind: "presentation_refusal", code: "invalid_persisted_read_model" });
        const read = vi.spyOn(store, "getReplanGovernanceAggregate").mockReturnValue(aggregate);
        const commit = vi.spyOn(store, "commitReplanGovernanceOperation");
        expect(decideScopeExpansion({ store, scope, aggregateId: "projection-aggregate", findingObservationId: "finding-observation-066", action: "ACCEPT_SCOPE_EXPANSION", expectedVersion: 0, reason: "Refuse incoherent evidence." })).toMatchObject({ kind: "presentation_refusal", code: "invalid_persisted_read_model" });
        expect(decideReplanApproval({ store, scope, aggregateId: "projection-aggregate", requestId: "request-066", action: "APPROVE_REPLAN", expectedVersion: 0, reason: "Refuse incoherent evidence." })).toMatchObject({ kind: "presentation_refusal", code: "invalid_persisted_read_model" });
        expect(commit).not.toHaveBeenCalled();
        read.mockRestore();
        commit.mockRestore();
      }
    } finally {
      closeStore(store);
    }
  });

  it("records only a configured feature-owner scope-expansion decision at the current version", () => {
    const store = createStore();
    try {
      seedPredecessors(store);
      setAuthority("feature-owner-1", "FEATURE_OWNER");
      const result = decideScopeExpansion({ store, scope, aggregateId: "scope-aggregate", findingObservationId: "finding-observation-066", action: "ACCEPT_SCOPE_EXPANSION", expectedVersion: 0, reason: "Accept the bounded expansion." });
      expect(result).toMatchObject({ kind: "decision_recorded", projection: { eventVersion: 1, state: "NORMAL_REMEDIATION", scopeExpansionDecisions: [{ outcome: "ACCEPT", actorId: "feature-owner-1", authorizedRole: "FEATURE_OWNER" }] } });
      const before = store.getReplanGovernanceAggregate(scope, "scope-aggregate");
      expect(decideScopeExpansion({ store, scope, aggregateId: "scope-aggregate", findingObservationId: "finding-observation-066", action: "ACCEPT_SCOPE_EXPANSION", expectedVersion: 0, reason: "Stale replay." })).toMatchObject({ kind: "presentation_refusal", code: "decision_refused" });
      expect(store.getReplanGovernanceAggregate(scope, "scope-aggregate")).toEqual(before);

      setAuthority("feature-owner-1", "ARCHITECTURE_STEWARD");
      expect(decideScopeExpansion({ store, scope, aggregateId: "scope-aggregate", findingObservationId: "finding-observation-066", action: "REJECT_SCOPE_EXPANSION", expectedVersion: 1, reason: "Wrong role." })).toMatchObject({ kind: "presentation_refusal", code: "decision_refused" });
      expect(store.getReplanGovernanceAggregate(scope, "scope-aggregate")).toEqual(before);

      setAuthority("review-agent-1", "FEATURE_OWNER");
      expect(decideScopeExpansion({ store, scope, aggregateId: "scope-aggregate", findingObservationId: "finding-observation-066", action: "REJECT_SCOPE_EXPANSION", expectedVersion: 1, reason: "Self decision." })).toMatchObject({ kind: "presentation_refusal", code: "persistence_failed" });
      expect(store.getReplanGovernanceAggregate(scope, "scope-aggregate")).toEqual(before);

      const rejected = createStore();
      try {
        seedPredecessors(rejected);
        setAuthority("feature-owner-reject", "FEATURE_OWNER");
        expect(decideScopeExpansion({ store: rejected, scope, aggregateId: "scope-reject-aggregate", findingObservationId: "finding-observation-066", action: "REJECT_SCOPE_EXPANSION", expectedVersion: 0, reason: "Reject the expansion." })).toMatchObject({ kind: "decision_recorded", projection: { eventVersion: 1, scopeExpansionDecisions: [{ outcome: "REJECT", actorId: "feature-owner-reject" }] } });
      } finally {
        closeStore(rejected);
      }

      for (const disposition of ["IN_SCOPE_BLOCKER", "ARCHITECTURE_DEBT", "OBSERVATION"]) {
        const invalidSubject = createStore();
        try {
          seedPredecessors(invalidSubject, scope, "finding-observation-066", disposition);
          setAuthority("feature-owner-invalid", "FEATURE_OWNER");
          const beforeInvalid = invalidSubject.getReplanGovernanceAggregate(scope, "invalid-subject-aggregate");
          expect(decideScopeExpansion({ store: invalidSubject, scope, aggregateId: "invalid-subject-aggregate", findingObservationId: "finding-observation-066", action: "ACCEPT_SCOPE_EXPANSION", expectedVersion: 0, reason: "Refuse non-expansion subject." })).toMatchObject({ kind: "presentation_refusal", code: "persistence_failed" });
          expect(invalidSubject.getReplanGovernanceAggregate(scope, "invalid-subject-aggregate")).toEqual(beforeInvalid);
        } finally {
          closeStore(invalidSubject);
        }
      }
      for (const foreignObservationId of ["missing-observation", "foreign-observation"]) {
        const invalidSubject = createStore();
        try {
          if (foreignObservationId === "foreign-observation") seedPredecessors(invalidSubject, { ...scope, phaseNumber: 5 }, foreignObservationId);
          else seedPredecessors(invalidSubject);
          setAuthority("feature-owner-invalid", "FEATURE_OWNER");
          const beforeInvalid = invalidSubject.getReplanGovernanceAggregate(scope, "invalid-subject-aggregate");
          expect(decideScopeExpansion({ store: invalidSubject, scope, aggregateId: "invalid-subject-aggregate", findingObservationId: foreignObservationId, action: "REJECT_SCOPE_EXPANSION", expectedVersion: 0, reason: "Refuse missing or foreign subject." })).toMatchObject({ kind: "presentation_refusal", code: "persistence_failed" });
          expect(invalidSubject.getReplanGovernanceAggregate(scope, "invalid-subject-aggregate")).toEqual(beforeInvalid);
        } finally {
          closeStore(invalidSubject);
        }
      }
    } finally {
      closeStore(store);
    }
  });

  it("records only a configured non-author steward decision for the exact current plan", () => {
    const store = createStore();
    try {
      seedPredecessors(store);
      seedPendingRequest(store);
      setAuthority("steward-1", "ARCHITECTURE_STEWARD");
      const result = decideReplanApproval({ store, scope, aggregateId: "replan-aggregate", requestId: "replan-request", action: "APPROVE_REPLAN", expectedVersion: 2, reason: "Approve exact bounded plan." });
      expect(result).toMatchObject({ kind: "decision_recorded", projection: { state: "REPLAN_APPROVED", eventVersion: 3, replanDecisions: [{ requestId: "replan-request", outcome: "APPROVE", actorId: "steward-1", authorizedRole: "ARCHITECTURE_STEWARD" }] } });
      const before = store.getReplanGovernanceAggregate(scope, "replan-aggregate");
      expect(decideReplanApproval({ store, scope, aggregateId: "replan-aggregate", requestId: "replan-request", action: "APPROVE_REPLAN", expectedVersion: 2, reason: "Stale replay." })).toMatchObject({ kind: "presentation_refusal", code: "decision_refused" });
      expect(store.getReplanGovernanceAggregate(scope, "replan-aggregate")).toEqual(before);

      const second = createStore();
      try {
        seedPredecessors(second);
        seedPendingRequest(second, "self-aggregate");
        setAuthority("review-agent-1", "ARCHITECTURE_STEWARD");
        const beforeSelf = second.getReplanGovernanceAggregate(scope, "self-aggregate");
        expect(decideReplanApproval({ store: second, scope, aggregateId: "self-aggregate", requestId: "replan-request", action: "REJECT_REPLAN", expectedVersion: 2, reason: "Self decision." })).toMatchObject({ kind: "presentation_refusal", code: "decision_refused" });
        expect(second.getReplanGovernanceAggregate(scope, "self-aggregate")).toEqual(beforeSelf);
      } finally {
        closeStore(second);
      }

      const rejected = createStore();
      try {
        seedPredecessors(rejected);
        seedPendingRequest(rejected, "rejected-aggregate");
        setAuthority("steward-reject", "ARCHITECTURE_STEWARD");
        expect(decideReplanApproval({ store: rejected, scope, aggregateId: "rejected-aggregate", requestId: "replan-request", action: "REJECT_REPLAN", expectedVersion: 2, reason: "Reject exact bounded plan." })).toMatchObject({ kind: "decision_recorded", projection: { state: "REPLAN_REJECTED", replanDecisions: [{ outcome: "REJECT", actorId: "steward-reject" }] } });
      } finally {
        closeStore(rejected);
      }
    } finally {
      closeStore(store);
    }
  });

  it("fails closed for malformed local authority and untrusted request fields without mutation", () => {
    delete process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID;
    delete process.env.HEPHA_LOCAL_GOVERNANCE_ROLES;
    expect(resolveLoopbackGovernanceAuthority()).toMatchObject({ kind: "presentation_refusal", code: "authority_unavailable" });
    setAuthority("owner-1", "FEATURE_OWNER, ARCHITECTURE_STEWARD");
    expect(resolveLoopbackGovernanceAuthority()).toMatchObject({ kind: "presentation_refusal", code: "authority_unavailable" });

    const store = createStore();
    try {
      seedPredecessors(store);
      setAuthority("feature-owner-1", "FEATURE_OWNER");
      const before = store.getReplanGovernanceAggregate(scope, "invalid-aggregate");
      expect(decideScopeExpansion({ store, scope, aggregateId: "invalid-aggregate", findingObservationId: "finding-observation-066", action: "ACCEPT_SCOPE_EXPANSION", expectedVersion: 0, reason: "Accept.", actorId: "forged" })).toMatchObject({ kind: "presentation_refusal", code: "invalid_input" });
      expect(store.getReplanGovernanceAggregate(scope, "invalid-aggregate")).toEqual(before);
      expect(decideScopeExpansion({ store, scope, aggregateId: "invalid-aggregate", findingObservationId: "finding-observation-066", action: "ACCEPT_SCOPE_EXPANSION", expectedVersion: 0, reason: "token=unsafe" })).toMatchObject({ kind: "presentation_refusal", code: "invalid_input" });
      expect(store.getReplanGovernanceAggregate(scope, "invalid-aggregate")).toEqual(before);
    } finally {
      closeStore(store);
    }
  });
});
