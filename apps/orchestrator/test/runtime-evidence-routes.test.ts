import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { decodeRuntimeEvidenceCursor, encodeRuntimeEvidenceCursor } from "../src/application/runtime-evidence/runtime-evidence-cursor.js";
import { handleRuntimeEvidenceRoutes } from "../src/transport/http/routes/runtime-evidence-routes.js";

function request(path: string, method = "GET", body?: unknown) {
  const value = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as IncomingMessage;
  value.method = method;
  value.url = path;
  return value;
}
function response() { return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse; }
function context() {
  return {
    readFeature: vi.fn(async () => ({ ok: true as const, value: { safe: true } })),
    readPhase: vi.fn(async () => ({ ok: true as const, value: { safe: true } })),
    recordDirect: vi.fn(async () => ({ ok: true as const, value: { safe: true } as never })),
  };
}

describe("runtime evidence HTTP routes", () => {
  it("decodes the summary identity and returns only the application projection", async () => {
    const outgoing = response();
    const routes = context();
    const url = new URL("http://localhost/api/projects/project%2Fpublic/features/feature%3AFEAT-TEST/runtime-evidence");
    expect(await handleRuntimeEvidenceRoutes(request(url.pathname), outgoing, url, routes)).toBe(true);
    expect(routes.readFeature).toHaveBeenCalledWith({ projectId: "project/public", cardKey: "feature:FEAT-TEST" });
    expect(outgoing.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "application/json; charset=utf-8" });
  });

  it("validates and decodes the bounded detail query before application work", async () => {
    const cursor = encodeRuntimeEvidenceCursor({ startedAt: "2026-07-23T10:00:00.000Z", mode: "orchestrated", executionId: "invocation-1" });
    const routes = context();
    const outgoing = response();
    const url = new URL(`http://localhost/api/projects/project/features/feature%3AFEAT-TEST/runtime-evidence/phases/delivery-contract/executions?cursor=${cursor}&limit=64`);
    expect(await handleRuntimeEvidenceRoutes(request(`${url.pathname}${url.search}`), outgoing, url, routes)).toBe(true);
    expect(routes.readPhase).toHaveBeenCalledWith({
      projectId: "project", cardKey: "feature:FEAT-TEST", phaseExecutionContractId: "delivery-contract", cursor, limit: 64,
    });
  });

  it("requires the exact mode-qualified cursor tuple", () => {
    const valid = { schemaVersion: "runtime-evidence-cursor/v1", startedAt: "2026-07-23T10:00:00.000Z", mode: "direct_host", executionId: "same-id" };
    expect(decodeRuntimeEvidenceCursor(Buffer.from(JSON.stringify(valid)).toString("base64url"))).toEqual({
      startedAt: valid.startedAt,
      mode: "direct_host",
      executionId: "same-id",
    });
    for (const candidate of [
      (({ mode: _mode, ...rest }) => rest)(valid),
      { ...valid, mode: null },
      { ...valid, mode: "legacy" },
      { ...valid, executionId: null },
      { ...valid, extra: "forbidden" },
    ]) expect(decodeRuntimeEvidenceCursor(Buffer.from(JSON.stringify(candidate)).toString("base64url"))).toBeNull();
  });

  it("records only identity-matched direct-host evidence through the public write boundary", async () => {
    const routes = context();
    const outgoing = response();
    const direct = {
      schemaVersion: "runtime-execution/v1", mode: "direct_host", evidenceId: "direct-1",
      projectId: "project", cardKey: "feature:FEAT-TEST",
    };
    const url = new URL("http://localhost/api/projects/project/features/feature%3AFEAT-TEST/runtime-evidence/direct-host");
    expect(await handleRuntimeEvidenceRoutes(request(url.pathname, "POST", direct), outgoing, url, routes)).toBe(true);
    expect(routes.recordDirect).toHaveBeenCalledWith(direct);
    expect(outgoing.writeHead).toHaveBeenCalledWith(201, { "Content-Type": "application/json; charset=utf-8" });

    const rejectedRoutes = context();
    const rejected = response();
    expect(await handleRuntimeEvidenceRoutes(
      request(url.pathname, "POST", { ...direct, cardKey: "feature:FOREIGN" }), rejected, url, rejectedRoutes,
    )).toBe(true);
    expect(rejectedRoutes.recordDirect).not.toHaveBeenCalled();
    expect(rejected.writeHead).toHaveBeenCalledWith(400, { "Content-Type": "application/json; charset=utf-8" });
  });

  it.each([
    "?limit=0",
    "?limit=65",
    "?limit=1&limit=2",
    "?cursor=not-a-closed-cursor",
    "?rawSql=select",
  ])("rejects malformed query %s without service work or raw diagnostics", async (query) => {
    const routes = context();
    const outgoing = response();
    const url = new URL(`http://localhost/api/projects/project/features/feature%3AFEAT-TEST/runtime-evidence/phases/delivery-contract/executions${query}`);
    expect(await handleRuntimeEvidenceRoutes(request(`${url.pathname}${url.search}`), outgoing, url, routes)).toBe(true);
    expect(routes.readPhase).not.toHaveBeenCalled();
    expect(outgoing.writeHead).toHaveBeenCalledWith(400, { "Content-Type": "application/json; charset=utf-8" });
    expect(String(vi.mocked(outgoing.end).mock.calls[0]?.[0])).not.toMatch(/select|sqlite|secret/iu);
  });
});
