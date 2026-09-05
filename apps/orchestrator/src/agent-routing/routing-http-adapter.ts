import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  isRoutingMatrixAttentionAcknowledgeV1,
  isRoutingMatrixRowDraftV1,
  type RoutingPolicyErrorCode,
} from "@hepha/shared";
import type { RoutingMatrixServiceErrorCode, RoutingPolicyService } from "./routing-policy-service.js";
import { sendJson } from "../transport/http/send-json.js";

/** Owns the closed, secret-safe HTTP projection of routing policy operations. */
export async function handleAgentRoutingHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  service: RoutingPolicyService,
): Promise<boolean> {
  if (url.pathname === "/api/agent-routing/matrix" && request.method === "GET") {
    if (!await isEmpty(request)) return invalid(response);
    return sendResult(response, service.getRoutingMatrix());
  }
  if (url.pathname === "/api/agent-routing/matrix/preview" && request.method === "POST") {
    const body = await readBody(request);
    if (!isRoutingMatrixRowDraftV1(body)) return invalid(response);
    return sendResult(response, service.previewRoutingMatrixRow(body));
  }
  if (url.pathname === "/api/agent-routing/matrix/row" && request.method === "PUT") {
    const body = await readBody(request);
    if (!isRoutingMatrixRowDraftV1(body)) return invalid(response);
    return sendResult(response, service.saveRoutingMatrixRow(body));
  }
  if (url.pathname === "/api/agent-routing/matrix/attention/acknowledge" && request.method === "POST") {
    const body = await readBody(request);
    if (!isRoutingMatrixAttentionAcknowledgeV1(body)) return invalid(response);
    return sendResult(response, service.acknowledgeRoutingMatrixAttention(body));
  }
  if (url.pathname === "/api/agent-routing/resolve" && request.method === "POST") {
    const body = await readBody(request);
    if (body === null) return invalid(response);
    const result = service.resolve(body);
    if (!result.ok) { rejection(response, result.code, result.message); return true; }
    sendJson(response, 200, { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, plan: result.plan });
    return true;
  }
  const preflight = url.pathname.match(/^\/api\/agent-routing\/connections\/([^/]*)\/deletion-preflight$/);
  if (preflight && request.method === "GET") {
    if (!await isEmpty(request)) return invalid(response);
    const connectionId = decodePathSegment(preflight[1]);
    if (connectionId === null) return invalid(response);
    const result = service.deletionPreflight(connectionId);
    if (!result.canDelete) { rejection(response, "ROUTING_GLOBAL_DELETE_BLOCKED", "A replacement Global Default is required before deleting this connection."); return true; }
    sendJson(response, 200, { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, ...result });
    return true;
  }
  return false;
}

function sendResult<T>(response: ServerResponse, result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: RoutingMatrixServiceErrorCode; readonly message: string }): true {
  if (!result.ok) { rejection(response, result.code, result.message); return true; }
  sendJson(response, 200, result.value);
  return true;
}
function invalid(response: ServerResponse): true { rejection(response, "ROUTING_INVALID_REQUEST", "Routing request is invalid."); return true; }
function rejection(
  response: ServerResponse,
  code: RoutingPolicyErrorCode | RoutingMatrixServiceErrorCode | "ROUTING_UNKNOWN_ACTION" | "ROUTING_GLOBAL_DELETE_BLOCKED",
  message: string,
): void {
  const statuses: Readonly<Record<string, number>> = {
    ROUTING_INVALID_REQUEST: 400,
    ROUTING_UNKNOWN_ACTION: 404,
    ROUTING_UNKNOWN_SCOPE: 404,
    ROUTING_INVALID_POLICY: 422,
    ROUTING_CAPABILITY_MISMATCH: 422,
    ROUTING_INVALID_HANDOFF_CHAIN: 422,
    ROUTING_ROUTE_UNAVAILABLE: 409,
    ROUTING_POLICY_CONFLICT: 409,
    ROUTING_BOOTSTRAP_REQUIRED: 409,
    ROUTING_GLOBAL_UNAVAILABLE: 409,
    ROUTING_ATTENTION_CONFLICT: 409,
    ROUTING_GLOBAL_DELETE_BLOCKED: 409,
    ROUTING_MATRIX_READ_FAILED: 500,
  };
  sendJson(response, statuses[code] ?? 400, { error: { code, message } });
}
async function readBody(request: IncomingMessage): Promise<unknown | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  try { const text = Buffer.concat(chunks).toString("utf8"); return text ? JSON.parse(text) : null; } catch { return null; }
}
async function isEmpty(request: IncomingMessage): Promise<boolean> {
  if (new URL(request.url ?? "/", "http://localhost").search) return false;
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).length === 0;
}

/** Decodes one canonical route path segment without allowing traversal-like identifiers. */
function decodePathSegment(segment: string): string | null {
  if (!segment || /%2f|%5c/i.test(segment)) return null;
  try {
    const decoded = decodeURIComponent(segment);
    return decoded && decoded.length <= 512 && decoded.trim() === decoded && !/[\\/]/.test(decoded) && !/%[0-9a-f]{2}/i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
