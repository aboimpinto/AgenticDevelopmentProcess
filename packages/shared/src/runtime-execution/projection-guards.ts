import type { RouteIdentityV1 } from "../agent-routing.js";
import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  type RuntimeSafeFailureCode,
} from "./contracts.js";
import type {
  RuntimeApprovedPlanSummaryV1,
  RuntimeAttemptEvidenceViewV1,
  RuntimeEvidenceOutcomeV1,
  RuntimeFeatureEvidenceV1,
  RuntimeInvocationChainViewV1,
  RuntimePhaseEvidenceSummaryV1,
  RuntimePhaseInvocationFilterV1,
  RuntimeRouteChangeEvidenceViewV1,
} from "./projection-contracts.js";

const FAILURE_CODES: readonly RuntimeSafeFailureCode[] = [
  "invalid_input", "connection_unavailable", "auth_unavailable", "provider_unsupported",
  "secret_read_failed", "context_preparation_failed", "spawn_failed", "payment_required",
  "quota_exceeded", "rate_limited", "endpoint_unavailable", "provider_unavailable",
  "timed_out", "cancelled", "safety_rejected", "invalid_output", "checkpoint_required",
  "cleanup_failed", "persistence_failed",
];
const OUTCOMES: readonly RuntimeEvidenceOutcomeV1[] = ["running", "completed", "failed", "timed_out"];
const ACTION_TYPES = ["discovery_planning", "implementation", "review", "completion", "knowledge_documentation"] as const;
const ROLE_IDS = ["product-architect", "requirements-agent", "ux-design-agent", "planning-agent", "implementation-agent", "code-review-agent", "completion-agent", "phase-lessons-capture-agent", "feature-lessons-writer-agent", "post-complete-lessons-curator-agent"] as const;

export function isRuntimeFeatureEvidenceV1(value: unknown): value is RuntimeFeatureEvidenceV1 {
  return record(value) && exact(value, ["schemaVersion", "projectId", "cardKey", "phases"])
    && value.schemaVersion === RUNTIME_EXECUTION_SCHEMA_VERSION && text(value.projectId, 512)
    && text(value.cardKey, 512) && Array.isArray(value.phases) && value.phases.length <= 256
    && value.phases.every(isRuntimePhaseEvidenceSummaryV1)
    && unique(value.phases.map((phase) => phase.phaseExecutionContractId ?? `number:${phase.phaseNumber ?? "none"}`));
}

export function isRuntimePhaseEvidenceSummaryV1(value: unknown): value is RuntimePhaseEvidenceSummaryV1 {
  if (!record(value) || !exact(value, [
    "phaseExecutionContractId", "phaseNumber", "phaseTitle", "state", "invocationCount",
    "executionModes", "directModelEvidence", "actualRoutes", "aggregateDurationMs", "finalOutcome", "failureCode",
  ]) || !nullableText(value.phaseExecutionContractId, 512) || !nullableNonNegative(value.phaseNumber)
    || !text(value.phaseTitle, 512)
    || !includes(["not_yet_run", "not_recorded", ...OUTCOMES] as const, value.state)
    || !nonNegative(value.invocationCount) || value.invocationCount > 256
    || !Array.isArray(value.executionModes) || value.executionModes.length > 2
    || !value.executionModes.every((mode) => mode === "direct_host" || mode === "orchestrated")
    || !sortedUnique(value.executionModes)
    || !Array.isArray(value.directModelEvidence) || value.directModelEvidence.length > value.invocationCount
    || !value.directModelEvidence.every(isDirectModelEvidence)
    || !sortedUnique(value.directModelEvidence.map(directModelIdentity))
    || !Array.isArray(value.actualRoutes) || !value.actualRoutes.every(route)
    || !unique(value.actualRoutes.map((item) => `${item.connectionId}\u0000${item.modelId}`))
    || !nullableNonNegative(value.aggregateDurationMs)
    || (value.finalOutcome !== null && !includes(OUTCOMES, value.finalOutcome))
    || !nullableFailure(value.failureCode)) return false;

  // Enforce the closed mode-owned aggregate matrix (4 rows: empty, direct_host, orchestrated, mixed)
  const hasDirect = value.executionModes.includes("direct_host");
  const hasOrchestrated = value.executionModes.includes("orchestrated");

  // Row 1: empty (not_yet_run or not_recorded) — no mode, no aggregates
  if (value.state === "not_yet_run" || value.state === "not_recorded") {
    return value.invocationCount === 0 && value.executionModes.length === 0
      && value.directModelEvidence.length === 0 && value.actualRoutes.length === 0
      && value.aggregateDurationMs === null && value.finalOutcome === null && value.failureCode === null;
  }

  // Non-empty rows (direct_host, orchestrated, or mixed)
  if (value.invocationCount < 1 || value.executionModes.length === 0
    || value.executionModes.length > value.invocationCount
    || value.directModelEvidence.length > value.invocationCount
    || value.actualRoutes.length > value.invocationCount * 2
    || value.finalOutcome !== value.state) return false;

  if (hasDirect && !hasOrchestrated) {
    // Row 2: direct_host only — directModelEvidence required, actualRoutes forbidden
    if (value.directModelEvidence.length === 0) return false;
    if (value.actualRoutes.length > 0) return false;
  } else if (!hasDirect && hasOrchestrated) {
    // Row 3: orchestrated only — directModelEvidence forbidden
    if (value.directModelEvidence.length > 0) return false;
  } else if (hasDirect && hasOrchestrated) {
    // Row 4: mixed — both modes, non-empty direct evidence, at least 2 invocations, unique modes
    if (value.invocationCount < 2) return false;
    if (value.directModelEvidence.length === 0) return false;
  }

  if (value.state === "completed" || value.state === "running") return value.failureCode === null;
  return value.state === "timed_out"
    ? value.failureCode === "timed_out"
    : value.failureCode !== null && value.failureCode !== "timed_out";
}

