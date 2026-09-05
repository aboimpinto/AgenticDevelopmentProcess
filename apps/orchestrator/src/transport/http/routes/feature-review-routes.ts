import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  AddFeatureFindingDetailInput,
  FeatureHumanReviewInput,
  FeatureWorkflowActionInput,
  FeatureWorkflowActionResponse,
  ResolveFeatureFindingInput,
  SubmitFeatureFindingInput,
} from "@hepha/shared";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

export interface FeatureReviewRoutesContext {
  acceptFindingsPhase(input: FeatureWorkflowActionInput): Promise<FeatureWorkflowActionResponse>;
  addFindingDetail(input: AddFeatureFindingDetailInput): Promise<FeatureWorkflowActionResponse>;
  recordHumanReview(input: FeatureHumanReviewInput): Promise<FeatureWorkflowActionResponse>;
  resolveFinding(input: ResolveFeatureFindingInput): Promise<FeatureWorkflowActionResponse>;
  submitFinding(input: SubmitFeatureFindingInput): Promise<FeatureWorkflowActionResponse>;
}

export async function handleFeatureReviewRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: FeatureReviewRoutesContext,
): Promise<boolean> {
  if (request.method !== "POST") return false;

  if (url.pathname === "/api/feature-human-review") {
    const input = await readJson<FeatureHumanReviewInput>(request);
    sendJson(response, 200, await context.recordHumanReview(input));
    return true;
  }
  if (url.pathname === "/api/feature-findings") {
    const input = await readJson<SubmitFeatureFindingInput>(request);
    sendJson(response, 201, await context.submitFinding(input));
    return true;
  }
  if (url.pathname === "/api/feature-findings/detail") {
    const input = await readJson<AddFeatureFindingDetailInput>(request);
    sendJson(response, 200, await context.addFindingDetail(input));
    return true;
  }
  if (url.pathname === "/api/feature-findings/resolve") {
    const input = await readJson<ResolveFeatureFindingInput>(request);
    sendJson(response, 200, await context.resolveFinding(input));
    return true;
  }
  if (url.pathname === "/api/feature-findings/accept-phase") {
    const input = await readJson<FeatureWorkflowActionInput>(request);
    sendJson(response, 200, await context.acceptFindingsPhase(input));
    return true;
  }

  return false;
}
