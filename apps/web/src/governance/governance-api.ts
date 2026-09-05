import {
  projectGovernanceDashboardModel,
  type GovernanceActionReceiptV1,
  type GovernanceActionRefusalCodeV1,
  type GovernanceActionResultV1,
  type GovernanceDashboardReadV1,
  type GovernanceReadRefusalCode,
} from "@hepha/shared";

export class GovernanceApiError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = "GovernanceApiError";
  }
}

export type GovernanceDashboardResponse =
  | Readonly<{ kind: "dashboard"; data: GovernanceDashboardReadV1 }>
  | Readonly<{ kind: "refusal"; code: GovernanceReadRefusalCode; message: string }>;

type GovernanceRecord = Record<string, unknown>;

const readRefusalCodes = ["INVALID_REQUEST", "PROJECT_NOT_FOUND", "GOVERNANCE_STATE_CONFLICT", "GOVERNANCE_STORE_UNAVAILABLE", "UNSAFE_GOVERNANCE_PROJECTION"] as const;
const actionRefusalCodes = ["INVALID_REQUEST", "NON_LOOPBACK_REQUEST", "PROJECT_NOT_FOUND", "AUTHORITY_UNAVAILABLE", "CONFIRMATION_REQUIRED", "CONFIRMATION_MISMATCH", "STALE_VERSION", "FOREIGN_TARGET", "SELF_CONFLICT", "ACTION_NOT_AVAILABLE", "PROVIDER_REFUSED", "GOVERNANCE_STORE_UNAVAILABLE", "PERSISTENCE_FAILED", "PILOT_PREREQUISITE_MISSING", "PILOT_EXPIRED"] as const;
const actionKinds = ["SCOPE_EXPANSION_DECISION", "REPLAN_DECISION", "DEBT_TRIAGE", "FUTURE_TOUCH_DECISION", "PILOT_ADMISSION", "PILOT_DISABLEMENT"] as const;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new GovernanceApiError(response.status, "Governance service returned an invalid response.");
  }
}

function isRecord(value: unknown): value is GovernanceRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactRecord(value: unknown, keys: readonly string[]): value is GovernanceRecord {
  return isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && allowed.includes(value as T[number]);
}

function readDashboardResponse(value: unknown, projectId: string): GovernanceDashboardResponse | undefined {
  if (!isRecord(value) || typeof value.kind !== "string") return undefined;
  if (value.kind === "governance_read" && isExactRecord(value, ["kind", "data"])) {
    const data = projectGovernanceDashboardModel(value.data);
    return data && data.projectId === projectId ? Object.freeze({ kind: "dashboard" as const, data }) : undefined;
  }
  if (value.kind === "governance_read_refusal" && isExactRecord(value, ["kind", "code", "message"]) && isOneOf(value.code, readRefusalCodes) && isNonEmptyString(value.message)) {
    return Object.freeze({ kind: "refusal" as const, code: value.code, message: value.message });
  }
  return undefined;
}

function isReceiptAction(kind: string, action: unknown, role: unknown): boolean {
  if (kind === "SCOPE_EXPANSION_DECISION") return role === "FEATURE_OWNER" && isOneOf(action, ["ACCEPT_SCOPE_EXPANSION", "REJECT_SCOPE_EXPANSION"] as const);
  if (kind === "REPLAN_DECISION") return role === "ARCHITECTURE_STEWARD" && isOneOf(action, ["APPROVE_REPLAN", "REJECT_REPLAN"] as const);
  if (kind === "DEBT_TRIAGE") return role === "ARCHITECTURE_STEWARD" && isOneOf(action, ["CONFIRM", "REJECT", "MERGE", "REASSIGN", "DEFER", "ACCEPT_RISK", "PLAN_LINK", "CLOSE", "SUPERSEDE"] as const);
  if (kind === "FUTURE_TOUCH_DECISION") return role === "ARCHITECTURE_STEWARD" && isOneOf(action, ["REMEDIATE", "PREREQUISITE", "WAIVER", "NON_INTERACTION"] as const);
  if (kind === "PILOT_ADMISSION") return role === "ARCHITECTURE_STEWARD" && action === "APPROVE_PILOT";
  return kind === "PILOT_DISABLEMENT" && role === "ARCHITECTURE_STEWARD" && action === "DISABLE_PILOT";
}

