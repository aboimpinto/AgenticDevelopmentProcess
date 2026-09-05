import type { ProviderConnectionId, ProviderConnectionKind } from "@hepha/shared";

/** Safe connection facts that a scanner may consume during one catalog scan. */
export interface CatalogConnectionDescriptor {
  readonly connectionId: ProviderConnectionId;
  readonly kind: ProviderConnectionKind;
  readonly providerKind: ProviderConnectionKind;
  readonly providerLabel: string;
  readonly endpointUrl: string;
  readonly endpointLocal: boolean;
}

export type PiCatalogProcessResult =
  | { readonly kind: "success"; readonly stdout: string }
  | { readonly kind: "non_zero"; readonly exitCode: number | null }
  | { readonly kind: "timeout" }
  | { readonly kind: "spawn_failed" };

/** Isolates the Pi command protocol from scanner policy and test fakes. */
export interface PiCatalogProcess {
  listModels(input: {
    readonly timeoutMs: number;
    readonly maxStdoutBytes: number;
  }): Promise<PiCatalogProcessResult>;
}

export type AuthorizedCatalogTransportResult =
  | { readonly kind: "success"; readonly statusCode: number; readonly body: unknown }
  | { readonly kind: "http_error"; readonly statusCode: number }
  | { readonly kind: "authentication_failed"; readonly statusCode: 401 | 403 }
  | { readonly kind: "timeout" }
  | { readonly kind: "unreachable" }
  | { readonly kind: "redirect_rejected"; readonly statusCode: number | null }
  | { readonly kind: "malformed_response" };

/**
 * The sole request port that can receive request-local authorization. Its
 * return value is deliberately credential-free; implementations must not log
 * or retain the authorization value.
 */
export interface AuthorizedCatalogTransport {
  requestModels(input: {
    readonly url: string;
    readonly authorizationHeader: string;
    readonly timeoutMs: number;
  }): Promise<AuthorizedCatalogTransportResult>;
}

/** Credential-broker refusals remain separate from scanner-visible transport results. */
export type ScanCredentialBrokerResult = AuthorizedCatalogTransportResult
  | { readonly kind: "not_scannable" }
  | { readonly kind: "vault_unavailable" };

export type CatalogScannerResult =
  | { readonly kind: "success"; readonly payload: unknown }
  | {
    readonly kind: "failure";
    readonly outcome: Exclude<import("@hepha/shared").CatalogScanOutcome, "success">;
    readonly httpStatusCode: number | null;
  };
