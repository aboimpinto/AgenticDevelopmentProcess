/**
 * FEAT-067 V1 pure architecture-debt lifecycle and future-touch policy.
 *
 * Compatibility Decision: BREAKING CHANGE PERMITTED. This internal policy
 * accepts only current V1 structured state. It performs no I/O and never
 * treats Markdown, caller-selected roles, clocks, or inferred waivers as
 * authority.
 */
import type {
  ArchitectureDebtAggregateV1,
  ArchitectureDebtPriority,
  ArchitectureDebtState,
  ArchitectureDebtTrigger,
} from "@hepha/db";

export type ArchitectureDebtTriageOperation =
  | "CONFIRM" | "REJECT" | "MERGE" | "REASSIGN" | "DEFER"
  | "ACCEPT_RISK" | "PLAN_LINK" | "CLOSE" | "SUPERSEDE";
export type FutureTouchDecisionKind = "REMEDIATE" | "PREREQUISITE" | "WAIVER" | "NON_INTERACTION";
export type ArchitectureDebtPolicyRefusalCode =
  | "invalid_input" | "unauthorized" | "stale_version" | "foreign_identity"
  | "invalid_transition" | "invalid_target" | "invalid_decision";

export interface DebtAuthorityContext {
  readonly actorId: string;
  readonly verifiedRole: "ARCHITECTURE_STEWARD";
}

/** The policy model includes state produced by triage before later persistence consumes it. */
export type ArchitectureDebtPolicyAggregateV1 = Omit<ArchitectureDebtAggregateV1, "prioritySource"> & {
  readonly prioritySource: "AUTO_PENDING_DEFAULT" | "STEWARD_CONFIRMED";
};

interface ArchitectureDebtTriageEventCommon {
  readonly operation: ArchitectureDebtTriageOperation;
  readonly projectId: string;
  readonly recordId: string;
  readonly actorId: string;
  readonly authorizedRole: "ARCHITECTURE_STEWARD";
  readonly reason: string;
  readonly expectedVersion: number;
  readonly resultingVersion: number;
  readonly occurredAt: string;
}

export type ArchitectureDebtTriageEvent =
  | (ArchitectureDebtTriageEventCommon & { readonly operation: "CONFIRM"; readonly ownerId: string; readonly rationale: string; readonly risk: string; readonly architecturalBoundary: string; readonly priority: ArchitectureDebtPriority; readonly futureTouchTrigger: ArchitectureDebtTrigger })
  | (ArchitectureDebtTriageEventCommon & { readonly operation: "REJECT" })
  | (ArchitectureDebtTriageEventCommon & { readonly operation: "MERGE"; readonly targetRecordId: string })
  | (ArchitectureDebtTriageEventCommon & { readonly operation: "REASSIGN"; readonly ownerId: string })
  | (ArchitectureDebtTriageEventCommon & { readonly operation: "DEFER" })
  | (ArchitectureDebtTriageEventCommon & { readonly operation: "ACCEPT_RISK"; readonly reviewTrigger: string })
  | (ArchitectureDebtTriageEventCommon & { readonly operation: "PLAN_LINK"; readonly featureId: string; readonly phaseTask: string })
  | (ArchitectureDebtTriageEventCommon & { readonly operation: "CLOSE"; readonly closureEvidence: string })
  | (ArchitectureDebtTriageEventCommon & { readonly operation: "SUPERSEDE"; readonly targetRecordId: string });

export interface ArchitectureDebtTriageAccepted {
  readonly kind: "accepted";
  readonly event: ArchitectureDebtTriageEvent;
  readonly nextAggregate: ArchitectureDebtPolicyAggregateV1;
}
export interface ArchitectureDebtPolicyRefusal {
  readonly kind: "refusal";
  readonly code: ArchitectureDebtPolicyRefusalCode;
  readonly message: string;
}
export type ArchitectureDebtTriageOutcome = ArchitectureDebtTriageAccepted | ArchitectureDebtPolicyRefusal;

