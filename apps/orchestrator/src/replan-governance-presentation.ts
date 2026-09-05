/**
 * FEAT-066 transport-neutral governance projection and local decision boundary.
 *
 * Compatibility Decision: BREAKING CHANGE PERMITTED. This internal V1 module
 * has no approved external consumer. It exposes a read-only projection and
 * resolves actor/roles exclusively from local process configuration; it has no
 * HTTP, dashboard, remote identity, or caller-selected authority fallback.
 */

import { randomUUID } from "node:crypto";

import {
  ReviewGovernanceSqliteStore,
  type ReplanGovernanceScope,
  type StoredReplanGovernanceAggregate,
} from "@hepha/db";

import {
  authorizeLoopbackGovernanceDecision,
  type LoopbackAuthority,
} from "./replan-governance-policy.js";
import { isReviewContractSafeString } from "./review-contract-types.js";

export type ReplanGovernancePresentationRefusalCode =
  | "invalid_input"
  | "invalid_persisted_read_model"
  | "authority_unavailable"
  | "decision_refused"
  | "persistence_failed";

export interface ReplanGovernancePresentationRefusal {
  readonly kind: "presentation_refusal";
  readonly code: ReplanGovernancePresentationRefusalCode;
  readonly message: string;
}

export interface ReplanGovernanceProjection {
  readonly kind: "replan_governance";
  readonly authority: "presentation_only";
  readonly scope: Readonly<ReplanGovernanceScope>;
  readonly aggregateId: string;
  readonly state: string;
  readonly eventVersion: number;
  readonly recurrence: Readonly<{ postFixManifestations: number; acceptedScopeExpansions: number }>;
  readonly request: Readonly<{
    requestId: string;
    planHash: string;
    planVersion: number;
    proposalAuthorActor: string;
    producerInvocationId: string;
    policyId: "replan-governance-v1";
    policyVersion: 1;
    eligibleRoles: readonly ["ARCHITECTURE_STEWARD"];
    requestedAt: string;
  }> | null;
  readonly scopeExpansionDecisions: readonly Readonly<{
    decisionId: string;
    findingObservationId: string;
    outcome: "ACCEPT" | "REJECT";
    actorId: string;
    authorizedRole: "FEATURE_OWNER";
    reason: string;
    expectedVersion: number;
    resultingVersion: number;
    decidedAt: string;
  }>[];
  readonly replanDecisions: readonly Readonly<{
    decisionId: string;
    requestId: string;
    planHash: string;
    planVersion: number;
    outcome: "APPROVE" | "REJECT";
    actorId: string;
    authorizedRole: "ARCHITECTURE_STEWARD";
    reason: string;
    expectedVersion: number;
    resultingVersion: number;
    decidedAt: string;
  }>[];
  readonly dispatch: Readonly<{ outcome: "STARTED" | "START_FAILED"; workflowRunId: string; attemptedAt: string }> | null;
  readonly summary: Readonly<{ observations: number; requests: number; decisions: number; dispatchAttempts: number; reviewAssessments: number }>;
}

export type ReplanGovernanceProjectionResult = ReplanGovernanceProjection | ReplanGovernancePresentationRefusal;
export type RenderReplanGovernanceResult =
  | Readonly<{ kind: "rendered"; markdown: string; projection: ReplanGovernanceProjection }>
  | ReplanGovernancePresentationRefusal;
export type LoopbackGovernanceAuthorityResult =
  | Readonly<{ kind: "authority"; authority: LoopbackAuthority }>
  | ReplanGovernancePresentationRefusal;
export type LocalDecisionResult =
  | Readonly<{ kind: "decision_recorded"; projection: ReplanGovernanceProjection }>
  | ReplanGovernancePresentationRefusal;

const HASH_RE = /^[a-f0-9]{64}$/;
const KEBAB_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const STATES = new Set([
  "NORMAL_REMEDIATION", "REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL",
  "REPLAN_APPROVED", "REPLAN_REJECTED", "BOUNDED_REMEDIATION_DISPATCHED", "REVIEW_PENDING",
]);
const TIMESTAMP_RE = /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function safeText(value: unknown, maximumLength = 4096): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength
    && isWellFormedUtf16(value) && isReviewContractSafeString(value)
    && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

