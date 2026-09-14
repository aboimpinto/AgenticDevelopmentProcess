import type { IncomingMessage, ServerResponse } from "node:http";
import type { FeatureWorkflowActionResponse, PhaseQualityResolutionInput } from "@hepha/shared";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

export async function handlePhaseQualityResolutionRoute(request: IncomingMessage, response: ServerResponse, url: URL,
  resolve: (input: PhaseQualityResolutionInput) => Promise<FeatureWorkflowActionResponse>) {
  if (request.method !== "POST" || url.pathname !== "/api/phase-quality/resolve") return false;
  const input = await readJson<PhaseQualityResolutionInput>(request);
  sendJson(response, 200, await resolve(input));
  return true;
}
