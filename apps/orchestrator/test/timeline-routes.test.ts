import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { handleTimelineRoutes } from "../src/transport/http/routes/timeline-routes.js";

function request(method = "GET"): IncomingMessage {
  return { method } as IncomingMessage;
}

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

describe("timeline HTTP routes", () => {
  it("decodes phase identity and serializes the application response", async () => {
    const readPhase = vi.fn(async () => ({ phaseTitle: "Random" }));
    const outgoing = response();
    const url = new URL("http://localhost/api/projects/project%20id/features/card%2Fid/timeline/phase/7");

    expect(await handleTimelineRoutes(request(), outgoing, url, {
      readCompleted: vi.fn(), readPhase,
    })).toBe(true);
    expect(readPhase).toHaveBeenCalledWith({ cardKey: "card/id", phaseNumber: 7, projectId: "project id" });
    expect(outgoing.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  it("decodes completed-timeline identity", async () => {
    const readCompleted = vi.fn(async () => ({ evid: [] }));
    const url = new URL("http://localhost/api/projects/project/features/card/timeline/completed");

    expect(await handleTimelineRoutes(request(), response(), url, {
      readCompleted, readPhase: vi.fn(),
    })).toBe(true);
    expect(readCompleted).toHaveBeenCalledWith({ cardKey: "card", projectId: "project" });
  });

  it("maps application failures to the stable endpoint-specific errors", async () => {
    const logError = vi.fn();
    const outgoing = response();
    const readPhase = vi.fn(async () => { throw new Error("storage unavailable"); });
    const url = new URL("http://localhost/api/projects/project/features/card/timeline/phase/2");

    expect(await handleTimelineRoutes(request(), outgoing, url, {
      logError, readCompleted: vi.fn(), readPhase,
    })).toBe(true);
    expect(logError).toHaveBeenCalledWith("Phase timeline", expect.any(Error));
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify({
      error: "Failed to retrieve phase timeline data.",
    }));
    expect(outgoing.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
  });

  it("refuses unrelated paths and unsupported methods", async () => {
    const context = { readCompleted: vi.fn(), readPhase: vi.fn() };
    await expect(handleTimelineRoutes(
      request(), response(), new URL("http://localhost/api/tasks"), context,
    )).resolves.toBe(false);
    await expect(handleTimelineRoutes(
      request("POST"), response(),
      new URL("http://localhost/api/projects/project/features/card/timeline/completed"), context,
    )).resolves.toBe(false);
  });
});
