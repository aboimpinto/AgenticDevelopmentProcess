/** FEAT-068 V1 fail-closed controlled pilot admission, dispatch, and disablement. */
import { randomUUID } from "node:crypto";
import { GovernanceRolloutSqliteStore, type GovernancePilotApproval, type GovernanceRolloutStatus } from "@hepha/db";

export interface GovernancePilotConfiguration {
  readonly pilotId: string; readonly projectId: string; readonly featureId: string; readonly phaseContractId: string; readonly taskId: string; readonly contractVersion: number; readonly riskClassification: "LOW"; readonly allowedBoundary: "REVIEW_RECOVERY"; readonly pilotConfigHash: string;
}
export interface GovernancePilotCandidate { readonly projectId: string; readonly pilotId: string; readonly featureId: string; readonly phaseContractId: string; readonly taskId: string; readonly contractVersion: number; readonly pilotConfigHash: string; readonly sourceVersionHash: string; readonly occurredAt: string; readonly authorityAvailable: boolean; readonly recurrenceStopped: boolean; }
type Raw = Record<string, unknown>;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const HASH = /^[a-f0-9]{64}$/;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
function record(value: unknown): value is Raw { return typeof value === "object" && value !== null && !Array.isArray(value); }
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function utc(value: unknown): value is string { return typeof value === "string" && UTC.test(value) && Number.isFinite(Date.parse(value)); }
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 1024 && !/[\u0000-\u001f\u007f-\u009f]|[\ud800-\udfff]/.test(value) && !/(?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*\S+/i.test(value) && !/<\/?[A-Za-z][^>]*>|(?:javascript|data|vbscript)\s*:/i.test(value); }
function exact(value: Raw, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
export function isGovernancePilotConfiguration(value: unknown): value is GovernancePilotConfiguration {
  return record(value) && exact(value, ["pilotId", "projectId", "featureId", "phaseContractId", "taskId", "contractVersion", "riskClassification", "allowedBoundary", "pilotConfigHash"])
    && ["pilotId", "projectId", "featureId", "phaseContractId", "taskId"].every((key) => id(value[key])) && integer(value.contractVersion) && value.riskClassification === "LOW" && value.allowedBoundary === "REVIEW_RECOVERY" && hash(value.pilotConfigHash);
}
function sameConfig(config: GovernancePilotConfiguration, target: Raw, projectId: string): boolean {
  return config.projectId === projectId && config.pilotId === target.pilotId && config.featureId === target.featureId && config.phaseContractId === target.phaseContractId && config.taskId === target.taskId && config.contractVersion === target.contractVersion && config.pilotConfigHash === target.pilotConfigHash;
}
function currentPrerequisites(status: GovernanceRolloutStatus, projectId: string, parityReceiptId: unknown, migrationAuditId: unknown, sourceVersionHash: string, now: string): boolean {
  return status.parity !== null && status.migration !== null && status.parity.receiptId === parityReceiptId && status.parity.result === "MATCH" && status.parity.sourceVersionHash === sourceVersionHash && Date.parse(status.parity.validUntil) > Date.parse(now) && status.migration.auditId === migrationAuditId && (status.migration.outcome === "APPLIED" || status.migration.outcome === "ALREADY_CURRENT") && status.migration.readBackHash !== null;
}
export type GovernancePilotAdmissionResult = Readonly<{ kind: "admitted"; status: GovernanceRolloutStatus; approval: GovernancePilotApproval }> | Readonly<{ kind: "refusal"; code: "PILOT_PREREQUISITE_MISSING" | "PILOT_EXPIRED" | "PERSISTENCE_FAILED" }>;
/** Validates and persists exactly one steward-bound approval; it never dispatches work. */
export function evaluateGovernancePilotAdmission(raw: unknown): GovernancePilotAdmissionResult {
  if (!record(raw) || !exact(raw, ["store", "projectId", "config", "target", "payload", "expectedVersion", "reason", "authority", "sourceVersionHash", "now"]) || !(raw.store instanceof GovernanceRolloutSqliteStore) || !id(raw.projectId) || !isGovernancePilotConfiguration(raw.config) || !record(raw.target) || !record(raw.payload) || !integer(raw.expectedVersion) || !text(raw.reason) || !record(raw.authority) || !id(raw.authority.actorId) || raw.authority.role !== "ARCHITECTURE_STEWARD" || !hash(raw.sourceVersionHash) || typeof raw.now !== "function") return { kind: "refusal", code: "PILOT_PREREQUISITE_MISSING" };
  const now = raw.now(); if (!utc(now) || !sameConfig(raw.config, raw.target, raw.projectId) || !exact(raw.payload, ["parityReceiptId", "migrationAuditId", "expiresAt"]) || !id(raw.payload.parityReceiptId) || !id(raw.payload.migrationAuditId) || !utc(raw.payload.expiresAt)) return { kind: "refusal", code: "PILOT_PREREQUISITE_MISSING" };
  if (Date.parse(raw.payload.expiresAt) <= Date.parse(now) || Date.parse(raw.payload.expiresAt) - Date.parse(now) > 86400000) return { kind: "refusal", code: "PILOT_EXPIRED" };
  const current = raw.store.readStatus(raw.projectId); if (current.kind !== "success") return { kind: "refusal", code: "PERSISTENCE_FAILED" };
  if (current.value.mode !== "DISABLED" || current.value.eventVersion !== raw.expectedVersion || current.value.pilot !== null || !currentPrerequisites(current.value, raw.projectId, raw.payload.parityReceiptId, raw.payload.migrationAuditId, raw.sourceVersionHash, now)) return { kind: "refusal", code: "PILOT_PREREQUISITE_MISSING" };
  const approval: GovernancePilotApproval = { approvalReceiptId: `pilot-approval-${randomUUID()}`, pilotId: raw.config.pilotId, featureId: raw.config.featureId, phaseContractId: raw.config.phaseContractId, taskId: raw.config.taskId, contractVersion: raw.config.contractVersion, pilotConfigHash: raw.config.pilotConfigHash, actorId: raw.authority.actorId, authorizedRole: "ARCHITECTURE_STEWARD", reason: raw.reason, parityReceiptId: raw.payload.parityReceiptId, migrationAuditId: raw.payload.migrationAuditId, approvedAt: now, expiresAt: raw.payload.expiresAt, expectedVersion: raw.expectedVersion, resultingVersion: raw.expectedVersion + 1 };
  const saved = raw.store.appendPilotEvent({ projectId: raw.projectId, expectedVersion: raw.expectedVersion, pilotId: raw.config.pilotId, eventKind: "PILOT_ADMITTED", state: "ACTIVE", payload: approval, occurredAt: now });
  return saved.kind === "success" && saved.value.mode === "ACTIVE" ? { kind: "admitted", status: saved.value, approval } : { kind: "refusal", code: "PERSISTENCE_FAILED" };
}
export type GovernancePilotDispatchResult = "ALLOW_EXACT_PILOT" | "NEEDS_HUMAN" | "DENY";
function isGovernancePilotCandidate(value: unknown): value is GovernancePilotCandidate {
  return record(value) && exact(value, ["projectId", "pilotId", "featureId", "phaseContractId", "taskId", "contractVersion", "pilotConfigHash", "sourceVersionHash", "occurredAt", "authorityAvailable", "recurrenceStopped"])
    && ["projectId", "pilotId", "featureId", "phaseContractId", "taskId"].every((key) => id(value[key]))
    && integer(value.contractVersion) && hash(value.pilotConfigHash) && hash(value.sourceVersionHash) && utc(value.occurredAt)
    && typeof value.authorityAvailable === "boolean" && typeof value.recurrenceStopped === "boolean";
}
/** The sole admission-to-routing gate. It cannot select a candidate or invoke a dispatcher. */
export function evaluateGovernancePilotDispatch(raw: unknown): GovernancePilotDispatchResult {
  if (!record(raw) || !exact(raw, ["projectId", "status", "candidate"]) || !id(raw.projectId) || !isGovernancePilotCandidate(raw.candidate)) return "DENY";
  const trustedProjectId = raw.projectId; const candidate = raw.candidate; const status = raw.status as GovernanceRolloutStatus;
  if (candidate.projectId !== trustedProjectId) return "DENY";
  if (!status || status.mode !== "ACTIVE" || !status.pilot || !candidate.authorityAvailable || candidate.recurrenceStopped || Date.parse(candidate.occurredAt) >= Date.parse(status.pilot.expiresAt)) return "NEEDS_HUMAN";
  return status.pilot.pilotId === candidate.pilotId && status.pilot.featureId === candidate.featureId && status.pilot.phaseContractId === candidate.phaseContractId && status.pilot.taskId === candidate.taskId && status.pilot.contractVersion === candidate.contractVersion && status.pilot.pilotConfigHash === candidate.pilotConfigHash && status.parity?.result === "MATCH" && status.parity.sourceVersionHash === candidate.sourceVersionHash ? "ALLOW_EXACT_PILOT" : "DENY";
}
export type GovernancePilotDisablementResult = Readonly<{ kind: "disabled"; status: GovernanceRolloutStatus }> | Readonly<{ kind: "refusal"; code: "PILOT_PREREQUISITE_MISSING" | "PERSISTENCE_FAILED" }>;
/** Appends an auditable terminal V1 disablement and never restores a legacy lane. */
export function disableGovernancePilot(raw: unknown): GovernancePilotDisablementResult {
  if (!record(raw) || !exact(raw, ["store", "projectId", "pilotId", "expectedVersion", "reason", "now"]) || !(raw.store instanceof GovernanceRolloutSqliteStore) || !id(raw.projectId) || !id(raw.pilotId) || !integer(raw.expectedVersion) || !text(raw.reason) || typeof raw.now !== "function") return { kind: "refusal", code: "PILOT_PREREQUISITE_MISSING" };
  const now = raw.now(); if (!utc(now)) return { kind: "refusal", code: "PERSISTENCE_FAILED" }; const current = raw.store.readStatus(raw.projectId);
  if (current.kind !== "success") return { kind: "refusal", code: "PERSISTENCE_FAILED" };
  if (!current.value.pilot || current.value.pilot.pilotId !== raw.pilotId || current.value.eventVersion !== raw.expectedVersion || (current.value.mode !== "ACTIVE" && current.value.mode !== "NEEDS_HUMAN")) return { kind: "refusal", code: "PILOT_PREREQUISITE_MISSING" };
  const saved = raw.store.appendPilotEvent({ projectId: raw.projectId, expectedVersion: raw.expectedVersion, pilotId: raw.pilotId, eventKind: "DISABLED_BY_OPERATOR", state: "NEEDS_HUMAN", payload: { lastOutcome: "DISABLED_BY_OPERATOR" }, occurredAt: now });
  return saved.kind === "success" && saved.value.mode === "NEEDS_HUMAN" ? { kind: "disabled", status: saved.value } : { kind: "refusal", code: "PERSISTENCE_FAILED" };
}
