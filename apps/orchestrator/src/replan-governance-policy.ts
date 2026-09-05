/**
 * FEAT-066 pure V1 recurrence, approval, and bounded-dispatch policy.
 *
 * Compatibility Decision: BREAKING CHANGE PERMITTED. This internal V1
 * boundary has no approved external consumer or legacy fallback. It consumes
 * typed Phase 2 aggregate reads and a prevalidated V1 replan-plan projection;
 * it never reads SQLite, Markdown, environment, clocks, fingerprints, retry
 * counts, or process state.
 */

import type {
  ReplanGovernanceState,
  ReplanObservationKind,
  StoredReplanGovernanceAggregate,
} from "@hepha/db";

import {
  computeReviewArtifactHash,
  isReviewContractSafeString,
  isValidArtifactLineage,
  isValidArtifactReference,
  isValidProjectRelativePath,
  type ArtifactReference,
  type ReplanPlan,
  type SurfaceEntry,
} from "./review-contract-types.js";

export type ReplanGovernanceRefusalCode =
  | "INVALID_INPUT"
  | "SCOPE_MISMATCH"
  | "INVALID_STATE"
  | "DUPLICATE_EVENT"
  | "UNAUTHORIZED"
  | "SELF_APPROVAL"
  | "STALE_VERSION"
  | "PLAN_NOT_CURRENT"
  | "DISPATCH_CONSUMED";

export interface ReplanPolicyRefusal {
  readonly kind: "refusal";
  readonly code: ReplanGovernanceRefusalCode;
  readonly message: string;
}

export interface ReplanGovernanceCandidate {
  readonly aggregateId: string;
  readonly scope: {
    readonly projectId: string;
    readonly featureId: string;
    readonly phaseNumber: number;
    readonly reviewGateId: string;
    readonly defectClass: string;
  };
  readonly observationEventId: string;
  readonly observationKind: ReplanObservationKind;
  readonly triggerManifestHash: string;
  readonly basisManifestHash: string;
  readonly findingObservationId?: string;
  readonly remediationCycleId?: string;
  readonly decisionId?: string;
}

export interface ReplanGovernanceDecision {
  readonly kind: "decision";
  readonly action: "APPEND_OBSERVATION" | "APPEND_THRESHOLD";
  readonly state: "NORMAL_REMEDIATION" | "REMEDIATION_REPLAN_REQUIRED";
  readonly reasonCode: "first_post_fix_manifestation" | "first_scope_expansion" | "recurrence_threshold" | "finding_exhaustiveness";
  readonly expectedVersion: number;
  readonly candidate: ReplanGovernanceCandidate;
}

export type ReplanGovernanceOutcome = ReplanGovernanceDecision | ReplanPolicyRefusal;

export interface LoopbackAuthority {
  readonly actorId: string;
  readonly roles: readonly ("FEATURE_OWNER" | "ARCHITECTURE_STEWARD")[];
}

export interface ReplanApprovalRequest {
  readonly subject: "REPLAN";
  readonly requestId: string;
  readonly action: "APPROVE_REPLAN" | "REJECT_REPLAN";
  readonly expectedVersion: number;
  readonly reason: string;
}

export interface AuthorizedReplanDecision {
  readonly kind: "authorized";
  readonly requestId: string;
  readonly planHash: string;
  readonly planVersion: number;
  readonly outcome: "APPROVE" | "REJECT";
  readonly actorId: string;
  readonly authorizedRole: "ARCHITECTURE_STEWARD";
  readonly reason: string;
  readonly expectedVersion: number;
  readonly resultingVersion: number;
  readonly decidedAt: string;
}

export type ReplanAuthorizationOutcome = AuthorizedReplanDecision | ReplanPolicyRefusal;

export interface ApprovedPlanArtifact {
  readonly artifactId: string;
  readonly contentHash: string;
  readonly relativePath: string;
}

export interface ApprovedBoundedReplanInput {
  readonly aggregate: StoredReplanGovernanceAggregate;
  readonly artifact: ApprovedPlanArtifact;
  readonly plan: ReplanPlan;
}

