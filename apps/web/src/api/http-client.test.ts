// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createHttpClient, getErrorMessage, getHttpError } from "./http-client.js";

function response(input: {
  body?: unknown;
  contentType?: string;
  ok: boolean;
  status: number;
}): Response {
  return {
    headers: new Headers({ "content-type": input.contentType ?? "application/json" }),
    json: vi.fn().mockResolvedValue(input.body),
    ok: input.ok,
    status: input.status,
  } as unknown as Response;
}

describe("createHttpClient", () => {
  it("returns typed JSON through GET without adding request options", async () => {
    const transport = vi.fn().mockResolvedValue(response({ body: { value: 7 }, ok: true, status: 200 }));
    const client = createHttpClient(transport);

    await expect(client.get<{ value: number }>("/api/value")).resolves.toEqual({ value: 7 });
    expect(transport).toHaveBeenCalledWith("/api/value", undefined);
  });

  it("encodes POST bodies and the JSON content type exactly once", async () => {
    const transport = vi.fn().mockResolvedValue(response({ body: { accepted: true }, ok: true, status: 201 }));
    const client = createHttpClient(transport);

    await client.post("/api/actions", { action: "continue" });

    expect(transport).toHaveBeenCalledWith("/api/actions", {
      body: JSON.stringify({ action: "continue" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  });

  it("uses a safe server error and falls back to the response status", async () => {
    const serverFailure = createHttpClient(
      vi.fn().mockResolvedValue(response({ body: { error: "Action refused" }, ok: false, status: 409 })),
    );
    const fallbackFailure = createHttpClient(
      vi.fn().mockResolvedValue(response({ body: { message: "private" }, ok: false, status: 503 })),
    );

    await expect(serverFailure.get("/api/action")).rejects.toThrow("Action refused");
    await expect(fallbackFailure.get("/api/action")).rejects.toThrow("Request failed with 503");
  });

  it("does not attempt JSON parsing for a non-JSON success", async () => {
    const rawResponse = response({ contentType: "text/plain", ok: true, status: 204 });
    const client = createHttpClient(vi.fn().mockResolvedValue(rawResponse));

    await expect(client.request("/api/empty", { method: "DELETE" })).resolves.toBeNull();
    expect(rawResponse.json).not.toHaveBeenCalled();
  });
});

describe("HTTP error presentation", () => {
  it("accepts only an object with a string error field", () => {
    expect(getHttpError({ error: "safe" })).toBe("safe");
    expect(getHttpError([{ error: "array" }])).toBeNull();
    expect(getHttpError({ error: 400 })).toBeNull();
    expect(getHttpError(null)).toBeNull();
  });

  it("presents Error messages without exposing arbitrary values", () => {
    expect(getErrorMessage(new Error("offline"))).toBe("offline");
    expect(getErrorMessage({ secret: "value" })).toBe("Unknown dashboard error");
  });
});
