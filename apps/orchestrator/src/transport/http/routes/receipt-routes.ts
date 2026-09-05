import type { IncomingMessage, ServerResponse } from "node:http";
import type { ReceiptSearchFilter } from "@hepha/shared";
import type {
  ReceiptDetailInput,
  ReceiptDetailResult,
} from "../../../application/receipts/receipt-application.js";
import { sendJson } from "../send-json.js";

export interface ReceiptRoutesContext {
  detail(input: ReceiptDetailInput): Promise<ReceiptDetailResult>;
  logError?(scope: "Receipt search" | "Receipt detail", error: unknown): void;
  search(input: ReceiptSearchFilter): Promise<unknown>;
}

export async function handleReceiptRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ReceiptRoutesContext,
): Promise<boolean> {
  const collection = url.pathname.match(/^\/api\/projects\/([^/]+)\/receipts$/);
  if (request.method === "GET" && collection?.[1]) {
    try {
      sendJson(response, 200, await context.search({
        artifact: url.searchParams.get("artifact") ?? undefined,
        command: url.searchParams.get("command") ?? undefined,
        knowledgeRule: url.searchParams.get("knowledgeRule") ?? undefined,
        model: url.searchParams.get("model") ?? undefined,
        projectId: decodeURIComponent(collection[1]),
      }));
    } catch (error) {
      logError(context, "Receipt search", error);
      sendJson(response, 500, { error: "Failed to search receipts." });
    }
    return true;
  }

  const detail = url.pathname.match(/^\/api\/projects\/([^/]+)\/receipts\/([^/]+)$/);
  if (request.method === "GET" && detail?.[1] && detail[2]) {
    try {
      const result = await context.detail({
        projectId: decodeURIComponent(detail[1]),
        receiptId: decodeURIComponent(detail[2]),
      });
      sendJson(response, result.status, result.body);
    } catch (error) {
      logError(context, "Receipt detail", error);
      sendJson(response, 500, { error: "Failed to retrieve receipt detail." });
    }
    return true;
  }

  return false;
}

function logError(
  context: ReceiptRoutesContext,
  scope: "Receipt search" | "Receipt detail",
  error: unknown,
): void {
  if (context.logError) context.logError(scope, error);
  else console.error(`[FEAT-038] ${scope} error:`, error instanceof Error ? error.message : error);
}