export interface ArchitectureDebtTouchPlanV1 {
  readonly schemaVersion: "hepha-architecture-debt-touch-plan/v1";
  readonly projectId: string;
  readonly featureId: string;
  readonly paths: readonly string[];
  readonly symbols: readonly { readonly relativePath: string; readonly symbol: string }[];
  readonly ruleTags: readonly string[];
}

interface FutureTouchDecisionCommon {
  readonly decisionId: string;
  readonly projectId: string;
  readonly featureId: string;
  readonly touchPlanHash: string;
  readonly recordId: string;
  readonly recordVersion: number;
  readonly selectorIds: readonly string[];
  readonly actorId: string;
  readonly authorizedRole: "ARCHITECTURE_STEWARD";
  readonly reason: string;
  /** Server-owned persistence timestamp; callers cannot omit or forge a legacy lane. */
  readonly occurredAt: string;
}

export type FutureTouchDecision =
  | (FutureTouchDecisionCommon & { readonly kind: "REMEDIATE"; readonly owningPhaseTask: string; readonly acceptanceObligation: string })
  | (FutureTouchDecisionCommon & { readonly kind: "PREREQUISITE"; readonly prerequisiteFeatureId: string; readonly orderingEvidence: string; readonly completionCondition: string })
  | (FutureTouchDecisionCommon & { readonly kind: "WAIVER"; readonly waiverExpiry?: string; readonly reconsiderationTrigger?: string })
  | (FutureTouchDecisionCommon & { readonly kind: "NON_INTERACTION"; readonly inspectedBoundary: string; readonly explanation: string });

export interface FutureTouchMatch {
  readonly recordId: string;
  readonly recordVersion: number;
  readonly selectorIds: readonly string[];
  readonly decision: FutureTouchDecision;
}
export type FutureTouchOutcome =
  | { readonly kind: "accepted"; readonly matches: readonly FutureTouchMatch[] }
  | ArchitectureDebtPolicyRefusal;

const STATES = new Set<ArchitectureDebtState>([
  "PENDING_TRIAGE", "CONFIRMED", "DEFERRED", "ACCEPTED_RISK", "PLANNED", "CLOSED", "REJECTED", "MERGED", "SUPERSEDED",
]);
const OPEN_STATES = new Set<ArchitectureDebtState>(["PENDING_TRIAGE", "CONFIRMED", "DEFERRED", "ACCEPTED_RISK", "PLANNED"]);
const PRIORITIES = new Set<ArchitectureDebtPriority>(["P0", "P1", "P2", "P3"]);
const OPERATIONS = new Set<ArchitectureDebtTriageOperation>(["CONFIRM", "REJECT", "MERGE", "REASSIGN", "DEFER", "ACCEPT_RISK", "PLAN_LINK", "CLOSE", "SUPERSEDE"]);
const DECISION_KINDS = new Set<FutureTouchDecisionKind>(["REMEDIATE", "PREREQUISITE", "WAIVER", "NON_INTERACTION"]);
const HASH_RE = /^[a-f0-9]{64}$/;
const RECORD_ID_RE = /^ARCH-DEBT-[a-f0-9]{32}$/;
const UTC_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const SECRET_LIKE = [/(?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*\S+/i, /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/, /sk-[A-Za-z0-9_-]{12,}/];

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function text(value: unknown, max = 4096): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && !value.includes("\0") && !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value) && !SECRET_LIKE.some((pattern) => pattern.test(value)); }
function identifier(value: unknown, max = 256): value is string { return text(value, max); }
function path(value: unknown): value is string { return text(value, 1024) && !value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/.test(value) && !value.split("/").some((part) => !part || part === "." || part === ".."); }
function timestamp(value: unknown): value is string { return typeof value === "string" && UTC_RE.test(value) && Number.isFinite(Date.parse(value)); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH_RE.test(value); }
function sortedUnique(values: readonly string[]): boolean { return values.every((value, index) => index === 0 || values[index - 1] < value); }
function stringList(value: unknown, predicate: (entry: unknown) => entry is string = (entry): entry is string => text(entry)): value is readonly string[] { return Array.isArray(value) && value.length <= 128 && value.every(predicate) && sortedUnique(value as readonly string[]); }
function refusal(code: ArchitectureDebtPolicyRefusalCode): ArchitectureDebtPolicyRefusal {
  const messages: Record<ArchitectureDebtPolicyRefusalCode, string> = {
    invalid_input: "Architecture-debt policy input is invalid.", unauthorized: "Architecture-debt authority is not authorized.", stale_version: "Architecture-debt record version is stale.", foreign_identity: "Architecture-debt identity does not match the record.", invalid_transition: "Architecture-debt state does not permit this operation.", invalid_target: "Architecture-debt target is invalid.", invalid_decision: "Architecture-debt future-touch decision is incomplete or stale.",
  };
  return { kind: "refusal", code, message: messages[code] };
}

