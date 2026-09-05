import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { handleModelCatalogRoutes } from "../src/transport/http/routes/model-catalog-routes.js";

const context = {} as never;
const response = {} as ServerResponse;

describe("model catalog HTTP routes", () => {
  it.each([
    ["PATCH", "/api/model-catalog"],
    ["GET", "/api/model-catalog/scan-active"],
    ["GET", "/api/model-catalog/connections/connection/scan"],
    ["POST", "/api/model-catalog/connections/connection/diagnostics"],
    ["GET", "/api/not-model-catalog"],
  ])("returns control for unsupported %s %s", async (method, pathname) => {
    await expect(handleModelCatalogRoutes(
      { method } as IncomingMessage,
      response,
      new URL(`http://localhost${pathname}`),
      context,
    )).resolves.toBe(false);
  });
});
