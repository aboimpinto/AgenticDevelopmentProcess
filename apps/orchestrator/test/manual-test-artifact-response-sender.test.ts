import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { ManualTestArtifactResponseSender } from "../src/transport/http/manual-test-artifact-response-sender.js";

function responseHarness() {
  const response = { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
  return response;
}

const input = { cardId: "card-any", download: true, format: "pdf" as const, projectId: "project" };

describe("manual-test artifact response sender", () => {
  it("streams a resolved artifact with download and content-safety headers", async () => {
    const content = Buffer.from("artifact");
    const sender = new ManualTestArtifactResponseSender({
      readFile: vi.fn(() => content),
      resolveArtifact: vi.fn(async () => ({
        disposition: "attachment", fileName: "verification.pdf", mimeType: "application/pdf", path: "/artifact.pdf",
      })),
    });
    const response = responseHarness();
    await sender.send(response, input);
    expect(response.writeHead).toHaveBeenCalledWith(200, {
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="verification.pdf"',
      "Content-Length": content.length,
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    });
    expect(response.end).toHaveBeenCalledWith(content);
  });

  it("returns the canonical not-found response when resolution fails", async () => {
    const sender = new ManualTestArtifactResponseSender({
      readFile: vi.fn(), resolveArtifact: vi.fn(async () => null),
    });
    const response = responseHarness();
    await sender.send(response, input);
    expect(response.writeHead).toHaveBeenCalledWith(404, { "Content-Type": "application/json; charset=utf-8" });
    expect(response.end).toHaveBeenCalledWith(JSON.stringify({ error: "Artifact not found." }));
  });

  it("maps a disappeared resolved file to the same not-found boundary", async () => {
    const sender = new ManualTestArtifactResponseSender({
      readFile: vi.fn(() => { throw new Error("gone"); }),
      resolveArtifact: vi.fn(async () => ({
        disposition: "inline", fileName: "verification.md", mimeType: "text/markdown", path: "/gone.md",
      })),
    });
    const response = responseHarness();
    await sender.send(response, { ...input, download: false, format: "markdown" });
    expect(response.writeHead).toHaveBeenCalledWith(404, { "Content-Type": "application/json; charset=utf-8" });
  });
});
