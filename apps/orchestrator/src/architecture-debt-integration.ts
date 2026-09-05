/**
 * Architecture-debt refinement/readiness composition boundary.
 *
 * Compatibility Decision: BREAKING CHANGE PERMITTED. This V1 boundary accepts
 * only a canonical structured touch plan and persisted SQLite decisions; it
 * never derives authority from Markdown, a caller role, or an in-memory result.
 */
import {
  ArchitectureDebtSqliteStore,
  type ArchitectureDebtAggregateV1,
} from "@hepha/db";
import {
  evaluateArchitectureDebtTriage,
  evaluateFutureTouch,
  type ArchitectureDebtPolicyAggregateV1,
  type DebtAuthorityContext,
  type FutureTouchDecision,
  type FutureTouchMatch,
} from "./architecture-debt-policy.js";
import {
  projectArchitectureDebtRegister,
  type ArchitectureDebtProjectionV1,
} from "./architecture-debt-presentation.js";
import { loadPhaseExecutionContract } from "./phase-execution-contract.js";

import {
  loadArchitectureDebtTouchPlan,
  validateArchitectureDebtTouchPlan,
} from "./architecture-debt-touch-plan.js";

export {
  ARCHITECTURE_DEBT_TOUCH_PLAN_FILE,
  validateArchitectureDebtTouchPlan,
  type ArchitectureDebtTouchPlanV1,
  type ArchitectureDebtTouchPlanValidation,
} from "./architecture-debt-touch-plan.js";

export type ArchitectureDebtIntegrationRefusalCode =
  | "invalid_input"
  | "touch_plan_missing"
  | "touch_plan_invalid"
  | "store_unavailable"
  | "policy_refusal"
  | "persistence_failed"
  | "readiness_blocked";

export type ArchitectureDebtReadinessResult =
  | { readonly kind: "ready"; readonly context: ArchitectureDebtContext }
  | { readonly kind: "blocked"; readonly code: ArchitectureDebtIntegrationRefusalCode; readonly message: string };
export interface ArchitectureDebtContextEntry {
  readonly recordId: string;
  readonly recordVersion: number;
  readonly ownerId: string;
  readonly priority: string;
  readonly ruleId: string;
  readonly architecturalBoundary: string;
  readonly rationale: string;
  readonly futureTouchTriggerName: string;
  readonly selectorIds: readonly string[];
  readonly decisionKind: FutureTouchDecision["kind"];
}
export interface ArchitectureDebtContext { readonly kind: "architecture_debt_context/v1"; readonly featureId: string; readonly touchPlanHash: string; readonly matchedDebt: readonly ArchitectureDebtContextEntry[]; }

