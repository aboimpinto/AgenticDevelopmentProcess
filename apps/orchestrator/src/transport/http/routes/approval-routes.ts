import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApprovalDbStatus } from "@hepha/db";
import type {
  ApprovalApplicationResult,
  ListApprovalsInput,
  ResolveApprovalInput,
} from "../../../application/approvals/approval-application.js";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

export interface ApprovalRoutesContext {
  defaultProjectId(): string;
  list(input: ListApprovalsInput): Promise<unknown>;
  resolve(requestId: string, input: ResolveApprovalInput): Promise<ApprovalApplicationResult>;
}

export async function handleApprovalRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ApprovalRoutesContext,
): Promise<boolean> {
  if (request.method === "GET" && url.pathname === "/api/approvals") {
    const projectId = url.searchParams.get("projectId") ?? context.defaultProjectId();
    const status = (url.searchParams.get("status") ?? "pending") as ApprovalDbStatus | "all";
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
    sendJson(response, 200, await context.list({ limit, projectId, status }));
    return true;
  }

  const resolution = url.pathname.match(/^\/api\/approvals\/([^/]+)\/resolve$/);
  if (request.method === "POST" && resolution?.[1]) {
    const result = await context.resolve(
      decodeURIComponent(resolution[1]),
      await readJson<ResolveApprovalInput>(request),
    );
    sendJson(response, result.status, result.body);
    return true;
  }

  return false;
}
