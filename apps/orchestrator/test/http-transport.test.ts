import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { ProjectRegistrationError } from "../src/project-registration.js";
import { setBaseHeaders } from "../src/transport/http/cors.js";
import { toProjectErrorResponse } from "../src/transport/http/orchestrator-error-response.js";
import { readJson } from "../src/transport/http/read-json.js";
import { createHttpRequestListener } from "../src/transport/http/request-listener.js";
import { sendJson } from "../src/transport/http/send-json.js";

function requestFrom(chunks: Array<string | Buffer>): IncomingMessage {
  return Readable.from(chunks) as IncomingMessage;
}

function responseDouble() {
  const headers = new Map<string, string>();
  const response = {
    end: vi.fn(),
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
    }),
    writeHead: vi.fn(),
  } as unknown as ServerResponse;

  return { headers, response };
}

describe("HTTP JSON request decoding", () => {
  it("decodes JSON split across string and Buffer chunks", async () => {
    const request = requestFrom(["{\"name\":", Buffer.from("\"HEPHA\"}")]);

    await expect(readJson<{ name: string }>(request)).resolves.toEqual({ name: "HEPHA" });
  });

  it("preserves the established empty-body contract", async () => {
    await expect(readJson<Record<string, never>>(requestFrom([]))).resolves.toEqual({});
  });

  it("rejects malformed JSON", async () => {
    await expect(readJson(requestFrom(["{not-json"]))).rejects.toBeInstanceOf(SyntaxError);
  });
});

describe("HTTP JSON response serialization", () => {
  it("writes the status, UTF-8 JSON content type, and serialized body", () => {
    const { response } = responseDouble();

    sendJson(response, 201, { created: true });

    expect(response.writeHead).toHaveBeenCalledWith(201, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(response.end).toHaveBeenCalledWith('{"created":true}');
  });
});

describe("HTTP base headers", () => {
  it("sets the loopback CORS contract", () => {
    const { headers, response } = responseDouble();

    setBaseHeaders(response);

    expect(headers).toEqual(new Map([
      ["access-control-allow-origin", "http://127.0.0.1:5173"],
      ["access-control-allow-methods", "GET,POST,OPTIONS"],
      ["access-control-allow-headers", "Content-Type"],
    ]));
  });
});

describe("orchestrator HTTP error mapping", () => {
  it("maps a typed project-registration failure without losing its contract fields", () => {
    const error = new ProjectRegistrationError(
      "MISSING_FOLDER",
      "rootPath",
      "Project root path does not exist",
    );

    expect(toProjectErrorResponse(error)).toEqual({
      body: {
        code: "MISSING_FOLDER",
        error: "Project root path does not exist",
        field: "rootPath",
      },
      statusCode: 400,
    });
  });

  it("sanitizes a non-Error failure into the generic 500 contract", () => {
    expect(toProjectErrorResponse("failure")).toEqual({
      body: { error: "Unknown orchestrator error" },
      statusCode: 500,
    });
  });
});

describe("HTTP request listener", () => {
  it("delegates successful requests without writing an extra response", async () => {
    const { response } = responseDouble();
    const request = requestFrom([]);
    const dispatch = vi.fn(async () => {
      sendJson(response, 200, { ok: true });
    });
    const listener = createHttpRequestListener({
      dispatch,
      mapError: toProjectErrorResponse,
      reportError: vi.fn(),
    });

    listener(request, response);

    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith(request, response));
    expect(response.end).toHaveBeenCalledTimes(1);
  });

  it("maps, reports, and serializes a rejected request", async () => {
    const { response } = responseDouble();
    const request = requestFrom([]);
    const failure = new ProjectRegistrationError(
      "MISSING_FIELD",
      "rootPath",
      "Project root path is required",
    );
    const reportError = vi.fn();
    const listener = createHttpRequestListener({
      dispatch: vi.fn().mockRejectedValue(failure),
      mapError: toProjectErrorResponse,
      reportError,
    });

    listener(request, response);

    await vi.waitFor(() => expect(response.end).toHaveBeenCalledOnce());
    const serializedBody = vi.mocked(response.end).mock.calls[0]?.[0];
    expect(JSON.parse(String(serializedBody))).toEqual({
      code: "MISSING_FIELD",
      error: "Project root path is required",
      field: "rootPath",
    });
    expect(reportError).toHaveBeenCalledWith(failure);
    expect(response.writeHead).toHaveBeenCalledWith(400, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });
});
