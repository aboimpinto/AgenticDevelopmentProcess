import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProjectSummary } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { handleProjectInitializationRoute } from "../src/transport/http/routes/project-initialization-route.js";

function request(pathname: string, method = "POST"): IncomingMessage {
  const value = Readable.from([]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function responseDouble(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

function project(): StoredProject {
  return {
    id: "project/encoded",
    createdAt: "2026-07-20T10:00:00.000Z",
    memoryBankPath: "/projects/encoded/MemoryBank",
    name: "Encoded",
    rootPath: "/projects/encoded",
    updatedAt: "2026-07-20T10:00:00.000Z",
  };
}

describe("project initialization HTTP route", () => {
  it("initializes the decoded project and returns its refreshed summary", async () => {
    const response = responseDouble();
    const storedProject = project();
    const initializeProject = vi.fn(async () => ({
      createdDirectories: ["/created"],
      createdFiles: ["/counter"],
    }));
    const summary = { id: storedProject.id, name: storedProject.name } as ProjectSummary;

    const handled = await handleProjectInitializationRoute(
      request("/api/projects/project%2Fencoded/initialize-memory-bank"),
      response,
      new URL("http://localhost/api/projects/project%2Fencoded/initialize-memory-bank"),
      {
        findProject: vi.fn(() => storedProject),
        initializeProject,
        summarizeProject: vi.fn(() => summary),
      },
    );

    expect(handled).toBe(true);
    expect(initializeProject).toHaveBeenCalledWith(storedProject);
    expect(response.writeHead).toHaveBeenCalledWith(201, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(JSON.parse(String(vi.mocked(response.end).mock.calls[0]?.[0]))).toEqual({
      createdDirectories: ["/created"],
      createdFiles: ["/counter"],
      project: summary,
    });
  });

  it("returns not found without invoking initialization", async () => {
    const response = responseDouble();
    const initializeProject = vi.fn();

    const handled = await handleProjectInitializationRoute(
      request("/api/projects/missing/initialize-memory-bank"),
      response,
      new URL("http://localhost/api/projects/missing/initialize-memory-bank"),
      {
        findProject: () => undefined,
        initializeProject,
        summarizeProject: vi.fn(),
      },
    );

    expect(handled).toBe(true);
    expect(initializeProject).not.toHaveBeenCalled();
    expect(response.writeHead).toHaveBeenCalledWith(404, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(response.end).toHaveBeenCalledWith('{"error":"Project not found"}');
  });

  it("does not claim another path or HTTP method", async () => {
    const context = {
      findProject: vi.fn(),
      initializeProject: vi.fn(),
      summarizeProject: vi.fn(),
    };

    await expect(handleProjectInitializationRoute(
      request("/api/projects/project/initialize-memory-bank", "GET"),
      responseDouble(),
      new URL("http://localhost/api/projects/project/initialize-memory-bank"),
      context,
    )).resolves.toBe(false);
    await expect(handleProjectInitializationRoute(
      request("/api/projects/project/work-items"),
      responseDouble(),
      new URL("http://localhost/api/projects/project/work-items"),
      context,
    )).resolves.toBe(false);
  });
});
