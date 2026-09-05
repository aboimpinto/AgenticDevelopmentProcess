import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { handleRunAnalyticsRoute } from "../src/transport/http/routes/run-analytics-route.js";

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

describe("run analytics HTTP route", () => {
  it("decodes filters and drops unknown grouping dimensions", async () => {
    const read = vi.fn(async () => ({ totals: {} }));
    const outgoing = response();
    const url = new URL(
      "http://localhost/api/projects/project%20id/analytics/runs?cardKey=CARD-1&groupBy=phase&groupBy=unknown&groupBy=model&startedAfter=a&startedBefore=b",
    );

    expect(await handleRunAnalyticsRoute(
      { method: "GET" } as IncomingMessage, outgoing, url, { read },
    )).toBe(true);
    expect(read).toHaveBeenCalledWith({
      cardKey: "CARD-1",
      groupBy: ["phase", "model"],
      projectId: "project id",
      startedAfter: "a",
      startedBefore: "b",
    });
    expect(outgoing.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
  });

  it("returns the stable analytics error when the query fails", async () => {
    const outgoing = response();
    const logError = vi.fn();
    const read = vi.fn(async () => { throw new Error("unavailable"); });
    const url = new URL("http://localhost/api/projects/project/analytics/runs");

    expect(await handleRunAnalyticsRoute(
      { method: "GET" } as IncomingMessage, outgoing, url, { logError, read },
    )).toBe(true);
    expect(logError).toHaveBeenCalledWith(expect.any(Error));
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify({
      error: "Failed to retrieve run metrics.",
    }));
  });

  it("refuses unrelated paths and unsupported methods", async () => {
    const context = { read: vi.fn() };
    await expect(handleRunAnalyticsRoute(
      { method: "GET" } as IncomingMessage,
      response(), new URL("http://localhost/api/tasks"), context,
    )).resolves.toBe(false);
    await expect(handleRunAnalyticsRoute(
      { method: "POST" } as IncomingMessage,
      response(), new URL("http://localhost/api/projects/p/analytics/runs"), context,
    )).resolves.toBe(false);
  });
});