function safeIdentifier(value: unknown): value is string {
  return safeText(value, 256);
}

function kebabIdentifier(value: unknown): value is string {
  return typeof value === "string" && KEBAB_RE.test(value);
}

function hash(value: unknown): value is string {
  return typeof value === "string" && HASH_RE.test(value);
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !TIMESTAMP_RE.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function integer(value: unknown, minimum = 0): value is number {
  return Number.isInteger(value) && (value as number) >= minimum;
}

function scope(value: unknown): value is ReplanGovernanceScope {
  return isRecord(value) && hasOnlyKeys(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass"])
    && safeIdentifier(value.projectId) && safeIdentifier(value.featureId) && integer(value.phaseNumber)
    && safeIdentifier(value.reviewGateId) && kebabIdentifier(value.defectClass);
}

function scopedRecord(value: unknown, keys: readonly string[], aggregate: StoredReplanGovernanceAggregate): value is Record<string, unknown> {
  return isRecord(value) && hasOnlyKeys(value, keys)
    && value.projectId === aggregate.scope.projectId && value.featureId === aggregate.scope.featureId
    && value.phaseNumber === aggregate.scope.phaseNumber && value.reviewGateId === aggregate.scope.reviewGateId
    && value.defectClass === aggregate.scope.defectClass && value.aggregateId === aggregate.aggregateId;
}

function observation(value: unknown, aggregate: StoredReplanGovernanceAggregate): boolean {
  return scopedRecord(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "observationEventId", "observationKind", "triggerManifestHash", "basisManifestHash", "findingObservationId", "remediationCycleId", "decisionId", "createdAt"], aggregate)
    && kebabIdentifier(value.observationEventId) && ["POST_FIX_MANIFESTATION", "SCOPE_EXPANSION_ACCEPTED", "FINDING_EXHAUSTIVENESS"].includes(value.observationKind as string)
    && hash(value.triggerManifestHash) && hash(value.basisManifestHash) && timestamp(value.createdAt);
}

function request(value: unknown, aggregate: StoredReplanGovernanceAggregate): boolean {
  return scopedRecord(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "requestId", "triggerEventId", "planHash", "planVersion", "proposalAuthorActor", "producerInvocationId", "policyId", "policyVersion", "eligibleRoles", "requestedAt"], aggregate)
    && kebabIdentifier(value.requestId) && kebabIdentifier(value.triggerEventId) && hash(value.planHash)
    && integer(value.planVersion, 1) && safeIdentifier(value.proposalAuthorActor) && safeIdentifier(value.producerInvocationId)
    && value.policyId === "replan-governance-v1" && value.policyVersion === 1
    && Array.isArray(value.eligibleRoles) && value.eligibleRoles.length === 1 && value.eligibleRoles[0] === "ARCHITECTURE_STEWARD"
    && timestamp(value.requestedAt);
}

function scopeDecision(value: unknown, aggregate: StoredReplanGovernanceAggregate): boolean {
  return scopedRecord(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "decisionId", "findingObservationId", "outcome", "actorId", "authorizedRole", "policyId", "policyVersion", "reason", "expectedVersion", "resultingVersion", "decidedAt"], aggregate)
    && kebabIdentifier(value.decisionId) && kebabIdentifier(value.findingObservationId)
    && (value.outcome === "ACCEPT" || value.outcome === "REJECT") && safeIdentifier(value.actorId)
    && value.authorizedRole === "FEATURE_OWNER" && value.policyId === "replan-governance-v1" && value.policyVersion === 1
    && safeText(value.reason) && integer(value.expectedVersion) && value.resultingVersion === (value.expectedVersion as number) + 1 && timestamp(value.decidedAt);
}

function replanDecision(value: unknown, aggregate: StoredReplanGovernanceAggregate): boolean {
  return scopedRecord(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "decisionId", "requestId", "planHash", "planVersion", "outcome", "actorId", "authorizedRole", "policyId", "policyVersion", "reason", "expectedVersion", "resultingVersion", "decidedAt"], aggregate)
    && kebabIdentifier(value.decisionId) && kebabIdentifier(value.requestId) && hash(value.planHash) && integer(value.planVersion, 1)
    && (value.outcome === "APPROVE" || value.outcome === "REJECT") && safeIdentifier(value.actorId)
    && value.authorizedRole === "ARCHITECTURE_STEWARD" && value.policyId === "replan-governance-v1" && value.policyVersion === 1
    && safeText(value.reason) && integer(value.expectedVersion) && value.resultingVersion === (value.expectedVersion as number) + 1 && timestamp(value.decidedAt);
}