export interface ApprovedBoundedReplanDispatch {
  readonly kind: "dispatch";
  readonly context: Readonly<{
    projectId: string;
    featureId: string;
    phaseNumber: number;
    reviewGateId: string;
    defectClass: string;
    requestId: string;
    planArtifactId: string;
    planHash: string;
    planRelativePath: string;
    planVersion: number;
    approvalDecisionId: string;
    authorizedRole: "ARCHITECTURE_STEWARD";
    approvalEventVersion: number;
    rootCause: string;
    surface: Readonly<{
      inspected: readonly Readonly<SurfaceEntry>[];
      affected: readonly Readonly<SurfaceEntry>[];
      confirmedUnaffected: readonly Readonly<SurfaceEntry>[];
    }>;
    explicitExclusions: readonly Readonly<{ relativePath: string; rationale: string }>[];
    remediationItems: readonly Readonly<{ remediationItemId: string; instruction: string; targetSurfaceIds: readonly string[] }>[];
    testMatrix: readonly Readonly<{ testId: string; requirement: string; targetSurfaceIds: readonly string[] }>[];
    verificationPlan: string;
    closureCriteria: string;
  }>;
}

export type ApprovedBoundedReplanDispatchOutcome = ApprovedBoundedReplanDispatch | ReplanPolicyRefusal;

