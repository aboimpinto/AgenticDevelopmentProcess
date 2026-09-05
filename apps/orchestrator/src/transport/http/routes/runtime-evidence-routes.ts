import type { IncomingMessage, ServerResponse } from "node:http";
import type { DirectHostEvidenceRecordResult } from "../../../application/runtime-evidence/direct-host-runtime-evidence-application.js";
import type {
  RuntimeEvidenceReadErrorCode,
  RuntimeEvidenceReadResult,
} from "../../../application/runtime-evidence/runtime-evidence-application.js";
import { decodeRuntimeEvidenceCursor } from "../../../application/runtime-evidence/runtime-evidence-cursor.js";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

export interface RuntimeEvidenceRoutesContext {
  readFeature(input: unknown): Promise<RuntimeEvidenceReadResult<unknown>>;
  readPhase(input: unknown): Promise<RuntimeEvidenceReadResult<unknown>>;
  recordDirect(input: unknown): Promise<DirectHostEvidenceRecordResult>;
}

/** Owns summary/detail reads and direct-host runtime-evidence recording over HTTP. */
export async function handleRuntimeEvidenceRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: RuntimeEvidenceRoutesContext,
): Promise<boolean> {
  const direct = url.pathname.match(/^\/api\/projects\/([^/]+)\/features\/([^/]+)\/runtime-evidence\/direct-host$/u);
  if (request.method === "POST" && direct?.[1] && direct[2]) {
    const identity = decodeIdentity(direct.slice(1, 3));
    if (!identity || url.search.length > 0) {
      sendRejection(response, "RUNTIME_EVIDENCE_INVALID_REQUEST");
      return true;
    }
    const input = await readJson<unknown>(request);
    if (!record(input) || input.projectId !== identity[0] || input.cardKey !== identity[1]) {
      sendRejection(response, "RUNTIME_EVIDENCE_INVALID_REQUEST");
      return true;
    }
    sendRecordResult(response, await context.recordDirect(input));
    return true;
  }

  const detail = url.pathname.match(/^\/api\/projects\/([^/]+)\/features\/([^/]+)\/runtime-evidence\/phases\/([^/]+)\/executions$/u);
  if (request.method === "GET" && detail?.[1] && detail[2] && detail[3]) {
    const identity = decodeIdentity(detail.slice(1, 4));
    const query = parseDetailQuery(url.searchParams);
    if (!identity || !query) {
      sendRejection(response, "RUNTIME_EVIDENCE_INVALID_REQUEST");
      return true;
    }
    const cursor = query.cursor;
    if (cursor !== null && decodeRuntimeEvidenceCursor(cursor) === null) {
      sendRejection(response, "RUNTIME_EVIDENCE_INVALID_CURSOR");
      return true;
    }
    sendResult(response, await context.readPhase({
      projectId: identity[0],
      cardKey: identity[1],
      phaseExecutionContractId: identity[2],
      cursor,
      limit: query.limit,
    }));
    return true;
  }

  const summary = url.pathname.match(/^\/api\/projects\/([^/]+)\/features\/([^/]+)\/runtime-evidence$/u);
  if (request.method === "GET" && summary?.[1] && summary[2]) {
    if (url.search.length > 0) {
      sendRejection(response, "RUNTIME_EVIDENCE_INVALID_REQUEST");
      return true;
    }
    const identity = decodeIdentity(summary.slice(1, 3));
    if (!identity) {
      sendRejection(response, "RUNTIME_EVIDENCE_INVALID_REQUEST");
      return true;
    }
    sendResult(response, await context.readFeature({ projectId: identity[0], cardKey: identity[1] }));
    return true;
  }
  return false;
}

function parseDetailQuery(search: URLSearchParams): { cursor: string | null; limit: number } | null {
  const keys = [...search.keys()];
  if (keys.some((key) => key !== "cursor" && key !== "limit") || new Set(keys).size !== keys.length) return null;
  const rawCursor = search.get("cursor");
  const rawLimit = search.get("limit");
  if (rawCursor === "" || rawCursor !== null && (rawCursor.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(rawCursor))) return null;
  if (rawLimit === null) return { cursor: rawCursor, limit: 32 };
  if (!/^(?:[1-9]|[1-5][0-9]|6[0-4])$/u.test(rawLimit)) return null;
  return { cursor: rawCursor, limit: Number.parseInt(rawLimit, 10) };
}

function decodeIdentity(values: readonly string[]): string[] | null {
  try {
    const decoded = values.map(decodeURIComponent);
    return decoded.every((value) => text(value, 512)) ? decoded : null;
  } catch {
    return null;
  }
}

function sendRecordResult(response: ServerResponse, result: DirectHostEvidenceRecordResult): void {
  if (result.ok) { sendJson(response, 201, result.value); return; }
  const status = result.code === "RUNTIME_EVIDENCE_NOT_FOUND" ? 404
    : result.code === "RUNTIME_PERSISTENCE_CONFLICT" ? 409
      : result.code === "RUNTIME_EVIDENCE_UNAVAILABLE" ? 500 : 400;
  sendJson(response, status, {
    error: status === 404 ? "Runtime evidence target was not found."
      : status === 409 ? "Runtime evidence identity conflicts with an existing record."
        : status === 500 ? "Runtime evidence is unavailable."
          : "Direct-host runtime evidence is invalid.",
    code: result.code,
  });
}
function sendResult(response: ServerResponse, result: RuntimeEvidenceReadResult<unknown>): void {
  if (result.ok) { sendJson(response, 200, result.value); return; }
  sendRejection(response, result.code);
}
function sendRejection(response: ServerResponse, code: RuntimeEvidenceReadErrorCode): void {
  const status = code === "RUNTIME_EVIDENCE_NOT_FOUND" ? 404
    : code === "RUNTIME_EVIDENCE_UNAVAILABLE" ? 500
      : code === "RUNTIME_EVIDENCE_HISTORY_LIMIT" ? 413 : 400;
  const message = status === 404 ? "Runtime evidence was not found."
    : status === 500 ? "Runtime evidence is unavailable."
      : status === 413 ? "Runtime evidence exceeds the bounded history limit."
        : "Runtime evidence request is invalid.";
  sendJson(response, status, { error: message, code });
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: string, max: number): boolean { return value.length > 0 && value.length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value); }