function transition(value: unknown, aggregate: StoredReplanGovernanceAggregate): boolean {
  return scopedRecord(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "transitionId", "fromState", "toState", "reasonCode", "triggerRecordId", "triggerHash", "expectedVersion", "resultingVersion", "transitionedAt"], aggregate)
    && kebabIdentifier(value.transitionId) && STATES.has(value.fromState as string) && STATES.has(value.toState as string)
    && kebabIdentifier(value.reasonCode) && kebabIdentifier(value.triggerRecordId)
    && (value.triggerHash === undefined || hash(value.triggerHash)) && integer(value.expectedVersion)
    && value.resultingVersion === (value.expectedVersion as number) + 1 && timestamp(value.transitionedAt);
}

const ALLOWED_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  NORMAL_REMEDIATION: ["NORMAL_REMEDIATION", "REMEDIATION_REPLAN_REQUIRED"],
  REMEDIATION_REPLAN_REQUIRED: ["REPLAN_PENDING_APPROVAL"],
  REPLAN_PENDING_APPROVAL: ["REPLAN_APPROVED", "REPLAN_REJECTED"],
  REPLAN_APPROVED: ["BOUNDED_REMEDIATION_DISPATCHED"],
  REPLAN_REJECTED: ["REPLAN_PENDING_APPROVAL"],
  BOUNDED_REMEDIATION_DISPATCHED: ["REVIEW_PENDING"],
  REVIEW_PENDING: ["REVIEW_PENDING", "NORMAL_REMEDIATION", "REMEDIATION_REPLAN_REQUIRED"],
};

/** Requires the persisted transition evidence to reconstruct the read model exactly. */
function coherentTransitionChain(aggregate: StoredReplanGovernanceAggregate): boolean {
  const transitions = aggregate.transitions;
  if (transitions.length === 0) return aggregate.eventVersion === 0 && aggregate.state === "NORMAL_REMEDIATION";
  return transitions.every((entry, index) => entry.expectedVersion === index
    && entry.resultingVersion === index + 1
    && entry.fromState === (index === 0 ? "NORMAL_REMEDIATION" : transitions[index - 1]?.toState)
    && ALLOWED_TRANSITIONS[entry.fromState]?.includes(entry.toState))
    && aggregate.eventVersion === transitions.at(-1)?.resultingVersion
    && aggregate.state === transitions.at(-1)?.toState;
}

function dispatch(value: unknown, aggregate: StoredReplanGovernanceAggregate): boolean {
  return scopedRecord(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "attemptEventId", "dispatchId", "requestId", "planHash", "planVersion", "approvalDecisionId", "approvalEventVersion", "outcome", "reasonCode", "workflowRunId", "attemptedAt"], aggregate)
    && kebabIdentifier(value.attemptEventId) && kebabIdentifier(value.dispatchId) && kebabIdentifier(value.requestId)
    && hash(value.planHash) && integer(value.planVersion, 1) && kebabIdentifier(value.approvalDecisionId)
    && integer(value.approvalEventVersion) && (value.outcome === "STARTED" || value.outcome === "START_FAILED")
    && (value.reasonCode === undefined || kebabIdentifier(value.reasonCode)) && safeIdentifier(value.workflowRunId) && timestamp(value.attemptedAt);
}

function assessment(value: unknown, aggregate: StoredReplanGovernanceAggregate): boolean {
  const ids = (candidate: unknown, maximum: number) => Array.isArray(candidate) && candidate.length > 0 && candidate.length <= maximum && candidate.every(kebabIdentifier);
  return scopedRecord(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "assessmentId", "dispatchId", "reviewManifestHash", "reviewRunId", "planHash", "planVersion", "outcome", "assessedSurfaceIds", "assessedRemediationItemIds", "assessedTestIds", "createdAt"], aggregate)
    && kebabIdentifier(value.assessmentId) && kebabIdentifier(value.dispatchId) && hash(value.reviewManifestHash)
    && safeIdentifier(value.reviewRunId) && hash(value.planHash) && integer(value.planVersion, 1) && safeText(value.outcome)
    && ids(value.assessedSurfaceIds, 128) && ids(value.assessedRemediationItemIds, 64) && ids(value.assessedTestIds, 64) && timestamp(value.createdAt);
}