export function isRuntimeInvocationChainViewV1(value: unknown): value is RuntimeInvocationChainViewV1 {
  if (!record(value) || !exact(value, [
    "invocationId", "rootInvocationId", "parentInvocationId", "invocationKind", "approvedPlan",
    "phaseExecutionContractId", "phaseNumber", "status", "openedAt", "settledAt", "durationMs",
    "failureCode", "attempts", "routeChangeEvents",
  ]) || !text(value.invocationId, 512) || !text(value.rootInvocationId, 512)
    || !nullableText(value.parentInvocationId, 512) || (value.invocationKind !== "root" && value.invocationKind !== "nested")
    || !isApprovedPlan(value.approvedPlan) || !text(value.phaseExecutionContractId, 512)
    || !nonNegative(value.phaseNumber) || !includes(OUTCOMES, value.status) || !timestamp(value.openedAt)
    || !nullableTimestamp(value.settledAt) || !nullableNonNegative(value.durationMs)
    || !nullableFailure(value.failureCode) || !Array.isArray(value.attempts) || value.attempts.length < 1
    || value.attempts.length > 2 || !value.attempts.every(isAttempt)
    || !Array.isArray(value.routeChangeEvents) || value.routeChangeEvents.length > 1
    || !value.routeChangeEvents.every(isEvent)) return false;
  const chain = value as unknown as RuntimeInvocationChainViewV1;
  if (chain.invocationKind === "root" ? chain.rootInvocationId !== chain.invocationId || chain.parentInvocationId !== null
    : chain.rootInvocationId === chain.invocationId || chain.parentInvocationId === null) return false;
  if (chain.approvedPlan.secondRoute !== null
    && sameRoute(chain.approvedPlan.primaryRoute, chain.approvedPlan.secondRoute)) return false;
  if (chain.attempts.some((attempt, index) => attempt.attemptIndex !== index
    || !atOrAfter(attempt.preparationStartedAt, chain.openedAt))
    || chain.attempts[0]?.attemptKind !== "primary"
    || !sameRoute(chain.attempts[0]!.approvedRoute, chain.approvedPlan.primaryRoute)) return false;
  const primary = chain.attempts[0]!;
  if (chain.attempts.length === 2) {
    const second = chain.attempts[1]!;
    const event = chain.routeChangeEvents[0];
    if (chain.approvedPlan.secondRoute === null || !sameRoute(second.approvedRoute, chain.approvedPlan.secondRoute)
      || !event || (event.kind !== "fallback" && event.kind !== "recovery") || second.attemptKind !== event.kind
      || !terminalAttempt(primary) || primary.status === "completed" || primary.terminalAt === null
      || primary.failureCode === null || event.reasonCode !== primary.failureCode
      || event.sourceInvocationId !== chain.invocationId || event.targetInvocationId !== chain.invocationId
      || event.sourceAttemptId !== primary.attemptId || event.targetAttemptId !== second.attemptId
      || !sameRoute(event.sourceApprovedRoute, primary.approvedRoute)
      || !sameRoute(event.targetApprovedRoute, second.approvedRoute)
      || !atOrAfter(event.occurredAt, primary.terminalAt)
      || !atOrAfter(second.preparationStartedAt, event.occurredAt)
      || (event.kind === "fallback" ? primary.workState !== "none" : primary.workState !== "checkpointed")
      || !eventResultMatchesAttempt(event.result, second.status)) return false;
  } else if (chain.routeChangeEvents.length !== 0) return false;
  if (chain.status === "running") return chain.settledAt === null && chain.durationMs === null && chain.failureCode === null;
  const finalAttempt = chain.attempts.at(-1)!;
  if (!terminalAttempt(finalAttempt) || chain.attempts.some((attempt) => !terminalAttempt(attempt))
    || chain.settledAt === null || chain.durationMs === null
    || !atOrAfter(chain.settledAt, chain.openedAt) || elapsed(chain.openedAt, chain.settledAt) !== chain.durationMs
    || chain.attempts.some((attempt) => attempt.terminalAt === null || !atOrAfter(chain.settledAt!, attempt.terminalAt))
    || chain.routeChangeEvents.some((event) => !atOrAfter(chain.settledAt!, event.occurredAt))) return false;
  if (chain.status === "completed" ? finalAttempt.status !== "completed" || chain.failureCode !== null
    : chain.status === "timed_out" ? finalAttempt.status !== "timed_out" || chain.failureCode !== "timed_out"
      : finalAttempt.status === "cancelled" ? chain.failureCode !== "cancelled"
        : finalAttempt.status !== "failed" || chain.failureCode !== finalAttempt.failureCode) return false;
  if (chain.attempts.length === 2 && !eventResultMatchesTerminalAttempt(chain.routeChangeEvents[0]!.result, finalAttempt.status)) return false;
  return true;
}

