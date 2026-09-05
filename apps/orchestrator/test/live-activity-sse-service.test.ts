import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { LiveActivitySseService } from "../src/transport/sse/live-activity-sse-service.js";

function createConnection(url = "/activity") {
  const request = Object.assign(new EventEmitter(), { headers: { host: "localhost" }, url }) as IncomingMessage;
  const chunks: string[] = [];
  const emitter = new EventEmitter();
  const response = Object.assign(emitter, {
    destroyed: false,
    end: vi.fn(() => { response.writableEnded = true; }),
    write: vi.fn((chunk: string) => { chunks.push(chunk); return true; }),
    writeHead: vi.fn(),
    writableEnded: false,
  }) as unknown as ServerResponse;
  return { chunks, request, response };
}

function project() {
  return { id: "project-any" } as never;
}

describe("live activity SSE service", () => {
  it("connects, broadcasts mapped notifications, and removes closed clients", () => {
    const query = vi.fn(async () => []);
    const service = new LiveActivitySseService({ queryPhaseLifecycleEventsAfterCursor: query });
    const connection = createConnection();
    service.stream(project(), connection.request, connection.response);

    expect(connection.response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      "Content-Type": "text/event-stream; charset=utf-8",
    }));
    expect(connection.chunks.join("")).toContain("event: live-activity.connected");
    service.notify("project-any", "workflow.started", "WORK-ANY");
    expect(connection.chunks.join("")).toContain("event: live-activity.event");
    expect(connection.chunks.join("")).toContain("Workflow started: WORK-ANY");

    const count = connection.chunks.length;
    connection.request.emit("close");
    service.notify("project-any", "workflow.completed", "WORK-ANY");
    expect(connection.chunks).toHaveLength(count);
    expect(connection.response.end).toHaveBeenCalledOnce();
    expect(query).not.toHaveBeenCalled();
  });

  it("replays stored phase events after a supplied cursor", async () => {
    const query = vi.fn(async () => [{
      cardId: "WORK-ANY",
      eventType: "phase.completed",
      id: "event-any",
      metadata: '{"gate":"green"}',
      occurredAt: "2031-01-01T00:00:00.000Z",
      phaseNumber: 44,
      phaseStatus: "COMPLETED",
      phaseTitle: "Arbitrary work",
      projectId: "project-any",
      runId: "run-any",
      summary: "Phase completed",
    }] as never);
    const service = new LiveActivitySseService({ queryPhaseLifecycleEventsAfterCursor: query });
    const connection = createConnection("/activity?lastPhaseCursor=cursor-any");
    service.stream(project(), connection.request, connection.response);
    await vi.waitFor(() => expect(connection.chunks.join("")).toContain("event: live-activity.replay-batch"));

    expect(query).toHaveBeenCalledWith("project-any", "cursor-any");
    expect(connection.chunks.join("")).toContain('"phaseNumber":44');
    expect(connection.chunks.join("")).toContain('"gate":"green"');
    connection.request.emit("close");
  });

  it("reports replay failures and ignores unmapped notifications", async () => {
    const service = new LiveActivitySseService({
      queryPhaseLifecycleEventsAfterCursor: vi.fn(async () => { throw new Error("store unavailable"); }),
    });
    const connection = createConnection("/activity?lastPhaseCursor=cursor-any");
    service.stream(project(), connection.request, connection.response);
    await vi.waitFor(() => expect(connection.chunks.join("")).toContain("event: live-activity.replay-unavailable"));
    expect(connection.chunks.join("")).toContain("store unavailable");

    const count = connection.chunks.length;
    service.notify("project-any", "unmapped.event", "WORK-ANY");
    expect(connection.chunks).toHaveLength(count);
    connection.request.emit("close");
  });
});