const HASH_RE = /^[a-f0-9]{64}$/;
const IDENTIFIER_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const STATES = new Set<ReplanGovernanceState>([
  "NORMAL_REMEDIATION", "REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL", "REPLAN_APPROVED", "REPLAN_REJECTED", "BOUNDED_REMEDIATION_DISPATCHED", "REVIEW_PENDING",
]);
const OBSERVATION_KINDS = new Set<ReplanObservationKind>(["POST_FIX_MANIFESTATION", "SCOPE_EXPANSION_ACCEPTED", "FINDING_EXHAUSTIVENESS"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function safeText(value: unknown): value is string {
  return typeof value === "string" && isWellFormedUtf16(value)
    && isReviewContractSafeString(value) && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

function safeProjectRelativePath(value: unknown): value is string {
  return typeof value === "string" && isWellFormedUtf16(value) && isValidProjectRelativePath(value);
}

function hasSafeArtifactReference(value: unknown): value is ArtifactReference {
  return isRecord(value) && safeProjectRelativePath(value.relativePath) && isValidArtifactReference(value);
}

function hasSafeArtifactLineage(value: unknown, artifactId: string, scope: ReplanPlan["scope"]): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const predecessors = value.predecessors;
  const supersedes = value.supersedes;
  if ((predecessors !== undefined && (!Array.isArray(predecessors) || !predecessors.every(hasSafeArtifactReference)))
    || (supersedes !== undefined && !hasSafeArtifactReference(supersedes))) return false;
  return isValidArtifactLineage(value, artifactId, "replan_plan", scope);
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128 && IDENTIFIER_RE.test(value);
}

/** Matches Phase 2's safe actor/principal and scope-string storage contract. */
function safeIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length <= 256 && safeText(value);
}

function hash(value: unknown): value is string {
  return typeof value === "string" && HASH_RE.test(value);
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const [datePart, timePart] = value.replace("+00:00", "Z").split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.slice(0, 8).split(":").map(Number);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day
    && parsed.getUTCHours() === hour && parsed.getUTCMinutes() === minute && parsed.getUTCSeconds() === second;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isScope(value: unknown): value is ReplanGovernanceCandidate["scope"] {
  return isRecord(value)
    && hasOnlyKeys(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass"])
    && safeIdentity(value.projectId) && safeIdentity(value.featureId)
    && Number.isInteger(value.phaseNumber) && (value.phaseNumber as number) >= 0
    && safeIdentity(value.reviewGateId) && identifier(value.defectClass);
}

function isArtifactScope(value: unknown): value is ReplanPlan["scope"] {
  return isRecord(value)
    && hasOnlyKeys(value, ["projectId", "featureId", "phaseNumber", "reviewGateId"])
    && safeIdentity(value.projectId) && safeIdentity(value.featureId)
    && Number.isInteger(value.phaseNumber) && (value.phaseNumber as number) >= 0
    && safeIdentity(value.reviewGateId);
}

function sameScope(left: ReplanGovernanceCandidate["scope"], right: ReplanGovernanceCandidate["scope"]): boolean {
  return left.projectId === right.projectId && left.featureId === right.featureId
    && left.phaseNumber === right.phaseNumber && left.reviewGateId === right.reviewGateId
    && left.defectClass === right.defectClass;
}

function refusal(code: ReplanGovernanceRefusalCode): ReplanPolicyRefusal {
  const messages: Record<ReplanGovernanceRefusalCode, string> = {
    INVALID_INPUT: "Replan governance input is invalid.",
    SCOPE_MISMATCH: "Replan governance input does not match the aggregate scope.",
    INVALID_STATE: "Replan governance state does not permit this operation.",
    DUPLICATE_EVENT: "Replan governance event is already recorded.",
    UNAUTHORIZED: "Governance authority is not authorized for this operation.",
    SELF_APPROVAL: "A proposal author cannot decide that proposal.",
    STALE_VERSION: "Governance decision version is stale.",
    PLAN_NOT_CURRENT: "The replan is not the current approved plan.",
    DISPATCH_CONSUMED: "The approved replan has already been consumed for dispatch.",
  };
  return { kind: "refusal", code, message: messages[code] };
}

function isScopedAggregateRecord(value: unknown, keys: readonly string[], scope: ReplanGovernanceCandidate["scope"], aggregateId: string): value is Record<string, unknown> {
  return isRecord(value) && hasOnlyKeys(value, keys)
    && value.projectId === scope.projectId && value.featureId === scope.featureId
    && value.phaseNumber === scope.phaseNumber && value.reviewGateId === scope.reviewGateId
    && value.defectClass === scope.defectClass && value.aggregateId === aggregateId;
}

function isObservationRecord(value: unknown, scope: ReplanGovernanceCandidate["scope"], aggregateId: string): boolean {
  if (!isScopedAggregateRecord(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "observationEventId", "observationKind", "triggerManifestHash", "basisManifestHash", "findingObservationId", "remediationCycleId", "decisionId", "createdAt"], scope, aggregateId)
    || !identifier(value.observationEventId) || typeof value.observationKind !== "string" || !OBSERVATION_KINDS.has(value.observationKind as ReplanObservationKind)
    || !hash(value.triggerManifestHash) || !hash(value.basisManifestHash) || !timestamp(value.createdAt)) return false;
  if (value.findingObservationId !== undefined && !identifier(value.findingObservationId)) return false;
  if (value.remediationCycleId !== undefined && !identifier(value.remediationCycleId)) return false;
  if (value.decisionId !== undefined && !identifier(value.decisionId)) return false;
  return value.observationKind === "POST_FIX_MANIFESTATION"
    ? value.remediationCycleId !== undefined && value.findingObservationId === undefined && value.decisionId === undefined
    : value.observationKind === "SCOPE_EXPANSION_ACCEPTED"
      ? value.findingObservationId !== undefined && value.decisionId !== undefined && value.remediationCycleId === undefined
      : value.findingObservationId !== undefined && value.decisionId === undefined && value.remediationCycleId === undefined;
}

function isRequestRecord(value: unknown, scope: ReplanGovernanceCandidate["scope"], aggregateId: string): boolean {
  return isScopedAggregateRecord(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "requestId", "triggerEventId", "planHash", "planVersion", "proposalAuthorActor", "producerInvocationId", "policyId", "policyVersion", "eligibleRoles", "requestedAt"], scope, aggregateId)
    && identifier(value.requestId) && identifier(value.triggerEventId) && hash(value.planHash)
    && Number.isInteger(value.planVersion) && (value.planVersion as number) >= 1
    && safeIdentity(value.proposalAuthorActor) && safeIdentity(value.producerInvocationId)
    && value.policyId === "replan-governance-v1" && value.policyVersion === 1
    && Array.isArray(value.eligibleRoles) && value.eligibleRoles.length === 1 && value.eligibleRoles[0] === "ARCHITECTURE_STEWARD"
    && timestamp(value.requestedAt);
}

function isScopeDecisionRecord(value: unknown, scope: ReplanGovernanceCandidate["scope"], aggregateId: string): boolean {
  return isScopedAggregateRecord(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "decisionId", "findingObservationId", "outcome", "actorId", "authorizedRole", "policyId", "policyVersion", "reason", "expectedVersion", "resultingVersion", "decidedAt"], scope, aggregateId)
    && identifier(value.decisionId) && identifier(value.findingObservationId) && (value.outcome === "ACCEPT" || value.outcome === "REJECT")
    && safeIdentity(value.actorId) && value.authorizedRole === "FEATURE_OWNER" && value.policyId === "replan-governance-v1" && value.policyVersion === 1
    && safeText(value.reason) && Number.isInteger(value.expectedVersion) && (value.expectedVersion as number) >= 0
    && value.resultingVersion === (value.expectedVersion as number) + 1 && timestamp(value.decidedAt);
}