function validAggregate(value: unknown): value is StoredReplanGovernanceAggregate {
  if (!isRecord(value) || !hasOnlyKeys(value, ["scope", "aggregateId", "eventVersion", "state", "observations", "requests", "scopeExpansionDecisions", "decisions", "transitions", "dispatchAttempts", "reviewAssessments"])
    || !scope(value.scope) || !kebabIdentifier(value.aggregateId) || !integer(value.eventVersion) || !STATES.has(value.state as string)
    || !Array.isArray(value.observations) || !Array.isArray(value.requests) || !Array.isArray(value.scopeExpansionDecisions)
    || !Array.isArray(value.decisions) || !Array.isArray(value.transitions) || !Array.isArray(value.dispatchAttempts) || !Array.isArray(value.reviewAssessments)) return false;
  const aggregate = value as unknown as StoredReplanGovernanceAggregate;
  const total = aggregate.observations.length + aggregate.requests.length + aggregate.scopeExpansionDecisions.length
    + aggregate.decisions.length + aggregate.transitions.length + aggregate.dispatchAttempts.length + aggregate.reviewAssessments.length;
  return total <= 512 && aggregate.observations.every((entry) => observation(entry, aggregate))
    && aggregate.requests.every((entry) => request(entry, aggregate))
    && aggregate.scopeExpansionDecisions.every((entry) => scopeDecision(entry, aggregate))
    && aggregate.decisions.every((entry) => replanDecision(entry, aggregate))
    && aggregate.transitions.every((entry) => transition(entry, aggregate))
    && aggregate.dispatchAttempts.every((entry) => dispatch(entry, aggregate))
    && aggregate.reviewAssessments.every((entry) => assessment(entry, aggregate))
    && coherentTransitionChain(aggregate);
}

function freezeCopy<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => freezeCopy(item))) as T;
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = freezeCopy(item);
    return Object.freeze(result) as T;
  }
  return value;
}

function refusal(code: ReplanGovernancePresentationRefusalCode): ReplanGovernancePresentationRefusal {
  const messages: Record<ReplanGovernancePresentationRefusalCode, string> = {
    invalid_input: "Replan governance request is invalid.",
    invalid_persisted_read_model: "Replan governance evidence is unavailable.",
    authority_unavailable: "Local governance authority is unavailable.",
    decision_refused: "The governance decision was refused.",
    persistence_failed: "The governance decision could not be recorded.",
  };
  return { kind: "presentation_refusal", code, message: messages[code] };
}

/**
 * Reads the V1 loopback configuration once. No actor, role, or default is
 * accepted from a decision request; FEAT-068 owns replacing this boundary.
 */
export function resolveLoopbackGovernanceAuthority(): LoopbackGovernanceAuthorityResult {
  const actorId = process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID;
  const rolesRaw = process.env.HEPHA_LOCAL_GOVERNANCE_ROLES;
  if (!safeIdentifier(actorId) || typeof rolesRaw !== "string" || rolesRaw.length === 0 || /\s/.test(rolesRaw)) return refusal("authority_unavailable");
  const roles = rolesRaw.split(",");
  if (roles.length === 0 || new Set(roles).size !== roles.length || !roles.every((role) => role === "FEATURE_OWNER" || role === "ARCHITECTURE_STEWARD")) return refusal("authority_unavailable");
  return freezeCopy({ kind: "authority" as const, authority: { actorId, roles: [...roles] as ("FEATURE_OWNER" | "ARCHITECTURE_STEWARD")[] } });
}

