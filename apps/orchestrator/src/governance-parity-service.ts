/** FEAT-068 V1 deterministic shadow parity and safe rollout-status composition. */
import { createHash, randomUUID } from "node:crypto";
import { GovernanceRolloutSqliteStore, type GovernanceRolloutStatus } from "@hepha/db";
import { projectGovernanceDashboardModel, type GovernanceDashboardReadV1 } from "@hepha/shared";

export type GovernanceParityResult =
  | Readonly<{ kind: "governance_parity_recorded"; receipt: GovernanceParityReceiptV1 }>
  | Readonly<{ kind: "governance_parity_refusal"; code: "INVALID_PROJECTION" | "FOREIGN_PROJECTION" | "PERSISTENCE_FAILED"; message: string }>;
export type GovernanceRolloutStatusResult =
  | Readonly<{ kind: "governance_rollout_status"; status: GovernanceRolloutStatus }>
  | Readonly<{ kind: "governance_rollout_refusal"; code: "INVALID_REQUEST" | "GOVERNANCE_STORE_UNAVAILABLE"; message: string }>;
export interface GovernanceParityReceiptV1 {
  readonly receiptId: string; readonly projectId: string; readonly projectionSchema: "hepha-governance-parity/v1";
  readonly sourceVersionHash: string; readonly authoritativeHash: string; readonly dashboardHash: string;
  readonly result: "MATCH" | "MISMATCH"; readonly differenceCategories: readonly ("SCHEMA" | "PROJECT" | "SOURCE_VERSION" | "REPLAN" | "DEBT" | "QUEUE" | "METRICS")[];
  readonly differenceCount: number; readonly comparedAt: string; readonly validUntil: string;
}
type RecordValue = Record<string, unknown>;
const CATEGORY_ORDER = ["SCHEMA", "PROJECT", "SOURCE_VERSION", "REPLAN", "DEBT", "QUEUE", "METRICS"] as const;
function record(value: unknown): value is RecordValue { return typeof value === "object" && value !== null && !Array.isArray(value); }
function compare(left: string, right: string): number { return left === right ? 0 : left < right ? -1 : 1; }
function hash(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function canonicalJson(value: unknown): string | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) return JSON.stringify(value);
  if (Array.isArray(value)) { const members = value.map(canonicalJson); return members.every((entry): entry is string => entry !== undefined) ? `[${members.join(",")}]` : undefined; }
  if (!record(value)) return undefined;
  const entries = Object.keys(value).sort(compare).map((key) => { const child = canonicalJson(value[key]); return child === undefined ? undefined : `${JSON.stringify(key)}:${child}`; });
  return entries.every((entry): entry is string => entry !== undefined) ? `{${entries.join(",")}}` : undefined;
}
function safeString(value: string): boolean {
  return value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f\u007f-\u009f]/.test(value)
    && !/(?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*\S+/i.test(value)
    && !/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(value) && !/<\/?[A-Za-z][^>]*>/.test(value)
    && !/(?:javascript|data|vbscript)\s*:/i.test(value) && !/^(?:[A-Za-z]:[\\/]|[\\/])/.test(value) && !value.split(/[\\/]/).includes("..");
}
function safeValue(value: unknown): boolean { if (typeof value === "string") return safeString(value); if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return true; return Array.isArray(value) ? value.every(safeValue) : record(value) && Object.values(value).every(safeValue); }
function sortStrings(value: unknown): unknown { return Array.isArray(value) ? [...value].sort((left, right) => compare(String(left), String(right))) : value; }
function canonicalProjection(input: GovernanceDashboardReadV1): RecordValue {
  const copy = JSON.parse(JSON.stringify(input)) as RecordValue;
  // The dashboard transport discriminator must never enter parity bytes or hashes.
  copy.schemaVersion = "hepha-governance-parity/v1";
  copy.sourceVersionHash = sourceVersionHash(input);
  delete copy.rollout;
  const remediations = copy.remediations as RecordValue[];
  remediations.sort((left, right) => compare(String(left.reviewRunId), String(right.reviewRunId)));
  for (const remediation of remediations) {
    (remediation.findings as RecordValue[]).sort((left, right) => compare(String(left.findingId), String(right.findingId)));
    (remediation.receipts as RecordValue[]).sort((left, right) => compare(`${left.findingId}\0${left.subjectKind}\0${left.subjectId}`, `${right.findingId}\0${right.subjectKind}\0${right.subjectId}`));
  }
  const replans = copy.replans as RecordValue[];
  replans.sort((left, right) => compare(String(left.aggregateId), String(right.aggregateId)));
  for (const replan of replans) {
    (replan.scopeExpansionDecisions as RecordValue[]).sort((left, right) => Number(left.resultingVersion) - Number(right.resultingVersion) || compare(String(left.decisionId), String(right.decisionId)));
    (replan.replanDecisions as RecordValue[]).sort((left, right) => Number(left.resultingVersion) - Number(right.resultingVersion) || compare(String(left.decisionId), String(right.decisionId)));
    replan.availableActions = sortStrings(replan.availableActions);
  }
  const debt = copy.architectureDebt as RecordValue[];
  debt.sort((left, right) => compare(String(left.recordId), String(right.recordId)));
  for (const item of debt) {
    (item.locations as RecordValue[]).sort((left, right) => compare(`${left.relativePath}\0${left.symbol ?? ""}\0${left.locationId}`, `${right.relativePath}\0${right.symbol ?? ""}\0${right.locationId}`));
    (item.futureTouchDecisions as RecordValue[]).sort((left, right) => compare(String(left.decisionId), String(right.decisionId)));
    for (const location of item.locations as RecordValue[]) location.ruleTags = sortStrings(location.ruleTags);
    const trigger = item.futureTouchTrigger as RecordValue; for (const field of ["paths", "symbols", "ruleTags"]) trigger[field] = sortStrings(trigger[field]);
    item.availableActions = sortStrings(item.availableActions);
  }
  const urgency = { SCOPE_EXPANSION: 0, P0: 1, REPLAN_APPROVAL: 2, REPLAN_REQUIRED: 3, P1: 4, P2: 5, P3: 6, INFORMATIONAL: 7 } as Record<string, number>;
  const kind = { REMEDIATION: 0, REPLAN: 1, ARCHITECTURE_DEBT: 2 } as Record<string, number>;
  (copy.queue as RecordValue[]).sort((left, right) => Number(right.requiresAction) - Number(left.requiresAction) || urgency[String(left.urgency)]! - urgency[String(right.urgency)]! || kind[String(left.itemKind)]! - kind[String(right.itemKind)]! || compare(String(left.itemId), String(right.itemId)));
  for (const item of copy.queue as RecordValue[]) item.availableActions = sortStrings(item.availableActions);
  const metrics = copy.metrics as RecordValue; for (const value of Object.values(metrics)) if (Array.isArray(value)) value.sort((left, right) => compare(String((left as RecordValue).key), String((right as RecordValue).key)));
  return copy;
}
function sourceVersionHash(value: GovernanceDashboardReadV1): string {
  const tuples = [
    ...value.remediations.map((entry) => `review:${entry.reviewRunId}:${entry.manifestHash}:${entry.gate.gateState}:${entry.cycleState}`),
    ...value.replans.map((entry) => `replan:${entry.aggregateId}:${entry.eventVersion}`),
    ...value.architectureDebt.map((entry) => `debt:${entry.recordId}:${entry.eventVersion}`),
  ].sort(compare);
  return hash(tuples.join("\n"));
}
function categories(authoritative: RecordValue, dashboard: RecordValue, authoritativeSource: string, dashboardSource: string): GovernanceParityReceiptV1["differenceCategories"] {
  const categories: string[] = [];
  if (authoritative.schemaVersion !== dashboard.schemaVersion) categories.push("SCHEMA");
  if (authoritative.projectId !== dashboard.projectId) categories.push("PROJECT");
  if (authoritativeSource !== dashboardSource || canonicalJson((authoritative.remediations as unknown)) !== canonicalJson(dashboard.remediations)) categories.push("SOURCE_VERSION");
  if (canonicalJson(authoritative.replans) !== canonicalJson(dashboard.replans)) categories.push("REPLAN");
  if (canonicalJson(authoritative.architectureDebt) !== canonicalJson(dashboard.architectureDebt)) categories.push("DEBT");
  if (canonicalJson(authoritative.queue) !== canonicalJson(dashboard.queue)) categories.push("QUEUE");
  if (canonicalJson(authoritative.metrics) !== canonicalJson(dashboard.metrics)) categories.push("METRICS");
  return categories.sort((left, right) => CATEGORY_ORDER.indexOf(left as never) - CATEGORY_ORDER.indexOf(right as never)) as GovernanceParityReceiptV1["differenceCategories"];
}
function refusal(code: Extract<GovernanceParityResult, { kind: "governance_parity_refusal" }>["code"], message: string): GovernanceParityResult { return Object.freeze({ kind: "governance_parity_refusal", code, message }); }

