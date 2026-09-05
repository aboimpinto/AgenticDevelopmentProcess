import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { handleProviderConnectionRoutes } from "../src/transport/http/routes/provider-connection-routes.js";

const service = {} as never;
const mutations = {} as never;
const context = { service, mutations };

function response(): ServerResponse {
  return {} as ServerResponse;
}

function handlers() {
  return {
    create: vi.fn(),
    createSecret: vi.fn(),
    delete: vi.fn(),
    deletionPreflight: vi.fn(),
    diagnostics: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    revokeSecret: vi.fn(),
    rotateSecret: vi.fn(),
    update: vi.fn(),
    validate: vi.fn(),
  };
}

describe("provider connection HTTP routes", () => {
  it.each([
    ["GET", "/api/provider-connections", "list", []],
    ["POST", "/api/provider-connections", "create", ["request"]],
    ["POST", "/api/provider-connections/id/secrets/rotate", "rotateSecret", ["request", "id"]],
    ["POST", "/api/provider-connections/id/secrets/revoke", "revokeSecret", ["id"]],
    ["POST", "/api/provider-connections/id/secrets", "createSecret", ["request", "id"]],
    ["POST", "/api/provider-connections/id/validate", "validate", ["id"]],
    ["GET", "/api/provider-connections/id/delete-preflight", "deletionPreflight", ["id"]],
    ["GET", "/api/provider-connections/id", "get", ["id"]],
    ["PUT", "/api/provider-connections/id", "update", ["request", "id"]],
    ["DELETE", "/api/provider-connections/id", "delete", ["request", "id"]],
  ] as const)("dispatches %s %s to %s", async (method, pathname, operation, expected) => {
    const adapter = handlers();
    const request = { method } as IncomingMessage;
    const outgoing = response();

    expect(await handleProviderConnectionRoutes(
      request, outgoing, new URL(`http://localhost${pathname}`), context, adapter,
    )).toBe(true);
    const expectedArgs = expected.map((value) => value === "request" ? request : value);
    const operationService = operation === "create" || operation === "update"
      || operation === "createSecret" || operation === "rotateSecret"
      ? mutations
      : service;
    expect(adapter[operation]).toHaveBeenCalledWith(
      ...(operation === "create" || operation === "update" || operation === "createSecret"
        || operation === "rotateSecret" || operation === "delete"
        ? [request, outgoing, operationService, ...expectedArgs.slice(1)]
        : [outgoing, operationService, ...expectedArgs]),
    );
  });

  it("parses the diagnostics limit", async () => {
    const adapter = handlers();
    const url = new URL("http://localhost/api/provider-connections/id/diagnostics?limit=7");

    expect(await handleProviderConnectionRoutes(
      { method: "GET" } as IncomingMessage, response(), url, context, adapter,
    )).toBe(true);
    expect(adapter.diagnostics).toHaveBeenCalledWith(expect.anything(), service, "id", 7);
  });

  it("refuses unrelated paths and unsupported methods", async () => {
    const adapter = handlers();
    await expect(handleProviderConnectionRoutes(
      { method: "GET" } as IncomingMessage, response(), new URL("http://localhost/api/tasks"),
      context, adapter,
    )).resolves.toBe(false);
    await expect(handleProviderConnectionRoutes(
      { method: "PATCH" } as IncomingMessage, response(),
      new URL("http://localhost/api/provider-connections/id"), context, adapter,
    )).resolves.toBe(false);
  });
});
