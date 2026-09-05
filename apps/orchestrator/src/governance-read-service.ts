/**
 * FEAT-068 V1 safe governance read composition.
 *
 * Compatibility Decision: BREAKING CHANGE PERMITTED. Internal V1 callers,
 * fixtures, and development artifacts use this exact fail-closed contract;
 * there is no legacy, hash-only, or context-free fallback.
 */
import { ArchitectureDebtSqliteStore, type StoredReplanGovernanceAggregate } from "@hepha/db";
import type {
  GovernanceArchitectureDebtV1, GovernanceCountV1, GovernanceDashboardReadV1,
  GovernanceMetricsV1, GovernanceNonNegativeIntegerV1, GovernanceQueueItemV1, GovernanceReadResultV1,
  GovernanceRemediationV1, GovernanceReplanStateV1, GovernanceReplanV1,
} from "@hepha/shared";

import { openAuthoritativeReviewStore, readCurrentAuthoritativeReviewEvidence } from "./authoritative-review-integration.js";
import { projectArchitectureDebtRegister } from "./architecture-debt-presentation.js";
import { projectReplanGovernance } from "./replan-governance-presentation.js";
import { projectPersistedReviewEvidence } from "./review-ingestion-presentation.js";

export interface GovernanceReadProject { readonly id: string; readonly rootPath: string; }
export type GovernanceReadProviderResult =
  | { readonly kind: "loaded"; readonly reviewModels: readonly unknown[]; readonly replans: readonly unknown[]; readonly debtAggregates: readonly unknown[] }
  | { readonly kind: "store_unavailable" };
export interface GovernanceReadProvider { load(project: GovernanceReadProject): GovernanceReadProviderResult; }

const SAFE_IDENTIFIER = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const HASH = /^[a-f0-9]{64}$/;
const MAX_COLLECTION = 512;
const REPLAN_STATES = new Set<GovernanceReplanStateV1>([
  "NORMAL_REMEDIATION", "REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL",
  "REPLAN_APPROVED", "REPLAN_REJECTED", "BOUNDED_REMEDIATION_DISPATCHED", "REVIEW_PENDING",
]);
const EMPTY_ROLLOUT: GovernanceDashboardReadV1["rollout"] = Object.freeze({ mode: "DISABLED", eventVersion: 0, parity: null, migration: null, pilot: null });
const DEBT_ACTIONS = {
  PENDING_TRIAGE: ["ACCEPT_RISK", "CONFIRM", "DEFER", "MERGE", "PLAN_LINK", "REASSIGN", "REJECT", "SUPERSEDE"],
  CONFIRMED: ["ACCEPT_RISK", "CLOSE", "DEFER", "MERGE", "PLAN_LINK", "REASSIGN", "SUPERSEDE"],
  DEFERRED: ["ACCEPT_RISK", "CLOSE", "CONFIRM", "MERGE", "PLAN_LINK", "REASSIGN", "SUPERSEDE"],
  ACCEPTED_RISK: ["CLOSE", "CONFIRM", "PLAN_LINK", "REASSIGN", "SUPERSEDE"],
  PLANNED: ["ACCEPT_RISK", "CLOSE", "DEFER", "REASSIGN", "SUPERSEDE"],
  CLOSED: [], REJECTED: [], MERGED: [], SUPERSEDED: [],
} as const;

type RawRecord = Record<string, unknown>;
function record(value: unknown): value is RawRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: RawRecord, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function codeUnitCompare(left: string, right: string): number { return left === right ? 0 : left < right ? -1 : 1; }
function safeId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 256 && SAFE_IDENTIFIER.test(value); }
function safeText(value: unknown, maximum = 4096): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f-\u009f]/.test(value)
    && !/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/.test(value)
    && !/(?:!?\[[^\]]*\]\(\s*|<\s*)(?:javascript|data|vbscript)\s*:/i.test(value)
    && !/(?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*\S+/i.test(value);
}
function timestamp(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)); }
function nonNegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
/** The service constructs metric totals only from validated records and arrays. */
function metricCount(value: number): GovernanceNonNegativeIntegerV1 {
  if (!nonNegativeInteger(value)) throw new Error("Invalid governance metric count.");
  return value as GovernanceNonNegativeIntegerV1;
}
function refusal(code: Extract<GovernanceReadResultV1, { kind: "governance_read_refusal" }>["code"], message: string): GovernanceReadResultV1 { return Object.freeze({ kind: "governance_read_refusal", code, message }); }
function countEntries(values: readonly string[]): readonly GovernanceCountV1[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.freeze([...counts.entries()].map(([key, count]) => Object.freeze({ key, count: metricCount(count) })).sort((left, right) => codeUnitCompare(left.key, right.key)));
}
function validateProviderResult(value: unknown): value is GovernanceReadProviderResult {
  if (!record(value) || typeof value.kind !== "string") return false;
  if (value.kind === "store_unavailable") return exactKeys(value, ["kind"]);
  return value.kind === "loaded" && exactKeys(value, ["kind", "reviewModels", "replans", "debtAggregates"])
    && [value.reviewModels, value.replans, value.debtAggregates].every((collection) => Array.isArray(collection) && collection.length <= MAX_COLLECTION);
}
function deepFreezeDetached<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => deepFreezeDetached(item))) as T;
  if (record(value)) {
    const copy: RawRecord = {};
    for (const [key, item] of Object.entries(value)) copy[key] = deepFreezeDetached(item);
    return Object.freeze(copy) as T;
  }
  return value;
}

