import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  SubmitEpicInput,
  SubmitEpicResponse,
  SubmitFeatureInput,
  SubmitFeatureResponse,
} from "@hepha/shared";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

export interface WorkItemSubmissionRoutesContext {
  submitEpic(input: SubmitEpicInput): Promise<SubmitEpicResponse>;
  submitFeature(input: SubmitFeatureInput): Promise<SubmitFeatureResponse>;
}

export async function handleWorkItemSubmissionRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: WorkItemSubmissionRoutesContext,
): Promise<boolean> {
  if (request.method !== "POST") return false;

  if (url.pathname === "/api/submit-epic") {
    const input = await readJson<SubmitEpicInput>(request);
    const body = await context.submitEpic(input);
    sendJson<SubmitEpicResponse>(response, 201, body);
    return true;
  }

  if (url.pathname === "/api/submit-feature") {
    const input = await readJson<SubmitFeatureInput>(request);
    const body = await context.submitFeature(input);
    sendJson<SubmitFeatureResponse>(response, 201, body);
    return true;
  }

  return false;
}
