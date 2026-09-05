import type { DatabaseSync } from "node:sqlite";
import type {
  ReplanDecisionOutcome,
  ReplanDispatchOutcome,
  ReplanGovernanceReviewScope,
  ReplanGovernanceScope,
  ReplanGovernanceState,
  ReplanObservationKind,
  StoredReplanDecision,
  StoredReplanDefectClassObservation,
  StoredReplanDispatchAttempt,
  StoredReplanGovernanceAggregate,
  StoredReplanRequest,
  StoredReplanReviewAssessment,
  StoredReplanTransition,
  StoredScopeExpansionDecision,
} from "./contracts.js";
import { scanSafeContent } from "./content-safety.js";

function rejectInput(): never {
  throw new Error("INVALID_INPUT");
}

function assertSafeIdentifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) rejectInput();
  try { scanSafeContent(value); } catch { rejectInput(); }
}

function assertKebabIdentifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128
    || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)) rejectInput();
}

function assertObjectWithKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) rejectInput();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !(key in record))) rejectInput();
  return record;
}

function assertReviewScope(value: unknown): ReplanGovernanceReviewScope {
  const record = assertObjectWithKeys(value, ["projectId", "featureId", "phaseNumber", "reviewGateId"]);
  assertSafeIdentifier(record.projectId); assertSafeIdentifier(record.featureId); assertSafeIdentifier(record.reviewGateId);
  if (typeof record.phaseNumber !== "number" || !Number.isInteger(record.phaseNumber) || record.phaseNumber < 0) rejectInput();
  return record as unknown as ReplanGovernanceReviewScope;
}

function assertScope(value: unknown): ReplanGovernanceScope {
  const record = assertObjectWithKeys(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass"]);
  assertSafeIdentifier(record.projectId); assertSafeIdentifier(record.featureId); assertSafeIdentifier(record.reviewGateId);
  if (typeof record.phaseNumber !== "number" || !Number.isInteger(record.phaseNumber) || record.phaseNumber < 0) rejectInput();
  assertKebabIdentifier(record.defectClass);
  return record as unknown as ReplanGovernanceScope;
}

function parseAssessmentIds(value: unknown, maximum: number): readonly string[] {
  if (typeof value !== "string") rejectInput();
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { rejectInput(); }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > maximum) rejectInput();
  const seen = new Set<string>();
  for (const id of parsed) {
    assertKebabIdentifier(id);
    if (seen.has(id)) rejectInput();
    seen.add(id);
  }
  return [...parsed];
}

const REPLAN_TABLES = [
  "hepha_review_defect_class_observations",
  "hepha_review_replan_requests",
  "hepha_review_scope_expansion_decisions",
  "hepha_review_replan_decisions",
  "hepha_review_replan_transition_events",
  "hepha_review_replan_dispatch_attempts",
  "hepha_review_replan_review_assessments",
] as const;

/** Restart-safe immutable projections for V3 replan-governance aggregates. */
export class ReviewReplanQueryRepository {
  constructor(private readonly database: DatabaseSync) {}

