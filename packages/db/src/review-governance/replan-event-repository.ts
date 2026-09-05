import type { DatabaseSync } from "node:sqlite";
import type {
  AppendDefectClassObservationInput,
  AppendReplanDecisionInput,
  AppendReplanDispatchAttemptInput,
  AppendReplanRequestInput,
  AppendReplanReviewAssessmentInput,
  AppendReplanTransitionInput,
  AppendScopeExpansionDecisionInput,
  ReplanGovernanceScope,
  ReplanGovernanceState,
  ReviewStoreArtifactKind,
  StoredReplanGovernanceAggregate,
} from "./contracts.js";
import { ReviewArtifactRepository } from "./artifact-repository.js";
import { scanSafeContent } from "./content-safety.js";
import {
  assertCoherentReplanOperation,
  assertReplanScope,
  replanOperationRecordKeys,
} from "./replan-operation-policy.js";
import { ReviewReplanQueryRepository } from "./replan-query-repository.js";

function rejectInput(): never { throw new Error("INVALID_INPUT"); }

function assertObject(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) rejectInput();
}

function assertExactShape(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  assertObject(value);
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(value).some((key) => !allowed.has(key)) || required.some((key) => !(key in value))) rejectInput();
  return value;
}

function assertSafeIdentifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) rejectInput();
  try { scanSafeContent(value); } catch { rejectInput(); }
}

function assertKebabIdentifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128
    || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)) rejectInput();
}

function assertSafeBoundedString(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) rejectInput();
  try { scanSafeContent(value); } catch { rejectInput(); }
}

function assertUtcTimestamp(value: unknown): void {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]00:00)$/.test(value)) rejectInput();
  const year = Number(value.slice(0, 4)); const month = Number(value.slice(5, 7)); const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13)); const minute = Number(value.slice(14, 16)); const second = Number(value.slice(17, 19));
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31
    || hour > 23 || minute > 59 || second > 59) rejectInput();
  const days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (day > (month === 2 && leap ? 29 : days[month]!)) rejectInput();
}

function assertAssessmentIds(value: unknown, maximum: number): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) rejectInput();
  const seen = new Set<string>();
  for (const id of value) { assertKebabIdentifier(id); if (seen.has(id)) rejectInput(); seen.add(id); }
}

function assertReadBack(row: Record<string, unknown> | undefined, expected: Record<string, unknown>): void {
  if (!row) throw new Error("PERSISTENCE_FAILED");
  for (const [column, value] of Object.entries(expected)) {
    const actual = row[column];
    if (value === undefined || value === null ? actual !== null : actual !== value) throw new Error("PERSISTENCE_FAILED");
  }
}

/** Atomic append-only mutation boundary for V3 replan-governance events. */
export class ReviewReplanEventRepository {
  private transactionDepth = 0;

  constructor(
    private readonly database: DatabaseSync,
    private readonly artifacts: ReviewArtifactRepository,
    private readonly queries: ReviewReplanQueryRepository,
  ) {}

  private assertArtifact(hash: unknown, scope: ReplanGovernanceScope, kind?: ReviewStoreArtifactKind): void {
    const artifact = this.artifacts.getByHash(hash);
    if (!artifact || (kind !== undefined && artifact.artifactKind !== kind)
      || artifact.projectId !== scope.projectId || artifact.featureId !== scope.featureId
      || artifact.phaseNumber !== scope.phaseNumber || artifact.reviewGateId !== scope.reviewGateId) rejectInput();
  }

  private withTransaction(write: () => void, readBack: () => void): void {
    if (this.transactionDepth > 0) { write(); readBack(); return; }
    try {
      this.database.exec("begin immediate"); this.transactionDepth++;
      write(); readBack(); this.database.exec("commit");
    } catch (error) {
      try { this.database.exec("rollback"); } catch { /* no active transaction */ }
      if (error instanceof Error && error.message === "INVALID_INPUT") throw error;
      throw new Error("PERSISTENCE_FAILED");
    } finally { this.transactionDepth = 0; }
  }

  private currentEventVersion(scope: ReplanGovernanceScope, aggregateId: string): number {
    const row = this.database.prepare(
      "select max(resulting_version) as event_version from hepha_review_replan_transition_events where project_id = ? and feature_id = ? and phase_number = ? and review_gate_id = ? and defect_class = ? and aggregate_id = ?",
    ).get(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, scope.defectClass, aggregateId) as { event_version: number | null } | undefined;
    return row?.event_version ?? 0;
  }