/** Produces the only transport-neutral, read-only governance presentation. */
export function projectReplanGovernance(input: unknown): ReplanGovernanceProjectionResult {
  if (!validAggregate(input)) return refusal("invalid_persisted_read_model");
  const aggregate = input;
  const latestRequest = aggregate.requests.at(-1) ?? null;
  const latestDispatch = aggregate.dispatchAttempts.at(-1) ?? null;
  return freezeCopy({
    kind: "replan_governance" as const,
    authority: "presentation_only" as const,
    scope: { ...aggregate.scope },
    aggregateId: aggregate.aggregateId,
    state: aggregate.state,
    eventVersion: aggregate.eventVersion,
    recurrence: {
      postFixManifestations: aggregate.observations.filter((entry) => entry.observationKind === "POST_FIX_MANIFESTATION").length,
      acceptedScopeExpansions: aggregate.observations.filter((entry) => entry.observationKind === "SCOPE_EXPANSION_ACCEPTED").length,
    },
    request: latestRequest === null ? null : {
      requestId: latestRequest.requestId,
      planHash: latestRequest.planHash,
      planVersion: latestRequest.planVersion,
      proposalAuthorActor: latestRequest.proposalAuthorActor,
      producerInvocationId: latestRequest.producerInvocationId,
      policyId: latestRequest.policyId,
      policyVersion: latestRequest.policyVersion,
      eligibleRoles: ["ARCHITECTURE_STEWARD"] as ["ARCHITECTURE_STEWARD"],
      requestedAt: latestRequest.requestedAt,
    },
    scopeExpansionDecisions: aggregate.scopeExpansionDecisions.map(({ decisionId, findingObservationId, outcome, actorId, authorizedRole, reason, expectedVersion, resultingVersion, decidedAt }) => ({ decisionId, findingObservationId, outcome, actorId, authorizedRole, reason, expectedVersion, resultingVersion, decidedAt })),
    replanDecisions: aggregate.decisions.map(({ decisionId, requestId, planHash, planVersion, outcome, actorId, authorizedRole, reason, expectedVersion, resultingVersion, decidedAt }) => ({ decisionId, requestId, planHash, planVersion, outcome, actorId, authorizedRole, reason, expectedVersion, resultingVersion, decidedAt })),
    dispatch: latestDispatch === null ? null : { outcome: latestDispatch.outcome, workflowRunId: latestDispatch.workflowRunId, attemptedAt: latestDispatch.attemptedAt },
    summary: { observations: aggregate.observations.length, requests: aggregate.requests.length, decisions: aggregate.scopeExpansionDecisions.length + aggregate.decisions.length, dispatchAttempts: aggregate.dispatchAttempts.length, reviewAssessments: aggregate.reviewAssessments.length },
  });
}

function escapeMarkdown(value: string): string {
  return value.replace(/[|\r\n]/g, " ").replace(/\\/g, "\\\\");
}

/** Rendered Markdown is evidence only and never a decision/action surface. */
export function renderReplanGovernance(input: unknown): RenderReplanGovernanceResult {
  const projection = projectReplanGovernance(input);
  if (projection.kind === "presentation_refusal") return projection;
  const lines = [
    "## Replan Governance Evidence",
    "",
    "> **Presentation evidence only:** This Markdown is derived from immutable governance records. It cannot approve, reject, dispatch, or advance workflow.",
    "",
    `- **Scope:** ${escapeMarkdown(projection.scope.projectId)} / ${escapeMarkdown(projection.scope.featureId)} / Phase ${projection.scope.phaseNumber} / ${escapeMarkdown(projection.scope.reviewGateId)} / ${escapeMarkdown(projection.scope.defectClass)}`,
    `- **Aggregate:** ${escapeMarkdown(projection.aggregateId)}`,
    `- **State:** ${projection.state} (event version ${projection.eventVersion})`,
    `- **Recurrence:** ${projection.recurrence.postFixManifestations} post-fix manifestations; ${projection.recurrence.acceptedScopeExpansions} accepted scope expansions`,
    `- **Current request:** ${projection.request ? `${escapeMarkdown(projection.request.requestId)} / ${projection.request.planHash} / v${projection.request.planVersion}` : "none"}`,
    `- **Dispatch:** ${projection.dispatch ? `${projection.dispatch.outcome} / ${escapeMarkdown(projection.dispatch.workflowRunId)}` : "none"}`,
  ];
  return freezeCopy({ kind: "rendered" as const, markdown: lines.join("\n"), projection });
}