export function isRuntimePhaseInvocationFilterV1(value: unknown): value is RuntimePhaseInvocationFilterV1 {
  return record(value) && exact(value, [
    "schemaVersion", "projectId", "cardKey", "phaseExecutionContractId", "afterOpenedAt", "afterInvocationId", "limit",
  ]) && value.schemaVersion === RUNTIME_EXECUTION_SCHEMA_VERSION && text(value.projectId, 512)
    && text(value.cardKey, 512) && text(value.phaseExecutionContractId, 512)
    && nullableTimestamp(value.afterOpenedAt) && nullableText(value.afterInvocationId, 512)
    && ((value.afterOpenedAt === null) === (value.afterInvocationId === null))
    && positive(value.limit) && value.limit <= 64;
}

function isApprovedPlan(value: unknown): value is RuntimeApprovedPlanSummaryV1 {
  return record(value) && exact(value, [
    "planHash", "actionId", "actionType", "roleId", "promptVersion", "policySource", "revisionId",
    "primaryRoute", "secondRoute", "selectedLessonIds",
  ]) && typeof value.planHash === "string" && /^[a-f0-9]{64}$/u.test(value.planHash)
    && text(value.actionId, 128) && includes(ACTION_TYPES, value.actionType) && includes(ROLE_IDS, value.roleId)
    && text(value.promptVersion, 256) && includes(["global", "action_type", "action"] as const, value.policySource)
    && text(value.revisionId, 256) && route(value.primaryRoute)
    && (value.secondRoute === null || route(value.secondRoute) && !sameRoute(value.primaryRoute, value.secondRoute))
    && Array.isArray(value.selectedLessonIds) && value.selectedLessonIds.length <= 128
    && value.selectedLessonIds.every((item) => text(item, 512)) && sortedUnique(value.selectedLessonIds);
}

