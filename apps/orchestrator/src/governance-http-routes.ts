/** FEAT-068 V1 governance HTTP adapters: safe GET reads and confirmed POST actions. */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { GovernanceActionResultV1, GovernanceReadResultV1 } from "@hepha/shared";
import { executeGovernanceAction, type GovernanceActionExecutionContext } from "./governance-action-service.js";
import { readGovernanceDashboard, type GovernanceReadProject, type GovernanceReadProvider } from "./governance-read-service.js";
import { readGovernanceRolloutStatus, type GovernanceRolloutStatusResult } from "./governance-parity-service.js";

export interface GovernanceReadRouteContext { findProject(projectId: string): GovernanceReadProject | undefined; readonly provider: GovernanceReadProvider; readonly databasePath?: string | null; }
export interface GovernanceActionRouteContext extends GovernanceReadRouteContext { readonly databasePath: string | null; readonly now?: GovernanceActionExecutionContext["now"]; }
const IDENTIFIER = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RECORD_ID = /^ARCH-DEBT-[a-f0-9]{32}$/;
function send(response: ServerResponse, status: number, body: GovernanceReadResultV1 | GovernanceActionResultV1 | GovernanceRolloutStatusResult): void { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(body)); }
function refusal(code: Extract<GovernanceReadResultV1, { kind: "governance_read_refusal" }>["code"], message: string): GovernanceReadResultV1 { return { kind: "governance_read_refusal", code, message }; }
function status(result: GovernanceReadResultV1): number { return result.kind === "governance_read" ? 200 : result.code === "INVALID_REQUEST" ? 400 : result.code === "PROJECT_NOT_FOUND" ? 404 : result.code === "GOVERNANCE_STATE_CONFLICT" ? 409 : 503; }
function safeIdentifier(value: string | null): value is string { return value !== null && value.length > 0 && value.length <= 256 && IDENTIFIER.test(value) && !/[\u0000-\u001f\u007f-\u009f]/.test(value); }
function safePhase(value: string | null): value is string { return value !== null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)); }
function decodedSegment(value: string | undefined): string | undefined {
  if (value === undefined || /%(?:2f|5c)/i.test(value)) return undefined;
  try { const decoded = decodeURIComponent(value); return decoded.includes("/") || decoded.includes("\\") || !safeIdentifier(decoded) ? undefined : decoded; } catch { return undefined; }
}
function exactQuery(url: URL, expected: readonly string[]): boolean {
  const keys = [...url.searchParams.keys()].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]) && expected.every((key) => url.searchParams.getAll(key).length === 1);
}
function detail(result: GovernanceReadResultV1, category: "replans" | "architectureDebt", id: string, selector?: URLSearchParams): GovernanceReadResultV1 {
  if (result.kind !== "governance_read") return result;
  if (category === "replans") {
    const found = result.data.replans.find((value) => value.aggregateId === id);
    const selectorMatches = found !== undefined && selector !== undefined && found.featureId === selector.get("featureId") && found.phaseNumber === Number(selector.get("phaseNumber")) && found.reviewGateId === selector.get("reviewGateId") && found.defectClass === selector.get("defectClass");
    return selectorMatches ? { kind: "governance_read", data: Object.freeze({ ...result.data, replans: Object.freeze([found!]) }) } : refusal("GOVERNANCE_STATE_CONFLICT", "Governance detail does not belong to this project.");
  }
  const found = result.data.architectureDebt.find((value) => value.recordId === id);
  return found ? { kind: "governance_read", data: Object.freeze({ ...result.data, architectureDebt: Object.freeze([found]) }) } : refusal("GOVERNANCE_STATE_CONFLICT", "Governance detail does not belong to this project.");
}