function validTrigger(value: unknown): value is ArchitectureDebtTrigger {
  return record(value) && exactKeys(value, ["triggerId", "name", "paths", "symbols", "ruleTags"])
    && identifier(value.triggerId) && text(value.name) && stringList(value.paths, path) && stringList(value.symbols) && stringList(value.ruleTags)
    && value.paths.length + value.symbols.length + value.ruleTags.length > 0;
}
function validReference(value: unknown, kind: "debt_observation" | "review_manifest"): boolean {
  return record(value) && exactKeys(value, ["artifactKind", "artifactId", "contentHash", "relativePath"])
    && value.artifactKind === kind && identifier(value.artifactId) && hash(value.contentHash) && path(value.relativePath);
}
function validLocation(value: unknown): boolean {
  return record(value) && exactKeys(value, ["locationId", "relativePath", "symbol", "endpoint", "ruleTags"].filter((key) => value[key] !== undefined))
    && identifier(value.locationId) && path(value.relativePath) && (value.symbol === undefined || identifier(value.symbol))
    && (value.endpoint === undefined || identifier(value.endpoint)) && stringList(value.ruleTags);
}
function validDiscovery(value: unknown): boolean {
  return record(value) && exactKeys(value, ["featureId", "phaseNumber", "reviewGateId", "findingId", "manifest", "observation", "currentFeatureImpact"])
    && identifier(value.featureId) && Number.isInteger(value.phaseNumber) && (value.phaseNumber as number) >= 0 && identifier(value.reviewGateId)
    && identifier(value.findingId) && validReference(value.manifest, "review_manifest") && validReference(value.observation, "debt_observation")
    && value.currentFeatureImpact === "untouched_non_blocking";
}
function validRule(value: unknown): boolean {
  return record(value) && exactKeys(value, ["ruleId", "ruleVersion", "ruleHash", "catalogHash", "category", "sourceReference"])
    && identifier(value.ruleId) && identifier(value.ruleVersion) && hash(value.ruleHash) && hash(value.catalogHash) && identifier(value.category, 128) && path(value.sourceReference);
}
function validPolicyAggregate(value: unknown): value is ArchitectureDebtPolicyAggregateV1 {
  if (!record(value) || !exactKeys(value, ["schemaVersion", "recordId", "projectId", "eventVersion", "state", "ownerId", "rationale", "risk", "architecturalBoundary", "priority", "prioritySource", "futureTouchTrigger", "discovery", "rule", "locations", "observationReferences", "duplicateOfRecordId", "supersededByRecordId"].filter((key) => value[key] !== undefined))) return false;
  if (value.schemaVersion !== 1 || typeof value.recordId !== "string" || !RECORD_ID_RE.test(value.recordId) || !identifier(value.projectId)
    || !Number.isInteger(value.eventVersion) || (value.eventVersion as number) < 0 || typeof value.state !== "string" || !STATES.has(value.state as ArchitectureDebtState)
    || !identifier(value.ownerId) || !text(value.rationale) || !text(value.risk) || !identifier(value.architecturalBoundary)
    || typeof value.priority !== "string" || !PRIORITIES.has(value.priority as ArchitectureDebtPriority)
    || (value.prioritySource !== "AUTO_PENDING_DEFAULT" && value.prioritySource !== "STEWARD_CONFIRMED") || !validTrigger(value.futureTouchTrigger)
    || !validDiscovery(value.discovery) || !validRule(value.rule) || !Array.isArray(value.locations) || value.locations.length === 0 || value.locations.length > 128
    || !value.locations.every(validLocation) || new Set(value.locations.map((location) => (location as { locationId: string }).locationId)).size !== value.locations.length
    || !Array.isArray(value.observationReferences) || value.observationReferences.length === 0 || value.observationReferences.length > 128
    || !value.observationReferences.every((reference) => validReference(reference, "debt_observation"))) return false;
  return (value.duplicateOfRecordId === undefined || (typeof value.duplicateOfRecordId === "string" && RECORD_ID_RE.test(value.duplicateOfRecordId)))
    && (value.supersededByRecordId === undefined || (typeof value.supersededByRecordId === "string" && RECORD_ID_RE.test(value.supersededByRecordId)));
}
function validAuthority(value: unknown): value is DebtAuthorityContext { return record(value) && exactKeys(value, ["actorId", "verifiedRole"]) && identifier(value.actorId) && value.verifiedRole === "ARCHITECTURE_STEWARD"; }
function target(value: unknown): value is ArchitectureDebtPolicyAggregateV1 { return validPolicyAggregate(value); }
function sameTargetProject(source: ArchitectureDebtPolicyAggregateV1, candidate: ArchitectureDebtPolicyAggregateV1): boolean { return source.projectId === candidate.projectId && source.recordId !== candidate.recordId && OPEN_STATES.has(candidate.state); }
function targetCreatesCycle(source: ArchitectureDebtPolicyAggregateV1, candidate: ArchitectureDebtPolicyAggregateV1): boolean { return candidate.duplicateOfRecordId === source.recordId || candidate.supersededByRecordId === source.recordId; }