interface ScopeExpansionDecisionInput {
  readonly store: ReviewGovernanceSqliteStore;
  readonly scope: ReplanGovernanceScope;
  readonly aggregateId: string;
  readonly findingObservationId: string;
  readonly action: "ACCEPT_SCOPE_EXPANSION" | "REJECT_SCOPE_EXPANSION";
  readonly expectedVersion: number;
  readonly reason: string;
  /** Internal same-transaction projection guard; never caller authority. */
  readonly verifyReadBack?: (aggregate: StoredReplanGovernanceAggregate) => boolean;
}

interface ReplanDecisionInput {
  readonly store: ReviewGovernanceSqliteStore;
  readonly scope: ReplanGovernanceScope;
  readonly aggregateId: string;
  readonly requestId: string;
  readonly action: "APPROVE_REPLAN" | "REJECT_REPLAN";
  readonly expectedVersion: number;
  readonly reason: string;
  /** Internal same-transaction projection guard; never caller authority. */
  readonly verifyReadBack?: (aggregate: StoredReplanGovernanceAggregate) => boolean;
}

function validScopeExpansionDecisionInput(value: unknown): value is ScopeExpansionDecisionInput {
  return isRecord(value) && hasOnlyKeys(value, ["store", "scope", "aggregateId", "findingObservationId", "action", "expectedVersion", "reason", "verifyReadBack"].filter((key) => value[key] !== undefined))
    && value.store instanceof ReviewGovernanceSqliteStore && scope(value.scope) && kebabIdentifier(value.aggregateId)
    && kebabIdentifier(value.findingObservationId) && (value.action === "ACCEPT_SCOPE_EXPANSION" || value.action === "REJECT_SCOPE_EXPANSION")
    && integer(value.expectedVersion) && safeText(value.reason) && (value.verifyReadBack === undefined || typeof value.verifyReadBack === "function");
}

function validReplanDecisionInput(value: unknown): value is ReplanDecisionInput {
  return isRecord(value) && hasOnlyKeys(value, ["store", "scope", "aggregateId", "requestId", "action", "expectedVersion", "reason", "verifyReadBack"].filter((key) => value[key] !== undefined))
    && value.store instanceof ReviewGovernanceSqliteStore && scope(value.scope) && kebabIdentifier(value.aggregateId)
    && kebabIdentifier(value.requestId) && (value.action === "APPROVE_REPLAN" || value.action === "REJECT_REPLAN")
    && integer(value.expectedVersion) && safeText(value.reason) && (value.verifyReadBack === undefined || typeof value.verifyReadBack === "function");
}

function isPresentationRefusal(value: StoredReplanGovernanceAggregate | ReplanGovernancePresentationRefusal): value is ReplanGovernancePresentationRefusal {
  return "kind" in value && value.kind === "presentation_refusal";
}

function readAggregate(store: ReviewGovernanceSqliteStore, selectedScope: ReplanGovernanceScope, aggregateId: string): StoredReplanGovernanceAggregate | ReplanGovernancePresentationRefusal {
  try {
    const aggregate = store.getReplanGovernanceAggregate(selectedScope, aggregateId);
    return validAggregate(aggregate) ? aggregate : refusal("invalid_persisted_read_model");
  } catch {
    return refusal("persistence_failed");
  }
}

function generatedDecisionId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

/**
 * Persists a configured, non-self feature-owner decision for one exact scope
 * expansion observation. The accepted observation itself is reconciled only by
 * Phase 6 from this immutable decision; this adapter never infers recurrence.
 */