function isDecisionRecord(value: unknown, scope: ReplanGovernanceCandidate["scope"], aggregateId: string): boolean {
  return isScopedAggregateRecord(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "decisionId", "requestId", "planHash", "planVersion", "outcome", "actorId", "authorizedRole", "policyId", "policyVersion", "reason", "expectedVersion", "resultingVersion", "decidedAt"], scope, aggregateId)
    && identifier(value.decisionId) && identifier(value.requestId) && hash(value.planHash)
    && Number.isInteger(value.planVersion) && (value.planVersion as number) >= 1 && (value.outcome === "APPROVE" || value.outcome === "REJECT")
    && safeIdentity(value.actorId) && value.authorizedRole === "ARCHITECTURE_STEWARD" && value.policyId === "replan-governance-v1" && value.policyVersion === 1
    && safeText(value.reason) && Number.isInteger(value.expectedVersion) && (value.expectedVersion as number) >= 0
    && value.resultingVersion === (value.expectedVersion as number) + 1 && timestamp(value.decidedAt);
}

function isTransitionRecord(value: unknown, scope: ReplanGovernanceCandidate["scope"], aggregateId: string): boolean {
  return isScopedAggregateRecord(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "transitionId", "fromState", "toState", "reasonCode", "triggerRecordId", "triggerHash", "expectedVersion", "resultingVersion", "transitionedAt"], scope, aggregateId)
    && identifier(value.transitionId) && typeof value.fromState === "string" && STATES.has(value.fromState as ReplanGovernanceState)
    && typeof value.toState === "string" && STATES.has(value.toState as ReplanGovernanceState)
    && safeText(value.reasonCode) && identifier(value.triggerRecordId) && (value.triggerHash === undefined || hash(value.triggerHash))
    && Number.isInteger(value.expectedVersion) && (value.expectedVersion as number) >= 0
    && value.resultingVersion === (value.expectedVersion as number) + 1 && timestamp(value.transitionedAt);
}

function isDispatchRecord(value: unknown, scope: ReplanGovernanceCandidate["scope"], aggregateId: string): boolean {
  return isScopedAggregateRecord(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "attemptEventId", "dispatchId", "requestId", "planHash", "planVersion", "approvalDecisionId", "approvalEventVersion", "outcome", "reasonCode", "workflowRunId", "attemptedAt"], scope, aggregateId)
    && identifier(value.attemptEventId) && identifier(value.dispatchId) && identifier(value.requestId) && hash(value.planHash)
    && Number.isInteger(value.planVersion) && (value.planVersion as number) >= 1 && identifier(value.approvalDecisionId)
    && Number.isInteger(value.approvalEventVersion) && (value.approvalEventVersion as number) >= 0
    && (value.outcome === "STARTED" || value.outcome === "START_FAILED") && (value.reasonCode === undefined || safeText(value.reasonCode))
    && identifier(value.workflowRunId) && timestamp(value.attemptedAt);
}

