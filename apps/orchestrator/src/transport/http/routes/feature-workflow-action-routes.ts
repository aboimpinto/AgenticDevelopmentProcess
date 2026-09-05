import type { IncomingMessage, ServerResponse } from "node:http";
import type { FeatureWorkflowActionInput, FeatureWorkflowActionResponse } from "@hepha/shared";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

type FeatureWorkflowOperation = (
  input: FeatureWorkflowActionInput,
) => Promise<FeatureWorkflowActionResponse>;

export interface FeatureWorkflowActionRoutesContext {
  cancelFeatureWorkflow: FeatureWorkflowOperation;
  completeEpic: FeatureWorkflowOperation;
  completeFeature: FeatureWorkflowOperation;
  continueImplementing: FeatureWorkflowOperation;
  designFeature: FeatureWorkflowOperation;
  evaluateUiRequirement: FeatureWorkflowOperation;
  refineFeature: FeatureWorkflowOperation;
  startImplementing: FeatureWorkflowOperation;
}

const routes: ReadonlyArray<{
  operation: keyof FeatureWorkflowActionRoutesContext;
  path: string;
  status: number;
}> = [
  { operation: "evaluateUiRequirement", path: "/api/feature-ui-requirement", status: 200 },
  { operation: "designFeature", path: "/api/design-feature", status: 201 },
  { operation: "refineFeature", path: "/api/refine-feature", status: 201 },
  { operation: "startImplementing", path: "/api/start-implementing", status: 201 },
  { operation: "continueImplementing", path: "/api/continue-implementing", status: 201 },
  { operation: "completeFeature", path: "/api/complete-feature", status: 201 },
  { operation: "completeEpic", path: "/api/complete-epic", status: 200 },
  { operation: "cancelFeatureWorkflow", path: "/api/cancel-feature-workflow", status: 200 },
];

export async function handleFeatureWorkflowActionRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: FeatureWorkflowActionRoutesContext,
): Promise<boolean> {
  if (request.method !== "POST") return false;
  const route = routes.find(({ path }) => path === url.pathname);
  if (!route) return false;

  const input = await readJson<FeatureWorkflowActionInput>(request);
  const body = await context[route.operation](input);
  sendJson<FeatureWorkflowActionResponse>(response, route.status, body);
  return true;
}