interface TriageRequest {
  readonly aggregate: ArchitectureDebtPolicyAggregateV1;
  readonly authority: DebtAuthorityContext;
  readonly action: Record<string, unknown>;
}
function validTriageEnvelope(value: unknown): value is TriageRequest { return record(value) && exactKeys(value, ["aggregate", "authority", "action"]) && validPolicyAggregate(value.aggregate) && validAuthority(value.authority) && record(value.action); }
function actionBase(action: Record<string, unknown>): boolean {
  return typeof action.operation === "string" && OPERATIONS.has(action.operation as ArchitectureDebtTriageOperation)
    && identifier(action.projectId) && typeof action.recordId === "string" && RECORD_ID_RE.test(action.recordId)
    && Number.isInteger(action.expectedVersion) && (action.expectedVersion as number) >= 0 && text(action.reason) && timestamp(action.occurredAt);
}
function hasKeys(action: Record<string, unknown>, keys: readonly string[]): boolean { return exactKeys(action, keys); }
function transitionAllowed(state: ArchitectureDebtState, operation: ArchitectureDebtTriageOperation): boolean {
  const transitions: Readonly<Record<ArchitectureDebtState, readonly ArchitectureDebtTriageOperation[]>> = {
    PENDING_TRIAGE: ["CONFIRM", "REJECT", "MERGE", "REASSIGN", "DEFER", "ACCEPT_RISK", "PLAN_LINK", "SUPERSEDE"],
    CONFIRMED: ["MERGE", "REASSIGN", "DEFER", "ACCEPT_RISK", "PLAN_LINK", "CLOSE", "SUPERSEDE"],
    DEFERRED: ["CONFIRM", "MERGE", "REASSIGN", "ACCEPT_RISK", "PLAN_LINK", "CLOSE", "SUPERSEDE"],
    ACCEPTED_RISK: ["CONFIRM", "REASSIGN", "PLAN_LINK", "CLOSE", "SUPERSEDE"],
    PLANNED: ["REASSIGN", "DEFER", "ACCEPT_RISK", "CLOSE", "SUPERSEDE"],
    CLOSED: [], REJECTED: [], MERGED: [], SUPERSEDED: [],
  };
  return transitions[state].includes(operation);
}
function nextState(operation: ArchitectureDebtTriageOperation, state: ArchitectureDebtState): ArchitectureDebtState {
  return ({ CONFIRM: "CONFIRMED", REJECT: "REJECTED", MERGE: "MERGED", REASSIGN: state, DEFER: "DEFERRED", ACCEPT_RISK: "ACCEPTED_RISK", PLAN_LINK: "PLANNED", CLOSE: "CLOSED", SUPERSEDE: "SUPERSEDED" } as const)[operation];
}