function isAssessmentRecord(value: unknown, scope: ReplanGovernanceCandidate["scope"], aggregateId: string): boolean {
  const ids = (candidate: unknown, maximum: number) => Array.isArray(candidate) && candidate.length > 0 && candidate.length <= maximum && candidate.every(identifier) && unique(candidate as string[]);
  return isScopedAggregateRecord(value, ["projectId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "aggregateId", "assessmentId", "dispatchId", "reviewManifestHash", "reviewRunId", "planHash", "planVersion", "outcome", "assessedSurfaceIds", "assessedRemediationItemIds", "assessedTestIds", "createdAt"], scope, aggregateId)
    && identifier(value.assessmentId) && identifier(value.dispatchId) && hash(value.reviewManifestHash) && identifier(value.reviewRunId)
    && hash(value.planHash) && Number.isInteger(value.planVersion) && (value.planVersion as number) >= 1 && safeText(value.outcome)
    && ids(value.assessedSurfaceIds, 128) && ids(value.assessedRemediationItemIds, 64) && ids(value.assessedTestIds, 64) && timestamp(value.createdAt);
}

function validateAggregate(value: unknown): value is StoredReplanGovernanceAggregate {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["scope", "aggregateId", "eventVersion", "state", "observations", "requests", "scopeExpansionDecisions", "decisions", "transitions", "dispatchAttempts", "reviewAssessments"])
    || !isScope(value.scope) || !identifier(value.aggregateId)
    || !Number.isInteger(value.eventVersion) || (value.eventVersion as number) < 0
    || typeof value.state !== "string" || !STATES.has(value.state as ReplanGovernanceState)
    || !Array.isArray(value.observations) || !Array.isArray(value.requests)
    || !Array.isArray(value.scopeExpansionDecisions) || !Array.isArray(value.decisions)
    || !Array.isArray(value.transitions) || !Array.isArray(value.dispatchAttempts) || !Array.isArray(value.reviewAssessments)) return false;

  const scope = value.scope as ReplanGovernanceCandidate["scope"];
  const aggregateId = value.aggregateId as string;
  const records = [
    ...value.observations, ...value.requests, ...value.scopeExpansionDecisions,
    ...value.decisions, ...value.transitions, ...value.dispatchAttempts, ...value.reviewAssessments,
  ];
  if (records.length > 512 || !value.observations.every((record) => isObservationRecord(record, scope, aggregateId))
    || !value.requests.every((record) => isRequestRecord(record, scope, aggregateId))
    || !value.scopeExpansionDecisions.every((record) => isScopeDecisionRecord(record, scope, aggregateId))
    || !value.decisions.every((record) => isDecisionRecord(record, scope, aggregateId))
    || !value.transitions.every((record) => isTransitionRecord(record, scope, aggregateId))
    || !value.dispatchAttempts.every((record) => isDispatchRecord(record, scope, aggregateId))
    || !value.reviewAssessments.every((record) => isAssessmentRecord(record, scope, aggregateId))) return false;
  const transitions = value.transitions as Record<string, unknown>[];
  if (transitions.length === 0) return value.eventVersion === 0 && value.state === "NORMAL_REMEDIATION";
  const allowedTransitions: Readonly<Record<ReplanGovernanceState, readonly ReplanGovernanceState[]>> = {
    NORMAL_REMEDIATION: ["NORMAL_REMEDIATION", "REMEDIATION_REPLAN_REQUIRED"],
    REMEDIATION_REPLAN_REQUIRED: ["REPLAN_PENDING_APPROVAL"],
    REPLAN_PENDING_APPROVAL: ["REPLAN_APPROVED", "REPLAN_REJECTED"],
    REPLAN_APPROVED: ["BOUNDED_REMEDIATION_DISPATCHED"],
    REPLAN_REJECTED: ["REPLAN_PENDING_APPROVAL"],
    BOUNDED_REMEDIATION_DISPATCHED: ["REVIEW_PENDING"],
    REVIEW_PENDING: ["REVIEW_PENDING", "NORMAL_REMEDIATION", "REMEDIATION_REPLAN_REQUIRED"],
  };
  return transitions.every((transition, index) => transition.expectedVersion === index
    && transition.resultingVersion === index + 1
    && transition.fromState === (index === 0 ? "NORMAL_REMEDIATION" : transitions[index - 1]?.toState)
    && allowedTransitions[transition.fromState as ReplanGovernanceState]?.includes(transition.toState as ReplanGovernanceState))
    && value.eventVersion === transitions.at(-1)?.resultingVersion && value.state === transitions.at(-1)?.toState;
}

function validateCandidate(value: unknown): value is ReplanGovernanceCandidate {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["aggregateId", "scope", "observationEventId", "observationKind", "triggerManifestHash", "basisManifestHash", "findingObservationId", "remediationCycleId", "decisionId"])
    || !identifier(value.aggregateId) || !isScope(value.scope) || !identifier(value.observationEventId)
    || typeof value.observationKind !== "string" || !OBSERVATION_KINDS.has(value.observationKind as ReplanObservationKind)
    || !hash(value.triggerManifestHash) || !hash(value.basisManifestHash)) return false;
  if (value.findingObservationId !== undefined && !identifier(value.findingObservationId)) return false;
  if (value.remediationCycleId !== undefined && !identifier(value.remediationCycleId)) return false;
  if (value.decisionId !== undefined && !identifier(value.decisionId)) return false;
  if (value.observationKind === "POST_FIX_MANIFESTATION") {
    return value.remediationCycleId !== undefined && value.findingObservationId === undefined && value.decisionId === undefined;
  }
  if (value.observationKind === "SCOPE_EXPANSION_ACCEPTED") {
    return value.findingObservationId !== undefined && value.decisionId !== undefined && value.remediationCycleId === undefined;
  }
  return value.findingObservationId !== undefined && value.remediationCycleId === undefined && value.decisionId === undefined;
}

/**
 * Evaluates only an exact typed aggregate and a pre-proven candidate event.
 * The integration boundary owns proving candidate predecessors from FEAT-065
 * records and persists the returned closed decision through Phase 2.
 */
