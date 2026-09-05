import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  CreateMissingFeaturesInput,
  CreateMissingFeaturesResponse,
  PreviewMissingFeaturesInput,
  PreviewMissingFeaturesResponse,
} from "@hepha/shared";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

export interface MissingFeatureBatchRoutesContext {
  create(input: CreateMissingFeaturesInput): Promise<CreateMissingFeaturesResponse>;
  preview(input: PreviewMissingFeaturesInput): Promise<PreviewMissingFeaturesResponse>;
}

export async function handleMissingFeatureBatchRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: MissingFeatureBatchRoutesContext,
): Promise<boolean> {
  if (request.method !== "POST") return false;

  if (url.pathname === "/api/missing-features/preview") {
    const input = await readJson<PreviewMissingFeaturesInput>(request);
    const body = await context.preview(input);
    sendJson<PreviewMissingFeaturesResponse>(response, 200, body);
    return true;
  }

  if (url.pathname === "/api/missing-features") {
    const input = await readJson<CreateMissingFeaturesInput>(request);
    const body = await context.create(input);
    sendJson<CreateMissingFeaturesResponse>(response, 201, body);
    return true;
  }

  return false;
}
