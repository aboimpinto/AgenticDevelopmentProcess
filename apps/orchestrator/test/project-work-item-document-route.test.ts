import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WorkItemDocumentDetail } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { handleProjectWorkItemDocumentRoute } from "../src/transport/http/routes/project-work-item-document-route.js";

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

describe("project work-item document HTTP route", () => {
  it("decodes both identities and returns the document projection", async () => {
    const response = responseDouble();
    const detail = { cardId: "card/encoded", externalId: "FEAT-099", kind: "feature", markdown: "# Document", testCoverage: null } as unknown as WorkItemDocumentDetail;
    const readDocument = vi.fn(() => detail);
    const coverage = { feature: { percent: 90 } } as never;
    const readTestCoverage = vi.fn(async () => coverage);

    const handled = await handleProjectWorkItemDocumentRoute(
      request("/api/projects/project%2Fencoded/work-items/card%2Fencoded/document"),
      response,
      new URL("http://localhost/api/projects/project%2Fencoded/work-items/card%2Fencoded/document"),
      { findProject: () => project, readDocument, readTestCoverage },
    );

    expect(handled).toBe(true);
    expect(readDocument).toHaveBeenCalledWith(project, "card/encoded");
    expect(readTestCoverage).toHaveBeenCalledWith(project.id, "feature:FEAT-099");
    expect(detail.testCoverage).toBe(coverage);
    expect(response.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(response.end).toHaveBeenCalledWith(JSON.stringify(detail));
  });

  it("returns project not found without reading a document", async () => {
    const response = responseDouble();
    const readDocument = vi.fn();

    expect(await handleProjectWorkItemDocumentRoute(
      request("/api/projects/missing/work-items/card/document"),
      response,
      new URL("http://localhost/api/projects/missing/work-items/card/document"),
      { findProject: () => undefined, readDocument },
    )).toBe(true);
    expect(readDocument).not.toHaveBeenCalled();
    expect(response.writeHead).toHaveBeenCalledWith(404, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  it("does not claim collection requests or unsupported methods", async () => {
    const context = { findProject: vi.fn(), readDocument: vi.fn() };
    await expect(handleProjectWorkItemDocumentRoute(
      request("/api/projects/project/work-items"),
      responseDouble(),
      new URL("http://localhost/api/projects/project/work-items"),
      context,
    )).resolves.toBe(false);
    await expect(handleProjectWorkItemDocumentRoute(
      request("/api/projects/project/work-items/card/document", "POST"),
      responseDouble(),
      new URL("http://localhost/api/projects/project/work-items/card/document"),
      context,
    )).resolves.toBe(false);
  });
});