  getAggregate(rawScope: unknown, rawAggregateId: unknown): StoredReplanGovernanceAggregate {
    const scope = assertScope(rawScope); assertKebabIdentifier(rawAggregateId);
    const values = [scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, scope.defectClass, rawAggregateId];
    const where = "project_id = ? and feature_id = ? and phase_number = ? and review_gate_id = ? and defect_class = ? and aggregate_id = ?";
    const all = (table: string, order: string): Record<string, unknown>[] =>
      this.database.prepare(`select * from ${table} where ${where} order by ${order}`).all(...values) as Record<string, unknown>[];
    const transitions = all("hepha_review_replan_transition_events", "resulting_version asc").map((row) => ({
      ...scope, aggregateId: String(row.aggregate_id), transitionId: String(row.transition_id),
      fromState: String(row.from_state) as ReplanGovernanceState, toState: String(row.to_state) as ReplanGovernanceState,
      reasonCode: String(row.reason_code), triggerRecordId: String(row.trigger_record_id),
      triggerHash: row.trigger_hash === null ? undefined : String(row.trigger_hash),
      expectedVersion: Number(row.expected_version), resultingVersion: Number(row.resulting_version),
      transitionedAt: String(row.transitioned_at),
    })) satisfies StoredReplanTransition[];
    const last = transitions.at(-1);
    return {
      scope: { ...scope }, aggregateId: rawAggregateId, eventVersion: last?.resultingVersion ?? 0,
      state: last?.toState ?? "NORMAL_REMEDIATION",
      observations: all("hepha_review_defect_class_observations", "created_at asc, observation_event_id asc").map((row) => ({
        ...scope, aggregateId: String(row.aggregate_id), observationEventId: String(row.observation_event_id),
        observationKind: String(row.observation_kind) as ReplanObservationKind,
        triggerManifestHash: String(row.trigger_manifest_hash), basisManifestHash: String(row.basis_manifest_hash),
        findingObservationId: row.finding_observation_id === null ? undefined : String(row.finding_observation_id),
        remediationCycleId: row.remediation_cycle_id === null ? undefined : String(row.remediation_cycle_id),
        decisionId: row.decision_id === null ? undefined : String(row.decision_id), createdAt: String(row.created_at),
      })) satisfies StoredReplanDefectClassObservation[],
      requests: all("hepha_review_replan_requests", "plan_version asc, request_id asc").map((row) => ({
        ...scope, aggregateId: String(row.aggregate_id), requestId: String(row.request_id),
        triggerEventId: String(row.trigger_event_id), planHash: String(row.plan_hash), planVersion: Number(row.plan_version),
        proposalAuthorActor: String(row.proposal_author_actor), producerInvocationId: String(row.producer_invocation_id),
        policyId: "replan-governance-v1" as const, policyVersion: 1 as const,
        eligibleRoles: ["ARCHITECTURE_STEWARD"] as ["ARCHITECTURE_STEWARD"], requestedAt: String(row.requested_at),
      })) satisfies StoredReplanRequest[],
      scopeExpansionDecisions: all("hepha_review_scope_expansion_decisions", "resulting_version asc, decision_id asc").map((row) => ({
        ...scope, aggregateId: String(row.aggregate_id), decisionId: String(row.decision_id),
        findingObservationId: String(row.finding_observation_id), outcome: String(row.outcome) as "ACCEPT" | "REJECT",
        actorId: String(row.actor_id), authorizedRole: "FEATURE_OWNER" as const,
        policyId: "replan-governance-v1" as const, policyVersion: 1 as const, reason: String(row.reason),
        expectedVersion: Number(row.expected_version), resultingVersion: Number(row.resulting_version), decidedAt: String(row.decided_at),
      })) satisfies StoredScopeExpansionDecision[],
      decisions: all("hepha_review_replan_decisions", "resulting_version asc, decision_id asc").map((row) => ({
        ...scope, aggregateId: String(row.aggregate_id), decisionId: String(row.decision_id), requestId: String(row.request_id),
        planHash: String(row.plan_hash), planVersion: Number(row.plan_version), outcome: String(row.outcome) as ReplanDecisionOutcome,
        actorId: String(row.actor_id), authorizedRole: "ARCHITECTURE_STEWARD" as const,
        policyId: "replan-governance-v1" as const, policyVersion: 1 as const, reason: String(row.reason),
        expectedVersion: Number(row.expected_version), resultingVersion: Number(row.resulting_version), decidedAt: String(row.decided_at),
      })) satisfies StoredReplanDecision[],
      transitions,
      dispatchAttempts: all("hepha_review_replan_dispatch_attempts", "attempted_at asc, case outcome when 'STARTED' then 0 else 1 end asc, attempt_event_id asc").map((row) => ({
        ...scope, aggregateId: String(row.aggregate_id), attemptEventId: String(row.attempt_event_id),
        dispatchId: String(row.dispatch_id), requestId: String(row.request_id), planHash: String(row.plan_hash),
        planVersion: Number(row.plan_version), approvalDecisionId: String(row.approval_decision_id),
        approvalEventVersion: Number(row.approval_event_version), outcome: String(row.outcome) as ReplanDispatchOutcome,
        reasonCode: row.reason_code === null ? undefined : String(row.reason_code),
        workflowRunId: String(row.workflow_run_id), attemptedAt: String(row.attempted_at),
      })) satisfies StoredReplanDispatchAttempt[],
      reviewAssessments: all("hepha_review_replan_review_assessments", "created_at asc, assessment_id asc").map((row) => ({
        ...scope, aggregateId: String(row.aggregate_id), assessmentId: String(row.assessment_id),
        dispatchId: String(row.dispatch_id), reviewManifestHash: String(row.review_manifest_hash),
        reviewRunId: String(row.review_run_id), planHash: String(row.plan_hash), planVersion: Number(row.plan_version),
        outcome: String(row.outcome), assessedSurfaceIds: parseAssessmentIds(row.assessed_surface_ids_json, 128),
        assessedRemediationItemIds: parseAssessmentIds(row.assessed_remediation_item_ids_json, 64),
        assessedTestIds: parseAssessmentIds(row.assessed_test_ids_json, 64), createdAt: String(row.created_at),
      })) satisfies StoredReplanReviewAssessment[],
    };
  }

  listAggregates(rawScope: unknown): readonly StoredReplanGovernanceAggregate[] {
    const scope = assertReviewScope(rawScope);
    const clauses = REPLAN_TABLES.map((table) =>
      `select defect_class, aggregate_id from ${table} where project_id = ? and feature_id = ? and phase_number = ? and review_gate_id = ?`,
    ).join(" union ");
    const values = REPLAN_TABLES.flatMap(() => [scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId]);
    const rows = this.database.prepare(
      `select distinct defect_class, aggregate_id from (${clauses}) order by defect_class asc, aggregate_id asc`,
    ).all(...values) as Record<string, unknown>[];
    return rows.map((row) => this.getAggregate({ ...scope, defectClass: String(row.defect_class) }, String(row.aggregate_id)));
  }

  listForProject(projectId: unknown): readonly StoredReplanGovernanceAggregate[] {
    assertSafeIdentifier(projectId);
    const clauses = REPLAN_TABLES.map((table) =>
      `select project_id, feature_id, phase_number, review_gate_id, defect_class, aggregate_id from ${table} where project_id = ?`,
    ).join(" union ");
    const rows = this.database.prepare(
      `select distinct project_id, feature_id, phase_number, review_gate_id, defect_class, aggregate_id
       from (${clauses}) order by feature_id asc, phase_number asc, review_gate_id asc, defect_class asc, aggregate_id asc`,
    ).all(...REPLAN_TABLES.map(() => projectId)) as Record<string, unknown>[];
    return rows.map((row) => this.getAggregate({
      projectId: String(row.project_id), featureId: String(row.feature_id), phaseNumber: Number(row.phase_number),
      reviewGateId: String(row.review_gate_id), defectClass: String(row.defect_class),
    }, String(row.aggregate_id)));
  }
}
