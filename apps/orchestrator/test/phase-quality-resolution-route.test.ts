import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { handlePhaseQualityResolutionRoute } from "../src/transport/http/routes/phase-quality-resolution-route.js";

describe("phase quality HTTP command boundary", () => {
  const url = new URL("http://localhost/api/phase-quality/resolve");
  it("forwards only the posted decision to application admission and returns refreshed evidence", async () => {
    const input = { projectId: "sample", cardId: "work", phaseNumber: 8, gate: "tests", action: "repair", note: "Verify retry integration scenarios", expectedUpdatedAt: "current" };
    const request = Readable.from([JSON.stringify(input)]) as IncomingMessage; request.method = "POST";
    const response = { writeHead: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
    const result = { items: [], summary: "Repair admitted" } as never;
    const resolve = vi.fn(async () => result);
    expect(await handlePhaseQualityResolutionRoute(request, response, url, resolve)).toBe(true);
    expect(resolve).toHaveBeenCalledWith(input);
    expect(response.end).toHaveBeenCalledWith(JSON.stringify(result));
  });
  it("does not mutate through GET and propagates admission rejection", async () => {
    const response = { writeHead: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
    const resolve = vi.fn(async () => { throw new Error("Stale document"); });
    expect(await handlePhaseQualityResolutionRoute({ method: "GET" } as IncomingMessage, response, url, resolve)).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
    const request = Readable.from(["{} "]) as IncomingMessage; request.method = "POST";
    await expect(handlePhaseQualityResolutionRoute(request, response, url, resolve)).rejects.toThrow("Stale document");
    expect(response.end).not.toHaveBeenCalled();
  });
});