/** Evaluates one independently-authorized, version-bound triage action without I/O. */
export function evaluateArchitectureDebtTriage(rawInput: unknown): ArchitectureDebtTriageOutcome {
  if (!validTriageEnvelope(rawInput) || !actionBase(rawInput.action)) return refusal("invalid_input");
  const { aggregate, authority, action } = rawInput;
  const operation = action.operation as ArchitectureDebtTriageOperation;
  if (action.projectId !== aggregate.projectId || action.recordId !== aggregate.recordId) return refusal("foreign_identity");
  if (action.expectedVersion !== aggregate.eventVersion) return refusal("stale_version");
  if (!transitionAllowed(aggregate.state, operation)) return refusal("invalid_transition");

  const nextBase: ArchitectureDebtPolicyAggregateV1 = { ...aggregate, state: nextState(operation, aggregate.state), eventVersion: aggregate.eventVersion + 1 };
  const eventCommon: Omit<ArchitectureDebtTriageEventCommon, "operation"> = {
    projectId: aggregate.projectId, recordId: aggregate.recordId, actorId: authority.actorId, authorizedRole: authority.verifiedRole,
    reason: action.reason as string, expectedVersion: aggregate.eventVersion, resultingVersion: aggregate.eventVersion + 1, occurredAt: action.occurredAt as string,
  };
  const accepted = (event: ArchitectureDebtTriageEvent, nextAggregate: ArchitectureDebtPolicyAggregateV1): ArchitectureDebtTriageAccepted => ({ kind: "accepted", event, nextAggregate });

  if (operation === "CONFIRM") {
    if (!hasKeys(action, ["operation", "projectId", "recordId", "expectedVersion", "reason", "occurredAt", "ownerId", "rationale", "risk", "architecturalBoundary", "priority", "futureTouchTrigger"])
      || !identifier(action.ownerId) || !text(action.rationale) || !text(action.risk) || !identifier(action.architecturalBoundary)
      || typeof action.priority !== "string" || !PRIORITIES.has(action.priority as ArchitectureDebtPriority) || !validTrigger(action.futureTouchTrigger)) return refusal("invalid_input");
    const priority = action.priority as ArchitectureDebtPriority;
    const futureTouchTrigger = action.futureTouchTrigger;
    return accepted({ ...eventCommon, operation, ownerId: action.ownerId, rationale: action.rationale, risk: action.risk, architecturalBoundary: action.architecturalBoundary, priority, futureTouchTrigger }, { ...nextBase, ownerId: action.ownerId, rationale: action.rationale, risk: action.risk, architecturalBoundary: action.architecturalBoundary, priority, prioritySource: "STEWARD_CONFIRMED", futureTouchTrigger });
  }
  if (operation === "REASSIGN") {
    if (!hasKeys(action, ["operation", "projectId", "recordId", "expectedVersion", "reason", "occurredAt", "ownerId"]) || !identifier(action.ownerId)) return refusal("invalid_input");
    return accepted({ ...eventCommon, operation, ownerId: action.ownerId }, { ...nextBase, ownerId: action.ownerId });
  }
  if (operation === "MERGE" || operation === "SUPERSEDE") {
    if (!hasKeys(action, ["operation", "projectId", "recordId", "expectedVersion", "reason", "occurredAt", "targetAggregate"]) || !target(action.targetAggregate)) return refusal("invalid_input");
    if (!sameTargetProject(aggregate, action.targetAggregate) || targetCreatesCycle(aggregate, action.targetAggregate)) return refusal("invalid_target");
    const targetRecordId = action.targetAggregate.recordId;
    return operation === "MERGE"
      ? accepted({ ...eventCommon, operation, targetRecordId }, { ...nextBase, duplicateOfRecordId: targetRecordId })
      : accepted({ ...eventCommon, operation, targetRecordId }, { ...nextBase, supersededByRecordId: targetRecordId });
  }
  if (operation === "PLAN_LINK") {
    if (!hasKeys(action, ["operation", "projectId", "recordId", "expectedVersion", "reason", "occurredAt", "featureId", "phaseTask"]) || !identifier(action.featureId) || !identifier(action.phaseTask)) return refusal("invalid_input");
    return accepted({ ...eventCommon, operation, featureId: action.featureId, phaseTask: action.phaseTask }, nextBase);
  }
  if (operation === "ACCEPT_RISK") {
    if (!hasKeys(action, ["operation", "projectId", "recordId", "expectedVersion", "reason", "occurredAt", "reviewTrigger"]) || !identifier(action.reviewTrigger)) return refusal("invalid_input");
    return accepted({ ...eventCommon, operation, reviewTrigger: action.reviewTrigger }, nextBase);
  }
  if (operation === "CLOSE") {
    if (!hasKeys(action, ["operation", "projectId", "recordId", "expectedVersion", "reason", "occurredAt", "closureEvidence"]) || !text(action.closureEvidence)) return refusal("invalid_input");
    return accepted({ ...eventCommon, operation, closureEvidence: action.closureEvidence }, nextBase);
  }
  if (operation === "REJECT" || operation === "DEFER") {
    if (!hasKeys(action, ["operation", "projectId", "recordId", "expectedVersion", "reason", "occurredAt"])) return refusal("invalid_input");
    return accepted({ ...eventCommon, operation }, nextBase);
  }
  return refusal("invalid_input");
}

