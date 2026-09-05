import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { handleProjectLiveActivityRoute } from "../src/transport/http/routes/project-live-activity-route.js";

const project = { id: "project/id" } as StoredProject;
function request(path: string, method = "GET") {
  const value = Readable.from([]) as IncomingMessage;
  value.method = method;
  value.url = path;
  return value;
}
function response() {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

describe("project live-activity HTTP route", () => {
  it("decodes the project and hands off the open stream", async () => {
    const incoming = request("/api/projects/project%2Fid/live-activity");
    const outgoing = response();
    const streamActivity = vi.fn();
    expect(await handleProjectLiveActivityRoute(incoming, outgoing, new URL("http://localhost/api/projects/project%2Fid/live-activity"), {
      findProject: () => project,
      streamActivity,
    })).toBe(true);
    expect(streamActivity).toHaveBeenCalledWith(project, incoming, outgoing);
  });

  it("returns not found without opening activity", async () => {
    const outgoing = response();
    const streamActivity = vi.fn();
    expect(await handleProjectLiveActivityRoute(request("/api/projects/missing/live-activity"), outgoing, new URL("http://localhost/api/projects/missing/live-activity"), {
      findProject: () => undefined,
      streamActivity,
    })).toBe(true);
    expect(streamActivity).not.toHaveBeenCalled();
    expect(outgoing.writeHead).toHaveBeenCalledWith(404, { "Content-Type": "application/json; charset=utf-8" });
  });

  it("refuses sibling routes and unsupported methods", async () => {
    const context = { findProject: vi.fn(), streamActivity: vi.fn() };
    await expect(handleProjectLiveActivityRoute(request("/api/projects/id/memory-bank-events"), response(), new URL("http://localhost/api/projects/id/memory-bank-events"), context)).resolves.toBe(false);
    await expect(handleProjectLiveActivityRoute(request("/api/projects/id/live-activity", "POST"), response(), new URL("http://localhost/api/projects/id/live-activity"), context)).resolves.toBe(false);
  });
});
