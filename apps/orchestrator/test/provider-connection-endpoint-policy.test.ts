// Behavior suite: provider connection endpoint policy.
/**
 * FEAT-058: Endpoint Policy Tests
 *
 * Tests for URL classification, endpoint validation, redirect handling,
 * and transport behavior.
 */

import { describe, expect, it } from "vitest";
import {
  classifyEndpoint,
  FakeEndpointTransport,
} from "../src/provider-connections/endpoint-policy.js";

// ---------------------------------------------------------------------------
// classifyEndpoint
// ---------------------------------------------------------------------------

describe("classifyEndpoint", () => {
  it("classifies remote HTTPS as valid", () => {
    const result = classifyEndpoint("https://api.openai.com/v1");
    expect(result.valid).toBe(true);
    expect(result.classification).toBe("remote_https");
  });

  it("rejects remote HTTP endpoint", () => {
    const result = classifyEndpoint("http://api.openai.com/v1");
    expect(result.valid).toBe(false);
    expect(result.failureCode).toBe("invalid_endpoint");
    expect(result.safeMessage).toContain("HTTPS");
  });

  it("classifies localhost as local and valid", () => {
    const result = classifyEndpoint("http://localhost:8080/v1");
    expect(result.valid).toBe(true);
    expect(result.classification).toBe("local");
  });

  it("classifies 127.0.0.1 as local and valid", () => {
    const result = classifyEndpoint("http://127.0.0.1:11434/v1");
    expect(result.valid).toBe(true);
    expect(result.classification).toBe("local");
  });

  it("classifies private 10.x.x.x as local", () => {
    const result = classifyEndpoint("http://10.0.0.5:8080/");
    expect(result.valid).toBe(true);
    expect(result.classification).toBe("local");
  });

  it("classifies 192.168.x.x as local", () => {
    const result = classifyEndpoint("http://192.168.1.100:3000/");
    expect(result.valid).toBe(true);
    expect(result.classification).toBe("local");
  });

  it("rejects unparseable URL", () => {
    const result = classifyEndpoint("not-a-url");
    expect(result.valid).toBe(false);
    expect(result.failureCode).toBe("invalid_endpoint");
  });

  it("rejects empty URL", () => {
    const result = classifyEndpoint("");
    expect(result.valid).toBe(false);
    expect(result.failureCode).toBe("invalid_endpoint");
  });
});

// ---------------------------------------------------------------------------
// FakeEndpointTransport
// ---------------------------------------------------------------------------

describe("FakeEndpointTransport", () => {
  it("returns 200 for default response", async () => {
    const transport = new FakeEndpointTransport();
    const result = await transport.check("https://api.test.com/v1");
    expect(result.success).toBe(true);
    expect(result.httpStatusCode).toBe(200);
  });

  it("returns configured response for specific URL", async () => {
    const transport = new FakeEndpointTransport();
    transport.setResponse("https://api.test.com/v1", { statusCode: 401 });

    const result = await transport.check("https://api.test.com/v1");
    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("auth_failed");
    expect(result.httpStatusCode).toBe(401);
  });

  it("simulates network error", async () => {
    const transport = new FakeEndpointTransport();
    transport.setSimulateNetworkError(true);

    const result = await transport.check("https://api.test.com/v1");
    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("unreachable");
  });

  it("rejects redirect to different host", async () => {
    const transport = new FakeEndpointTransport();
    transport.setResponse("https://api.test.com/v1", {
      statusCode: 302,
      headers: { location: "https://evil.com/redirect" },
    });

    const result = await transport.check("https://api.test.com/v1");
    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("redirect_rejected");
    expect(result.safeMessage).toContain("evil.com");
  });

  it("accepts same-host redirect", async () => {
    const transport = new FakeEndpointTransport();
    transport.setResponse("https://api.test.com/v1", {
      statusCode: 302,
      headers: { location: "https://api.test.com/v2" },
    });

    const result = await transport.check("https://api.test.com/v1");
    expect(result.success).toBe(true);
    expect(result.failureCode).toBeNull();
  });

  it("rejects HTTPS to HTTP protocol downgrade redirect", async () => {
    const transport = new FakeEndpointTransport();
    transport.setResponse("https://api.test.com/v1", {
      statusCode: 302,
      headers: { location: "http://api.test.com/v2" },
    });

    const result = await transport.check("https://api.test.com/v1");
    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("protocol_downgrade");
  });

  it("returns auth_failed for 403", async () => {
    const transport = new FakeEndpointTransport();
    transport.setResponse("https://api.test.com/v1", { statusCode: 403 });

    const result = await transport.check("https://api.test.com/v1");
    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("auth_failed");
  });

  it("returns http_error for 500", async () => {
    const transport = new FakeEndpointTransport();
    transport.setResponse("https://api.test.com/v1", { statusCode: 500 });

    const result = await transport.check("https://api.test.com/v1");
    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("http_error");
    expect(result.httpStatusCode).toBe(500);
  });

  it("simulates timeout via network error", async () => {
    const transport = new FakeEndpointTransport();
    transport.setSimulateNetworkError(true);

    const result = await transport.check("https://timeout.test/v1");
    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("unreachable");
    expect(result.safeMessage).toBe("Cannot reach endpoint");
    expect(result.httpStatusCode).toBeNull();
  });

  it("rejects 2xx redirect as not applicable (not an actual redirect)", async () => {
    const transport = new FakeEndpointTransport();
    transport.setResponse("https://api.test.com/v1", {
      statusCode: 200,
      headers: { location: "/ignore" },
    });

    const result = await transport.check("https://api.test.com/v1");
    // 200 with location is not a redirect — treated as success
    expect(result.success).toBe(true);
    expect(result.failureCode).toBeNull();
  });

  it("handles unknown status code gracefully", async () => {
    const transport = new FakeEndpointTransport();
    transport.setResponse("https://api.test.com/v1", { statusCode: 199 });

    const result = await transport.check("https://api.test.com/v1");
    expect(result.success).toBe(true);
    expect(result.failureCode).toBeNull();
  });

  it("preserves safe message for HTTP error codes", async () => {
    const transport = new FakeEndpointTransport();
    transport.setResponse("https://api.test.com/v1", { statusCode: 503 });

    const result = await transport.check("https://api.test.com/v1");
    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("http_error");
    expect(result.safeMessage).toEqual("Endpoint returned HTTP 503");
    expect(result.httpStatusCode).toBe(503);
  });
});
