import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { LinkFeatureToEpicInput, LinkFeatureToEpicResponse } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { handleFeatureEpicLinkRoute } from "../src/transport/http/routes/feature-epic-link-route.js";

function request(pathname: string, body: unknown, method = "POST"): IncomingMessage {
  const value = Readable.from([JSON.stringify(body)]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

describe("feature-to-EPIC link HTTP route", () => {
  it("resolves decoded identities and delegates the relationship command", async () => {
    const outgoing = response();
    const project = { id: "project id" } as StoredProject;
    const input = { operation: "link", targetEpicCardId: "EPIC-001" } as LinkFeatureToEpicInput;
    const body = { summary: "Linked." } as unknown as LinkFeatureToEpicResponse;
    const linkFeatureToEpic = vi.fn(async () => body);
    const findProject = vi.fn(() => project);
    const url = new URL("http://localhost/api/projects/project%20id/features/FEAT-001/link-epic");

    expect(await handleFeatureEpicLinkRoute(
      request(url.pathname, input),
      outgoing,
      url,
      { findProject, linkFeatureToEpic },
    )).toBe(true);
    expect(findProject).toHaveBeenCalledWith("project id");
    expect(linkFeatureToEpic).toHaveBeenCalledWith(project, "FEAT-001", input);
    expect(outgoing.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify(body));
  });

  it("returns not found without decoding or dispatching a body", async () => {
    const outgoing = response();
    const linkFeatureToEpic = vi.fn();
    const url = new URL("http://localhost/api/projects/missing/features/FEAT-001/link-epic");

    expect(await handleFeatureEpicLinkRoute(
      request(url.pathname, { operation: "link" }),
      outgoing,
      url,
      { findProject: () => undefined, linkFeatureToEpic },
    )).toBe(true);
    expect(linkFeatureToEpic).not.toHaveBeenCalled();
    expect(outgoing.writeHead).toHaveBeenCalledWith(404, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify({ error: "Project not found" }));
  });

  it("refuses sibling paths and unsupported methods", async () => {
    const context = { findProject: vi.fn(), linkFeatureToEpic: vi.fn() };

    await expect(handleFeatureEpicLinkRoute(
      request("/api/projects/project/features/FEAT-001/document", {}),
      response(),
      new URL("http://localhost/api/projects/project/features/FEAT-001/document"),
      context,
    )).resolves.toBe(false);
    await expect(handleFeatureEpicLinkRoute(
      request("/api/projects/project/features/FEAT-001/link-epic", {}, "GET"),
      response(),
      new URL("http://localhost/api/projects/project/features/FEAT-001/link-epic"),
      context,
    )).resolves.toBe(false);
  });
});