/** Canonicalizes the exact V1 parity projection without importing browser code. */
export function canonicalizeGovernanceParityV1(raw: unknown): Readonly<{ projection: RecordValue; bytes: string; hash: string; sourceVersionHash: string }> | undefined {
  const model = projectGovernanceDashboardModel(raw);
  if (!model || !safeValue(model)) return undefined;
  const projection = canonicalProjection(model); const bytes = canonicalJson(projection);
  return bytes === undefined ? undefined : Object.freeze({ projection: Object.freeze(projection), bytes, hash: hash(bytes), sourceVersionHash: sourceVersionHash(model) });
}

/** Records only canonical hashes and category names; mismatch values never enter SQLite. */
export function recordGovernanceParity(raw: unknown): GovernanceParityResult {
  if (!record(raw) || Object.keys(raw).length !== 5 || !["databasePath", "projectId", "authoritative", "dashboard", "now"].every((key) => Object.prototype.hasOwnProperty.call(raw, key)) || typeof raw.databasePath !== "string" || typeof raw.projectId !== "string" || typeof raw.now !== "function") return refusal("INVALID_PROJECTION", "Governance parity request is invalid.");
  const authoritative = canonicalizeGovernanceParityV1(raw.authoritative); const dashboard = canonicalizeGovernanceParityV1(raw.dashboard);
  if (!authoritative || !dashboard) return refusal("INVALID_PROJECTION", "Governance parity projection is unsafe or incomplete.");
  if ((authoritative.projection.projectId !== raw.projectId) || (dashboard.projection.projectId !== raw.projectId)) return refusal("FOREIGN_PROJECTION", "Governance parity projection does not belong to this project.");
  const now = raw.now as () => string;
  const comparedAt = now(); if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(comparedAt)) return refusal("INVALID_PROJECTION", "Governance parity clock is invalid.");
  const differenceCategories = categories(authoritative.projection, dashboard.projection, authoritative.sourceVersionHash, dashboard.sourceVersionHash);
  const receipt: GovernanceParityReceiptV1 = { receiptId: `parity-${randomUUID()}`, projectId: raw.projectId, projectionSchema: "hepha-governance-parity/v1", sourceVersionHash: authoritative.sourceVersionHash, authoritativeHash: authoritative.hash, dashboardHash: dashboard.hash, result: differenceCategories.length === 0 && authoritative.bytes === dashboard.bytes && authoritative.hash === dashboard.hash ? "MATCH" : "MISMATCH", differenceCategories, differenceCount: differenceCategories.length, comparedAt, validUntil: new Date(Date.parse(comparedAt) + 24 * 60 * 60 * 1000).toISOString() };
  let store: GovernanceRolloutSqliteStore;
  try { store = new GovernanceRolloutSqliteStore(raw.databasePath, now, raw.projectId); } catch { return refusal("PERSISTENCE_FAILED", "Governance rollout storage is unavailable."); }
  try { const saved = store.appendParityReceipt(receipt); return saved.kind === "success" ? Object.freeze({ kind: "governance_parity_recorded", receipt }) : refusal("PERSISTENCE_FAILED", "Governance parity receipt could not be verified."); } finally { store.close(); }
}

