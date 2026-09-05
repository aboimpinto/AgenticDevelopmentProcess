import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WorkItemDocumentDetail } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { handleDesignArtifactRoutes } from "../src/transport/http/routes/design-artifact-routes.js";

function request(pathname: string, method = "GET"): IncomingMessage {
  const value = Readable.from([]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function responseDouble(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

const project = { id: "project", name: "Project" } as StoredProject;
const detail = {
  content: "# UX Research",
  readError: null,
  readStatus: "ok",
} as WorkItemDocumentDetail;

describe("design artifact HTTP routes", () => {
  it("returns a selected Markdown design artifact", async () => {
    const response = responseDouble();
    const readArtifact = vi.fn(() => detail);
    const path = "/api/projects/project/work-items/card/design-artifacts/UX-research-report.md";

    expect(await handleDesignArtifactRoutes(request(path), response, new URL(`http://localhost${path}`), {
      findProject: () => project,
      readArtifact,
      renderPdf: vi.fn(),
    })).toBe(true);
    expect(readArtifact).toHaveBeenCalledWith(project, "card", "UX-research-report.md");
    expect(response.end).toHaveBeenCalledWith(JSON.stringify(detail));
  });

  it("downloads a rendered PDF with safe response headers", async () => {
    const response = responseDouble();
    const path = "/api/projects/project/work-items/card/design-artifacts/design-summary.md/pdf";

    expect(await handleDesignArtifactRoutes(request(path), response, new URL(`http://localhost${path}`), {
      findProject: () => project,
      readArtifact: () => detail,
      renderPdf: vi.fn(async () => ({ bytes: Buffer.from("pdf"), fileName: "design-summary.pdf" })),
    })).toBe(true);
    expect(response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      "Content-Disposition": 'attachment; filename="design-summary.pdf"',
      "Content-Type": "application/pdf",
    }));
    expect(response.end).toHaveBeenCalledWith(Buffer.from("pdf"));
  });

  it("returns not found for an unsupported or missing artifact", async () => {
    const response = responseDouble();
    const path = "/api/projects/project/work-items/card/design-artifacts/unknown.md";

    const readArtifact = vi.fn(() => detail);

    await handleDesignArtifactRoutes(request(path), response, new URL(`http://localhost${path}`), {
      findProject: () => project,
      readArtifact,
      renderPdf: vi.fn(),
    });
    expect(response.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readArtifact).not.toHaveBeenCalled();
  });
});