  private currentState(scope: ReplanGovernanceScope, aggregateId: string): ReplanGovernanceState {
    const row = this.database.prepare(
      "select to_state from hepha_review_replan_transition_events where project_id = ? and feature_id = ? and phase_number = ? and review_gate_id = ? and defect_class = ? and aggregate_id = ? order by resulting_version desc limit 1",
    ).get(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, scope.defectClass, aggregateId) as { to_state: ReplanGovernanceState } | undefined;
    return row?.to_state ?? "NORMAL_REMEDIATION";
  }

  private assertObservationReferences(input: AppendDefectClassObservationInput, scope: ReplanGovernanceScope): void {
    this.assertArtifact(input.triggerManifestHash, scope, "review_manifest");
    this.assertArtifact(input.basisManifestHash, scope, "review_manifest");
    if (input.observationKind === "POST_FIX_MANIFESTATION") {
      if (input.remediationCycleId === undefined || input.findingObservationId !== undefined || input.decisionId !== undefined) rejectInput();
      const cycle = this.database.prepare(`select project_id, feature_id, phase_number, review_gate_id
        from hepha_review_remediation_cycles where cycle_id = ?`).get(input.remediationCycleId) as Record<string, unknown> | undefined;
      assertReadBack(cycle, { project_id: scope.projectId, feature_id: scope.featureId, phase_number: scope.phaseNumber, review_gate_id: scope.reviewGateId });
      return;
    }
    if (input.observationKind === "SCOPE_EXPANSION_ACCEPTED") {
      if (input.findingObservationId === undefined || input.decisionId === undefined || input.remediationCycleId !== undefined) rejectInput();
      const decision = this.database.prepare(`select aggregate_id, project_id, feature_id, phase_number, review_gate_id, defect_class, finding_observation_id, outcome
        from hepha_review_scope_expansion_decisions where decision_id = ?`).get(input.decisionId) as Record<string, unknown> | undefined;
      assertReadBack(decision, { aggregate_id: input.aggregateId, project_id: scope.projectId, feature_id: scope.featureId, phase_number: scope.phaseNumber, review_gate_id: scope.reviewGateId, defect_class: scope.defectClass, finding_observation_id: input.findingObservationId, outcome: "ACCEPT" });
      return;
    }
    if (input.findingObservationId === undefined || input.remediationCycleId !== undefined || input.decisionId !== undefined) rejectInput();
    const finding = this.database.prepare(`select f.project_id, f.feature_id, f.phase_number, f.review_gate_id, f.defect_class
      from hepha_review_finding_observations o join hepha_review_findings f
        on f.review_run_id = o.review_run_id and f.finding_id = o.finding_id where o.observation_id = ?`).get(input.findingObservationId) as Record<string, unknown> | undefined;
    assertReadBack(finding, { project_id: scope.projectId, feature_id: scope.featureId, phase_number: scope.phaseNumber, review_gate_id: scope.reviewGateId, defect_class: scope.defectClass });
  }