const HASH_RE = /^[a-f0-9]{64}$/;
const RECORD_ID_RE = /^ARCH-DEBT-[a-f0-9]{32}$/;
const UTC_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const SECRET_LIKE = [/(?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*\S+/i, /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/, /sk-[A-Za-z0-9_-]{12,}/];
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function text(value: unknown, max = 4096): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && !value.includes("\0") && !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value) && !SECRET_LIKE.some((entry) => entry.test(value)); }
function identifier(value: unknown, max = 256): value is string { return text(value, max); }
function path(value: unknown): value is string { return text(value, 1024) && !value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/.test(value) && !value.split("/").some((part) => !part || part === "." || part === ".."); }
function sortedUnique(values: readonly string[]): boolean { return values.every((entry, index) => index === 0 || values[index - 1] < entry); }
function stringList(value: unknown, item: (entry: unknown) => entry is string = (entry): entry is string => text(entry)): value is readonly string[] { return Array.isArray(value) && value.length <= 128 && value.every(item) && sortedUnique(value as readonly string[]); }
function policyAggregate(value: ArchitectureDebtAggregateV1): ArchitectureDebtPolicyAggregateV1 { return value; }
function blocked(code: ArchitectureDebtIntegrationRefusalCode, message: string): Extract<ArchitectureDebtReadinessResult, { kind: "blocked" }> { return { kind: "blocked", code, message }; }
function validAuthority(value: unknown): value is DebtAuthorityContext { return record(value) && exactKeys(value, ["actorId", "verifiedRole"]) && identifier(value.actorId) && value.verifiedRole === "ARCHITECTURE_STEWARD"; }
function validDecision(value: unknown): value is FutureTouchDecision { return record(value) && typeof value.kind === "string" && ["REMEDIATE", "PREREQUISITE", "WAIVER", "NON_INTERACTION"].includes(value.kind) && identifier(value.decisionId) && identifier(value.projectId) && identifier(value.featureId) && typeof value.touchPlanHash === "string" && HASH_RE.test(value.touchPlanHash) && typeof value.recordId === "string" && RECORD_ID_RE.test(value.recordId) && Number.isInteger(value.recordVersion) && (value.recordVersion as number) >= 0 && stringList(value.selectorIds) && value.selectorIds.length > 0 && identifier(value.actorId) && value.authorizedRole === "ARCHITECTURE_STEWARD" && text(value.reason) && typeof value.occurredAt === "string" && UTC_RE.test(value.occurredAt) && Number.isFinite(Date.parse(value.occurredAt)); }
const PREREQUISITE_LIFECYCLE_STATES = new Set(["SUBMITTED", "READY", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
function validPrerequisiteStates(value: unknown): value is readonly { readonly featureId: string; readonly state: string }[] {
  if (!Array.isArray(value) || value.length > 4096) return false;
  const featureIds = new Set<string>();
  for (const entry of value) {
    if (!record(entry) || !exactKeys(entry, ["featureId", "state"]) || !identifier(entry.featureId) || typeof entry.state !== "string" || !PREREQUISITE_LIFECYCLE_STATES.has(entry.state) || featureIds.has(entry.featureId)) return false;
    featureIds.add(entry.featureId);
  }
  return true;
}
function validProjection(value: unknown): value is ArchitectureDebtProjectionV1 { return record(value) && exactKeys(value, ["recordId", "state", "eventVersion", "ownerId", "priority", "prioritySource", "rule", "architecturalBoundary", "rationale", "risk", "locations", "futureTouchTrigger", "discovery", "duplicateOfRecordId", "supersededByRecordId", "futureTouchDecisionSummaries"].filter((key) => value[key] !== undefined)) && typeof value.recordId === "string" && RECORD_ID_RE.test(value.recordId) && Number.isInteger(value.eventVersion) && (value.eventVersion as number) >= 0 && identifier(value.ownerId) && identifier(value.architecturalBoundary) && text(value.rationale) && text(value.risk) && record(value.rule) && exactKeys(value.rule, ["ruleId", "ruleVersion", "category", "sourceReference"]) && identifier(value.rule.ruleId) && identifier(value.rule.ruleVersion) && identifier(value.rule.category) && path(value.rule.sourceReference) && record(value.futureTouchTrigger) && identifier(value.futureTouchTrigger.triggerId) && text(value.futureTouchTrigger.name) && Array.isArray(value.locations) && Array.isArray(value.futureTouchDecisionSummaries) && value.futureTouchDecisionSummaries.length === 0; }

/** Persists an already policy-accepted lifecycle event and verifies read-back. */
export function recordArchitectureDebtTriage(rawInput: unknown): { readonly kind: "committed"; readonly aggregate: ArchitectureDebtAggregateV1 } | { readonly kind: "refusal"; readonly code: ArchitectureDebtIntegrationRefusalCode } {
  if (!record(rawInput) || !exactKeys(rawInput, ["aggregate", "authority", "action", "store", "verifyReadBack"].filter((key) => rawInput[key] !== undefined)) || !(rawInput.store instanceof ArchitectureDebtSqliteStore) || (rawInput.verifyReadBack !== undefined && typeof rawInput.verifyReadBack !== "function")) return { kind: "refusal", code: "invalid_input" };
  const evaluated = evaluateArchitectureDebtTriage({ aggregate: rawInput.aggregate, authority: rawInput.authority, action: rawInput.action });
  if (evaluated.kind === "refusal") return { kind: "refusal", code: "policy_refusal" };
  const persisted = rawInput.store.commitArchitectureDebtOperation({ kind: "APPLY_TRIAGE", projectId: evaluated.event.projectId, recordId: evaluated.event.recordId, expectedVersion: evaluated.event.expectedVersion, event: evaluated.event, nextAggregate: evaluated.nextAggregate }, rawInput.verifyReadBack as ((aggregate: ArchitectureDebtAggregateV1) => boolean) | undefined);
  if (persisted.kind !== "committed") return { kind: "refusal", code: persisted.kind === "refusal" && persisted.code === "persistence_failed" ? "persistence_failed" : "invalid_input" };
  return { kind: "committed", aggregate: persisted.aggregate };
}

/** Persists exactly one policy-valid, hash-bound future-touch decision. */
export function recordFutureTouchDecision(rawInput: unknown): { readonly kind: "committed" } | { readonly kind: "refusal"; readonly code: ArchitectureDebtIntegrationRefusalCode } {
  if (!record(rawInput) || !exactKeys(rawInput, ["touchPlan", "decision", "authority", "store"]) || !(rawInput.store instanceof ArchitectureDebtSqliteStore) || !validAuthority(rawInput.authority) || !validDecision(rawInput.decision)) return { kind: "refusal", code: "invalid_input" };
  const plan = validateArchitectureDebtTouchPlan(rawInput.touchPlan);
  if (plan.kind === "refusal") return { kind: "refusal", code: "touch_plan_invalid" };
  if (rawInput.decision.projectId !== plan.plan.projectId || rawInput.decision.featureId !== plan.plan.featureId || rawInput.decision.touchPlanHash !== plan.touchPlanHash) return { kind: "refusal", code: "invalid_input" };
  const aggregate = rawInput.store.getArchitectureDebtAggregate({ projectId: plan.plan.projectId, recordId: rawInput.decision.recordId });
  if (!aggregate) return { kind: "refusal", code: "store_unavailable" };
  const policy = evaluateFutureTouch({ touchPlan: plan.plan, touchPlanHash: plan.touchPlanHash, aggregates: [policyAggregate(aggregate)], decisions: [rawInput.decision], authority: rawInput.authority });
  if (policy.kind === "refusal" || policy.matches.length !== 1) return { kind: "refusal", code: "policy_refusal" };
  const persisted = rawInput.store.commitArchitectureDebtOperation({ kind: "RECORD_TOUCH_DECISION", projectId: plan.plan.projectId, featureId: plan.plan.featureId, touchPlanHash: plan.touchPlanHash, touchPlan: plan.plan, decision: rawInput.decision });
  return persisted.kind === "decision_committed"
    ? { kind: "committed" }
    : { kind: "refusal", code: persisted.kind === "refusal" && persisted.code === "persistence_failed" ? "persistence_failed" : "invalid_input" };
}

/** Builds a safe context only from a successful allowlisted projection and accepted decision matches. */
export function buildArchitectureDebtContext(rawInput: unknown): ArchitectureDebtContext | null {
  if (!record(rawInput) || !exactKeys(rawInput, ["projection", "featureId", "touchPlanHash", "matches"]) || !identifier(rawInput.featureId) || typeof rawInput.touchPlanHash !== "string" || !HASH_RE.test(rawInput.touchPlanHash) || !Array.isArray(rawInput.matches)) return null;
  const projection = rawInput.projection;
  if (!record(projection) || projection.kind !== "projected" || projection.authority !== "presentation_only" || !Array.isArray(projection.records) || !projection.records.every(validProjection) || !rawInput.matches.every((entry): entry is FutureTouchMatch => record(entry) && typeof entry.recordId === "string" && Number.isInteger(entry.recordVersion) && Array.isArray(entry.selectorIds) && validDecision(entry.decision))) return null;
  const projections = new Map<string, ArchitectureDebtProjectionV1>(projection.records.map((entry) => [entry.recordId, entry]));
  const entries: ArchitectureDebtContextEntry[] = [];
  for (const match of rawInput.matches as readonly FutureTouchMatch[]) {
    const item = projections.get(match.recordId);
    if (!item || item.eventVersion !== match.recordVersion) return null;
    entries.push({ recordId: item.recordId, recordVersion: item.eventVersion, ownerId: item.ownerId, priority: item.priority, ruleId: item.rule.ruleId, architecturalBoundary: item.architecturalBoundary, rationale: item.rationale, futureTouchTriggerName: item.futureTouchTrigger.name, selectorIds: [...match.selectorIds], decisionKind: match.decision.kind });
  }
  return { kind: "architecture_debt_context/v1", featureId: rawInput.featureId, touchPlanHash: rawInput.touchPlanHash, matchedDebt: entries.sort((left, right) => left.recordId < right.recordId ? -1 : left.recordId > right.recordId ? 1 : 0) };
}

/** Reads the persisted plan and decisions at the real refinement/readiness boundary. */
export function evaluateFeatureDebtReadiness(rawInput: unknown): ArchitectureDebtReadinessResult {
  if (!record(rawInput)
    || !exactKeys(rawInput, ["featureFolderPath", "projectId", "featureId", "authority", "store", "prerequisiteStates", "clockNow"])
    || !identifier(rawInput.projectId)
    || !identifier(rawInput.featureId)
    || !(rawInput.authority === null || validAuthority(rawInput.authority))
    || !(rawInput.store instanceof ArchitectureDebtSqliteStore)
    || !validPrerequisiteStates(rawInput.prerequisiteStates)
    || typeof rawInput.clockNow !== "string"
    || !UTC_RE.test(rawInput.clockNow)
    || !Number.isFinite(Date.parse(rawInput.clockNow))) {
    return blocked("invalid_input", "Architecture-debt readiness input is invalid.");
  }
  const planResult = loadArchitectureDebtTouchPlan(rawInput.featureFolderPath);
  if (planResult.kind === "missing") return blocked("touch_plan_missing", "ArchitectureDebtTouchPlan.json is required before readiness.");
  if (planResult.kind === "refusal") return blocked("touch_plan_invalid", planResult.message);
  if (planResult.plan.projectId !== rawInput.projectId || planResult.plan.featureId !== rawInput.featureId) return blocked("touch_plan_invalid", "ArchitectureDebtTouchPlan.json identity does not match the refined feature.");
  let aggregates: readonly ArchitectureDebtAggregateV1[];
  try {
    const aggregateResult = rawInput.store.queryOpenArchitectureDebt({
      projectId: rawInput.projectId,
      paths: [...planResult.plan.paths].sort(),
      symbols: planResult.plan.symbols.map((entry) => entry.symbol).sort(),
      ruleTags: [...planResult.plan.ruleTags].sort(),
    });
    if (aggregateResult.kind !== "success") return blocked("store_unavailable", "Architecture-debt storage is unavailable.");
    aggregates = aggregateResult.values;
  } catch { return blocked("store_unavailable", "Architecture-debt storage is unavailable."); }

  if (aggregates.length === 0) {
    return {
      kind: "ready",
      context: {
        kind: "architecture_debt_context/v1",
        featureId: rawInput.featureId,
        touchPlanHash: planResult.touchPlanHash,
        matchedDebt: [],
      },
    };
  }
  if (!validAuthority(rawInput.authority)) {
    return blocked("readiness_blocked", "A configured architecture steward is required when the touch plan matches open architecture debt.");
  }

  let decisions: readonly unknown[];
  try {
    const decisionResult = rawInput.store.getFutureTouchDecisions({ projectId: rawInput.projectId, featureId: rawInput.featureId, touchPlanHash: planResult.touchPlanHash });
    if (decisionResult.kind !== "success") return blocked("store_unavailable", "Architecture-debt storage is unavailable.");
    decisions = decisionResult.values;
  } catch { return blocked("store_unavailable", "Architecture-debt storage is unavailable."); }
  const policy = evaluateFutureTouch({ touchPlan: planResult.plan, touchPlanHash: planResult.touchPlanHash, aggregates: aggregates.map(policyAggregate), decisions, authority: rawInput.authority });
  if (policy.kind === "refusal") return blocked("readiness_blocked", "Architecture-debt decisions are missing, stale, foreign, or incomplete.");
  const taskIds = refinedTaskIds(rawInput.featureFolderPath);
  const prerequisites = new Map(rawInput.prerequisiteStates.map((entry) => [entry.featureId, entry.state]));
  for (const match of policy.matches) {
    if (match.decision.kind === "REMEDIATE" && !taskIds.has(match.decision.owningPhaseTask)) return blocked("readiness_blocked", "A REMEDIATE decision does not bind a current refined phase task.");
    if (match.decision.kind === "PREREQUISITE" && prerequisites.get(match.decision.prerequisiteFeatureId) !== "COMPLETED") return blocked("readiness_blocked", "A PREREQUISITE decision is not complete.");
    if (match.decision.kind === "WAIVER" && match.decision.waiverExpiry !== undefined && (!UTC_RE.test(match.decision.waiverExpiry) || Date.parse(match.decision.waiverExpiry) <= Date.parse(rawInput.clockNow))) return blocked("readiness_blocked", "A future-touch waiver has expired.");
  }
  const projection = projectArchitectureDebtRegister({ records: aggregates });
  const context = buildArchitectureDebtContext({ projection, featureId: rawInput.featureId, touchPlanHash: planResult.touchPlanHash, matches: policy.matches });
  return context ? { kind: "ready", context } : blocked("readiness_blocked", "Architecture-debt context could not be safely projected.");
}
function refinedTaskIds(featureFolderPath: unknown): Set<string> {
  if (!identifier(featureFolderPath, 4096)) return new Set();
  const loaded = loadPhaseExecutionContract(featureFolderPath);
  if (!loaded.contract) return new Set();
  return new Set(loaded.contract.phases.flatMap((phase) => phase.tasks.flatMap((task) => [task.id, `${phase.id}.${task.id}`])));
}
