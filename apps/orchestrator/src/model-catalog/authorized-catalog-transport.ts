import type { AuthorizedCatalogTransport, AuthorizedCatalogTransportResult } from "./catalog-ports.js";

const MAX_RESPONSE_BYTES = 1_048_576;

/** Performs one manual-redirect OpenAI-compatible catalog request. */
export class FetchAuthorizedCatalogTransport implements AuthorizedCatalogTransport {
  async requestModels(input: {
    readonly url: string;
    readonly authorizationHeader: string;
    readonly timeoutMs: number;
  }): Promise<AuthorizedCatalogTransportResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await fetch(input.url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: input.authorizationHeader,
        },
      });
      if (response.status >= 300 && response.status < 400) {
        return { kind: "redirect_rejected", statusCode: response.status };
      }
      if (response.status === 401 || response.status === 403) {
        return { kind: "authentication_failed", statusCode: response.status };
      }
      if (response.status < 200 || response.status >= 300) {
        return { kind: "http_error", statusCode: response.status };
      }
      const bodyText = await response.text();
      if (Buffer.byteLength(bodyText) > MAX_RESPONSE_BYTES) return { kind: "malformed_response" };
      try {
        return { kind: "success", statusCode: response.status, body: JSON.parse(bodyText) as unknown };
      } catch {
        return { kind: "malformed_response" };
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return { kind: "timeout" };
      return { kind: "unreachable" };
    } finally {
      clearTimeout(timeout);
    }
  }
}
