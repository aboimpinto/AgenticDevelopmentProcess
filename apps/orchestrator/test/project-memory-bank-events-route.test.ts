import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { handleProjectMemoryBankEventsRoute } from "../src/transport/http/routes/project-memory-bank-events-route.js";

function request(pathname: string, method = "GET"): IncomingMessage {
  const value = Readable.from([]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function responseDouble(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

const project: StoredProject = {
  id: "project/encoded",
  createdAt: "2026-07-20T10:00:00.000Z",
  memoryBankPath: "/project/MemoryBank",
  name: "Project",
  rootPath: "/project",
  updatedAt: "2026-07-20T10:00:00.000Z",
};

describe("project MemoryBank events HTTP route", () => {
  it("decodes the project and hands the open request to the event stream", async () => {
    const incoming = request("/api/projects/project%2Fencoded/memory-bank-events");
    const response = responseDouble();
    const streamEvents = vi.fn();

    expect(await handleProjectMemoryBankEventsRoute(
      incoming,
      response,
      new URL("http://localhost/api/projects/project%2Fencoded/memory-bank-events"),
      { findProject: () => project, streamEvents },
    )).toBe(true);
    expect(streamEvents).toHaveBeenCalledWith(project, incoming, response);
  });

  it("returns project not found without opening a stream", async () => {
    const response = responseDouble();
    const streamEvents = vi.fn();
    expect(await handleProjectMemoryBankEventsRoute(
      request("/api/projects/missing/memory-bank-events"),
      response,
      new URL("http://localhost/api/projects/missing/memory-bank-events"),
      { findProject: () => undefined, streamEvents },
    )).toBe(true);
    expect(streamEvents).not.toHaveBeenCalled();
    expect(response.writeHead).toHaveBeenCalledWith(404, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  it("does not claim another path or method", async () => {
    const context = { findProject: vi.fn(), streamEvents: vi.fn() };
    await expect(handleProjectMemoryBankEventsRoute(
      request("/api/projects/project/live-activity"),
      responseDouble(),
      new URL("http://localhost/api/projects/project/live-activity"),
      context,
    )).resolves.toBe(false);
    await expect(handleProjectMemoryBankEventsRoute(
      request("/api/projects/project/memory-bank-events", "POST"),
      responseDouble(),
      new URL("http://localhost/api/projects/project/memory-bank-events"),
      context,
    )).resolves.toBe(false);
  });
});
