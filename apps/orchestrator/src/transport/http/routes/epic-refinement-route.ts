import type { IncomingMessage, ServerResponse } from "node:http";
import type { SubmitEpicRefinementInput, SubmitEpicRefinementResponse } from "@hepha/shared";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

export interface EpicRefinementRouteContext {
  submitRefinement(input: SubmitEpicRefinementInput): Promise<SubmitEpicRefinementResponse>;
}

export async function handleEpicRefinementRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: EpicRefinementRouteContext,
): Promise<boolean> {
  if (request.method !== "POST" || url.pathname !== "/api/epic-refinements") {
    return false;
  }

  const input = await readJson<SubmitEpicRefinementInput>(request);
  const body = await context.submitRefinement(input);
  sendJson<SubmitEpicRefinementResponse>(response, 201, body);
  return true;
}
