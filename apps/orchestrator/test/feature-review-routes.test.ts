import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { FeatureWorkflowActionResponse } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  handleFeatureReviewRoutes,
  type FeatureReviewRoutesContext,
} from "../src/transport/http/routes/feature-review-routes.js";

function request(pathname: string, body: unknown, method = "POST"): IncomingMessage {
  const value = Readable.from([JSON.stringify(body)]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

function context(body: FeatureWorkflowActionResponse): FeatureReviewRoutesContext {
  const operation = () => vi.fn(async () => body);
  return {
    acceptFindingsPhase: operation(),
    addFindingDetail: operation(),
    recordHumanReview: operation(),
    resolveFinding: operation(),
    submitFinding: operation(),
  };
}

describe("feature review HTTP routes", () => {
  it.each([
    ["/api/feature-human-review", "recordHumanReview", { cardId: "card", check: "manual-tests", projectId: "project" }, 200],
    ["/api/feature-findings", "submitFinding", { cardId: "card", content: "Finding", projectId: "project" }, 201],
    ["/api/feature-findings/detail", "addFindingDetail", { cardId: "card", content: "Detail", findingId: "finding", projectId: "project" }, 200],
    ["/api/feature-findings/resolve", "resolveFinding", { cardId: "card", findingId: "finding", projectId: "project" }, 200],
    ["/api/feature-findings/accept-phase", "acceptFindingsPhase", { cardId: "card", projectId: "project" }, 200],
  ] as const)("maps %s to %s", async (pathname, operationName, input, status) => {
    const body = { summary: "Updated review." } as FeatureWorkflowActionResponse;
    const routes = context(body);
    const outgoing = response();

    expect(await handleFeatureReviewRoutes(
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

    await expect(handleFeatureReviewRoutes(
      request("/api/manual-test-verification/review", {}),
      response(),
      new URL("http://localhost/api/manual-test-verification/review"),
      routes,
    )).resolves.toBe(false);
    await expect(handleFeatureReviewRoutes(
      request("/api/feature-findings", {}, "GET"),
      response(),
      new URL("http://localhost/api/feature-findings"),
      routes,
    )).resolves.toBe(false);
  });
});
