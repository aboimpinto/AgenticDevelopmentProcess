import type { DirectHostRuntimeEvidenceStore, RuntimeInvocationStore } from "@hepha/db";
import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  isDirectHostRuntimeEvidenceV1,
  isOrchestratedRuntimeEvidenceV1,
  isRuntimeFeatureEvidenceV1,
  isRuntimePhaseExecutionEvidencePageV1,
  type DirectHostModelEvidenceV1,
  type DirectHostRuntimeEvidenceV1,
  type OrchestratedRuntimeEvidenceV1,
  type OrchestratedRuntimeEvidenceViewV1,
  type PhaseSummary,
  type RouteIdentityV1,
  type RuntimeAttemptV1,
  type RuntimeEvidenceGuardContextV1,
  type RuntimeEvidenceOutcomeV1,
  type RuntimeExecutionEvidenceViewV1,
  type RuntimeExecutionModeV1,
  type RuntimeFeatureEvidenceV1,
  type RuntimePhaseEvidenceSummaryV1,
  type RuntimePhaseExecutionEvidencePageV1,
  type RuntimeSafeFailureCode,
} from "@hepha/shared";
import { decodeRuntimeEvidenceCursor, encodeRuntimeEvidenceCursor } from "./runtime-evidence-cursor.js";

export type RuntimeEvidenceReadErrorCode =
  | "RUNTIME_EVIDENCE_INVALID_REQUEST"
  | "RUNTIME_EVIDENCE_INVALID_CURSOR"
  | "RUNTIME_EVIDENCE_HISTORY_LIMIT"
  | "RUNTIME_EVIDENCE_NOT_FOUND"
  | "RUNTIME_EVIDENCE_UNAVAILABLE";

export type RuntimeEvidenceReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: RuntimeEvidenceReadErrorCode };

export interface RuntimeEvidenceFeatureTarget {
  readonly projectId: string;
  readonly receiptProjectId: string;
  readonly cardKey: string;
  readonly phases: readonly PhaseSummary[];
}

export interface RuntimeEvidenceApplicationDependencies {
  readonly context: RuntimeEvidenceGuardContextV1;
  readonly directHostStore: Pick<DirectHostRuntimeEvidenceStore, "listFeatureEvidence">;
  readonly orchestratedStore: Pick<RuntimeInvocationStore, "listFeatureInvocations">;
  resolveFeature(projectId: string, cardKey: string): Promise<RuntimeEvidenceFeatureTarget | null> | RuntimeEvidenceFeatureTarget | null;
}

interface FeatureRequest { readonly projectId: string; readonly cardKey: string }
interface PhaseRequest extends FeatureRequest { readonly phaseExecutionContractId: string; readonly cursor: string | null; readonly limit: number }
type DurableEvidence = OrchestratedRuntimeEvidenceV1 | DirectHostRuntimeEvidenceV1;

/** Reads the closed all-phase summary after independently validating both durable authorities. */
export async function readFeatureRuntimeEvidence(
  raw: unknown,
  dependencies: RuntimeEvidenceApplicationDependencies,
): Promise<RuntimeEvidenceReadResult<RuntimeFeatureEvidenceV1>> {
  if (!isFeatureRequest(raw)) return rejection("RUNTIME_EVIDENCE_INVALID_REQUEST");
  const target = await dependencies.resolveFeature(raw.projectId, raw.cardKey);
  if (!target) return rejection("RUNTIME_EVIDENCE_NOT_FOUND");
  const evidence = readAuthorities(target, dependencies);
  if (!evidence.ok) return evidence;
  const response: RuntimeFeatureEvidenceV1 = {
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    projectId: target.projectId,
    cardKey: target.cardKey,
    phases: target.phases.map((phase) => summarizePhase(phase, evidence.value)),
  };
  return isRuntimeFeatureEvidenceV1(response) ? { ok: true, value: response } : rejection("RUNTIME_EVIDENCE_UNAVAILABLE");
}