function projectGovernanceRolloutStatusV1(status: GovernanceRolloutStatus): GovernanceRolloutStatus {
  return Object.freeze({
    mode: status.mode,
    eventVersion: status.eventVersion,
    parity: status.parity === null ? null : Object.freeze({
      receiptId: status.parity.receiptId, projectionSchema: status.parity.projectionSchema,
      sourceVersionHash: status.parity.sourceVersionHash, authoritativeHash: status.parity.authoritativeHash,
      dashboardHash: status.parity.dashboardHash, result: status.parity.result,
      differenceCategories: status.parity.differenceCategories, comparedAt: status.parity.comparedAt, validUntil: status.parity.validUntil,
    }),
    migration: status.migration === null ? null : Object.freeze({
      auditId: status.migration.auditId, schemaArea: status.migration.schemaArea, fromVersion: status.migration.fromVersion,
      toVersion: status.migration.toVersion, outcome: status.migration.outcome, completedAt: status.migration.completedAt, readBackHash: status.migration.readBackHash,
    }),
    pilot: null,
  });
}

export function readGovernanceRolloutStatus(raw: unknown): GovernanceRolloutStatusResult {
  if (!record(raw) || Object.keys(raw).length !== 2 || typeof raw.databasePath !== "string" || typeof raw.projectId !== "string") return Object.freeze({ kind: "governance_rollout_refusal", code: "INVALID_REQUEST", message: "Governance rollout request is invalid." });
  let store: GovernanceRolloutSqliteStore;
  try { store = new GovernanceRolloutSqliteStore(raw.databasePath, undefined, raw.projectId); } catch { return Object.freeze({ kind: "governance_rollout_refusal", code: "GOVERNANCE_STORE_UNAVAILABLE", message: "Governance rollout storage is unavailable." }); }
  try { const status = store.readStatus(raw.projectId); return status.kind === "success" ? Object.freeze({ kind: "governance_rollout_status", status: projectGovernanceRolloutStatusV1(status.value) }) : Object.freeze({ kind: "governance_rollout_refusal", code: "GOVERNANCE_STORE_UNAVAILABLE", message: "Governance rollout state cannot be read safely." }); } finally { store.close(); }
}