/** Opens only authoritative stores and reconstructs current safe provider models. */
export function createSqliteGovernanceReadProvider(databasePath: string): GovernanceReadProvider {
  return { load(project) {
    const reviewStore = openAuthoritativeReviewStore(project.rootPath, databasePath);
    if (!reviewStore) return { kind: "store_unavailable" };
    let reviewModels: unknown[]; let replans: readonly StoredReplanGovernanceAggregate[];
    try {
      reviewModels = reviewStore.listReviewGovernanceForProject(project.id).map((scope) => readCurrentAuthoritativeReviewEvidence({ projectRoot: project.rootPath, databasePath, expectedScope: scope }));
      if (reviewModels.some((model) => model === undefined)) return { kind: "store_unavailable" };
      replans = reviewStore.listReplanGovernanceForProject(project.id);
    } catch { return { kind: "store_unavailable" }; } finally { reviewStore.close(); }
    const debtStore = new ArchitectureDebtSqliteStore(databasePath);
    try {
      const debt = debtStore.listArchitectureDebtByProject(project.id);
      // This call validates only decisions selected by their authoritative debt
      // project relation; foreign corrupt rows cannot poison this project read.
      const decisions = debtStore.listFutureTouchDecisionsByProject(project.id);
      return debt.kind === "success" && decisions.kind === "success" ? { kind: "loaded", reviewModels, replans, debtAggregates: debt.values } : { kind: "store_unavailable" };
    } catch { return { kind: "store_unavailable" }; } finally { debtStore.close(); }
  } };
}

