/** FEAT-068 V1 loopback-only confirmed governance action boundary. */
import { createHash } from "node:crypto";
import { ArchitectureDebtSqliteStore, GovernanceRolloutSqliteStore } from "@hepha/db";
import type { GovernanceActionReceiptV1, GovernanceActionRequestV1, GovernanceActionResultV1 } from "@hepha/shared";
import { openAuthoritativeReviewStore } from "./authoritative-review-integration.js";
import { recordArchitectureDebtTriage } from "./architecture-debt-integration.js";
import { readGovernanceDashboardFromLoaded, type GovernanceReadProject, type GovernanceReadProvider, type GovernanceReadProviderResult } from "./governance-read-service.js";
import { canonicalizeGovernanceParityV1 } from "./governance-parity-service.js";
import { disableGovernancePilot, evaluateGovernancePilotAdmission, isGovernancePilotConfiguration } from "./governance-rollout-policy.js";
import { decideReplanApproval, decideScopeExpansion, resolveLoopbackGovernanceAuthority } from "./replan-governance-presentation.js";

type Raw = Record<string, unknown>;
type Authority = { readonly actorId: string; readonly role: "FEATURE_OWNER" | "ARCHITECTURE_STEWARD" };
export interface GovernanceActionExecutionContext { readonly project: GovernanceReadProject; readonly readProvider: GovernanceReadProvider; readonly databasePath: string; readonly now?: () => string; }

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RECORD_ID = /^ARCH-DEBT-[a-f0-9]{32}$/;
const FORBIDDEN = new Set(["actor", "actorId", "role", "roles", "authorizedRole", "trustedTimestamp", "occurredAt", "approvedAt", "enforcementState", "authority", "headers", "token", "tokens", "databasePath"]);
function record(value: unknown): value is Raw { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Raw, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function safeText(value: unknown, max = 1024): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
    && !/[\u0000-\u001f\u007f-\u009f]|[\ud800-\udfff]/.test(value)
    && !/(?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*\S+/i.test(value)
    && !/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/.test(value)
    && !/(?:!?\[[^\]]*\]\(\s*|<\s*)(?:javascript|data|vbscript)\s*:/i.test(value);
}
function identifier(value: unknown): value is string { return typeof value === "string" && value.length <= 256 && ID.test(value); }
function version(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function utc(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)); }
function canonical(value: unknown): string | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "number") return Number.isFinite(value as number) || typeof value !== "number" ? JSON.stringify(value) : undefined;
  if (typeof value === "string") return !/[\ud800-\udfff]/.test(value) ? JSON.stringify(value) : undefined;
  if (Array.isArray(value)) { const members = value.map(canonical); return members.some((member) => member === undefined) ? undefined : `[${members.join(",")}]`; }
  if (!record(value)) return undefined;
  const keys = Object.keys(value).sort((a, b) => a === b ? 0 : a < b ? -1 : 1);
  const members = keys.map((key) => { const member = canonical(value[key]); return member === undefined ? undefined : `${JSON.stringify(key)}:${member}`; });
  return members.some((member) => member === undefined) ? undefined : `{${members.join(",")}}`;
}
function refusal(code: Extract<GovernanceActionResultV1, { kind: "governance_action_refusal" }> ["code"], message: string, currentVersion?: number): GovernanceActionResultV1 { return { kind: "governance_action_refusal", code, message, ...(currentVersion === undefined ? {} : { currentVersion }) }; }
function hasForbidden(value: unknown): boolean { return record(value) ? Object.entries(value).some(([key, child]) => FORBIDDEN.has(key) || hasForbidden(child)) : Array.isArray(value) && value.some(hasForbidden); }

