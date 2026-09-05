import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type {
  SubmitEpicInput,
  SubmitEpicResponse,
  SubmitFeatureInput,
  SubmitFeatureResponse,
} from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { handleWorkItemSubmissionRoutes } from "../src/transport/http/routes/work-item-submission-routes.js";

function request(pathname: string, body: unknown, method = "POST"): IncomingMessage {
  const value = Readable.from([JSON.stringify(body)]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

describe("work-item submission HTTP routes", () => {
  it("decodes an EPIC submission and returns the created projection", async () => {
    const outgoing = response();
    const input = { projectId: "project", title: "Delivery" } as SubmitEpicInput;
    const body = { summary: "Submitted EPIC-001: Delivery." } as unknown as SubmitEpicResponse;
    const submitEpic = vi.fn(async () => body);

    expect(await handleWorkItemSubmissionRoutes(
      request("/api/submit-epic", input),
      outgoing,
      new URL("http://localhost/api/submit-epic"),
      { submitEpic, submitFeature: vi.fn() },
    )).toBe(true);
    expect(submitEpic).toHaveBeenCalledWith(input);
    expect(outgoing.writeHead).toHaveBeenCalledWith(201, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify(body));
  });

  it("decodes a FEAT submission and returns the created projection", async () => {
    const outgoing = response();
    const input = {
      projectId: "project",
      summary: "Expose one focused command.",
      title: "Submission boundary",
    } as SubmitFeatureInput;
    const body = { summary: "Submitted FEAT-001: Submission boundary." } as unknown as SubmitFeatureResponse;
    const submitFeature = vi.fn(async () => body);

    expect(await handleWorkItemSubmissionRoutes(
      request("/api/submit-feature", input),
      outgoing,
      new URL("http://localhost/api/submit-feature"),
      { submitEpic: vi.fn(), submitFeature },
    )).toBe(true);
    expect(submitFeature).toHaveBeenCalledWith(input);
    expect(outgoing.writeHead).toHaveBeenCalledWith(201, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify(body));
  });

  it("refuses unrelated paths and methods", async () => {
    const context = { submitEpic: vi.fn(), submitFeature: vi.fn() };

    await expect(handleWorkItemSubmissionRoutes(
      request("/api/epic-refinements", {}),
      response(),
      new URL("http://localhost/api/epic-refinements"),
      context,
    )).resolves.toBe(false);
    await expect(handleWorkItemSubmissionRoutes(
      request("/api/submit-feature", {}, "GET"),
      response(),
      new URL("http://localhost/api/submit-feature"),
      context,
    )).resolves.toBe(false);
  });
});