function readReceipt(value: unknown, projectId: string, draft: GovernanceRecord): GovernanceActionReceiptV1 | undefined {
  const keys = ["actionId", "projectId", "kind", "action", "targetKey", "actorId", "authorizedRole", "reason", "expectedVersion", "resultingVersion", "recordedAt", "providerReceiptId"];
  if (!isExactRecord(value, keys) || !["actionId", "projectId", "kind", "action", "targetKey", "actorId", "authorizedRole", "reason", "recordedAt", "providerReceiptId"].every((key) => isNonEmptyString(value[key])) || !isNonNegativeInteger(value.expectedVersion) || !isNonNegativeInteger(value.resultingVersion) || value.projectId !== projectId || !isOneOf(value.kind, actionKinds) || !isReceiptAction(value.kind, value.action, value.authorizedRole) || value.actionId !== draft.actionId || value.kind !== draft.kind || value.action !== draft.action || value.reason !== draft.reason || value.expectedVersion !== draft.expectedVersion) return undefined;
  return Object.freeze({ ...value }) as unknown as GovernanceActionReceiptV1;
}

function readActionResponse(value: unknown, projectId: string, draft: GovernanceRecord): GovernanceActionResultV1 | undefined {
  if (!isRecord(value) || typeof value.kind !== "string") return undefined;
  if (value.kind === "governance_action_recorded" && isExactRecord(value, ["kind", "receipt", "refreshed"])) {
    const receipt = readReceipt(value.receipt, projectId, draft);
    const refreshed = projectGovernanceDashboardModel(value.refreshed);
    return receipt && refreshed && refreshed.projectId === projectId ? Object.freeze({ kind: "governance_action_recorded" as const, receipt, refreshed }) : undefined;
  }
  const refusalKeys = Object.prototype.hasOwnProperty.call(value, "currentVersion") ? ["kind", "code", "message", "currentVersion"] : ["kind", "code", "message"];
  if (value.kind === "governance_action_refusal" && isExactRecord(value, refusalKeys) && isOneOf(value.code, actionRefusalCodes) && isNonEmptyString(value.message) && (value.currentVersion === undefined || isNonNegativeInteger(value.currentVersion))) {
    return value.currentVersion === undefined
      ? Object.freeze({ kind: "governance_action_refusal" as const, code: value.code, message: value.message })
      : Object.freeze({ kind: "governance_action_refusal" as const, code: value.code, message: value.message, currentVersion: value.currentVersion });
  }
  return undefined;
}

function canonicalize(value: unknown): string | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = value.map(canonicalize);
    return items.every((item): item is string => item !== undefined) ? `[${items.join(",")}]` : undefined;
  }
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value).sort((left, right) => left === right ? 0 : left < right ? -1 : 1);
  const entries = keys.map((key) => {
    const child = canonicalize(value[key]);
    return child === undefined ? undefined : `${JSON.stringify(key)}:${child}`;
  });
  return entries.every((entry): entry is string => entry !== undefined) ? `{${entries.join(",")}}` : undefined;
}

async function actionDigest(request: GovernanceRecord): Promise<string> {
  const canonical = canonicalize(request);
  if (!canonical) throw new GovernanceApiError(0, "Governance action could not be prepared safely.");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function fetchGovernanceDashboard(projectId: string): Promise<GovernanceDashboardResponse> {
  let response: Response;
  try {
    response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/governance/dashboard`);
  } catch {
    throw new GovernanceApiError(0, "Unable to reach the governance service.");
  }
  const decoded = readDashboardResponse(await readJson(response), projectId);
  if (!decoded) throw new GovernanceApiError(response.status, "Governance service returned an unsafe dashboard response.");
  return decoded;
}

export async function submitGovernanceAction(projectId: string, draft: GovernanceRecord): Promise<GovernanceActionResultV1> {
  const request = { ...draft, confirmation: { statement: "I_CONFIRM_THIS_GOVERNANCE_ACTION", actionDigest: await actionDigest(draft) } };
  let response: Response;
  try {
    response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/governance/actions`, { body: JSON.stringify(request), headers: { "Content-Type": "application/json" }, method: "POST" });
  } catch {
    throw new GovernanceApiError(0, "Unable to reach the governance service.");
  }
  const decoded = readActionResponse(await readJson(response), projectId, draft);
  if (!decoded) throw new GovernanceApiError(response.status, "Governance service returned an unsafe action response.");
  return decoded;
}

export type GovernanceApi = Readonly<{ fetchDashboard: typeof fetchGovernanceDashboard; submitAction: typeof submitGovernanceAction }>;

export const governanceApi: GovernanceApi = { fetchDashboard: fetchGovernanceDashboard, submitAction: submitGovernanceAction };
