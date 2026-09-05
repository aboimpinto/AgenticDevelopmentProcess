import type { CatalogScannerResult, AuthorizedCatalogTransportResult, CatalogConnectionDescriptor } from "./catalog-ports.js";

/** Maps the OpenAI-compatible `/models` response into the shared normalizer input. */
export class OpenAiCompatibleCatalogScanner {
  scan(
    _connection: CatalogConnectionDescriptor,
    transportResult: AuthorizedCatalogTransportResult,
  ): CatalogScannerResult {
    if (transportResult.kind !== "success") return mapTransportFailure(transportResult);
    const payload = toNormalizerPayload(transportResult.body);
    return payload === null
      ? { kind: "failure", outcome: "malformed_response", httpStatusCode: transportResult.statusCode }
      : { kind: "success", payload };
  }
}

function mapTransportFailure(result: Exclude<AuthorizedCatalogTransportResult, { readonly kind: "success" }>): CatalogScannerResult {
  switch (result.kind) {
    case "authentication_failed":
      return { kind: "failure", outcome: "authentication_failed", httpStatusCode: result.statusCode };
    case "timeout":
      return { kind: "failure", outcome: "timeout", httpStatusCode: null };
    case "redirect_rejected":
      return { kind: "failure", outcome: "redirect_rejected", httpStatusCode: result.statusCode };
    case "malformed_response":
      return { kind: "failure", outcome: "malformed_response", httpStatusCode: null };
    case "unreachable":
    case "http_error":
      return { kind: "failure", outcome: "unavailable", httpStatusCode: result.kind === "http_error" ? result.statusCode : null };
  }
}

function toNormalizerPayload(body: unknown): { readonly models: readonly unknown[] } | null {
  if (!isRecord(body) || !Array.isArray(body.data)) return null;
  const models: unknown[] = [];
  for (const value of body.data) {
    if (!isRecord(value) || typeof value.id !== "string") return null;
    models.push({
      modelId: value.id,
      displayName: value.name,
      description: value.description,
      contextWindowTokens: value.context_window_tokens,
      maxOutputTokens: value.max_output_tokens,
      inputModalities: value.input_modalities,
      capabilities: value.capabilities,
      pricing: value.pricing,
    });
  }
  return { models };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

