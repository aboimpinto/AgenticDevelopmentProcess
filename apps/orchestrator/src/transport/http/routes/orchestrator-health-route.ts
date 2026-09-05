import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "../send-json.js";

export interface OrchestratorHealthRouteContext {
  read(): unknown;
}

export async function handleOrchestratorHealthRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: OrchestratorHealthRouteContext,
): Promise<boolean> {
  if (request.method !== "GET" || url.pathname !== "/api/health") return false;
  sendJson(response, 200, context.read());
  return true;
}