  private appendObservation(rawInput: unknown): void {
    const input = assertExactShape(rawInput, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "observationEventId", "observationKind", "triggerManifestHash", "basisManifestHash", "createdAt"], ["findingObservationId", "remediationCycleId", "decisionId"]) as unknown as AppendDefectClassObservationInput;
    const scope = assertReplanScope(input as unknown as Record<string, unknown>);
    assertKebabIdentifier(input.aggregateId); assertKebabIdentifier(input.observationEventId);
    if (!["POST_FIX_MANIFESTATION", "SCOPE_EXPANSION_ACCEPTED", "FINDING_EXHAUSTIVENESS"].includes(input.observationKind)) rejectInput();
    assertUtcTimestamp(input.createdAt);
    if (input.findingObservationId !== undefined) assertKebabIdentifier(input.findingObservationId);
    if (input.remediationCycleId !== undefined) assertKebabIdentifier(input.remediationCycleId);
    if (input.decisionId !== undefined) assertKebabIdentifier(input.decisionId);
    this.withTransaction(() => {
      this.assertObservationReferences(input, scope);
      this.database.prepare(`insert into hepha_review_defect_class_observations
        (observation_event_id, aggregate_id, project_id, feature_id, phase_number, review_gate_id, defect_class, observation_kind, trigger_manifest_hash, basis_manifest_hash, finding_observation_id, remediation_cycle_id, decision_id, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.observationEventId, input.aggregateId, scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, scope.defectClass, input.observationKind, input.triggerManifestHash, input.basisManifestHash, input.findingObservationId ?? null, input.remediationCycleId ?? null, input.decisionId ?? null, input.createdAt);
    }, () => assertReadBack(this.database.prepare("select observation_event_id, aggregate_id, defect_class, observation_kind, trigger_manifest_hash from hepha_review_defect_class_observations where observation_event_id = ?").get(input.observationEventId) as Record<string, unknown> | undefined,
      { observation_event_id: input.observationEventId, aggregate_id: input.aggregateId, defect_class: scope.defectClass, observation_kind: input.observationKind, trigger_manifest_hash: input.triggerManifestHash }));
  }

  private appendRequest(rawInput: unknown): void {
    const input = assertExactShape(rawInput, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "requestId", "triggerEventId", "planHash", "planVersion", "proposalAuthorActor", "producerInvocationId", "policyId", "policyVersion", "requestedAt"]) as unknown as AppendReplanRequestInput;
    const scope = assertReplanScope(input as unknown as Record<string, unknown>);
    for (const key of ["aggregateId", "requestId", "triggerEventId"] as const) assertKebabIdentifier(input[key]);
    assertSafeIdentifier(input.proposalAuthorActor); assertSafeIdentifier(input.producerInvocationId);
    if (!Number.isInteger(input.planVersion) || input.planVersion < 1 || input.policyId !== "replan-governance-v1" || input.policyVersion !== 1) rejectInput();
    assertUtcTimestamp(input.requestedAt);
    this.withTransaction(() => {
      this.assertArtifact(input.planHash, scope, "replan_plan");
      const trigger = this.database.prepare("select aggregate_id, project_id, feature_id, phase_number, review_gate_id, defect_class from hepha_review_defect_class_observations where observation_event_id = ?").get(input.triggerEventId) as Record<string, unknown> | undefined;
      assertReadBack(trigger, { aggregate_id: input.aggregateId, project_id: scope.projectId, feature_id: scope.featureId, phase_number: scope.phaseNumber, review_gate_id: scope.reviewGateId, defect_class: scope.defectClass });
      this.database.prepare(`insert into hepha_review_replan_requests
        (request_id, aggregate_id, project_id, feature_id, phase_number, review_gate_id, defect_class, trigger_event_id, plan_hash, plan_version, proposal_author_actor, producer_invocation_id, policy_id, policy_version, eligible_roles_json, requested_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '["ARCHITECTURE_STEWARD"]', ?)`).run(input.requestId, input.aggregateId, scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, scope.defectClass, input.triggerEventId, input.planHash, input.planVersion, input.proposalAuthorActor, input.producerInvocationId, input.policyId, input.policyVersion, input.requestedAt);
    }, () => assertReadBack(this.database.prepare("select request_id, aggregate_id, plan_hash, plan_version, proposal_author_actor from hepha_review_replan_requests where request_id = ?").get(input.requestId) as Record<string, unknown> | undefined,
      { request_id: input.requestId, aggregate_id: input.aggregateId, plan_hash: input.planHash, plan_version: input.planVersion, proposal_author_actor: input.proposalAuthorActor }));
  }

  private appendScopeDecision(rawInput: unknown): void {
    const input = assertExactShape(rawInput, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "decisionId", "findingObservationId", "outcome", "actorId", "policyId", "policyVersion", "reason", "expectedVersion", "resultingVersion", "decidedAt"]) as unknown as AppendScopeExpansionDecisionInput;
    const scope = assertReplanScope(input as unknown as Record<string, unknown>);
    for (const key of ["aggregateId", "decisionId", "findingObservationId"] as const) assertKebabIdentifier(input[key]);
    assertSafeIdentifier(input.actorId);
    if (!["ACCEPT", "REJECT"].includes(input.outcome) || input.policyId !== "replan-governance-v1" || input.policyVersion !== 1 || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 || input.resultingVersion !== input.expectedVersion + 1) rejectInput();
    assertSafeBoundedString(input.reason); assertUtcTimestamp(input.decidedAt);
    this.withTransaction(() => {
      if (this.currentEventVersion(scope, input.aggregateId) !== input.expectedVersion) rejectInput();
      const observation = this.database.prepare(`select f.project_id, f.feature_id, f.phase_number, f.review_gate_id, f.defect_class, f.disposition, r.agent_invocation_id
        from hepha_review_finding_observations o join hepha_review_findings f on f.review_run_id = o.review_run_id and f.finding_id = o.finding_id
        join hepha_review_runs r on r.review_run_id = o.review_run_id where o.observation_id = ?`).get(input.findingObservationId) as Record<string, unknown> | undefined;
      assertReadBack(observation, { project_id: scope.projectId, feature_id: scope.featureId, phase_number: scope.phaseNumber, review_gate_id: scope.reviewGateId, defect_class: scope.defectClass, disposition: "SCOPE_EXPANSION" });
      if (observation?.agent_invocation_id === null || observation?.agent_invocation_id === input.actorId) rejectInput();
      this.database.prepare(`insert into hepha_review_scope_expansion_decisions
        (decision_id, aggregate_id, project_id, feature_id, phase_number, review_gate_id, defect_class, finding_observation_id, outcome, actor_id, authorized_role, policy_id, policy_version, reason, expected_version, resulting_version, decided_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.decisionId, input.aggregateId, scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, scope.defectClass, input.findingObservationId, input.outcome, input.actorId, "FEATURE_OWNER", input.policyId, input.policyVersion, input.reason, input.expectedVersion, input.resultingVersion, input.decidedAt);
    }, () => assertReadBack(this.database.prepare("select decision_id, finding_observation_id, outcome, authorized_role from hepha_review_scope_expansion_decisions where decision_id = ?").get(input.decisionId) as Record<string, unknown> | undefined,
      { decision_id: input.decisionId, finding_observation_id: input.findingObservationId, outcome: input.outcome, authorized_role: "FEATURE_OWNER" }));
  }

