import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  CreateMissingFeaturesInput,
  CreateMissingFeaturesResponse,
  PreviewMissingFeaturesInput,
  PreviewMissingFeaturesResponse,
} from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { handleMissingFeatureBatchRoutes } from "../src/transport/http/routes/missing-feature-batch-routes.js";

function request(pathname: string, body: unknown, method = "POST"): IncomingMessage {
  const value = Readable.from([JSON.stringify(body)]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

describe("missing-feature batch HTTP routes", () => {
  it("decodes preview input and returns the application projection", async () => {
    const outgoing = response();
    const input = { cardId: "card", projectId: "project" } as PreviewMissingFeaturesInput;
    const body = { plan: { planHash: "hash" } } as PreviewMissingFeaturesResponse;
    const preview = vi.fn(async () => body);

    expect(await handleMissingFeatureBatchRoutes(
      request("/api/missing-features/preview", input), outgoing,
      new URL("http://localhost/api/missing-features/preview"),
      { create: vi.fn(), preview },
    )).toBe(true);
    expect(preview).toHaveBeenCalledWith(input);
    expect(outgoing.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "application/json; charset=utf-8" });
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify(body));
  });

  it("decodes apply input and returns created", async () => {
    const outgoing = response();
    const input = { cardId: "card", projectId: "project" } as CreateMissingFeaturesInput;
    const body = { createdFeatureIds: ["FEAT-001"] } as unknown as CreateMissingFeaturesResponse;
    const create = vi.fn(async () => body);

    expect(await handleMissingFeatureBatchRoutes(
      request("/api/missing-features", input), outgoing,
      new URL("http://localhost/api/missing-features"),
      { create, preview: vi.fn() },
    )).toBe(true);
    expect(create).toHaveBeenCalledWith(input);
    expect(outgoing.writeHead).toHaveBeenCalledWith(201, { "Content-Type": "application/json; charset=utf-8" });
  });

  it("refuses unrelated paths and methods", async () => {
    const context = { create: vi.fn(), preview: vi.fn() };
    await expect(handleMissingFeatureBatchRoutes(
      request("/api/submit-feature", {}, "POST"), response(),
      new URL("http://localhost/api/submit-feature"), context,
    )).resolves.toBe(false);
    await expect(handleMissingFeatureBatchRoutes(
      request("/api/missing-features", {}, "GET"), response(),
      new URL("http://localhost/api/missing-features"), context,
    )).resolves.toBe(false);
  });
});