function validTouchPlan(value: unknown): value is ArchitectureDebtTouchPlanV1 {
  if (!record(value) || !exactKeys(value, ["schemaVersion", "projectId", "featureId", "paths", "symbols", "ruleTags"])
    || value.schemaVersion !== "hepha-architecture-debt-touch-plan/v1" || !identifier(value.projectId) || !identifier(value.featureId)
    || !stringList(value.paths, path) || !stringList(value.ruleTags)) return false;
  if (!Array.isArray(value.symbols) || value.symbols.length > 128) return false;
  const pairs: string[] = [];
  for (const symbol of value.symbols) {
    if (!record(symbol) || !exactKeys(symbol, ["relativePath", "symbol"]) || !path(symbol.relativePath) || !identifier(symbol.symbol)) return false;
    pairs.push(`${symbol.relativePath}\0${symbol.symbol}`);
  }
  return (value.paths.length + value.symbols.length + value.ruleTags.length > 0)
    && sortedUnique(pairs);
}
function pathsOverlap(left: string, right: string): boolean { return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`); }
function selectorsFor(recordValue: ArchitectureDebtPolicyAggregateV1, plan: ArchitectureDebtTouchPlanV1): string[] {
  const matches: string[] = [];
  for (const location of recordValue.locations) {
    if (plan.paths.some((candidate) => pathsOverlap(location.relativePath, candidate))) matches.push(`location:${location.locationId}:path`);
    if (location.symbol !== undefined && plan.symbols.some((candidate) => candidate.symbol === location.symbol && pathsOverlap(location.relativePath, candidate.relativePath))) matches.push(`location:${location.locationId}:symbol`);
    for (const tag of location.ruleTags) if (plan.ruleTags.includes(tag)) matches.push(`location:${location.locationId}:rule:${tag}`);
  }
  for (const value of recordValue.futureTouchTrigger.paths) if (plan.paths.some((candidate) => pathsOverlap(value, candidate))) matches.push(`trigger:${recordValue.futureTouchTrigger.triggerId}:path:${value}`);
  for (const value of recordValue.futureTouchTrigger.symbols) if (plan.symbols.some((candidate) => candidate.symbol === value)) matches.push(`trigger:${recordValue.futureTouchTrigger.triggerId}:symbol:${value}`);
  for (const value of recordValue.futureTouchTrigger.ruleTags) if (plan.ruleTags.includes(value)) matches.push(`trigger:${recordValue.futureTouchTrigger.triggerId}:rule:${value}`);
  return [...new Set(matches)].sort();
}
function validDecision(value: unknown): value is FutureTouchDecision {
  const commonKeys = ["decisionId", "projectId", "featureId", "touchPlanHash", "recordId", "recordVersion", "selectorIds", "kind", "actorId", "authorizedRole", "reason", "occurredAt"];
  if (!record(value) || !identifier(value.decisionId) || !identifier(value.projectId) || !identifier(value.featureId) || !hash(value.touchPlanHash)
    || typeof value.recordId !== "string" || !RECORD_ID_RE.test(value.recordId) || !Number.isInteger(value.recordVersion) || (value.recordVersion as number) < 0
    || !stringList(value.selectorIds) || value.selectorIds.length === 0 || typeof value.kind !== "string" || !DECISION_KINDS.has(value.kind as FutureTouchDecisionKind)
    || !identifier(value.actorId) || value.authorizedRole !== "ARCHITECTURE_STEWARD" || !text(value.reason) || !timestamp(value.occurredAt)) return false;
  if (value.kind === "REMEDIATE") return exactKeys(value, [...commonKeys, "owningPhaseTask", "acceptanceObligation"])
    && identifier(value.owningPhaseTask) && text(value.acceptanceObligation);
  if (value.kind === "PREREQUISITE") return exactKeys(value, [...commonKeys, "prerequisiteFeatureId", "orderingEvidence", "completionCondition"])
    && identifier(value.prerequisiteFeatureId) && text(value.orderingEvidence) && text(value.completionCondition);
  if (value.kind === "WAIVER") return exactKeys(value, [...commonKeys, ...["waiverExpiry", "reconsiderationTrigger"].filter((key) => value[key] !== undefined)])
    && (value.waiverExpiry === undefined || timestamp(value.waiverExpiry))
    && (value.reconsiderationTrigger === undefined || identifier(value.reconsiderationTrigger))
    && (value.waiverExpiry !== undefined || value.reconsiderationTrigger !== undefined);
  return exactKeys(value, [...commonKeys, "inspectedBoundary", "explanation"])
    && identifier(value.inspectedBoundary) && text(value.explanation);
}

/**
 * Evaluates only structured, hash-bound decisions. It is deliberately a pure
 * validator/matcher: Phase 6 owns decision persistence and readiness effects.
 */
export function evaluateFutureTouch(rawInput: unknown): FutureTouchOutcome {
  if (!record(rawInput) || !exactKeys(rawInput, ["touchPlan", "touchPlanHash", "aggregates", "decisions", "authority"])
    || !validTouchPlan(rawInput.touchPlan) || !hash(rawInput.touchPlanHash) || !Array.isArray(rawInput.aggregates)
    || !rawInput.aggregates.every(validPolicyAggregate) || !Array.isArray(rawInput.decisions) || !rawInput.decisions.every(validDecision)
    || !validAuthority(rawInput.authority)) return refusal("invalid_input");
  const plan = rawInput.touchPlan;
  const aggregates = rawInput.aggregates.filter((aggregate): aggregate is ArchitectureDebtPolicyAggregateV1 => OPEN_STATES.has(aggregate.state));
  const uniqueRecords = new Set<string>();
  if (aggregates.some((aggregate) => aggregate.projectId !== plan.projectId || uniqueRecords.has(aggregate.recordId) || (uniqueRecords.add(aggregate.recordId), false))) return refusal("foreign_identity");
  const matches: FutureTouchMatch[] = [];
  for (const aggregate of aggregates.sort((left, right) => left.recordId.localeCompare(right.recordId))) {
    const selectorIds = selectorsFor(aggregate, plan);
    if (selectorIds.length === 0) continue;
    const decisions = rawInput.decisions.filter((decision) => decision.projectId === plan.projectId && decision.featureId === plan.featureId
      && decision.touchPlanHash === rawInput.touchPlanHash && decision.recordId === aggregate.recordId && decision.recordVersion === aggregate.eventVersion);
    if (decisions.length !== 1) return refusal("invalid_decision");
    const decision = decisions[0]!;
    if (decision.actorId !== rawInput.authority.actorId || decision.authorizedRole !== rawInput.authority.verifiedRole || JSON.stringify(decision.selectorIds) !== JSON.stringify(selectorIds)) return refusal("invalid_decision");
    matches.push({ recordId: aggregate.recordId, recordVersion: aggregate.eventVersion, selectorIds, decision });
  }
  return { kind: "accepted", matches };
}