export function decideScopeExpansion(input: unknown): LocalDecisionResult {
  if (!validScopeExpansionDecisionInput(input)) return refusal("invalid_input");
  const authorityResult = resolveLoopbackGovernanceAuthority();
  if (authorityResult.kind === "presentation_refusal") return authorityResult;
  if (!authorityResult.authority.roles.includes("FEATURE_OWNER")) return refusal("decision_refused");
  const aggregate = readAggregate(input.store, input.scope, input.aggregateId);
  if (isPresentationRefusal(aggregate)) return aggregate;
  if ((aggregate.state !== "NORMAL_REMEDIATION" && aggregate.state !== "REVIEW_PENDING") || aggregate.eventVersion !== input.expectedVersion) return refusal("decision_refused");
  const outcome = input.action === "ACCEPT_SCOPE_EXPANSION" ? "ACCEPT" : "REJECT";
  const decisionId = generatedDecisionId("scope-expansion-decision");
  const transitionedAt = new Date().toISOString();
  try {
    const committed = input.store.commitReplanGovernanceOperation({
      kind: outcome === "ACCEPT" ? "SCOPE_EXPANSION_ACCEPTED_NO_THRESHOLD" : "SCOPE_EXPANSION_REJECTED",
      records: {
        decision: { ...input.scope, aggregateId: input.aggregateId, decisionId, findingObservationId: input.findingObservationId, outcome, actorId: authorityResult.authority.actorId, policyId: "replan-governance-v1", policyVersion: 1, reason: input.reason, expectedVersion: input.expectedVersion, resultingVersion: input.expectedVersion + 1, decidedAt: transitionedAt },
        transition: { ...input.scope, aggregateId: input.aggregateId, transitionId: `${decisionId}-transition`, fromState: aggregate.state, toState: aggregate.state, reasonCode: outcome === "ACCEPT" ? "scope-expansion-accepted" : "scope-expansion-rejected", triggerRecordId: decisionId, expectedVersion: input.expectedVersion, resultingVersion: input.expectedVersion + 1, transitionedAt },
      },
    }, input.verifyReadBack);
    const projected = projectReplanGovernance(committed);
    if (projected.kind === "presentation_refusal" || projected.eventVersion !== input.expectedVersion + 1
      || !projected.scopeExpansionDecisions.some((decision) => decision.decisionId === decisionId && decision.actorId === authorityResult.authority.actorId && decision.outcome === outcome)) return refusal("persistence_failed");
    return freezeCopy({ kind: "decision_recorded" as const, projection: projected });
  } catch {
    return refusal("persistence_failed");
  }
}

/** Persists only a Phase-3-authorized exact replan decision and its transition. */
export function decideReplanApproval(input: unknown): LocalDecisionResult {
  if (!validReplanDecisionInput(input)) return refusal("invalid_input");
  const authorityResult = resolveLoopbackGovernanceAuthority();
  if (authorityResult.kind === "presentation_refusal") return authorityResult;
  const aggregate = readAggregate(input.store, input.scope, input.aggregateId);
  if (isPresentationRefusal(aggregate)) return aggregate;
  const decidedAt = new Date().toISOString();
  const authorized = authorizeLoopbackGovernanceDecision({
    aggregate,
    request: { subject: "REPLAN", requestId: input.requestId, action: input.action, expectedVersion: input.expectedVersion, reason: input.reason },
    authority: authorityResult.authority,
    decidedAt,
  });
  if (authorized.kind === "refusal") return refusal("decision_refused");
  const decisionId = generatedDecisionId("replan-decision");
  const toState = authorized.outcome === "APPROVE" ? "REPLAN_APPROVED" : "REPLAN_REJECTED";
  try {
    const committed = input.store.commitReplanGovernanceOperation({
      kind: "REPLAN_DECISION",
      records: {
        decision: { ...input.scope, aggregateId: input.aggregateId, decisionId, requestId: authorized.requestId, planHash: authorized.planHash, planVersion: authorized.planVersion, outcome: authorized.outcome, actorId: authorized.actorId, policyId: "replan-governance-v1", policyVersion: 1, reason: authorized.reason, expectedVersion: authorized.expectedVersion, resultingVersion: authorized.resultingVersion, decidedAt: authorized.decidedAt },
        transition: { ...input.scope, aggregateId: input.aggregateId, transitionId: `${decisionId}-transition`, fromState: "REPLAN_PENDING_APPROVAL", toState, reasonCode: authorized.outcome === "APPROVE" ? "replan-approved" : "replan-rejected", triggerRecordId: decisionId, expectedVersion: authorized.expectedVersion, resultingVersion: authorized.resultingVersion, transitionedAt: authorized.decidedAt },
      },
    }, input.verifyReadBack);
    const projected = projectReplanGovernance(committed);
    if (projected.kind === "presentation_refusal" || projected.state !== toState || projected.eventVersion !== authorized.resultingVersion
      || !projected.replanDecisions.some((decision) => decision.decisionId === decisionId && decision.requestId === authorized.requestId && decision.actorId === authorized.actorId)) return refusal("persistence_failed");
    return freezeCopy({ kind: "decision_recorded" as const, projection: projected });
  } catch {
    return refusal("persistence_failed");
  }
}
