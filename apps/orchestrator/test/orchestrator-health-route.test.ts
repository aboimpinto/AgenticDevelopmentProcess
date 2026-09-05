import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { handleOrchestratorHealthRoute } from "../src/transport/http/routes/orchestrator-health-route.js";

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

describe("orchestrator health HTTP route", () => {
  it("serializes the supplied health projection", async () => {
    const outgoing = response();
    expect(await handleOrchestratorHealthRoute(
      { method: "GET" } as IncomingMessage, outgoing, new URL("http://localhost/api/health"),
      { read: () => ({ ok: true }) },
    )).toBe(true);
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify({ ok: true }));
  });

  it("refuses unrelated paths and unsupported methods", async () => {
    const context = { read: vi.fn() };
    await expect(handleOrchestratorHealthRoute(
      { method: "GET" } as IncomingMessage, response(), new URL("http://localhost/api/tasks"), context,
    )).resolves.toBe(false);
    await expect(handleOrchestratorHealthRoute(
      { method: "POST" } as IncomingMessage, response(), new URL("http://localhost/api/health"), context,
    )).resolves.toBe(false);
  });
});