function remediationDto(model: unknown, replans: readonly unknown[], projectId: string): GovernanceRemediationV1 | undefined {
  const projected = projectPersistedReviewEvidence(model);
  if (projected.kind !== "persisted_review_evidence" || projected.scope.projectId !== projectId
    || !safeId(projected.reviewRun.reviewRunId) || !HASH.test(projected.reviewRun.manifestHash)
    || projected.reviewRun.manifestHash !== projected.gate.basisManifestHash
    || !timestamp(projected.reviewRun.createdAt)) return undefined;
  const matching = new Map<string, GovernanceReplanV1[]>();
  for (const raw of replans) {
    const dto = replanDto(raw, projectId);
    if (!dto) return undefined;
    const key = `${dto.featureId}\0${dto.phaseNumber}\0${dto.reviewGateId}\0${dto.defectClass}`;
    matching.set(key, [...(matching.get(key) ?? []), dto]);
  }
  const findings: Array<GovernanceRemediationV1["findings"][number]> = [];
  for (const finding of projected.findings) {
    if (!safeId(finding.findingId) || !safeId(finding.findingObservationId) || !safeId(finding.defectClass) || !safeText(finding.summary, 240)) return undefined;
    const matches = matching.get(`${projected.scope.featureId}\0${projected.scope.phaseNumber}\0${projected.scope.reviewGateId}\0${finding.defectClass}`) ?? [];
    if (finding.disposition === "SCOPE_EXPANSION" && (matches.length !== 1 || !nonNegativeInteger(matches[0]!.eventVersion))) return undefined;
    if (finding.disposition !== "SCOPE_EXPANSION" && matches.length > 0) { /* aggregate cannot make a non-scope finding actionable */ }
    findings.push({ findingId: finding.findingId, findingObservationId: finding.findingObservationId, disposition: finding.disposition, severity: finding.severity, defectClass: finding.defectClass, summary: finding.summary, scopeDecisionTarget: finding.disposition === "SCOPE_EXPANSION" ? { aggregateId: matches[0]!.aggregateId, expectedVersion: matches[0]!.eventVersion } : null });
  }
  const receipts = projected.receipts.map((receipt) => ({ findingId: receipt.findingId, subjectKind: receipt.subjectKind, subjectId: receipt.subjectId, outcome: receipt.outcome }));
  return { reviewRunId: projected.reviewRun.reviewRunId, featureId: projected.scope.featureId, phaseNumber: projected.scope.phaseNumber, reviewGateId: projected.scope.reviewGateId, manifestHash: projected.reviewRun.manifestHash, manifestResult: projected.reviewRun.manifestResult, ruleSnapshotHash: projected.gate.basisManifestHash, createdAt: projected.reviewRun.createdAt, gate: { gateState: projected.gate.gateState, reasonCode: projected.gate.reasonCode, basisManifestHash: projected.gate.basisManifestHash, cycleId: projected.gate.cycleId, decidedAt: projected.gate.decidedAt }, cycleState: projected.cycleState, findings: findings.sort((left, right) => codeUnitCompare(left.findingId, right.findingId)), receipts: receipts.sort((left, right) => codeUnitCompare(`${left.findingId}\0${left.subjectKind}\0${left.subjectId}`, `${right.findingId}\0${right.subjectKind}\0${right.subjectId}`)) };
}
function replanDto(raw: unknown, projectId: string): GovernanceReplanV1 | undefined {
  const projected = projectReplanGovernance(raw);
  if (projected.kind !== "replan_governance" || projected.scope.projectId !== projectId || !safeId(projected.aggregateId) || !nonNegativeInteger(projected.eventVersion) || !REPLAN_STATES.has(projected.state as GovernanceReplanStateV1)) return undefined;
  return { aggregateId: projected.aggregateId, featureId: projected.scope.featureId, phaseNumber: projected.scope.phaseNumber, reviewGateId: projected.scope.reviewGateId, defectClass: projected.scope.defectClass, state: projected.state as GovernanceReplanStateV1, eventVersion: projected.eventVersion, recurrence: { ...projected.recurrence }, currentRequest: projected.request === null ? null : { requestId: projected.request.requestId, planHash: projected.request.planHash, planVersion: projected.request.planVersion, requestedAt: projected.request.requestedAt }, scopeExpansionDecisions: projected.scopeExpansionDecisions.map((decision) => ({ ...decision })), replanDecisions: projected.replanDecisions.map((decision) => ({ ...decision })), dispatch: projected.dispatch === null ? null : { ...projected.dispatch }, summary: { ...projected.summary }, availableActions: projected.state === "REPLAN_PENDING_APPROVAL" ? ["APPROVE_REPLAN", "REJECT_REPLAN"] : [] };
}
function debtDtos(aggregates: readonly unknown[], projectId: string): readonly GovernanceArchitectureDebtV1[] | undefined {
  if (!aggregates.every((aggregate) => record(aggregate) && aggregate.projectId === projectId)) return undefined;
  const projected = projectArchitectureDebtRegister({ records: aggregates });
  if (projected.kind !== "projected") return undefined;
  return projected.records.map((item) => ({ recordId: item.recordId, state: item.state, eventVersion: item.eventVersion, ownerId: item.ownerId, priority: item.priority, prioritySource: item.prioritySource, rule: { ...item.rule }, architecturalBoundary: item.architecturalBoundary, rationale: item.rationale, risk: item.risk, locations: item.locations.map((location) => ({ ...location, ruleTags: [...location.ruleTags] })), futureTouchTrigger: { ...item.futureTouchTrigger, paths: [...item.futureTouchTrigger.paths], symbols: [...item.futureTouchTrigger.symbols], ruleTags: [...item.futureTouchTrigger.ruleTags] }, discovery: { ...item.discovery }, ...(item.duplicateOfRecordId === undefined ? {} : { duplicateOfRecordId: item.duplicateOfRecordId }), ...(item.supersededByRecordId === undefined ? {} : { supersededByRecordId: item.supersededByRecordId }), futureTouchDecisions: [], availableActions: [...DEBT_ACTIONS[item.state]] }));
}
function queueFor(remediations: readonly GovernanceRemediationV1[], replans: readonly GovernanceReplanV1[], debt: readonly GovernanceArchitectureDebtV1[]): readonly GovernanceQueueItemV1[] {
  const queue: GovernanceQueueItemV1[] = [];
  for (const remediation of remediations) for (const finding of remediation.findings) {
    const actions = finding.scopeDecisionTarget === null ? [] : ["ACCEPT_SCOPE_EXPANSION", "REJECT_SCOPE_EXPANSION"] as const;
    queue.push({ itemId: `remediation:${remediation.reviewRunId}:${finding.findingId}`, itemKind: "REMEDIATION", targetId: finding.findingObservationId, featureId: remediation.featureId, state: remediation.cycleState, currentVersion: finding.scopeDecisionTarget?.expectedVersion ?? null, requiresAction: actions.length > 0, urgency: actions.length > 0 ? "SCOPE_EXPANSION" : "INFORMATIONAL", summaryCode: finding.disposition, availableActions: actions });
  }
  for (const replan of replans) queue.push({ itemId: `replan:${replan.aggregateId}`, itemKind: "REPLAN", targetId: replan.aggregateId, featureId: replan.featureId, state: replan.state, currentVersion: replan.eventVersion, requiresAction: replan.availableActions.length > 0, urgency: replan.availableActions.length > 0 ? "REPLAN_APPROVAL" : "INFORMATIONAL", summaryCode: replan.state, availableActions: replan.availableActions });
  for (const item of debt) queue.push({ itemId: `debt:${item.recordId}`, itemKind: "ARCHITECTURE_DEBT", targetId: item.recordId, featureId: item.discovery.featureId, state: item.state, currentVersion: item.eventVersion, requiresAction: item.availableActions.length > 0, urgency: item.priority, summaryCode: item.state, availableActions: item.availableActions });
  const urgencyRank = { SCOPE_EXPANSION: 0, P0: 1, REPLAN_APPROVAL: 2, REPLAN_REQUIRED: 3, P1: 4, P2: 5, P3: 6, INFORMATIONAL: 7 } as const;
  const kindRank = { REMEDIATION: 0, REPLAN: 1, ARCHITECTURE_DEBT: 2 } as const;
  return queue.sort((left, right) => (Number(right.requiresAction) - Number(left.requiresAction)) || (urgencyRank[left.urgency] - urgencyRank[right.urgency]) || (kindRank[left.itemKind] - kindRank[right.itemKind]) || codeUnitCompare(left.itemId, right.itemId));
}
function dispatchOutcomeHistory(rawReplans: readonly unknown[]): readonly ("STARTED" | "START_FAILED")[] | undefined {
  const outcomes: ("STARTED" | "START_FAILED")[] = [];
  for (const aggregate of rawReplans) {
    // replanDto has already accepted this aggregate through the provider's
    // complete V1 projector; this narrow read keeps raw attempts internal.
    if (!record(aggregate) || !Array.isArray(aggregate.dispatchAttempts)) return undefined;
    for (const attempt of aggregate.dispatchAttempts) {
      if (!record(attempt) || (attempt.outcome !== "STARTED" && attempt.outcome !== "START_FAILED")) return undefined;
      outcomes.push(attempt.outcome);
    }
  }
  return outcomes;
}
function metrics(remediations: readonly GovernanceRemediationV1[], replans: readonly GovernanceReplanV1[], debt: readonly GovernanceArchitectureDebtV1[], queue: readonly GovernanceQueueItemV1[], dispatchOutcomes: readonly ("STARTED" | "START_FAILED")[]): GovernanceMetricsV1 {
  const scopeOutcomes = replans.flatMap((item) => item.scopeExpansionDecisions.map((decision) => decision.outcome));
  const replanOutcomes = replans.flatMap((item) => item.replanDecisions.map((decision) => decision.outcome));
  return { reviewResults: countEntries(remediations.map((item) => item.manifestResult)), gateStates: countEntries(remediations.map((item) => item.gate.gateState)), cycleStates: countEntries(remediations.map((item) => item.cycleState)), findingDispositions: countEntries(remediations.flatMap((item) => item.findings.map((finding) => finding.disposition))), ruleReferences: [], recoveryStopReasons: [], replanStates: countEntries(replans.map((item) => item.state)), debtStates: countEntries(debt.map((item) => item.state)), debtPriorities: countEntries(debt.map((item) => item.priority)), scopeDecisionOutcomes: countEntries(scopeOutcomes), replanDecisionOutcomes: countEntries(replanOutcomes), futureTouchDecisionKinds: [], dispatchOutcomes: countEntries(dispatchOutcomes), shadowOutcomes: [], pilotOutcomes: [], reviewRuns: metricCount(remediations.length), openRemediationCycles: metricCount(remediations.filter((item) => item.cycleState !== "NO_REMEDIATION_REQUIRED" && item.cycleState !== "REMEDIATION_VERIFIED").length), replanAggregates: metricCount(replans.length), architectureDebtRecords: metricCount(debt.length), actionableQueueItems: metricCount(queue.filter((item) => item.requiresAction).length), postFixManifestations: metricCount(replans.reduce((total, item) => total + item.recurrence.postFixManifestations, 0)), acceptedScopeExpansions: metricCount(replans.reduce((total, item) => total + item.recurrence.acceptedScopeExpansions, 0)) };
}