export function evaluateReplanGovernance(input: unknown): ReplanGovernanceOutcome {
  if (!isRecord(input) || !hasOnlyKeys(input, ["aggregate", "candidate"])
    || !validateAggregate(input.aggregate) || !validateCandidate(input.candidate)) return refusal("INVALID_INPUT");
  const aggregate = input.aggregate;
  const candidate = input.candidate;
  if (aggregate.aggregateId !== candidate.aggregateId || !sameScope(aggregate.scope, candidate.scope)) return refusal("SCOPE_MISMATCH");
  if (aggregate.state !== "NORMAL_REMEDIATION" && aggregate.state !== "REVIEW_PENDING") return refusal("INVALID_STATE");
  const duplicate = aggregate.observations.some((observation) => {
    if (observation.observationEventId === candidate.observationEventId) return true;
    if (candidate.observationKind === "POST_FIX_MANIFESTATION") {
      return observation.observationKind === candidate.observationKind
        && observation.triggerManifestHash === candidate.triggerManifestHash;
    }
    if (candidate.observationKind === "SCOPE_EXPANSION_ACCEPTED") {
      return observation.observationKind === candidate.observationKind
        && observation.findingObservationId === candidate.findingObservationId
        && observation.decisionId === candidate.decisionId;
    }
    return observation.observationKind === candidate.observationKind
      && observation.findingObservationId === candidate.findingObservationId;
  });
  if (duplicate) return refusal("DUPLICATE_EVENT");
  if (candidate.observationKind === "SCOPE_EXPANSION_ACCEPTED") {
    const decision = aggregate.scopeExpansionDecisions.find((item) => item.decisionId === candidate.decisionId);
    if (!decision || decision.outcome !== "ACCEPT" || decision.findingObservationId !== candidate.findingObservationId) return refusal("INVALID_INPUT");
  }

  const postFixCount = aggregate.observations.filter((item) => item.observationKind === "POST_FIX_MANIFESTATION").length
    + (candidate.observationKind === "POST_FIX_MANIFESTATION" ? 1 : 0);
  const expansionCount = aggregate.observations.filter((item) => item.observationKind === "SCOPE_EXPANSION_ACCEPTED").length
    + (candidate.observationKind === "SCOPE_EXPANSION_ACCEPTED" ? 1 : 0);
  const threshold = candidate.observationKind === "FINDING_EXHAUSTIVENESS" || postFixCount >= 2 || expansionCount >= 2;
  const reasonCode = candidate.observationKind === "FINDING_EXHAUSTIVENESS"
    ? "finding_exhaustiveness"
    : threshold ? "recurrence_threshold"
      : candidate.observationKind === "POST_FIX_MANIFESTATION" ? "first_post_fix_manifestation" : "first_scope_expansion";
  return {
    kind: "decision",
    action: threshold ? "APPEND_THRESHOLD" : "APPEND_OBSERVATION",
    state: threshold ? "REMEDIATION_REPLAN_REQUIRED" : "NORMAL_REMEDIATION",
    reasonCode,
    expectedVersion: aggregate.eventVersion,
    candidate,
  };
}

function validateAuthority(value: unknown): value is LoopbackAuthority {
  return isRecord(value) && hasOnlyKeys(value, ["actorId", "roles"])
    && safeIdentity(value.actorId) && Array.isArray(value.roles) && value.roles.length > 0
    && value.roles.every((role) => role === "FEATURE_OWNER" || role === "ARCHITECTURE_STEWARD")
    && unique(value.roles as string[]);
}

function validateApprovalRequest(value: unknown): value is ReplanApprovalRequest {
  return isRecord(value) && hasOnlyKeys(value, ["subject", "requestId", "action", "expectedVersion", "reason"])
    && value.subject === "REPLAN" && identifier(value.requestId)
    && (value.action === "APPROVE_REPLAN" || value.action === "REJECT_REPLAN")
    && Number.isInteger(value.expectedVersion) && (value.expectedVersion as number) >= 0 && safeText(value.reason);
}

/**
 * Authorizes one exact replan decision. The caller cannot nominate a role;
 * only a previously resolved loopback authority supplies actor and roles.
 */