/** Reads one ordered, cursor-bounded mixed-mode phase execution page. */
export async function readPhaseRuntimeEvidence(
  raw: unknown,
  dependencies: RuntimeEvidenceApplicationDependencies,
): Promise<RuntimeEvidenceReadResult<RuntimePhaseExecutionEvidencePageV1>> {
  if (!isPhaseRequest(raw)) return rejection("RUNTIME_EVIDENCE_INVALID_REQUEST");
  const cursor = raw.cursor === null ? null : decodeRuntimeEvidenceCursor(raw.cursor);
  if (raw.cursor !== null && cursor === null) return rejection("RUNTIME_EVIDENCE_INVALID_CURSOR");
  const target = await dependencies.resolveFeature(raw.projectId, raw.cardKey);
  if (!target) return rejection("RUNTIME_EVIDENCE_NOT_FOUND");
  if (!target.phases.some((phase) => phase.executionContractId === raw.phaseExecutionContractId)) {
    return rejection("RUNTIME_EVIDENCE_NOT_FOUND");
  }
  const evidence = readAuthorities(target, dependencies);
  if (!evidence.ok) return evidence;
  const ordered = evidence.value
    .filter((entry) => phaseContractId(entry) === raw.phaseExecutionContractId)
    .map((entry) => projectExecution(entry, target))
    .sort(compareExecutions);
  const remaining = cursor === null
    ? ordered
    : ordered.filter((entry) => compareExecutionPosition(entry, cursor) > 0);
  const executions = remaining.slice(0, raw.limit);
  const hasMore = remaining.length > raw.limit;
  const last = hasMore ? executions.at(-1) : null;
  const response: RuntimePhaseExecutionEvidencePageV1 = {
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    projectId: target.projectId,
    cardKey: target.cardKey,
    phaseExecutionContractId: raw.phaseExecutionContractId,
    executions,
    nextCursor: last ? encodeRuntimeEvidenceCursor(executionPosition(last)) : null,
  };
  return isRuntimePhaseExecutionEvidencePageV1(response)
    ? { ok: true, value: response }
    : rejection("RUNTIME_EVIDENCE_UNAVAILABLE");
}

function readAuthorities(
  target: RuntimeEvidenceFeatureTarget,
  dependencies: RuntimeEvidenceApplicationDependencies,
): RuntimeEvidenceReadResult<readonly DurableEvidence[]> {
  const orchestrated = dependencies.orchestratedStore.listFeatureInvocations({
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    projectId: target.receiptProjectId,
    cardKey: target.cardKey,
    limit: 256,
  });
  if (!orchestrated.ok) return persistenceReadRejection(orchestrated.code);
  if (!orchestrated.value.every((entry) => isOrchestratedRuntimeEvidenceV1(entry, dependencies.context))) {
    return rejection("RUNTIME_EVIDENCE_UNAVAILABLE");
  }
  if (!orchestrated.value.every((entry) => entry.receipt.projectId === target.receiptProjectId && entry.receipt.cardKey === target.cardKey)) {
    return rejection("RUNTIME_EVIDENCE_UNAVAILABLE");
  }
  const direct = dependencies.directHostStore.listFeatureEvidence({
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    projectId: target.projectId,
    cardKey: target.cardKey,
    limit: 256,
  });
  if (!direct.ok) return persistenceReadRejection(direct.code);
  if (!direct.value.every((entry) => isDirectHostRuntimeEvidenceV1(entry, dependencies.context))) {
    return rejection("RUNTIME_EVIDENCE_UNAVAILABLE");
  }
  if (!direct.value.every((entry) => entry.projectId === target.projectId && entry.cardKey === target.cardKey)) {
    return rejection("RUNTIME_EVIDENCE_UNAVAILABLE");
  }
  if (orchestrated.value.length + direct.value.length > 256) return rejection("RUNTIME_EVIDENCE_HISTORY_LIMIT");
  return { ok: true, value: [...orchestrated.value, ...direct.value] };
}

function summarizePhase(
  phase: PhaseSummary,
  allEvidence: readonly DurableEvidence[],
): RuntimePhaseEvidenceSummaryV1 {
  const executionContractId = phase.executionContractId ?? null;
  const executions = executionContractId === null
    ? []
    : allEvidence.filter((entry) => phaseContractId(entry) === executionContractId).sort(compareDurable);
  if (executions.length === 0) return {
    phaseExecutionContractId: executionContractId,
    phaseNumber: phase.number,
    phaseTitle: phase.title,
    state: phaseHasActivity(phase.status) ? "not_recorded" : "not_yet_run",
    invocationCount: 0,
    executionModes: [],
    directModelEvidence: [],
    actualRoutes: [],
    aggregateDurationMs: null,
    finalOutcome: null,
    failureCode: null,
  };
  const running = executions.some((entry) => outcome(entry) === "running");
  const latest = executions.at(-1)!;
  const finalOutcome = running ? "running" : outcome(latest);
  const durations = executions.flatMap((entry) => entry.mode === "direct_host"
    ? entry.durationMs === null ? [] : [entry.durationMs]
    : entry.attempts.flatMap((attempt) => attempt.durationMs === null ? [] : [attempt.durationMs]));
  return {
    phaseExecutionContractId: executionContractId,
    phaseNumber: phase.number,
    phaseTitle: phase.title,
    state: finalOutcome,
    invocationCount: executions.length,
    executionModes: uniqueModes(executions),
    directModelEvidence: uniqueDirectModelEvidence(executions),
    actualRoutes: uniqueActualRoutes(executions),
    aggregateDurationMs: durations.length === 0 ? null : durations.reduce((sum, duration) => sum + duration, 0),
    finalOutcome,
    failureCode: running || finalOutcome === "completed" ? null : failureCode(latest) ?? "persistence_failed",
  };
}

