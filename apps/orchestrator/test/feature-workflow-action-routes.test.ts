import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { FeatureWorkflowActionInput, FeatureWorkflowActionResponse } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  handleFeatureWorkflowActionRoutes,
  type FeatureWorkflowActionRoutesContext,
} from "../src/transport/http/routes/feature-workflow-action-routes.js";

function request(pathname: string, body: unknown, method = "POST"): IncomingMessage {
  const value = Readable.from([JSON.stringify(body)]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

function context(body: FeatureWorkflowActionResponse): FeatureWorkflowActionRoutesContext {
  const operation = () => vi.fn(async () => body);
  return {
    cancelFeatureWorkflow: operation(),
    completeEpic: operation(),
    completeFeature: operation(),
    continueImplementing: operation(),
    designFeature: operation(),
    evaluateUiRequirement: operation(),
    refineFeature: operation(),
    startImplementing: operation(),
  };
}

describe("feature workflow action HTTP routes", () => {
  it.each([
    ["/api/feature-ui-requirement", "evaluateUiRequirement", 200],
    ["/api/design-feature", "designFeature", 201],
    ["/api/refine-feature", "refineFeature", 201],
    ["/api/start-implementing", "startImplementing", 201],
    ["/api/continue-implementing", "continueImplementing", 201],
    ["/api/complete-feature", "completeFeature", 201],
    ["/api/complete-epic", "completeEpic", 200],
    ["/api/cancel-feature-workflow", "cancelFeatureWorkflow", 200],
  ] as const)("maps %s to %s with status %i", async (pathname, operationName, status) => {
    const outgoing = response();
    const input = { cardId: "card", projectId: "project" } as FeatureWorkflowActionInput;
    const body = { summary: "Accepted command." } as FeatureWorkflowActionResponse;
    const routes = context(body);

    expect(await handleFeatureWorkflowActionRoutes(
      request(pathname, input),
      outgoing,
      new URL(`http://localhost${pathname}`),
      routes,
    )).toBe(true);
    expect(routes[operationName]).toHaveBeenCalledWith(input);
    expect(outgoing.writeHead).toHaveBeenCalledWith(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify(body));
  });

  it("refuses unrelated paths and unsupported methods", async () => {
    const routes = context({ summary: "unused" } as FeatureWorkflowActionResponse);

    await expect(handleFeatureWorkflowActionRoutes(
      request("/api/feature-human-review", {}),
      response(),
      new URL("http://localhost/api/feature-human-review"),
      routes,
    )).resolves.toBe(false);
    await expect(handleFeatureWorkflowActionRoutes(
      request("/api/start-implementing", {}, "GET"),
      response(),
      new URL("http://localhost/api/start-implementing"),
      routes,
    )).resolves.toBe(false);
  });
});