/** Canonical SHA-256 digest for the complete action intent excluding confirmation. */
export function computeGovernanceActionDigest(rawRequestWithoutConfirmation: unknown): string | undefined { const serialized = canonical(rawRequestWithoutConfirmation); return serialized === undefined ? undefined : createHash("sha256").update(serialized, "utf8").digest("hex"); }
function stringList(value: unknown): value is readonly string[] { return Array.isArray(value) && value.length <= 128 && value.every((item) => safeText(item)) && value.every((item, index, values) => index === 0 || values[index - 1]! < item); }
function trigger(value: unknown): boolean { return record(value) && exact(value, ["triggerId", "name", "paths", "symbols", "ruleTags"]) && identifier(value.triggerId) && safeText(value.name) && stringList(value.paths) && stringList(value.symbols) && stringList(value.ruleTags) && value.paths.length + value.symbols.length + value.ruleTags.length > 0; }
function debtPayload(action: string, payload: Raw): boolean {
  if (action === "CONFIRM") return exact(payload, ["ownerId", "rationale", "risk", "architecturalBoundary", "priority", "futureTouchTrigger"]) && identifier(payload.ownerId) && safeText(payload.rationale) && safeText(payload.risk) && identifier(payload.architecturalBoundary) && ["P0", "P1", "P2", "P3"].includes(payload.priority as string) && trigger(payload.futureTouchTrigger);
  if (action === "MERGE" || action === "SUPERSEDE") return exact(payload, ["targetRecordId"]) && typeof payload.targetRecordId === "string" && RECORD_ID.test(payload.targetRecordId);
  if (action === "REASSIGN") return exact(payload, ["ownerId"]) && identifier(payload.ownerId);
  if (action === "ACCEPT_RISK") return exact(payload, ["reviewTrigger"]) && identifier(payload.reviewTrigger);
  if (action === "PLAN_LINK") return exact(payload, ["featureId", "phaseTask"]) && identifier(payload.featureId) && identifier(payload.phaseTask);
  if (action === "CLOSE") return exact(payload, ["closureEvidence"]) && safeText(payload.closureEvidence);
  return (action === "REJECT" || action === "DEFER") && exact(payload, []);
}
function futurePayload(action: string, payload: Raw): boolean {
  if (action === "REMEDIATE") return exact(payload, ["owningPhaseTask", "acceptanceObligation"]) && identifier(payload.owningPhaseTask) && safeText(payload.acceptanceObligation);
  if (action === "PREREQUISITE") return exact(payload, ["prerequisiteFeatureId", "orderingEvidence", "completionCondition"]) && identifier(payload.prerequisiteFeatureId) && safeText(payload.orderingEvidence) && safeText(payload.completionCondition);
  if (action === "WAIVER") return exact(payload, ["waiverExpiry", "reconsiderationTrigger"].filter((key) => payload[key] !== undefined)) && (payload.waiverExpiry === undefined || utc(payload.waiverExpiry)) && (payload.reconsiderationTrigger === undefined || identifier(payload.reconsiderationTrigger)) && (payload.waiverExpiry !== undefined || payload.reconsiderationTrigger !== undefined);
  return action === "NON_INTERACTION" && exact(payload, ["inspectedBoundary", "explanation"]) && identifier(payload.inspectedBoundary) && safeText(payload.explanation);
}
/** Validates the entire closed V1 discriminator before authority or storage use. */
function envelope(value: unknown): value is Raw {
  return record(value) && exact(value, ["schemaVersion", "actionId", "kind", "action", "target", "expectedVersion", "reason", "payload", "confirmation"])
    && value.schemaVersion === "hepha-governance-action/v1" && identifier(value.actionId) && typeof value.kind === "string" && typeof value.action === "string"
    && version(value.expectedVersion) && safeText(value.reason) && record(value.target) && record(value.payload) && !hasForbidden(value);
}
function shape(value: Raw): boolean {
  const kind = value.kind; const action = value.action; const target = value.target as Raw; const payload = value.payload as Raw;
  if (kind === "SCOPE_EXPANSION_DECISION") return (action === "ACCEPT_SCOPE_EXPANSION" || action === "REJECT_SCOPE_EXPANSION") && exact(target as Raw, ["aggregateId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "findingObservationId"]) && identifier(target.aggregateId) && identifier(target.featureId) && version(target.phaseNumber) && identifier(target.reviewGateId) && identifier(target.defectClass) && identifier(target.findingObservationId) && exact(payload as Raw, []);
  if (kind === "REPLAN_DECISION") return (action === "APPROVE_REPLAN" || action === "REJECT_REPLAN") && exact(target as Raw, ["aggregateId", "featureId", "phaseNumber", "reviewGateId", "defectClass", "requestId", "planHash", "planVersion"]) && identifier(target.aggregateId) && identifier(target.featureId) && version(target.phaseNumber) && identifier(target.reviewGateId) && identifier(target.defectClass) && identifier(target.requestId) && typeof target.planHash === "string" && HASH.test(target.planHash) && version(target.planVersion) && exact(payload as Raw, []);
  if (kind === "DEBT_TRIAGE") return ["CONFIRM", "REJECT", "MERGE", "REASSIGN", "DEFER", "ACCEPT_RISK", "PLAN_LINK", "CLOSE", "SUPERSEDE"].includes(action as string) && exact(target as Raw, ["recordId"]) && typeof target.recordId === "string" && RECORD_ID.test(target.recordId) && debtPayload(action as string, payload as Raw);
  if (kind === "FUTURE_TOUCH_DECISION") return ["REMEDIATE", "PREREQUISITE", "WAIVER", "NON_INTERACTION"].includes(action as string) && exact(target as Raw, ["recordId", "featureId", "touchPlanHash", "selectorIds"]) && typeof target.recordId === "string" && RECORD_ID.test(target.recordId) && identifier(target.featureId) && typeof target.touchPlanHash === "string" && HASH.test(target.touchPlanHash) && stringList(target.selectorIds) && target.selectorIds.length > 0 && futurePayload(action as string, payload as Raw);
  if (kind === "PILOT_ADMISSION") return action === "APPROVE_PILOT" && exact(target as Raw, ["pilotId", "featureId", "phaseContractId", "taskId", "contractVersion", "pilotConfigHash"]) && identifier(target.pilotId) && identifier(target.featureId) && identifier(target.phaseContractId) && identifier(target.taskId) && version(target.contractVersion) && typeof target.pilotConfigHash === "string" && HASH.test(target.pilotConfigHash) && exact(payload as Raw, ["parityReceiptId", "migrationAuditId", "expiresAt"]) && identifier(payload.parityReceiptId) && identifier(payload.migrationAuditId) && utc(payload.expiresAt);
  return kind === "PILOT_DISABLEMENT" && action === "DISABLE_PILOT" && exact(target as Raw, ["pilotId"]) && identifier(target.pilotId) && exact(payload as Raw, ["disableReason"]) && safeText(payload.disableReason);
}
function requestStatus(value: unknown): "valid" | "confirmation_required" | "invalid" {
  if (!record(value)) return "invalid";
  const envelopeWithoutConfirmation = ["schemaVersion", "actionId", "kind", "action", "target", "expectedVersion", "reason", "payload"];
  const keys = Object.keys(value);
  if (!keys.every((key) => envelopeWithoutConfirmation.includes(key) || key === "confirmation") || !envelopeWithoutConfirmation.every((key) => keys.includes(key))) return "invalid";
  const confirmation = value.confirmation;
  if (!record(confirmation) || !exact(confirmation, ["statement", "actionDigest"]) || confirmation.statement !== "I_CONFIRM_THIS_GOVERNANCE_ACTION" || typeof confirmation.actionDigest !== "string" || !HASH.test(confirmation.actionDigest)) return "confirmation_required";
  return envelope(value) && shape(value) ? "valid" : "invalid";
}
function authorityFor(kind: GovernanceActionRequestV1["kind"]): Authority | undefined { const resolved = resolveLoopbackGovernanceAuthority(); if (resolved.kind !== "authority") return undefined; const role = kind === "SCOPE_EXPANSION_DECISION" ? "FEATURE_OWNER" : "ARCHITECTURE_STEWARD"; if (!resolved.authority.roles.includes(role) || (role === "ARCHITECTURE_STEWARD" && process.env.HEPHA_ARCHITECTURE_STEWARD_ID !== resolved.authority.actorId)) return undefined; return { actorId: resolved.authority.actorId, role }; }
function receipt(request: GovernanceActionRequestV1, projectId: string, authority: Authority, resultingVersion: number, targetKey: string, recordedAt: string, providerReceiptId: string): GovernanceActionReceiptV1 { return { actionId: request.actionId, projectId, kind: request.kind, action: request.action, targetKey, actorId: authority.actorId, authorizedRole: authority.role, reason: request.reason, expectedVersion: request.expectedVersion, resultingVersion, recordedAt, providerReceiptId }; }
function sameScope(aggregate: { scope: Raw; aggregateId: string }, target: Raw, projectId: string): boolean { return aggregate.aggregateId === target.aggregateId && aggregate.scope.projectId === projectId && aggregate.scope.featureId === target.featureId && aggregate.scope.phaseNumber === target.phaseNumber && aggregate.scope.reviewGateId === target.reviewGateId && aggregate.scope.defectClass === target.defectClass; }
type Dashboard = Extract<ReturnType<typeof readGovernanceDashboardFromLoaded>, { kind: "governance_read" }>["data"];
type LoadedDashboardSource = Extract<GovernanceReadProviderResult, { kind: "loaded" }>;
type CommittedAction = { version: number; key: string; providerReceiptId: string; recordedAt: string; refreshed: Dashboard };
function preflightRead(context: GovernanceActionExecutionContext): { source: LoadedDashboardSource; dashboard: Dashboard } | undefined {
  let source: GovernanceReadProviderResult;
  try { source = context.readProvider.load(context.project); } catch { return undefined; }
  const dashboard = readGovernanceDashboardFromLoaded(context.project, source);
  return source.kind === "loaded" && dashboard.kind === "governance_read" ? { source, dashboard: dashboard.data } : undefined;
}
function projectReadBack(context: GovernanceActionExecutionContext, source: LoadedDashboardSource, replacement: Partial<Pick<LoadedDashboardSource, "replans" | "debtAggregates">>): Dashboard | undefined {
  const refreshed = readGovernanceDashboardFromLoaded(context.project, { ...source, ...replacement });
  return refreshed.kind === "governance_read" ? refreshed.data : undefined;
}
function pilotConfig(): unknown { try { return process.env.HEPHA_GOVERNANCE_PILOT_CONFIG ? JSON.parse(process.env.HEPHA_GOVERNANCE_PILOT_CONFIG) : undefined; } catch { return undefined; } }

/** Executes one current-version, server-authorized provider action and returns an exact refreshed safe read. */
export function executeGovernanceAction(rawInput: unknown): GovernanceActionResultV1 {
  if (!record(rawInput) || !exact(rawInput, ["request", "context"]) || !record(rawInput.context)) return refusal("INVALID_REQUEST", "Governance action request is invalid.");
  const classification = requestStatus(rawInput.request);
  if (classification === "confirmation_required") return refusal("CONFIRMATION_REQUIRED", "Governance action confirmation is required.");
  if (classification !== "valid") return refusal("INVALID_REQUEST", "Governance action request is invalid.");
  const request = rawInput.request as GovernanceActionRequestV1; const context = rawInput.context as unknown as GovernanceActionExecutionContext;
  if (!context.project || !context.readProvider || !safeText(context.databasePath, 4096)) return refusal("GOVERNANCE_STORE_UNAVAILABLE", "Governance storage is unavailable.");
  const digest = computeGovernanceActionDigest({ schemaVersion: request.schemaVersion, actionId: request.actionId, kind: request.kind, action: request.action, target: request.target, expectedVersion: request.expectedVersion, reason: request.reason, payload: request.payload });
  if (!digest || digest !== request.confirmation.actionDigest) return refusal("CONFIRMATION_MISMATCH", "Governance action confirmation does not match the request.");
  const authority = authorityFor(request.kind); if (!authority) return refusal("AUTHORITY_UNAVAILABLE", "Local governance authority is unavailable.");
  const baseline = preflightRead(context);
  if (!baseline) return refusal("PERSISTENCE_FAILED", "Governance action could not be read back.");
  let result: CommittedAction | undefined;
  try {
    if (request.kind === "SCOPE_EXPANSION_DECISION" || request.kind === "REPLAN_DECISION") {
      const store = openAuthoritativeReviewStore(context.project.rootPath, context.databasePath); if (!store) return refusal("GOVERNANCE_STORE_UNAVAILABLE", "Governance storage is unavailable.");
      try {
        const target = request.target as Raw;
        const candidates = store.listReplanGovernanceForProject(context.project.id).filter((aggregate) => sameScope(aggregate as unknown as { scope: Raw; aggregateId: string }, target, context.project.id));
        if (candidates.length !== 1 || candidates[0]!.aggregateId !== target.aggregateId) return refusal("FOREIGN_TARGET", "Governance target does not belong to this project.");
        const aggregate = candidates[0]!;
        if (aggregate.eventVersion !== request.expectedVersion) return refusal("STALE_VERSION", "Governance action version is stale.", aggregate.eventVersion);
        if (!baseline.dashboard.replans.some((item) => item.aggregateId === aggregate.aggregateId && item.eventVersion === aggregate.eventVersion)) return refusal("PERSISTENCE_FAILED", "Governance action could not be read back.");
        if (request.kind === "SCOPE_EXPANSION_DECISION") { const observation = store.getReviewFindingObservationContext(target.findingObservationId); if (!observation || observation.projectId !== context.project.id || observation.featureId !== target.featureId || observation.phaseNumber !== target.phaseNumber || observation.reviewGateId !== target.reviewGateId || observation.defectClass !== target.defectClass || observation.disposition !== "SCOPE_EXPANSION") return refusal("FOREIGN_TARGET", "Governance target does not belong to this project."); }
        else { const current = aggregate.requests.at(-1); if (!current || current.requestId !== target.requestId || current.planHash !== target.planHash || current.planVersion !== target.planVersion) return refusal("FOREIGN_TARGET", "Governance target does not belong to this project."); if (current.proposalAuthorActor === authority.actorId) return refusal("SELF_CONFLICT", "Governance operator cannot decide their own replan.", aggregate.eventVersion); }
        let verificationAttempted = false;
        const verifyReadBack = (current: typeof aggregate): boolean => {
          verificationAttempted = true;
          const refreshed = projectReadBack(context, baseline.source, { replans: baseline.source.replans.map((item) => record(item) && item.aggregateId === aggregate.aggregateId ? current : item) });
          const decision = request.kind === "SCOPE_EXPANSION_DECISION" ? current.scopeExpansionDecisions.at(-1) : current.decisions.at(-1);
          if (!refreshed || !decision || current.eventVersion !== request.expectedVersion + 1 || decision.actorId !== authority.actorId || decision.expectedVersion !== request.expectedVersion || decision.resultingVersion !== current.eventVersion || !utc(decision.decidedAt)) return false;
          const exact = refreshed.replans.find((item) => item.aggregateId === aggregate.aggregateId);
          const bound = request.kind === "SCOPE_EXPANSION_DECISION"
            ? exact?.scopeExpansionDecisions.some((item) => item.decisionId === decision.decisionId && item.findingObservationId === (decision as typeof current.scopeExpansionDecisions[number]).findingObservationId && item.outcome === decision.outcome && item.resultingVersion === decision.resultingVersion)
            : exact?.replanDecisions.some((item) => item.decisionId === decision.decisionId && item.requestId === (decision as typeof current.decisions[number]).requestId && item.planHash === (decision as typeof current.decisions[number]).planHash && item.planVersion === (decision as typeof current.decisions[number]).planVersion && item.outcome === decision.outcome && item.resultingVersion === decision.resultingVersion);
          if (!exact || exact.eventVersion !== current.eventVersion || !bound) return false;
          result = { version: current.eventVersion, key: aggregate.aggregateId, providerReceiptId: decision.decisionId, recordedAt: decision.decidedAt, refreshed };
          return true;
        };
        const delegated = request.kind === "SCOPE_EXPANSION_DECISION" ? decideScopeExpansion({ store, scope: aggregate.scope, aggregateId: aggregate.aggregateId, findingObservationId: target.findingObservationId, action: request.action, expectedVersion: request.expectedVersion, reason: request.reason, verifyReadBack }) : decideReplanApproval({ store, scope: aggregate.scope, aggregateId: aggregate.aggregateId, requestId: target.requestId, action: request.action, expectedVersion: request.expectedVersion, reason: request.reason, verifyReadBack });
        if (delegated.kind !== "decision_recorded") return refusal(verificationAttempted ? "PERSISTENCE_FAILED" : "PROVIDER_REFUSED", verificationAttempted ? "Governance action could not be read back." : "Governance provider refused the action.", aggregate.eventVersion);
        if (!result) return refusal("PERSISTENCE_FAILED", "Governance action could not be read back.");
      } finally { store.close(); }
    } else if (request.kind === "DEBT_TRIAGE") {
      const store = new ArchitectureDebtSqliteStore(context.databasePath); try {
        const target = request.target as Raw; const aggregate = store.getArchitectureDebtAggregate({ projectId: context.project.id, recordId: target.recordId });
        if (!aggregate || aggregate.projectId !== context.project.id) return refusal("FOREIGN_TARGET", "Governance target does not belong to this project.");
        if (aggregate.eventVersion !== request.expectedVersion) return refusal("STALE_VERSION", "Governance action version is stale.", aggregate.eventVersion);
        if (!baseline.dashboard.architectureDebt.some((item) => item.recordId === aggregate.recordId && item.eventVersion === aggregate.eventVersion)) return refusal("PERSISTENCE_FAILED", "Governance action could not be read back.");
        const occurredAt = context.now?.() ?? new Date().toISOString(); if (!utc(occurredAt)) return refusal("PERSISTENCE_FAILED", "Governance action could not be persisted.");
        const action = { operation: request.action, projectId: context.project.id, recordId: aggregate.recordId, expectedVersion: request.expectedVersion, reason: request.reason, occurredAt, ...(request.payload as Raw) };
        if ((request.action === "MERGE" || request.action === "SUPERSEDE") && typeof (request.payload as Raw).targetRecordId === "string") Object.assign(action, { targetAggregate: store.getArchitectureDebtAggregate({ projectId: context.project.id, recordId: (request.payload as Raw).targetRecordId }) });
        let verificationAttempted = false;
        const verifyReadBack = (current: typeof aggregate): boolean => {
          verificationAttempted = true;
          const refreshed = projectReadBack(context, baseline.source, { debtAggregates: baseline.source.debtAggregates.map((item) => record(item) && item.recordId === aggregate.recordId ? current : item) });
          const exact = refreshed?.architectureDebt.find((item) => item.recordId === aggregate.recordId);
          if (!refreshed || !exact || exact.eventVersion !== current.eventVersion || exact.state !== current.state || current.eventVersion !== request.expectedVersion + 1) return false;
          result = { version: current.eventVersion, key: aggregate.recordId, providerReceiptId: `${aggregate.recordId}:${current.eventVersion}`, recordedAt: occurredAt, refreshed };
          return true;
        };
        const delegated = recordArchitectureDebtTriage({ aggregate, authority: { actorId: authority.actorId, verifiedRole: "ARCHITECTURE_STEWARD" }, action, store, verifyReadBack });
        if (delegated.kind !== "committed") return refusal(verificationAttempted ? "PERSISTENCE_FAILED" : "PROVIDER_REFUSED", verificationAttempted ? "Governance action could not be read back." : "Governance provider refused the action.", aggregate.eventVersion);
        if (!result) return refusal("PERSISTENCE_FAILED", "Governance action could not be read back.");
      } finally { store.close(); }
    } else if (request.kind === "PILOT_ADMISSION" || request.kind === "PILOT_DISABLEMENT") {
      const now = context.now ?? (() => new Date().toISOString());
      // Preserve the exact migration audit surfaced by the preceding dashboard
      // read; action-store validation must not append a competing audit record.
      const store = new GovernanceRolloutSqliteStore(context.databasePath, now, context.project.id, false);
      try {
        const target = request.target as Raw;
        if (request.kind === "PILOT_ADMISSION") {
          const config = pilotConfig(); const projection = canonicalizeGovernanceParityV1(baseline.dashboard);
          if (!isGovernancePilotConfiguration(config) || !projection) return refusal("PILOT_PREREQUISITE_MISSING", "Pilot admission prerequisites are unavailable.");
          const admission = evaluateGovernancePilotAdmission({ store, projectId: context.project.id, config, target, payload: request.payload, expectedVersion: request.expectedVersion, reason: request.reason, authority, sourceVersionHash: projection.sourceVersionHash, now });
          if (admission.kind === "refusal") return refusal(admission.code, admission.code === "PILOT_EXPIRED" ? "Pilot approval has expired." : "Pilot admission prerequisites are unavailable.");
          const refreshed = { ...baseline.dashboard, rollout: admission.status } as Dashboard;
          result = { version: admission.status.eventVersion, key: admission.approval.pilotId, providerReceiptId: admission.approval.approvalReceiptId, recordedAt: admission.approval.approvedAt, refreshed };
        } else {
          const disableReason = (request.payload as Raw).disableReason;
          if (typeof target.pilotId !== "string" || typeof disableReason !== "string") return refusal("INVALID_REQUEST", "Pilot disablement request is invalid.");
          const disabled = disableGovernancePilot({ store, projectId: context.project.id, pilotId: target.pilotId, expectedVersion: request.expectedVersion, reason: disableReason, now });
          if (disabled.kind === "refusal") return refusal(disabled.code, "Pilot disablement prerequisites are unavailable.");
          const refreshed = { ...baseline.dashboard, rollout: disabled.status } as Dashboard;
          result = { version: disabled.status.eventVersion, key: target.pilotId, providerReceiptId: `${target.pilotId}:${disabled.status.eventVersion}`, recordedAt: now(), refreshed };
        }
      } finally { store.close(); }
    } else return refusal("ACTION_NOT_AVAILABLE", "This governance action is not available in the current rollout phase.");
  } catch { return refusal("PERSISTENCE_FAILED", "Governance action could not be persisted."); }
  if (!result) return refusal("PERSISTENCE_FAILED", "Governance action could not be read back.");
  return { kind: "governance_action_recorded", receipt: receipt(request, context.project.id, authority, result.version, result.key, result.recordedAt, result.providerReceiptId), refreshed: result.refreshed };
}