/**
 * Projects one already-loaded authoritative snapshot without performing I/O.
 * Action writes use this while their provider transaction remains open, so an
 * invalid post-write DTO rolls the provider transaction back before commit.
 */
export function readGovernanceDashboardFromLoaded(project: GovernanceReadProject, loaded: unknown): GovernanceReadResultV1 {
  if (!record(project) || !exactKeys(project, ["id", "rootPath"]) || !safeId(project.id) || typeof project.rootPath !== "string" || project.rootPath.length === 0) return refusal("INVALID_REQUEST", "Governance read request is invalid.");
  if (!validateProviderResult(loaded)) return refusal("UNSAFE_GOVERNANCE_PROJECTION", "Governance state cannot be safely projected.");
  if (loaded.kind === "store_unavailable") return refusal("GOVERNANCE_STORE_UNAVAILABLE", "Governance storage is unavailable.");
  try {
    const replans = loaded.replans.map((aggregate) => replanDto(aggregate, project.id));
    const remediations = loaded.reviewModels.map((model) => remediationDto(model, loaded.replans, project.id));
    const debt = debtDtos(loaded.debtAggregates, project.id);
    if (replans.some((item) => item === undefined) || remediations.some((item) => item === undefined) || debt === undefined) return refusal("UNSAFE_GOVERNANCE_PROJECTION", "Governance state cannot be safely projected.");
    const sortedReplans = [...(replans as GovernanceReplanV1[])].sort((left, right) => codeUnitCompare(left.aggregateId, right.aggregateId));
    const sortedRemediations = [...(remediations as GovernanceRemediationV1[])].sort((left, right) => codeUnitCompare(left.reviewRunId, right.reviewRunId));
    const queue = queueFor(sortedRemediations, sortedReplans, debt);
    const dispatchOutcomes = dispatchOutcomeHistory(loaded.replans);
    if (dispatchOutcomes === undefined) return refusal("UNSAFE_GOVERNANCE_PROJECTION", "Governance state cannot be safely projected.");
    const data: GovernanceDashboardReadV1 = { schemaVersion: "hepha-governance-dashboard/v1", projectId: project.id, remediations: sortedRemediations, replans: sortedReplans, architectureDebt: [...debt], queue, metrics: metrics(sortedRemediations, sortedReplans, debt, queue, dispatchOutcomes), rollout: EMPTY_ROLLOUT };
    return Object.freeze({ kind: "governance_read" as const, data: deepFreezeDetached(data) });
  } catch { return refusal("UNSAFE_GOVERNANCE_PROJECTION", "Governance state cannot be safely projected."); }
}

/** Composes provider reads into the detached and recursively frozen V1 dashboard DTO. */
export function readGovernanceDashboard(rawInput: unknown): GovernanceReadResultV1 {
  if (!record(rawInput) || !exactKeys(rawInput, ["project", "provider"]) || !record(rawInput.project) || !exactKeys(rawInput.project, ["id", "rootPath"]) || !safeId(rawInput.project.id) || typeof rawInput.project.rootPath !== "string" || rawInput.project.rootPath.length === 0 || !record(rawInput.provider) || !exactKeys(rawInput.provider, ["load"]) || typeof rawInput.provider.load !== "function") return refusal("INVALID_REQUEST", "Governance read request is invalid.");
  const project = rawInput.project as unknown as GovernanceReadProject; const provider = rawInput.provider as unknown as GovernanceReadProvider;
  let loaded: unknown;
  try { loaded = provider.load(project); } catch { return refusal("GOVERNANCE_STORE_UNAVAILABLE", "Governance storage is unavailable."); }
  return readGovernanceDashboardFromLoaded(project, loaded);
}
