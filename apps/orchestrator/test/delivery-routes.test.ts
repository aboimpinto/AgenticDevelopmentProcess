import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { handleDeliveryRoutes } from "../src/transport/http/routes/delivery-routes.js";

function request(pathname: string, body?: unknown, method = "GET"): IncomingMessage {
  const value = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

describe("delivery HTTP routes", () => {
  it("validates and dispatches status queries", async () => {
    const readStatus = vi.fn(async () => ({ status: 200, body: { status: "ready" } }));
    const outgoing = response();
    const url = new URL("http://localhost/api/delivery/status?projectId=project&cardId=card");

    expect(await handleDeliveryRoutes(
      request(url.pathname), outgoing, url, { prepare: vi.fn(), readStatus },
    )).toBe(true);
    expect(readStatus).toHaveBeenCalledWith({ cardId: "card", projectId: "project" });
    expect(outgoing.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "application/json; charset=utf-8",
    });

    const invalid = response();
    const invalidUrl = new URL("http://localhost/api/delivery/status?projectId=project");
    expect(await handleDeliveryRoutes(
      request(invalidUrl.pathname), invalid, invalidUrl, { prepare: vi.fn(), readStatus },
    )).toBe(true);
    expect(invalid.end).toHaveBeenCalledWith(JSON.stringify({ error: "projectId and cardId are required." }));
  });

  it("decodes preparation and preserves its application status", async () => {
    const input = { approved: true, cardId: "project:state:item", projectId: "project" };
    const prepare = vi.fn(async () => ({ status: 400, body: { outcome: "blocked" } }));
    const outgoing = response();

    expect(await handleDeliveryRoutes(
      request("/api/delivery/prepare", input, "POST"), outgoing,
      new URL("http://localhost/api/delivery/prepare"), { prepare, readStatus: vi.fn() },
    )).toBe(true);
    expect(prepare).toHaveBeenCalledWith(input);
    expect(outgoing.writeHead).toHaveBeenCalledWith(400, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  it("refuses unrelated paths and unsupported methods", async () => {
    const context = { prepare: vi.fn(), readStatus: vi.fn() };
    await expect(handleDeliveryRoutes(
      request("/api/tasks"), response(), new URL("http://localhost/api/tasks"), context,
    )).resolves.toBe(false);
    await expect(handleDeliveryRoutes(
      request("/api/delivery/status", {}, "POST"), response(),
      new URL("http://localhost/api/delivery/status"), context,
    )).resolves.toBe(false);
  });
});
