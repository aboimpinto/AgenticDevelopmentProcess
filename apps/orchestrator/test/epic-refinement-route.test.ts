import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { SubmitEpicRefinementInput, SubmitEpicRefinementResponse } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { handleEpicRefinementRoute } from "../src/transport/http/routes/epic-refinement-route.js";

function request(pathname: string, body: unknown, method = "POST"): IncomingMessage {
  const value = Readable.from([JSON.stringify(body)]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

describe("EPIC refinement HTTP route", () => {
  it("decodes and delegates a refinement command", async () => {
    const outgoing = response();
    const input = {
      cardId: "epic-card",
      projectId: "project",
      request: "Clarify the delivery boundary.",
    } as SubmitEpicRefinementInput;
    const body = { summary: "Refined EPIC-001." } as unknown as SubmitEpicRefinementResponse;
    const submitRefinement = vi.fn(async () => body);

    expect(await handleEpicRefinementRoute(
      request("/api/epic-refinements", input),
      outgoing,
      new URL("http://localhost/api/epic-refinements"),
      { submitRefinement },
    )).toBe(true);
    expect(submitRefinement).toHaveBeenCalledWith(input);
    expect(outgoing.writeHead).toHaveBeenCalledWith(201, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify(body));
  });

  it("refuses sibling paths and unsupported methods", async () => {
    const context = { submitRefinement: vi.fn() };

    await expect(handleEpicRefinementRoute(
      request("/api/submit-epic", {}),
      response(),
      new URL("http://localhost/api/submit-epic"),
      context,
    )).resolves.toBe(false);
    await expect(handleEpicRefinementRoute(
      request("/api/epic-refinements", {}, "GET"),
      response(),
      new URL("http://localhost/api/epic-refinements"),
      context,
    )).resolves.toBe(false);
  });
});
