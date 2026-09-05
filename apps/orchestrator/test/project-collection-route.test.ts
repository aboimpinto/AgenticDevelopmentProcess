import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProjectSummary } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { handleProjectCollectionRoute } from "../src/transport/http/routes/project-collection-route.js";

function project(id: string, name: string): StoredProject {
  return {
    id,
    createdAt: "2026-07-20T10:00:00.000Z",
    memoryBankPath: `/projects/${id}/MemoryBank`,
    name,
    rootPath: `/projects/${id}`,
    updatedAt: "2026-07-20T10:00:00.000Z",
  };
}

function summary(value: StoredProject): ProjectSummary {
  return {
    id: value.id,
    counts: {
      "00_EPICS": 0,
      "01_SUBMITTED": 0,
      "02_READY_TO_DEVELOP": 0,
      "03_IN_PROGRESS": 0,
      "04_COMPLETED": 0,
      "05_CANCELLED": 0,
    },
    createdAt: value.createdAt,
    defaultBranch: "master",
    detectedStack: ["Node.js"],
    featuresRootExists: true,
    memoryBankPath: value.memoryBankPath,
    memoryBankRelativePath: "MemoryBank",
    name: value.name,
    needsInitialization: false,
    rootPath: value.rootPath,
    updatedAt: value.updatedAt,
  };
}

function request(method: string, pathname: string, body = ""): IncomingMessage {
  const value = Readable.from(body ? [body] : []) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function responseDouble() {
  const response = {
    end: vi.fn(),
    writeHead: vi.fn(),
  } as unknown as ServerResponse;
  return response;
}

describe("project collection HTTP route", () => {
  it("lists summarized projects in a stable name order", async () => {
    const response = responseDouble();
    const alpha = project("alpha", "Alpha");
    const zulu = project("zulu", "Zulu");

    const handled = await handleProjectCollectionRoute(
      request("GET", "/api/projects"),
      response,
      new URL("http://localhost/api/projects"),
      {
        createProject: vi.fn(),
        listProjects: () => [zulu, alpha],
        summarizeProject: summary,
      },
    );

    expect(handled).toBe(true);
    expect(response.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(JSON.parse(String(vi.mocked(response.end).mock.calls[0]?.[0]))).toEqual({
      projects: [summary(alpha), summary(zulu)],
    });
  });

  it("decodes and delegates project creation before returning its summary", async () => {
    const response = responseDouble();
    const created = project("created", "Created project");
    const createProject = vi.fn(() => created);
    const input = {
      memoryBankPath: "MemoryBank",
      name: "Created project",
      rootPath: "/projects/created",
    };

    const handled = await handleProjectCollectionRoute(
      request("POST", "/api/projects", JSON.stringify(input)),
      response,
      new URL("http://localhost/api/projects"),
      {
        createProject,
        listProjects: () => [],
        summarizeProject: summary,
      },
    );

    expect(handled).toBe(true);
    expect(createProject).toHaveBeenCalledWith(input);
    expect(response.writeHead).toHaveBeenCalledWith(201, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(JSON.parse(String(vi.mocked(response.end).mock.calls[0]?.[0]))).toEqual({
      project: summary(created),
    });
  });

  it("does not claim unrelated paths or unsupported methods", async () => {
    const context = {
      createProject: vi.fn(),
      listProjects: vi.fn(() => []),
      summarizeProject: vi.fn(summary),
    };

    await expect(handleProjectCollectionRoute(
      request("GET", "/api/health"),
      responseDouble(),
      new URL("http://localhost/api/health"),
      context,
    )).resolves.toBe(false);
    await expect(handleProjectCollectionRoute(
      request("DELETE", "/api/projects"),
      responseDouble(),
      new URL("http://localhost/api/projects"),
      context,
    )).resolves.toBe(false);
    expect(context.listProjects).not.toHaveBeenCalled();
    expect(context.createProject).not.toHaveBeenCalled();
  });
});
