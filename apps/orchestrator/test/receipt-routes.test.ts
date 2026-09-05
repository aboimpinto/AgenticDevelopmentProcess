import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { handleReceiptRoutes } from "../src/transport/http/routes/receipt-routes.js";

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

describe("receipt HTTP routes", () => {
  it("decodes project search filters", async () => {
    const search = vi.fn(async () => ({ results: [] }));
    const url = new URL("http://localhost/api/projects/project%20id/receipts?artifact=a&command=c&model=m&knowledgeRule=k");

    expect(await handleReceiptRoutes(
      { method: "GET" } as IncomingMessage, response(), url, { detail: vi.fn(), search },
    )).toBe(true);
    expect(search).toHaveBeenCalledWith({
      artifact: "a", command: "c", knowledgeRule: "k", model: "m", projectId: "project id",
    });
  });

  it("decodes detail identity and preserves its application status", async () => {
    const detail = vi.fn(async () => ({ body: { status: "not_found" }, status: 404 }));
    const outgoing = response();
    const url = new URL("http://localhost/api/projects/project/receipts/receipt%2Fid");

    expect(await handleReceiptRoutes(
      { method: "GET" } as IncomingMessage, outgoing, url, { detail, search: vi.fn() },
    )).toBe(true);
    expect(detail).toHaveBeenCalledWith({ projectId: "project", receiptId: "receipt/id" });
    expect(outgoing.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  it("maps collection and detail failures to their stable errors", async () => {
    const context = {
      detail: vi.fn(async () => { throw new Error("detail"); }),
      logError: vi.fn(),
      search: vi.fn(async () => { throw new Error("search"); }),
    };
    const collection = response();
    const detail = response();

    await handleReceiptRoutes(
      { method: "GET" } as IncomingMessage, collection,
      new URL("http://localhost/api/projects/p/receipts"), context,
    );
    await handleReceiptRoutes(
      { method: "GET" } as IncomingMessage, detail,
      new URL("http://localhost/api/projects/p/receipts/id"), context,
    );

    expect(collection.end).toHaveBeenCalledWith(JSON.stringify({ error: "Failed to search receipts." }));
    expect(detail.end).toHaveBeenCalledWith(JSON.stringify({ error: "Failed to retrieve receipt detail." }));
    expect(context.logError).toHaveBeenCalledTimes(2);
  });

  it("refuses unrelated paths and unsupported methods", async () => {
    const context = { detail: vi.fn(), search: vi.fn() };
    await expect(handleReceiptRoutes(
      { method: "GET" } as IncomingMessage, response(), new URL("http://localhost/api/tasks"), context,
    )).resolves.toBe(false);
    await expect(handleReceiptRoutes(
      { method: "POST" } as IncomingMessage, response(),
      new URL("http://localhost/api/projects/p/receipts"), context,
    )).resolves.toBe(false);
  });
});
