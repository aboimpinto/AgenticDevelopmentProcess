import { describe, expect, it } from "vitest";
import type { ProviderConnectionId } from "@hepha/shared";
import { OpenAiCompatibleCatalogScanner } from "../src/model-catalog/openai-compatible-catalog-scanner.js";
import type { CatalogConnectionDescriptor, AuthorizedCatalogTransportResult } from "../src/model-catalog/catalog-ports.js";

const connection: CatalogConnectionDescriptor = {
  connectionId: "openai-compatible" as ProviderConnectionId,
  kind: "custom",
  providerKind: "custom",
  providerLabel: "OpenAI compatible",
  endpointUrl: "https://provider.test/v1",
  endpointLocal: false,
};

describe("OpenAiCompatibleCatalogScanner", () => {
  it("maps a valid OpenAI-compatible response into the closed normalizer input", () => {
    const scanner = new OpenAiCompatibleCatalogScanner();
    const result = scanner.scan(connection, {
      kind: "success",
      statusCode: 200,
      body: { data: [{ id: "model-b", name: " Model B ", capabilities: { tools: true } }] },
    });

    expect(result).toEqual({
      kind: "success",
      payload: { models: [{ modelId: "model-b", displayName: " Model B ", description: undefined, contextWindowTokens: undefined, maxOutputTokens: undefined, inputModalities: undefined, capabilities: { tools: true }, pricing: undefined }] },
    });
  });

  it.each([
    [{ kind: "authentication_failed", statusCode: 401 } as const, "authentication_failed", 401],
    [{ kind: "timeout" } as const, "timeout", null],
    [{ kind: "unreachable" } as const, "unavailable", null],
    [{ kind: "http_error", statusCode: 429 } as const, "unavailable", 429],
    [{ kind: "redirect_rejected", statusCode: 302 } as const, "redirect_rejected", 302],
    [{ kind: "malformed_response" } as const, "malformed_response", null],
  ])("classifies safe transport result %o", (transportResult: AuthorizedCatalogTransportResult, outcome, httpStatusCode) => {
    expect(new OpenAiCompatibleCatalogScanner().scan(connection, transportResult)).toEqual({
      kind: "failure",
      outcome,
      httpStatusCode,
    });
  });

  it("rejects malformed response shapes before candidate normalization", () => {
    const scanner = new OpenAiCompatibleCatalogScanner();
    expect(scanner.scan(connection, { kind: "success", statusCode: 200, body: { data: [{ id: 1 }] } })).toEqual({
      kind: "failure",
      outcome: "malformed_response",
      httpStatusCode: 200,
    });
  });
});