function isAttempt(value: unknown): value is RuntimeAttemptEvidenceViewV1 {
  if (!record(value) || !exact(value, [
    "attemptId", "attemptIndex", "attemptKind", "approvedRoute", "actualRoute", "providerId",
    "authenticationConnectionId", "authenticationKind", "credentialVersion", "workState", "checkpointId",
    "status", "preparationStartedAt", "startedAt", "spawnedAt", "terminalAt", "durationMs", "exitCode",
    "timeoutMarker", "failureCode",
  ])) return false;
  if (!text(value.attemptId, 512) || (value.attemptIndex !== 0 && value.attemptIndex !== 1)
    || !includes(["primary", "fallback", "recovery"] as const, value.attemptKind) || !route(value.approvedRoute)
    || (value.actualRoute !== null && !route(value.actualRoute)) || !nullableText(value.providerId, 256)
    || !nullableText(value.authenticationConnectionId, 512)
    || !includes([null, "pi_session", "injected_connection_secret"] as const, value.authenticationKind)
    || !nullablePositive(value.credentialVersion) || !includes(["none", "started", "checkpointed"] as const, value.workState)
    || !nullableText(value.checkpointId, 512)
    || !includes(["preparing", "running", "completed", "failed", "timed_out", "cancelled"] as const, value.status)
    || !timestamp(value.preparationStartedAt) || !nullableTimestamp(value.startedAt) || !nullableTimestamp(value.spawnedAt)
    || !nullableTimestamp(value.terminalAt) || !nullableNonNegative(value.durationMs)
    || !(value.exitCode === null || typeof value.exitCode === "number" && Number.isInteger(value.exitCode))
    || typeof value.timeoutMarker !== "boolean" || !nullableFailure(value.failureCode)) return false;
  const attempt = value as unknown as RuntimeAttemptEvidenceViewV1;
  if (attempt.attemptIndex === 0 ? attempt.attemptKind !== "primary" : attempt.attemptKind === "primary") return false;
  if (attempt.actualRoute !== null && !sameRoute(attempt.actualRoute, attempt.approvedRoute)) return false;
  const authAbsent = attempt.providerId === null && attempt.authenticationConnectionId === null && attempt.authenticationKind === null && attempt.credentialVersion === null;
  const piSession = attempt.providerId !== null && attempt.authenticationConnectionId !== null && attempt.authenticationKind === "pi_session" && attempt.credentialVersion === null;
  const injected = attempt.providerId !== null && attempt.authenticationConnectionId !== null && attempt.authenticationKind === "injected_connection_secret" && positive(attempt.credentialVersion);
  if ((!authAbsent && !piSession && !injected) || attempt.actualRoute !== null && authAbsent) return false;
  if (attempt.workState === "checkpointed" ? attempt.checkpointId === null : attempt.checkpointId !== null) return false;
  if (attempt.status === "preparing") return attempt.actualRoute === null && attempt.startedAt === null
    && attempt.spawnedAt === null && attempt.terminalAt === null && attempt.durationMs === null
    && attempt.exitCode === null && !attempt.timeoutMarker && attempt.failureCode === null && attempt.workState === "none";
  if (attempt.status === "running") return attempt.actualRoute !== null && attempt.startedAt !== null
    && attempt.spawnedAt !== null && atOrAfter(attempt.startedAt, attempt.preparationStartedAt)
    && atOrAfter(attempt.spawnedAt, attempt.startedAt) && attempt.terminalAt === null
    && attempt.durationMs === null && attempt.exitCode === null && !attempt.timeoutMarker && attempt.failureCode === null;
  if (attempt.terminalAt === null || attempt.durationMs === null || !atOrAfter(attempt.terminalAt, attempt.preparationStartedAt)
    || elapsed(attempt.preparationStartedAt, attempt.terminalAt) !== attempt.durationMs) return false;
  if (attempt.actualRoute === null ? attempt.startedAt !== null || attempt.spawnedAt !== null || attempt.workState !== "none"
    : attempt.startedAt === null || attempt.spawnedAt === null || !atOrAfter(attempt.startedAt, attempt.preparationStartedAt)
      || !atOrAfter(attempt.spawnedAt, attempt.startedAt) || !atOrAfter(attempt.terminalAt, attempt.spawnedAt)) return false;
  if (attempt.status === "completed") return attempt.actualRoute !== null && attempt.failureCode === null && !attempt.timeoutMarker;
  if (attempt.failureCode === null) return false;
  if (attempt.status === "timed_out") return attempt.actualRoute !== null && attempt.timeoutMarker && attempt.failureCode === "timed_out";
  if (attempt.timeoutMarker) return false;
  return attempt.status === "cancelled" ? attempt.failureCode === "cancelled"
    : attempt.failureCode !== "timed_out" && attempt.failureCode !== "cancelled";
}

