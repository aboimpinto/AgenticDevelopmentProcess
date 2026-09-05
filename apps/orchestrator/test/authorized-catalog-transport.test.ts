import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchAuthorizedCatalogTransport } from "../src/model-catalog/authorized-catalog-transport.js";

afterEach(() => vi.unstubAllGlobals());

const request = {
  url: "https://provider.test/v1/models",
  authorizationHeader: "Bearer transport-test-secret",
  timeoutMs: 20,
};

describe("FetchAuthorizedCatalogTransport", () => {
  it("rejects a redirect without following a second request", async () => {
    let calls = 0;
    let redirectMode: RequestRedirect | undefined;
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      calls += 1;
      redirectMode = init?.redirect;
      return new Response(null, { status: 302 });
    });

    await expect(new FetchAuthorizedCatalogTransport().requestModels(request)).resolves.toEqual({
      kind: "redirect_rejected",
      statusCode: 302,
    });
    expect(calls).toBe(1);
    expect(redirectMode).toBe("manual");
  });

  it("classifies authentication and malformed successful responses without returning body text", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 401 }));
    await expect(new FetchAuthorizedCatalogTransport().requestModels(request)).resolves.toEqual({
      kind: "authentication_failed",
      statusCode: 401,
    });

    vi.stubGlobal("fetch", async () => new Response("not-json", { status: 200 }));
    await expect(new FetchAuthorizedCatalogTransport().requestModels(request)).resolves.toEqual({
      kind: "malformed_response",
    });
  });

  it("classifies an aborted request as a timeout", async () => {
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) => new Promise<never>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    }));

    await expect(new FetchAuthorizedCatalogTransport().requestModels({ ...request, timeoutMs: 1 })).resolves.toEqual({
      kind: "timeout",
    });
  });
});