function projectExecution(
  evidence: DurableEvidence,
  target: RuntimeEvidenceFeatureTarget,
): RuntimeExecutionEvidenceViewV1 {
  if (evidence.mode === "direct_host") return { ...evidence, projectId: target.projectId, cardKey: target.cardKey };
  return projectOrchestrated(evidence);
}

function projectOrchestrated(evidence: OrchestratedRuntimeEvidenceV1): OrchestratedRuntimeEvidenceViewV1 {
  const receipt = evidence.receipt;
  if (receipt.phaseExecutionContractId === null || receipt.phaseNumber === null) throw new Error("RUNTIME_EVIDENCE_UNAVAILABLE");
  return {
    mode: "orchestrated",
    invocationId: receipt.invocationId,
    rootInvocationId: receipt.rootInvocationId,
    parentInvocationId: receipt.parentInvocationId,
    invocationKind: receipt.invocationKind,
    approvedPlan: {
      planHash: receipt.planHash,
      actionId: receipt.actionId,
      actionType: receipt.actionType,
      roleId: receipt.roleId,
      promptVersion: receipt.promptVersion,
      policySource: receipt.policySource,
      revisionId: receipt.revisionId,
      primaryRoute: receipt.approvedPrimaryRoute,
      secondRoute: receipt.approvedSecondRoute,
      selectedLessonIds: receipt.selectedLessonIds,
    },
    phaseExecutionContractId: receipt.phaseExecutionContractId,
    phaseNumber: receipt.phaseNumber,
    status: projectOutcome(receipt.status),
    openedAt: receipt.openedAt,
    settledAt: receipt.settledAt,
    durationMs: receipt.durationMs,
    failureCode: receipt.failureCode,
    attempts: evidence.attempts.map(projectAttempt),
    routeChangeEvents: evidence.routeChangeEvents.map((event) => ({
      eventId: event.eventId,
      sourceInvocationId: event.sourceInvocationId,
      sourceAttemptId: event.sourceAttemptId,
      targetInvocationId: event.targetInvocationId,
      targetAttemptId: event.targetAttemptId,
      kind: event.kind,
      reasonCode: event.reasonCode,
      occurredAt: event.occurredAt,
      sourceApprovedRoute: event.sourceApprovedRoute,
      targetApprovedRoute: event.targetApprovedRoute,
      result: event.result,
    })),
  };
}

function projectAttempt(attempt: RuntimeAttemptV1) {
  return {
    attemptId: attempt.attemptId,
    attemptIndex: attempt.attemptIndex,
    attemptKind: attempt.attemptKind,
    approvedRoute: attempt.approvedRoute,
    actualRoute: attempt.actualRoute,
    providerId: attempt.providerId,
    authenticationConnectionId: attempt.authenticationConnectionId,
    authenticationKind: attempt.authenticationKind,
    credentialVersion: attempt.credentialVersion,
    workState: attempt.workState,
    checkpointId: attempt.checkpointId,
    status: attempt.status,
    preparationStartedAt: attempt.preparationStartedAt,
    startedAt: attempt.startedAt,
    spawnedAt: attempt.spawnedAt,
    terminalAt: attempt.terminalAt,
    durationMs: attempt.durationMs,
    exitCode: attempt.exitCode,
    timeoutMarker: attempt.timeoutMarker,
    failureCode: attempt.failureCode,
  };
}

