import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  AddFeatureFindingDetailInput,
  FeatureHumanReviewInput,
  FeatureWorkflowActionInput,
  FeatureWorkflowActionResponse,
  ResolveFeatureFindingInput,
  SubmitFeatureFindingInput,
  PhaseQualityResolutionInput,
} from "@hepha/shared";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";
import { handlePhaseQualityResolutionRoute } from "./phase-quality-resolution-route.js";
import type { FeatureFindingApplication } from "../../../application/features/feature-finding-application.js";
import type { FeatureHumanReviewApplication } from "../../../application/features/feature-human-review-application.js";
import type { PhaseQualityResolutionApplication } from "../../../application/features/phase-quality-resolution-application.js";

export interface FeatureReviewRoutesContext {
  resolvePhaseQuality(input: PhaseQualityResolutionInput): Promise<FeatureWorkflowActionResponse>;
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
  if (await handlePhaseQualityResolutionRoute(request, response, url, input => context.resolvePhaseQuality(input))) return true;

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

/** Compose the review/verification command family outside the server entrypoint. */
export function createFeatureReviewRoutesContext(findings: FeatureFindingApplication,
  humanReview: FeatureHumanReviewApplication, phaseQuality: PhaseQualityResolutionApplication): FeatureReviewRoutesContext {
  return {
    acceptFindingsPhase: input => findings.acceptPhase(input),
    addFindingDetail: input => findings.addDetail(input),
    recordHumanReview: input => humanReview.record(input),
    resolveFinding: input => findings.resolve(input),
    submitFinding: input => findings.submit(input),
    resolvePhaseQuality: input => phaseQuality.resolve(input),
  };
}
