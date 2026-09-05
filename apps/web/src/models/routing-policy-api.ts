import {
  isRoutingMatrixAttentionAcknowledgeV1,
  isRoutingMatrixPreviewV1,
  isRoutingMatrixRowDraftV1,
  isRoutingMatrixSnapshotV1,
  selectorScopeKey,
  type RoutingMatrixAttentionAcknowledgeV1,
  type RoutingMatrixPreviewV1,
  type RoutingMatrixRowDraftV1,
  type RoutingMatrixSnapshotV1,
} from "@hepha/shared";

const BASE = "/api/agent-routing/matrix";
const routingErrorCodes = [
  "ROUTING_INVALID_REQUEST",
  "ROUTING_UNKNOWN_SCOPE",
  "ROUTING_INVALID_POLICY",
  "ROUTING_CAPABILITY_MISMATCH",
  "ROUTING_INVALID_HANDOFF_CHAIN",
  "ROUTING_ROUTE_UNAVAILABLE",
  "ROUTING_POLICY_CONFLICT",
  "ROUTING_BOOTSTRAP_REQUIRED",
  "ROUTING_GLOBAL_UNAVAILABLE",
  "ROUTING_ATTENTION_CONFLICT",
  "ROUTING_MATRIX_READ_FAILED",
] as const;
export type RoutingMatrixErrorCode = typeof routingErrorCodes[number];
const routingErrorCodeSet = new Set<string>(routingErrorCodes);

/** Carries only an allowlisted routing code and fixed presentation-safe text. */
export class RoutingPolicyPresentationError extends Error {
  constructor(readonly code: RoutingMatrixErrorCode | null = null) {
    super("Routing policy data is unavailable. Refresh and try again.");
  }
}

export interface RoutingPolicyApi {
  matrix(): Promise<RoutingMatrixSnapshotV1>;
  preview(input: RoutingMatrixRowDraftV1): Promise<RoutingMatrixPreviewV1>;
  save(input: RoutingMatrixRowDraftV1): Promise<RoutingMatrixSnapshotV1>;
  acknowledge(input: RoutingMatrixAttentionAcknowledgeV1): Promise<RoutingMatrixSnapshotV1>;
}

/** Adapts the closed routing-matrix HTTP surface and guards every response before use. */
export const routingPolicyApi: RoutingPolicyApi = {
  async matrix() {
    const body = await request(BASE);
    if (!isRoutingMatrixSnapshotV1(body)) throw new RoutingPolicyPresentationError();
    return body;
  },
  async preview(input) {
    if (!isRoutingMatrixRowDraftV1(input)) throw new RoutingPolicyPresentationError("ROUTING_INVALID_REQUEST");
    const body = await request(`${BASE}/preview`, "POST", input);
    if (!isRoutingMatrixPreviewV1(body)
      || body.policyId !== input.policyId
      || body.scopeKey !== selectorScopeKey(input.scope)
      || body.expectedRevision.revisionId !== input.expectedRevision.revisionId
      || body.expectedRevision.revisionNumber !== input.expectedRevision.revisionNumber
      || body.revisionGuard !== input.revisionGuard) throw new RoutingPolicyPresentationError();
    return body;
  },
  async save(input) {
    if (!isRoutingMatrixRowDraftV1(input)) throw new RoutingPolicyPresentationError("ROUTING_INVALID_REQUEST");
    const body = await request(`${BASE}/row`, "PUT", input);
    if (!isRoutingMatrixSnapshotV1(body) || !saveResponseSettlesInput(body, input)) throw new RoutingPolicyPresentationError();
    return body;
  },
  async acknowledge(input) {
    if (!isRoutingMatrixAttentionAcknowledgeV1(input)) throw new RoutingPolicyPresentationError("ROUTING_INVALID_REQUEST");
    const body = await request(`${BASE}/attention/acknowledge`, "POST", input);
    if (!isRoutingMatrixSnapshotV1(body) || !acknowledgementResponseSettlesInput(body, input)) throw new RoutingPolicyPresentationError();
    return body;
  },
};

function saveResponseSettlesInput(snapshot: RoutingMatrixSnapshotV1, input: RoutingMatrixRowDraftV1): boolean {
  if (snapshot.policy.policyId !== input.policyId
    || snapshot.policy.revisionNumber !== input.expectedRevision.revisionNumber + 1
    || snapshot.policy.revisionId === input.expectedRevision.revisionId
    || snapshot.policy.revisionGuard === input.revisionGuard) return false;
  const scopeKey = selectorScopeKey(input.scope);
  const row = snapshot.global.scopeKey === scopeKey
    ? snapshot.global
    : snapshot.groups.flatMap((group) => [group.typeDefault, ...group.actions]).find((candidate) => candidate.scopeKey === scopeKey);
  if (!row) return false;
  if (input.selection.kind === "inherit") return row.configured.kind === "inherit" && row.configuredFailurePolicy === null;
  return row.configured.kind === "route"
    && routeIdentityEquals(row.configured.route, input.selection.route)
    && failurePolicyEquals(row.configuredFailurePolicy, input.selection.failurePolicy);
}

function acknowledgementResponseSettlesInput(snapshot: RoutingMatrixSnapshotV1, input: RoutingMatrixAttentionAcknowledgeV1): boolean {
  if (snapshot.policy.policyId !== input.policyId
    || snapshot.policy.revisionId !== input.expectedRevision.revisionId
    || snapshot.policy.revisionNumber !== input.expectedRevision.revisionNumber
    || snapshot.policy.revisionGuard !== input.revisionGuard) return false;
  return snapshot.attention.some((attention) => attention.attentionId === input.attentionIdentity.attentionId
    && attention.attentionRevisionId === input.attentionIdentity.attentionRevisionId
    && routeIdentityEquals(attention.affectedRoute, input.attentionIdentity.affectedRoute)
    && attention.acknowledgedAt === input.acknowledgedAt);
}

function failurePolicyEquals(
  actual: RoutingMatrixSnapshotV1["global"]["configuredFailurePolicy"],
  expected: Extract<RoutingMatrixRowDraftV1["selection"], { kind: "route" }>["failurePolicy"],
): boolean {
  if (actual === null || actual.kind !== expected.kind) return false;
  return actual.kind !== "reroute_route_once"
    || expected.kind === "reroute_route_once" && routeIdentityEquals(actual.fallbackRoute, expected.fallbackRoute);
}

function routeIdentityEquals(
  left: { readonly connectionId: string; readonly modelId: string },
  right: { readonly connectionId: string; readonly modelId: string },
): boolean {
  return left.connectionId === right.connectionId && left.modelId === right.modelId;
}

async function request(path: string, method = "GET", body?: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new RoutingPolicyPresentationError();
  }
  if (!response.ok) {
    let errorBody: unknown = null;
    try { errorBody = await response.json(); } catch { /* Use the fixed presentation error. */ }
    throw new RoutingPolicyPresentationError(readErrorCode(errorBody));
  }
  try {
    return await response.json();
  } catch {
    throw new RoutingPolicyPresentationError();
  }
}

function readErrorCode(value: unknown): RoutingMatrixErrorCode | null {
  if (!record(value) || !exactKeys(value, ["error"]) || !record(value.error) || !exactKeys(value.error, ["code", "message"])
    || typeof value.error.code !== "string" || typeof value.error.message !== "string" || !routingErrorCodeSet.has(value.error.code)) return null;
  return value.error.code as RoutingMatrixErrorCode;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
