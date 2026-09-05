import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { FeatureWorkflowConsoleResponse, WorkflowConsoleCleanupResponse } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { handleWorkflowConsoleRoutes } from "../src/transport/http/routes/workflow-console-routes.js";

function request(pathname: string, body?: unknown, method = "GET"): IncomingMessage {
  const value = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

describe("workflow console HTTP routes", () => {
  it("reads a decoded workflow run console", async () => {
    const outgoing = response();
    const body = { files: [], refreshedAt: "now", runId: "run id" } as FeatureWorkflowConsoleResponse;
    const readConsole = vi.fn(() => body);
    const url = new URL("http://localhost/api/workflow-console/run%20id");

    expect(await handleWorkflowConsoleRoutes(
      request(url.pathname), outgoing, url,
      { cleanupConsole: vi.fn(), readConsole },
    )).toBe(true);
    expect(readConsole).toHaveBeenCalledWith("run id");
    expect(outgoing.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify(body));
  });

  it("decodes cleanup input and normalizes an omitted retained run", async () => {
    const outgoing = response();
    const body = {
      deletedFiles: [], keepRunId: null, keptFiles: [], refreshedAt: "now",
    } as WorkflowConsoleCleanupResponse;
    const cleanupConsole = vi.fn(() => body);

    expect(await handleWorkflowConsoleRoutes(
      request("/api/workflow-console-cleanup", {}, "POST"),
      outgoing,
      new URL("http://localhost/api/workflow-console-cleanup"),
      { cleanupConsole, readConsole: vi.fn() },
    )).toBe(true);
    expect(cleanupConsole).toHaveBeenCalledWith(null);
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify(body));
  });

  it("refuses sibling paths and unsupported methods", async () => {
    const context = { cleanupConsole: vi.fn(), readConsole: vi.fn() };
    await expect(handleWorkflowConsoleRoutes(
      request("/api/workflow-console"), response(),
      new URL("http://localhost/api/workflow-console"), context,
    )).resolves.toBe(false);
    await expect(handleWorkflowConsoleRoutes(
      request("/api/workflow-console/run", undefined, "POST"), response(),
      new URL("http://localhost/api/workflow-console/run"), context,
    )).resolves.toBe(false);
  });
});