function isEvent(value: unknown): value is RuntimeRouteChangeEvidenceViewV1 {
  return record(value) && exact(value, [
    "eventId", "sourceInvocationId", "sourceAttemptId", "targetInvocationId", "targetAttemptId", "kind",
    "reasonCode", "occurredAt", "sourceApprovedRoute", "targetApprovedRoute", "result",
  ]) && text(value.eventId, 512) && text(value.sourceInvocationId, 512) && text(value.sourceAttemptId, 512)
    && text(value.targetInvocationId, 512) && text(value.targetAttemptId, 512)
    && includes(["fallback", "recovery"] as const, value.kind)
    && failure(value.reasonCode) && timestamp(value.occurredAt) && route(value.sourceApprovedRoute)
    && route(value.targetApprovedRoute) && !sameRoute(value.sourceApprovedRoute, value.targetApprovedRoute)
    && includes(["started", "completed", "failed"] as const, value.result);
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value); }
function nullableText(value: unknown, max: number): boolean { return value === null || text(value, max); }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function nonNegative(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function nullablePositive(value: unknown): boolean { return value === null || positive(value); }
function nullableNonNegative(value: unknown): boolean { return value === null || nonNegative(value); }
function timestamp(value: unknown): value is string { if (typeof value !== "string") return false; const parsed = new Date(value); return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value; }
function nullableTimestamp(value: unknown): boolean { return value === null || timestamp(value); }
function route(value: unknown): value is RouteIdentityV1 { return record(value) && exact(value, ["connectionId", "modelId"]) && text(value.connectionId, 512) && text(value.modelId, 512); }
function sameRoute(left: RouteIdentityV1, right: RouteIdentityV1): boolean { return left.connectionId === right.connectionId && left.modelId === right.modelId; }
function failure(value: unknown): value is RuntimeSafeFailureCode { return includes(FAILURE_CODES, value); }
function nullableFailure(value: unknown): boolean { return value === null || failure(value); }
function includes<T>(values: readonly T[], value: unknown): value is T { return values.includes(value as T); }
function unique(values: readonly string[]): boolean { return new Set(values).size === values.length; }
function sortedUnique(values: readonly string[]): boolean { return unique(values) && values.every((item, index) => index === 0 || values[index - 1]! < item); }
function isDirectModelEvidence(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.status === "not_recorded") return exact(value, ["status"]);
  return value.status === "recorded" && exact(value, ["status", "modelId", "providerId", "instrumentationSource", "observedAt"])
    && text(value.modelId, 512) && nullableText(value.providerId, 512)
    && text(value.instrumentationSource, 512) && timestamp(value.observedAt);
}
function directModelIdentity(value: { readonly status: string; readonly modelId?: string; readonly providerId?: string | null; readonly instrumentationSource?: string; readonly observedAt?: string }): string {
  return value.status === "not_recorded" ? "not_recorded" : `recorded\u0000${value.modelId}\u0000${value.providerId ?? ""}\u0000${value.instrumentationSource}\u0000${value.observedAt}`;
}
function terminalAttempt(value: RuntimeAttemptEvidenceViewV1): boolean { return value.status === "completed" || value.status === "failed" || value.status === "timed_out" || value.status === "cancelled"; }
function eventResultMatchesAttempt(result: RuntimeRouteChangeEvidenceViewV1["result"], status: RuntimeAttemptEvidenceViewV1["status"]): boolean {
  if (result === "started") return true;
  return result === "completed" ? status === "completed" : status === "failed" || status === "timed_out" || status === "cancelled";
}
function eventResultMatchesTerminalAttempt(result: RuntimeRouteChangeEvidenceViewV1["result"], status: RuntimeAttemptEvidenceViewV1["status"]): boolean {
  return status === "completed" ? result === "completed" : result === "failed";
}
function elapsed(start: string, end: string): number { return new Date(end).getTime() - new Date(start).getTime(); }
function atOrAfter(candidate: string, baseline: string): boolean { return new Date(candidate).getTime() >= new Date(baseline).getTime(); }
function ordered(values: readonly (readonly [string, string])[]): boolean { return values.every((value, index) => index === 0 || values[index - 1]![0] < value[0] || values[index - 1]![0] === value[0] && values[index - 1]![1] < value[1]); }