  private appendDecision(rawInput: unknown): void {
    const input = assertExactShape(rawInput, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "decisionId", "requestId", "planHash", "planVersion", "outcome", "actorId", "policyId", "policyVersion", "reason", "expectedVersion", "resultingVersion", "decidedAt"]) as unknown as AppendReplanDecisionInput;
    const scope = assertReplanScope(input as unknown as Record<string, unknown>);
    for (const key of ["aggregateId", "decisionId", "requestId"] as const) assertKebabIdentifier(input[key]);
    assertSafeIdentifier(input.actorId);
    if (!Number.isInteger(input.planVersion) || input.planVersion < 1 || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 || input.resultingVersion !== input.expectedVersion + 1 || !["APPROVE", "REJECT"].includes(input.outcome) || input.policyId !== "replan-governance-v1" || input.policyVersion !== 1) rejectInput();
    assertSafeBoundedString(input.reason); assertUtcTimestamp(input.decidedAt);
    this.withTransaction(() => {
      this.assertArtifact(input.planHash, scope, "replan_plan");
      const request = this.database.prepare("select aggregate_id, project_id, feature_id, phase_number, review_gate_id, defect_class, plan_hash, plan_version, proposal_author_actor from hepha_review_replan_requests where request_id = ?").get(input.requestId) as Record<string, unknown> | undefined;
      assertReadBack(request, { aggregate_id: input.aggregateId, project_id: scope.projectId, feature_id: scope.featureId, phase_number: scope.phaseNumber, review_gate_id: scope.reviewGateId, defect_class: scope.defectClass, plan_hash: input.planHash, plan_version: input.planVersion });
      if (request?.proposal_author_actor === input.actorId || this.currentEventVersion(scope, input.aggregateId) !== input.expectedVersion) rejectInput();
      this.database.prepare(`insert into hepha_review_replan_decisions
        (decision_id, request_id, aggregate_id, project_id, feature_id, phase_number, review_gate_id, defect_class, plan_hash, plan_version, outcome, actor_id, authorized_role, policy_id, policy_version, reason, expected_version, resulting_version, decided_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.decisionId, input.requestId, input.aggregateId, scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, scope.defectClass, input.planHash, input.planVersion, input.outcome, input.actorId, "ARCHITECTURE_STEWARD", input.policyId, input.policyVersion, input.reason, input.expectedVersion, input.resultingVersion, input.decidedAt);
    }, () => assertReadBack(this.database.prepare("select decision_id, request_id, outcome, actor_id, resulting_version from hepha_review_replan_decisions where decision_id = ?").get(input.decisionId) as Record<string, unknown> | undefined,
      { decision_id: input.decisionId, request_id: input.requestId, outcome: input.outcome, actor_id: input.actorId, resulting_version: input.resultingVersion }));
  }

  private appendTransition(rawInput: unknown): void {
    const input = assertExactShape(rawInput, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "transitionId", "fromState", "toState", "reasonCode", "triggerRecordId", "expectedVersion", "resultingVersion", "transitionedAt"], ["triggerHash"]) as unknown as AppendReplanTransitionInput;
    const scope = assertReplanScope(input as unknown as Record<string, unknown>);
    for (const key of ["aggregateId", "transitionId", "triggerRecordId", "reasonCode"] as const) assertKebabIdentifier(input[key]);
    const states = ["NORMAL_REMEDIATION", "REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL", "REPLAN_APPROVED", "REPLAN_REJECTED", "BOUNDED_REMEDIATION_DISPATCHED", "REVIEW_PENDING"];
    if (!states.includes(input.fromState) || !states.includes(input.toState) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 || input.resultingVersion !== input.expectedVersion + 1) rejectInput();
    assertUtcTimestamp(input.transitionedAt);
    this.withTransaction(() => {
      if (this.currentEventVersion(scope, input.aggregateId) !== input.expectedVersion || this.currentState(scope, input.aggregateId) !== input.fromState) rejectInput();
      if (input.triggerHash !== undefined) this.assertArtifact(input.triggerHash, scope);
      this.database.prepare(`insert into hepha_review_replan_transition_events
        (transition_id, aggregate_id, project_id, feature_id, phase_number, review_gate_id, defect_class, from_state, to_state, reason_code, trigger_record_id, trigger_hash, expected_version, resulting_version, transitioned_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.transitionId, input.aggregateId, scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, scope.defectClass, input.fromState, input.toState, input.reasonCode, input.triggerRecordId, input.triggerHash ?? null, input.expectedVersion, input.resultingVersion, input.transitionedAt);
    }, () => assertReadBack(this.database.prepare("select transition_id, aggregate_id, from_state, to_state, resulting_version from hepha_review_replan_transition_events where transition_id = ?").get(input.transitionId) as Record<string, unknown> | undefined,
      { transition_id: input.transitionId, aggregate_id: input.aggregateId, from_state: input.fromState, to_state: input.toState, resulting_version: input.resultingVersion }));
  }