export function authorizeLoopbackGovernanceDecision(input: unknown): ReplanAuthorizationOutcome {
  if (!isRecord(input) || !hasOnlyKeys(input, ["aggregate", "request", "authority", "decidedAt"])
    || !validateAggregate(input.aggregate) || !validateApprovalRequest(input.request)
    || !validateAuthority(input.authority) || !timestamp(input.decidedAt)) return refusal("INVALID_INPUT");
  const aggregate = input.aggregate;
  const request = input.request;
  const authority = input.authority;
  if (aggregate.state !== "REPLAN_PENDING_APPROVAL") return refusal("INVALID_STATE");
  if (request.expectedVersion !== aggregate.eventVersion) return refusal("STALE_VERSION");
  if (!authority.roles.includes("ARCHITECTURE_STEWARD")) return refusal("UNAUTHORIZED");
  const persistedRequest = aggregate.requests.find((item) => item.requestId === request.requestId);
  const currentRequest = aggregate.requests.at(-1);
  if (!persistedRequest || persistedRequest !== currentRequest || persistedRequest.planVersion < 1 || !hash(persistedRequest.planHash)) return refusal("PLAN_NOT_CURRENT");
  if (persistedRequest.proposalAuthorActor === authority.actorId) return refusal("SELF_APPROVAL");
  if (aggregate.decisions.some((decision) => decision.requestId === persistedRequest.requestId
    && decision.planHash === persistedRequest.planHash && decision.planVersion === persistedRequest.planVersion)) return refusal("PLAN_NOT_CURRENT");
  return {
    kind: "authorized",
    requestId: persistedRequest.requestId,
    planHash: persistedRequest.planHash,
    planVersion: persistedRequest.planVersion,
    outcome: request.action === "APPROVE_REPLAN" ? "APPROVE" : "REJECT",
    actorId: authority.actorId,
    authorizedRole: "ARCHITECTURE_STEWARD",
    reason: request.reason,
    expectedVersion: request.expectedVersion,
    resultingVersion: request.expectedVersion + 1,
    decidedAt: input.decidedAt,
  };
}

function validateSurfaceEntry(value: unknown): value is SurfaceEntry {
  if (!isRecord(value) || !hasOnlyKeys(value, ["surfaceId", "relativePath", "symbol", "endpoint", "rationale"])
    || !identifier(value.surfaceId) || !safeProjectRelativePath(value.relativePath)) return false;
  return [value.symbol, value.endpoint, value.rationale].every((field) => field === undefined || safeText(field));
}

function validatePlan(value: unknown): value is ReplanPlan {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["schemaVersion", "artifactKind", "artifactId", "scope", "lineage", "manifestReference", "findingIds", "defectClass", "replanReason", "rootCause", "surface", "explicitExclusions", "remediationItems", "testMatrix", "verificationPlan", "closureCriteria"])
    || value.schemaVersion !== 1 || value.artifactKind !== "replan_plan" || !identifier(value.artifactId)
    || !isArtifactScope(value.scope) || !hasSafeArtifactLineage(value.lineage, value.artifactId, value.scope)
    || !hasSafeArtifactReference(value.manifestReference)
    || value.manifestReference.artifactKind !== "review_manifest"
    || !Array.isArray(value.findingIds) || value.findingIds.length === 0 || value.findingIds.length > 64
    || !value.findingIds.every(identifier) || !unique(value.findingIds as string[]) || !safeText(value.defectClass)
    || (value.replanReason !== "finding_exhaustiveness" && value.replanReason !== "recurrence_signal")
    || !safeText(value.rootCause) || !isRecord(value.surface)
    || !hasOnlyKeys(value.surface, ["inspected", "affected", "confirmedUnaffected"])
    || !Array.isArray(value.surface.inspected) || !Array.isArray(value.surface.affected) || !Array.isArray(value.surface.confirmedUnaffected)
    || !Array.isArray(value.explicitExclusions) || !Array.isArray(value.remediationItems) || !Array.isArray(value.testMatrix)
    || !safeText(value.verificationPlan) || !safeText(value.closureCriteria)) return false;
  const collections = [value.surface.inspected, value.surface.affected, value.surface.confirmedUnaffected];
  if (value.surface.affected.length === 0 || collections.some((entries) => entries.length > 128 || !entries.every(validateSurfaceEntry))) return false;
  if (!collections.every((entries) => unique(entries.map((entry) => entry.surfaceId)))) return false;
  const affectedIds = new Set(value.surface.affected.map((entry) => entry.surfaceId));
  if (value.surface.confirmedUnaffected.some((entry) => affectedIds.has(entry.surfaceId))) return false;
  if (!value.explicitExclusions.every((entry) => isRecord(entry) && hasOnlyKeys(entry, ["relativePath", "rationale"])
    && safeProjectRelativePath(entry.relativePath) && safeText(entry.rationale))
    || !unique(value.explicitExclusions.map((entry) => entry.relativePath))) return false;
  const affected = affectedIds;
  const itemShape = (item: unknown, idKey: "remediationItemId" | "testId", textKey: "instruction" | "requirement") => isRecord(item)
    && hasOnlyKeys(item, [idKey, textKey, "targetSurfaceIds"])
    && identifier(item[idKey]) && safeText(item[textKey]) && Array.isArray(item.targetSurfaceIds)
    && item.targetSurfaceIds.length > 0 && item.targetSurfaceIds.length <= 128
    && item.targetSurfaceIds.every(identifier) && unique(item.targetSurfaceIds as string[])
    && (item.targetSurfaceIds as string[]).every((id) => affected.has(id));
  return value.remediationItems.length > 0 && value.remediationItems.length <= 64
    && value.testMatrix.length > 0 && value.testMatrix.length <= 64
    && value.remediationItems.every((item) => itemShape(item, "remediationItemId", "instruction"))
    && value.testMatrix.every((item) => itemShape(item, "testId", "requirement"))
    && unique(value.remediationItems.map((item) => item.remediationItemId))
    && unique(value.testMatrix.map((item) => item.testId));
}