function uniqueModes(values: readonly DurableEvidence[]): readonly RuntimeExecutionModeV1[] {
  return [...new Set(values.map((entry) => entry.mode))].sort();
}
function uniqueDirectModelEvidence(values: readonly DurableEvidence[]): readonly DirectHostModelEvidenceV1[] {
  const direct = values.filter((entry): entry is DirectHostRuntimeEvidenceV1 => entry.mode === "direct_host")
    .map((entry) => entry.modelEvidence);
  const byIdentity = new Map(direct.map((entry) => [modelIdentity(entry), entry]));
  return [...byIdentity.entries()].sort(([left], [right]) => compareStrings(left, right)).map(([, entry]) => entry);
}
function uniqueActualRoutes(values: readonly DurableEvidence[]): readonly RouteIdentityV1[] {
  const routes: RouteIdentityV1[] = [];
  const identities = new Set<string>();
  for (const execution of values) {
    if (execution.mode !== "orchestrated") continue;
    for (const attempt of execution.attempts) {
      if (!attempt.actualRoute) continue;
      const identity = `${attempt.actualRoute.connectionId}\u0000${attempt.actualRoute.modelId}`;
      if (!identities.has(identity)) { identities.add(identity); routes.push(attempt.actualRoute); }
    }
  }
  return routes;
}
function modelIdentity(value: DirectHostModelEvidenceV1): string {
  return value.status === "not_recorded" ? "not_recorded"
    : `recorded\u0000${value.modelId}\u0000${value.providerId ?? ""}\u0000${value.instrumentationSource}\u0000${value.observedAt}`;
}
function phaseContractId(value: DurableEvidence): string | null {
  return value.mode === "direct_host" ? value.phaseExecutionContractId : value.receipt.phaseExecutionContractId;
}
function outcome(value: DurableEvidence): RuntimeEvidenceOutcomeV1 {
  return value.mode === "direct_host" ? projectOutcome(value.outcome) : projectOutcome(value.receipt.status);
}
function failureCode(value: DurableEvidence): RuntimeSafeFailureCode | null {
  return value.mode === "direct_host" ? value.failureCode : value.receipt.failureCode;
}
function durablePosition(value: DurableEvidence): readonly [string, RuntimeExecutionModeV1, string] {
  return value.mode === "direct_host"
    ? [value.startedAt, value.mode, value.evidenceId]
    : [value.receipt.openedAt, value.mode, value.receipt.invocationId];
}
function executionPosition(value: RuntimeExecutionEvidenceViewV1): { startedAt: string; mode: RuntimeExecutionModeV1; executionId: string } {
  return value.mode === "direct_host"
    ? { startedAt: value.startedAt, mode: value.mode, executionId: value.evidenceId }
    : { startedAt: value.openedAt, mode: value.mode, executionId: value.invocationId };
}
function compareDurable(left: DurableEvidence, right: DurableEvidence): number {
  const [leftTime, leftMode, leftId] = durablePosition(left);
  const [rightTime, rightMode, rightId] = durablePosition(right);
  return compareStrings(leftTime, rightTime) || compareStrings(leftMode, rightMode) || compareStrings(leftId, rightId);
}
function compareExecutions(left: RuntimeExecutionEvidenceViewV1, right: RuntimeExecutionEvidenceViewV1): number {
  return comparePositions(executionPosition(left), executionPosition(right));
}
function compareExecutionPosition(
  value: RuntimeExecutionEvidenceViewV1,
  cursor: { readonly startedAt: string; readonly mode: RuntimeExecutionModeV1; readonly executionId: string },
): number {
  return comparePositions(executionPosition(value), cursor);
}
function comparePositions(
  left: { readonly startedAt: string; readonly mode: RuntimeExecutionModeV1; readonly executionId: string },
  right: { readonly startedAt: string; readonly mode: RuntimeExecutionModeV1; readonly executionId: string },
): number {
  return compareStrings(left.startedAt, right.startedAt)
    || compareStrings(left.mode, right.mode)
    || compareStrings(left.executionId, right.executionId);
}
function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function projectOutcome(status: "running" | "completed" | "failed" | "timed_out" | "cancelled"): RuntimeEvidenceOutcomeV1 {
  return status === "cancelled" ? "failed" : status;
}
function phaseHasActivity(status: string): boolean {
  return !new Set(["", "UNKNOWN", "PENDING", "READY", "READY TO DEVELOP", "NOT_STARTED", "NOT STARTED", "SUBMITTED"])
    .has(status.trim().toUpperCase());
}
function persistenceReadRejection<T>(code: string): RuntimeEvidenceReadResult<T> {
  return rejection(code === "RUNTIME_EVIDENCE_HISTORY_LIMIT"
    ? "RUNTIME_EVIDENCE_HISTORY_LIMIT"
    : "RUNTIME_EVIDENCE_UNAVAILABLE");
}
function isFeatureRequest(value: unknown): value is FeatureRequest {
  return record(value) && exact(value, ["projectId", "cardKey"]) && text(value.projectId, 512) && text(value.cardKey, 512);
}
function isPhaseRequest(value: unknown): value is PhaseRequest {
  return record(value) && exact(value, ["projectId", "cardKey", "phaseExecutionContractId", "cursor", "limit"])
    && text(value.projectId, 512) && text(value.cardKey, 512) && text(value.phaseExecutionContractId, 512)
    && (value.cursor === null || typeof value.cursor === "string" && value.cursor.length > 0 && value.cursor.length <= 512)
    && typeof value.limit === "number" && Number.isSafeInteger(value.limit) && value.limit >= 1 && value.limit <= 64;
}
function rejection<T>(code: RuntimeEvidenceReadErrorCode): RuntimeEvidenceReadResult<T> { return { ok: false, code }; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value); }