  private appendDispatch(rawInput: unknown): void {
    const input = assertExactShape(rawInput, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "attemptEventId", "dispatchId", "requestId", "planHash", "planVersion", "approvalDecisionId", "approvalEventVersion", "outcome", "workflowRunId", "attemptedAt"], ["reasonCode"]) as unknown as AppendReplanDispatchAttemptInput;
    const scope = assertReplanScope(input as unknown as Record<string, unknown>);
    for (const key of ["aggregateId", "attemptEventId", "dispatchId", "requestId", "approvalDecisionId"] as const) assertKebabIdentifier(input[key]);
    assertSafeIdentifier(input.workflowRunId);
    if (!Number.isInteger(input.planVersion) || input.planVersion < 1 || !Number.isInteger(input.approvalEventVersion) || input.approvalEventVersion < 0 || !["STARTED", "START_FAILED"].includes(input.outcome)) rejectInput();
    if (input.reasonCode !== undefined) assertKebabIdentifier(input.reasonCode); assertUtcTimestamp(input.attemptedAt);
    this.withTransaction(() => {
      this.assertArtifact(input.planHash, scope, "replan_plan");
      const decision = this.database.prepare("select request_id, aggregate_id, project_id, feature_id, phase_number, review_gate_id, defect_class, plan_hash, plan_version, outcome, resulting_version from hepha_review_replan_decisions where decision_id = ?").get(input.approvalDecisionId) as Record<string, unknown> | undefined;
      assertReadBack(decision, { request_id: input.requestId, aggregate_id: input.aggregateId, project_id: scope.projectId, feature_id: scope.featureId, phase_number: scope.phaseNumber, review_gate_id: scope.reviewGateId, defect_class: scope.defectClass, plan_hash: input.planHash, plan_version: input.planVersion, outcome: "APPROVE", resulting_version: input.approvalEventVersion });
      if (input.outcome === "STARTED") {
        const previous = this.database.prepare("select attempt_event_id from hepha_review_replan_dispatch_attempts where project_id = ? and feature_id = ? and phase_number = ? and review_gate_id = ? and defect_class = ? and aggregate_id = ? and request_id = ? and plan_version = ? and outcome = 'STARTED'").get(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, scope.defectClass, input.aggregateId, input.requestId, input.planVersion);
        if (previous) rejectInput();
      } else {
        const started = this.database.prepare("select aggregate_id, project_id, feature_id, phase_number, review_gate_id, defect_class, request_id, plan_hash, plan_version, approval_decision_id, approval_event_version, workflow_run_id from hepha_review_replan_dispatch_attempts where dispatch_id = ? and outcome = 'STARTED'").get(input.dispatchId) as Record<string, unknown> | undefined;
        if (!started || started.aggregate_id !== input.aggregateId || started.project_id !== scope.projectId || started.feature_id !== scope.featureId
          || started.phase_number !== scope.phaseNumber || started.review_gate_id !== scope.reviewGateId || started.defect_class !== scope.defectClass
          || started.request_id !== input.requestId || started.plan_hash !== input.planHash || started.plan_version !== input.planVersion
          || started.approval_decision_id !== input.approvalDecisionId || started.approval_event_version !== input.approvalEventVersion
          || started.workflow_run_id !== input.workflowRunId) rejectInput();
      }
      this.database.prepare(`insert into hepha_review_replan_dispatch_attempts
        (attempt_event_id, dispatch_id, aggregate_id, project_id, feature_id, phase_number, review_gate_id, defect_class, request_id, plan_hash, plan_version, approval_decision_id, approval_event_version, outcome, reason_code, workflow_run_id, attempted_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.attemptEventId, input.dispatchId, input.aggregateId, scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, scope.defectClass, input.requestId, input.planHash, input.planVersion, input.approvalDecisionId, input.approvalEventVersion, input.outcome, input.reasonCode ?? null, input.workflowRunId, input.attemptedAt);
    }, () => assertReadBack(this.database.prepare("select attempt_event_id, dispatch_id, approval_decision_id, outcome from hepha_review_replan_dispatch_attempts where attempt_event_id = ?").get(input.attemptEventId) as Record<string, unknown> | undefined,
      { attempt_event_id: input.attemptEventId, dispatch_id: input.dispatchId, approval_decision_id: input.approvalDecisionId, outcome: input.outcome }));
  }

  private appendAssessment(rawInput: unknown): void {
    const input = assertExactShape(rawInput, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "assessmentId", "dispatchId", "reviewManifestHash", "reviewRunId", "planHash", "planVersion", "outcome", "assessedSurfaceIds", "assessedRemediationItemIds", "assessedTestIds", "createdAt"]) as unknown as AppendReplanReviewAssessmentInput;
    const scope = assertReplanScope(input as unknown as Record<string, unknown>);
    for (const key of ["aggregateId", "assessmentId", "dispatchId"] as const) assertKebabIdentifier(input[key]);
    if (input.outcome !== "APPROVED") rejectInput(); assertSafeIdentifier(input.reviewRunId);
    if (!Number.isInteger(input.planVersion) || input.planVersion < 1) rejectInput();
    assertAssessmentIds(input.assessedSurfaceIds, 128); assertAssessmentIds(input.assessedRemediationItemIds, 64); assertAssessmentIds(input.assessedTestIds, 64); assertUtcTimestamp(input.createdAt);
    this.withTransaction(() => {
      this.assertArtifact(input.reviewManifestHash, scope, "review_manifest"); this.assertArtifact(input.planHash, scope, "replan_plan");
      const dispatch = this.database.prepare("select aggregate_id, plan_hash, plan_version, outcome from hepha_review_replan_dispatch_attempts where dispatch_id = ?").get(input.dispatchId) as Record<string, unknown> | undefined;
      assertReadBack(dispatch, { aggregate_id: input.aggregateId, plan_hash: input.planHash, plan_version: input.planVersion, outcome: "STARTED" });
      const run = this.artifacts.getRunByManifestHash(input.reviewManifestHash);
      if (!run || run.reviewRunId !== input.reviewRunId) rejectInput();
      this.database.prepare(`insert into hepha_review_replan_review_assessments
        (assessment_id, aggregate_id, project_id, feature_id, phase_number, review_gate_id, defect_class, dispatch_id, review_manifest_hash, review_run_id, plan_hash, plan_version, outcome, assessed_surface_ids_json, assessed_remediation_item_ids_json, assessed_test_ids_json, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.assessmentId, input.aggregateId, scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, scope.defectClass, input.dispatchId, input.reviewManifestHash, input.reviewRunId, input.planHash, input.planVersion, input.outcome, JSON.stringify(input.assessedSurfaceIds), JSON.stringify(input.assessedRemediationItemIds), JSON.stringify(input.assessedTestIds), input.createdAt);
    }, () => {
      const row = this.database.prepare("select assessment_id, dispatch_id, review_manifest_hash, review_run_id, assessed_surface_ids_json, assessed_remediation_item_ids_json, assessed_test_ids_json from hepha_review_replan_review_assessments where assessment_id = ?").get(input.assessmentId) as Record<string, unknown> | undefined;
      assertReadBack(row, { assessment_id: input.assessmentId, dispatch_id: input.dispatchId, review_manifest_hash: input.reviewManifestHash, review_run_id: input.reviewRunId });
      if (JSON.stringify(JSON.parse(String(row?.assessed_surface_ids_json))) !== JSON.stringify(input.assessedSurfaceIds)
        || JSON.stringify(JSON.parse(String(row?.assessed_remediation_item_ids_json))) !== JSON.stringify(input.assessedRemediationItemIds)
        || JSON.stringify(JSON.parse(String(row?.assessed_test_ids_json))) !== JSON.stringify(input.assessedTestIds)) rejectInput();
    });
  }

