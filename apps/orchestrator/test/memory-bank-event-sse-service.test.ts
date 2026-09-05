import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMemoryBankFingerprint,
  getMemoryBankPollingIntervalMs,
  MemoryBankEventSseService,
  shouldPollMemoryBankEvents,
} from "../src/transport/sse/memory-bank-event-sse-service.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

function createConnection() {
  const request = Object.assign(new EventEmitter(), { headers: { host: "localhost" }, url: "/events" }) as IncomingMessage;
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

function createProject(withFeatures = false) {
  const memoryBankPath = mkdtempSync(join(tmpdir(), "hepha-memory-bank-events-"));
  temporaryDirectories.push(memoryBankPath);
  if (withFeatures) mkdirSync(join(memoryBankPath, "Features"));
  return {
    createdAt: "2031-01-01T00:00:00.000Z",
    id: "project-any",
    memoryBankPath,
    name: "Any project",
    rootPath: memoryBankPath,
    updatedAt: "2031-01-01T00:00:00.000Z",
  };
}

describe("MemoryBank event SSE service", () => {
  it("connects subscribers, sends mapped notifications, and removes closed clients", () => {
    const broadcastFileChange = vi.fn();
    const service = new MemoryBankEventSseService({ broadcastFileChange });
    const connection = createConnection();
    service.stream(createProject(), connection.request, connection.response);

    expect(connection.response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      "Content-Type": "text/event-stream; charset=utf-8",
    }));
    expect(connection.chunks.join("")).toContain("event: memorybank.connected");
    expect(connection.chunks.join("")).toContain("event: memorybank.error");

    service.notify("project-any", "workflow.updated", "WORK-ANY");
    expect(connection.chunks.join("")).toContain("event: memorybank.changed");
    expect(connection.chunks.join("")).toContain('"eventType":"workflow.updated"');
    expect(connection.chunks.join("")).toContain('"externalId":"WORK-ANY"');

    const count = connection.chunks.length;
    connection.request.emit("close");
    service.notify("project-any", "workflow.completed", "WORK-ANY");
    expect(connection.chunks).toHaveLength(count);
    expect(connection.response.end).toHaveBeenCalledOnce();
    expect(broadcastFileChange).not.toHaveBeenCalled();
  });

  it("uses filesystem fingerprints to detect changes through polling", async () => {
    vi.useFakeTimers();
    const project = createProject(true);
    const featuresPath = join(project.memoryBankPath, "Features");
    const initialFingerprint = getMemoryBankFingerprint(featuresPath);
    const broadcastFileChange = vi.fn();
    const service = new MemoryBankEventSseService({
      broadcastFileChange,
      environment: {
        HEPHA_MEMORYBANK_POLL_INTERVAL_MS: "250",
        HEPHA_MEMORYBANK_USE_POLLING: "1",
      },
    });
    const connection = createConnection();
    service.stream(project, connection.request, connection.response);

    writeFileSync(join(featuresPath, "arbitrary-work-item.md"), "# Arbitrary work item\n");
    expect(getMemoryBankFingerprint(featuresPath)).not.toBe(initialFingerprint);
    await vi.advanceTimersByTimeAsync(250);
    expect(broadcastFileChange).toHaveBeenCalledWith("project-any", expect.objectContaining({
      category: "file-change",
      type: "file.poll",
    }));
    await vi.advanceTimersByTimeAsync(300);
    expect(connection.chunks.join("")).toContain('"eventType":"poll"');
    connection.request.emit("close");
  });

  it("reads polling configuration defensively", () => {
    expect(shouldPollMemoryBankEvents({ HEPHA_MEMORYBANK_USE_POLLING: "1" })).toBe(true);
    expect(shouldPollMemoryBankEvents({ CHOKIDAR_USEPOLLING: "1" })).toBe(true);
    expect(shouldPollMemoryBankEvents({})).toBe(false);
    expect(getMemoryBankPollingIntervalMs({ HEPHA_MEMORYBANK_POLL_INTERVAL_MS: "900" })).toBe(900);
    expect(getMemoryBankPollingIntervalMs({ HEPHA_MEMORYBANK_POLL_INTERVAL_MS: "249" })).toBe(1500);
    expect(getMemoryBankPollingIntervalMs({ HEPHA_MEMORYBANK_POLL_INTERVAL_MS: "invalid" })).toBe(1500);
  });
});
