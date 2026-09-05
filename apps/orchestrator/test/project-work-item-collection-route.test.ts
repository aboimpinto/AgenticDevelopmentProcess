import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WorkItemListResponse, WorkItemScanStatus } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { handleProjectWorkItemCollectionRoute } from "../src/transport/http/routes/project-work-item-collection-route.js";

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

const scanStatus: WorkItemScanStatus = {
  epicDocumentCount: 0,
  epicFolderExists: true,
  epicInvalidSourceCount: 0,
  epicScanFailed: false,
  epicValidItemCount: 0,
  message: null,
};

describe("project work-item collection HTTP route", () => {
  it("scans the decoded project and sends the projected collection", async () => {
    const response = responseDouble();
    const scanResult = { items: [], scanStatus, sourceIssues: [] };
    const body = { items: [], scanStatus, sourceIssues: [], project: {}, scannedAt: "now" } as WorkItemListResponse;
    const scanProject = vi.fn(async () => scanResult);
    const projectResponse = vi.fn(() => body);

    const handled = await handleProjectWorkItemCollectionRoute(
      request("/api/projects/project%2Fencoded/work-items"),
      response,
      new URL("http://localhost/api/projects/project%2Fencoded/work-items"),
      { findProject: () => project, projectResponse, scanProject },
    );

    expect(handled).toBe(true);
    expect(scanProject).toHaveBeenCalledWith(project);
    expect(projectResponse).toHaveBeenCalledWith(project, scanResult);
    expect(response.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(response.end).toHaveBeenCalledWith(JSON.stringify(body));
  });

  it("returns not found without scanning", async () => {
    const response = responseDouble();
    const scanProject = vi.fn();

    const handled = await handleProjectWorkItemCollectionRoute(
      request("/api/projects/missing/work-items"),
      response,
      new URL("http://localhost/api/projects/missing/work-items"),
      { findProject: () => undefined, projectResponse: vi.fn(), scanProject },
    );

    expect(handled).toBe(true);
    expect(scanProject).not.toHaveBeenCalled();
    expect(response.writeHead).toHaveBeenCalledWith(404, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  it("does not claim another path or method", async () => {
    const context = { findProject: vi.fn(), projectResponse: vi.fn(), scanProject: vi.fn() };
    await expect(handleProjectWorkItemCollectionRoute(
      request("/api/projects/project/document"),
      responseDouble(),
      new URL("http://localhost/api/projects/project/document"),
      context,
    )).resolves.toBe(false);
    await expect(handleProjectWorkItemCollectionRoute(
      request("/api/projects/project/work-items", "POST"),
      responseDouble(),
      new URL("http://localhost/api/projects/project/work-items"),
      context,
    )).resolves.toBe(false);
  });
});
