import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type {
  ManualTestVerificationResultResponse,
  ManualTestVerificationStatusResponse,
} from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  handleManualTestVerificationRoutes,
  type ManualTestVerificationRoutesContext,
} from "../src/transport/http/routes/manual-test-verification-routes.js";

function request(pathname: string, body?: unknown, method = "POST"): IncomingMessage {
  const value = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

function context(): ManualTestVerificationRoutesContext {
  return {
    generate: vi.fn(),
    recordResult: vi.fn(),
    review: vi.fn(),
    sendArtifact: vi.fn(),
    status: vi.fn(),
  };
}

describe("manual-test verification HTTP routes", () => {
  it("maps generate and review success state to HTTP status", async () => {
    const input = { cardId: "card", projectId: "project" };
    for (const [pathname, operation, body] of [
      ["/api/manual-test-verification/generate", "generate", { success: true, message: "Generated.", errors: [] }],
      ["/api/manual-test-verification/review", "review", { success: false, message: "Rejected.", errors: ["Rejected."] }],
    ] as const) {
      const routes = context();
      vi.mocked(routes[operation]).mockResolvedValue(body as never);
      const outgoing = response();

      expect(await handleManualTestVerificationRoutes(
        request(pathname, input), outgoing, new URL(`http://localhost${pathname}`), routes,
      )).toBe(true);
      expect(routes[operation]).toHaveBeenCalledWith(input);
      expect(outgoing.writeHead).toHaveBeenCalledWith(body.success ? 200 : 400, {
        "Content-Type": "application/json; charset=utf-8",
      });
      if (!body.success) {
        expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify({ ...body, error: body.message }));
      }
    }
  });

  it.each([
    ["/api/manual-test-verification/record-pass", "pass"],
    ["/api/manual-test-verification/record-fail", "fail"],
  ] as const)("dispatches %s with result %s", async (pathname, result) => {
    const routes = context();
    const input = { cardId: "card", projectId: "project" };
    const body: ManualTestVerificationResultResponse = {
      errors: [], message: "Recorded.", success: true,
    };
    vi.mocked(routes.recordResult).mockResolvedValue(body);
    const outgoing = response();

    expect(await handleManualTestVerificationRoutes(
      request(pathname, input), outgoing, new URL(`http://localhost${pathname}`), routes,
    )).toBe(true);
    expect(routes.recordResult).toHaveBeenCalledWith(input, result);
    expect(outgoing.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  it("validates and dispatches the status query", async () => {
    const routes = context();
    const body = { success: true, summary: "Current." } as ManualTestVerificationStatusResponse;
    vi.mocked(routes.status).mockResolvedValue(body);
    const outgoing = response();
    const url = new URL("http://localhost/api/manual-test-verification/status?projectId=project&cardId=card");

    expect(await handleManualTestVerificationRoutes(request(url.pathname, undefined, "GET"), outgoing, url, routes)).toBe(true);
    expect(routes.status).toHaveBeenCalledWith({ cardId: "card", projectId: "project" });
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify(body));

    const invalid = response();
    const invalidUrl = new URL("http://localhost/api/manual-test-verification/status?projectId=project");
    expect(await handleManualTestVerificationRoutes(
      request(invalidUrl.pathname, undefined, "GET"), invalid, invalidUrl, routes,
    )).toBe(true);
    expect(invalid.writeHead).toHaveBeenCalledWith(400, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  it("validates artifact parameters and hands off the raw response", async () => {
    const routes = context();
    const outgoing = response();
    const url = new URL(
      "http://localhost/api/manual-test-verification/artifact?projectId=project&cardId=card&format=pdf&download=1",
    );

    expect(await handleManualTestVerificationRoutes(request(url.pathname, undefined, "GET"), outgoing, url, routes)).toBe(true);
    expect(routes.sendArtifact).toHaveBeenCalledWith(outgoing, {
      cardId: "card", download: true, format: "pdf", projectId: "project",
    });

    const invalid = response();
    const invalidUrl = new URL(
      "http://localhost/api/manual-test-verification/artifact?projectId=project&cardId=card&format=html",
    );
    expect(await handleManualTestVerificationRoutes(
      request(invalidUrl.pathname, undefined, "GET"), invalid, invalidUrl, routes,
    )).toBe(true);
    expect(invalid.writeHead).toHaveBeenCalledWith(400, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  it("refuses unrelated routes", async () => {
    const routes = context();
    await expect(handleManualTestVerificationRoutes(
      request("/api/delivery/status", undefined, "GET"),
      response(),
      new URL("http://localhost/api/delivery/status"),
      routes,
    )).resolves.toBe(false);
  });
});