/** Returns true only when this adapter owned the request. */
export async function handleGovernanceReadRoute(request: IncomingMessage, response: ServerResponse, context: GovernanceReadRouteContext): Promise<boolean> {
  if (request.method !== "GET") return false;
  let url: URL;
  try { url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`); } catch { return false; }
  const match = url.pathname.match(/^\/api\/projects\/([^/]*)\/governance\/(dashboard|rollout-status|replans\/([^/]*)|architecture-debt\/([^/]*))$/);
  if (!match) return false;
  const projectId = decodedSegment(match[1]);
  const kind = match[2]!;
  // Validate every selector before project discovery or provider load.
  if (!projectId) { send(response, 400, refusal("INVALID_REQUEST", "Project selector is invalid.")); return true; }
  let replanId: string | undefined; let debtId: string | undefined;
  if (kind.startsWith("replans/")) {
    replanId = decodedSegment(match[3]);
    if (!replanId || !exactQuery(url, ["defectClass", "featureId", "phaseNumber", "reviewGateId"]) || !safeIdentifier(url.searchParams.get("featureId")) || !safePhase(url.searchParams.get("phaseNumber")) || !safeIdentifier(url.searchParams.get("reviewGateId")) || !safeIdentifier(url.searchParams.get("defectClass"))) { send(response, 400, refusal("INVALID_REQUEST", "Replan selector is invalid.")); return true; }
  } else if (kind.startsWith("architecture-debt/")) {
    try { debtId = decodeURIComponent(match[4]!); } catch { debtId = undefined; }
    if (!debtId || /%(?:2f|5c)/i.test(match[4]!) || !RECORD_ID.test(debtId) || !exactQuery(url, [])) { send(response, 400, refusal("INVALID_REQUEST", "Architecture-debt selector is invalid.")); return true; }
  } else if (!exactQuery(url, [])) { send(response, 400, refusal("INVALID_REQUEST", "Dashboard request is invalid.")); return true; }
  const project = context.findProject(projectId);
  if (!project) { send(response, 404, refusal("PROJECT_NOT_FOUND", "Project is not registered.")); return true; }
  if (kind === "rollout-status") {
    if (!context.databasePath) { send(response, 503, { kind: "governance_rollout_refusal", code: "GOVERNANCE_STORE_UNAVAILABLE", message: "Governance rollout storage is unavailable." }); return true; }
    const rollout = readGovernanceRolloutStatus({ databasePath: context.databasePath, projectId });
    send(response, rollout.kind === "governance_rollout_status" ? 200 : rollout.code === "INVALID_REQUEST" ? 400 : 503, rollout);
    return true;
  }
  const dashboard = readGovernanceDashboard({ project, provider: context.provider });
  const result = kind === "dashboard" ? dashboard : detail(dashboard, kind.startsWith("replans/") ? "replans" : "architectureDebt", replanId ?? debtId ?? "", kind.startsWith("replans/") ? url.searchParams : undefined);
  if (result.kind === "governance_read" && context.databasePath) {
    const rollout = readGovernanceRolloutStatus({ databasePath: context.databasePath, projectId });
    if (rollout.kind !== "governance_rollout_status") { send(response, 503, refusal("GOVERNANCE_STORE_UNAVAILABLE", "Governance rollout state cannot be read safely.")); return true; }
    send(response, 200, { kind: "governance_read", data: Object.freeze({ ...result.data, rollout: rollout.status }) });
  } else send(response, status(result), result);
  return true;
}

function actionRefusal(code: Extract<GovernanceActionResultV1, { kind: "governance_action_refusal" }>["code"], message: string): GovernanceActionResultV1 { return { kind: "governance_action_refusal", code, message }; }
function loopback(address: string | undefined): boolean { return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1"; }
async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.length; if (size > 64 * 1024) throw new Error("body-too-large"); chunks.push(value); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** POST adapter: socket identity is checked before any untrusted body is read. */
export async function handleGovernanceActionRoute(request: IncomingMessage, response: ServerResponse, context: GovernanceActionRouteContext): Promise<boolean> {
  if (request.method !== "POST") return false;
  let url: URL; try { url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`); } catch { return false; }
  const match = url.pathname.match(/^\/api\/projects\/([^/]*)\/governance\/actions$/);
  if (!match) return false;
  // A proxy header is never local authority. Refuse it before body iteration,
  // project lookup, provider loading, or any action/digest work.
  if (!loopback(request.socket.remoteAddress) || request.headers.forwarded !== undefined || request.headers["x-forwarded-for"] !== undefined) { send(response, 403, actionRefusal("NON_LOOPBACK_REQUEST", "Governance actions require a direct loopback connection.")); return true; }
  const projectId = decodedSegment(match[1]);
  if (!projectId || !exactQuery(url, [])) { send(response, 400, actionRefusal("INVALID_REQUEST", "Governance action route is invalid.")); return true; }
  const project = context.findProject(projectId);
  if (!project) { send(response, 404, actionRefusal("PROJECT_NOT_FOUND", "Project is not registered.")); return true; }
  if (!context.databasePath) { send(response, 503, actionRefusal("GOVERNANCE_STORE_UNAVAILABLE", "Governance storage is unavailable.")); return true; }
  let body: unknown; try { body = await readJsonBody(request); } catch { send(response, 400, actionRefusal("INVALID_REQUEST", "Governance action body is invalid.")); return true; }
  const result = executeGovernanceAction({ request: body, context: { project, readProvider: context.provider, databasePath: context.databasePath, ...(context.now ? { now: context.now } : {}) } });
  const status = result.kind === "governance_action_recorded" ? 200 : result.code === "PROJECT_NOT_FOUND" ? 404 : result.code === "NON_LOOPBACK_REQUEST" ? 403 : result.code === "GOVERNANCE_STORE_UNAVAILABLE" || result.code === "PERSISTENCE_FAILED" ? 503 : result.code === "STALE_VERSION" || result.code === "FOREIGN_TARGET" || result.code === "SELF_CONFLICT" ? 409 : 400;
  send(response, status, result); return true;
}