  commit(rawInput: unknown, verifyReadBack?: (aggregate: StoredReplanGovernanceAggregate) => boolean): StoredReplanGovernanceAggregate {
    if (verifyReadBack !== undefined && typeof verifyReadBack !== "function") rejectInput();
    const input = assertExactShape(rawInput, ["kind", "records"]); if (typeof input.kind !== "string") rejectInput();
    const records = assertExactShape(input.records, replanOperationRecordKeys(input.kind));
    const { scope, aggregateId } = assertCoherentReplanOperation(input.kind, records);
    let aggregate: StoredReplanGovernanceAggregate | undefined;
    this.withTransaction(() => {
      switch (input.kind) {
        case "OBSERVATION": this.appendObservation(records.observation); break;
        case "THRESHOLD_MANIFESTATION": this.appendObservation(records.observation); this.appendTransition(records.transition); break;
        case "SCOPE_EXPANSION_ACCEPTED": this.appendScopeDecision(records.decision); this.appendObservation(records.observation); this.appendTransition(records.transition); break;
        case "SCOPE_EXPANSION_ACCEPTED_NO_THRESHOLD":
        case "SCOPE_EXPANSION_REJECTED": this.appendScopeDecision(records.decision); this.appendTransition(records.transition); break;
        case "PLAN_REQUEST": this.appendRequest(records.request); this.appendTransition(records.transition); break;
        case "REPLAN_DECISION": this.appendDecision(records.decision); this.appendTransition(records.transition); break;
        case "DISPATCH_STARTED": this.appendDispatch(records.dispatch); this.appendTransition(records.transition); break;
        case "DISPATCH_FAILED": this.appendDispatch(records.dispatch); break;
        case "REVIEW_ASSESSMENT": this.appendAssessment(records.assessment); this.appendTransition(records.transition); break;
        default: rejectInput();
      }
    }, () => {
      aggregate = this.queries.getAggregate(scope, aggregateId);
      if (!aggregate || (verifyReadBack !== undefined && !verifyReadBack(aggregate))) throw new Error("PERSISTENCE_FAILED");
    });
    return aggregate!;
  }
}
