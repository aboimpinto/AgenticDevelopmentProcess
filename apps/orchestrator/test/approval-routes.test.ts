import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { handleApprovalRoutes } from "../src/transport/http/routes/approval-routes.js";

function request(pathname: string, body?: unknown, method = "GET"): IncomingMessage {
  const value = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

describe("approval HTTP routes", () => {
  it("parses bounded list filters and default project identity", async () => {
    const list = vi.fn(async () => ({ approvals: [] }));
    const url = new URL("http://localhost/api/approvals?status=all&limit=999");

    expect(await handleApprovalRoutes(
      request(url.pathname), response(), url,
      { defaultProjectId: () => "project", list, resolve: vi.fn() },
    )).toBe(true);
    expect(list).toHaveBeenCalledWith({ limit: 200, projectId: "project", status: "all" });
  });

  it("decodes resolution identity/body and preserves application status", async () => {
    const input = { decision: "approve", reason: "Reviewed" };
    const resolveApproval = vi.fn(async () => ({
      body: { status: "approved" }, status: 200,
    }));
    const outgoing = response();
    const pathname = "/api/approvals/approval%20id/resolve";

    expect(await handleApprovalRoutes(
      request(pathname, input, "POST"), outgoing, new URL(`http://localhost${pathname}`),
      { defaultProjectId: () => "default", list: vi.fn(), resolve: resolveApproval },
    )).toBe(true);
    expect(resolveApproval).toHaveBeenCalledWith("approval id", input);
    expect(outgoing.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  it("refuses unrelated paths and unsupported methods", async () => {
    const context = { defaultProjectId: () => "default", list: vi.fn(), resolve: vi.fn() };
    await expect(handleApprovalRoutes(
      request("/api/tasks"), response(), new URL("http://localhost/api/tasks"), context,
    )).resolves.toBe(false);
    await expect(handleApprovalRoutes(
      request("/api/approvals/id/resolve", undefined, "GET"), response(),
      new URL("http://localhost/api/approvals/id/resolve"), context,
    )).resolves.toBe(false);
  });
});
