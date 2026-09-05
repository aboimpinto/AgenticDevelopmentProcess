import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  DeliveryApplicationResult,
  DeliveryPrepareInput,
} from "../../../application/delivery/delivery-application.js";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

export interface DeliveryRoutesContext {
  prepare(input: DeliveryPrepareInput): Promise<DeliveryApplicationResult>;
  readStatus(input: {
    cardId: string;
    projectId: string;
  }): Promise<DeliveryApplicationResult>;
}

export async function handleDeliveryRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: DeliveryRoutesContext,
): Promise<boolean> {
  if (request.method === "GET" && url.pathname === "/api/delivery/status") {
    const projectId = url.searchParams.get("projectId");
    const cardId = url.searchParams.get("cardId");
    if (!projectId || !cardId) {
      sendJson(response, 400, { error: "projectId and cardId are required." });
      return true;
    }
    const result = await context.readStatus({ cardId, projectId });
    sendJson(response, result.status, result.body);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/delivery/prepare") {
    const result = await context.prepare(await readJson<DeliveryPrepareInput>(request));
    sendJson(response, result.status, result.body);
    return true;
  }

  return false;
}