function freezeCopy<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => freezeCopy(item))) as T;
  if (isRecord(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = freezeCopy(item);
    return Object.freeze(copy) as T;
  }
  return value;
}

/**
 * Builds the only worker payload permitted by V1. It exposes no raw plan,
 * findings, environment, retry/fingerprint state, or caller-authored approval.
 */
export function buildApprovedBoundedReplanDispatch(input: unknown): ApprovedBoundedReplanDispatchOutcome {
  if (!isRecord(input) || !hasOnlyKeys(input, ["aggregate", "artifact", "plan"])
    || !validateAggregate(input.aggregate) || !isRecord(input.artifact)
    || !hasOnlyKeys(input.artifact, ["artifactId", "contentHash", "relativePath"])
    || !identifier(input.artifact.artifactId) || !hash(input.artifact.contentHash)
    || !safeProjectRelativePath(input.artifact.relativePath)
    || !validatePlan(input.plan)) return refusal("INVALID_INPUT");
  const aggregate = input.aggregate;
  const artifact = input.artifact as unknown as ApprovedPlanArtifact;
  const plan = input.plan;
  if (aggregate.scope.projectId !== plan.scope.projectId || aggregate.scope.featureId !== plan.scope.featureId
    || aggregate.scope.phaseNumber !== plan.scope.phaseNumber || aggregate.scope.reviewGateId !== plan.scope.reviewGateId
    || aggregate.scope.defectClass !== plan.defectClass) return refusal("SCOPE_MISMATCH");
  if (computeReviewArtifactHash(plan) !== artifact.contentHash) return refusal("PLAN_NOT_CURRENT");
  if (aggregate.state !== "REPLAN_APPROVED") return refusal("INVALID_STATE");
  const request = aggregate.requests.at(-1);
  const decision = aggregate.decisions.at(-1);
  const approvalTransition = aggregate.transitions.at(-1);
  if (!request || !decision || !approvalTransition || decision.outcome !== "APPROVE" || decision.authorizedRole !== "ARCHITECTURE_STEWARD"
    || request.requestId !== decision.requestId || request.planHash !== artifact.contentHash
    || decision.planHash !== artifact.contentHash || request.planVersion !== decision.planVersion
    || decision.resultingVersion !== aggregate.eventVersion || approvalTransition.triggerRecordId !== decision.decisionId
    || plan.artifactId !== artifact.artifactId) return refusal("PLAN_NOT_CURRENT");
  if (aggregate.dispatchAttempts.some((attempt) => attempt.outcome === "STARTED"
    && attempt.requestId === request.requestId && attempt.planHash === artifact.contentHash && attempt.planVersion === request.planVersion)) return refusal("DISPATCH_CONSUMED");
  return {
    kind: "dispatch",
    context: freezeCopy({
      ...aggregate.scope,
      requestId: request.requestId,
      planArtifactId: artifact.artifactId,
      planHash: artifact.contentHash,
      planRelativePath: artifact.relativePath,
      planVersion: request.planVersion,
      approvalDecisionId: decision.decisionId,
      authorizedRole: decision.authorizedRole,
      approvalEventVersion: decision.resultingVersion,
      rootCause: plan.rootCause,
      surface: plan.surface,
      explicitExclusions: plan.explicitExclusions,
      remediationItems: plan.remediationItems,
      testMatrix: plan.testMatrix,
      verificationPlan: plan.verificationPlan,
      closureCriteria: plan.closureCriteria,
    }),
  };
}
