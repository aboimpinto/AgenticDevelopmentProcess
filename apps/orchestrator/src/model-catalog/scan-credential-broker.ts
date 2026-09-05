import type { ProviderConnectionRecord } from "@hepha/shared";
import type { SecretVaultAdapter } from "../provider-connections/secret-vault.js";
import { classifyEndpoint } from "../provider-connections/endpoint-policy.js";
import type { AuthorizedCatalogTransport, ScanCredentialBrokerResult } from "./catalog-ports.js";

const SCAN_TIMEOUT_MS = 10_000;

/**
 * Owns the only FEAT-059 vault read and confines its result to one authorized
 * `/models` request. It never returns a secret, header, ref, or version.
 */
export class ScanCredentialBroker {
  constructor(
    private readonly vault: SecretVaultAdapter,
    private readonly transport: AuthorizedCatalogTransport,
  ) {}

  async requestModels(connection: ProviderConnectionRecord): Promise<ScanCredentialBrokerResult> {
    if (!isCredentialEligible(connection)) return { kind: "not_scannable" };
    if (!classifyEndpoint(connection.endpointUrl).valid) return { kind: "not_scannable" };
    if (!this.vault.isAvailable()) return { kind: "vault_unavailable" };

    let secret: string | null = null;
    let authorizationHeader: string | null = null;
    try {
      secret = await this.vault.readSecret(connection.secretRef);
      if (!secret || secret.trim().length === 0) return { kind: "authentication_failed", statusCode: 401 };
      authorizationHeader = `Bearer ${secret}`;
      return await this.transport.requestModels({
        url: modelsUrl(connection.endpointUrl),
        authorizationHeader,
        timeoutMs: SCAN_TIMEOUT_MS,
      });
    } catch {
      return { kind: "vault_unavailable" };
    } finally {
      authorizationHeader = null;
      secret = null;
    }
  }
}

function isCredentialEligible(connection: ProviderConnectionRecord): connection is ProviderConnectionRecord & { readonly secretRef: string } {
  return connection.lifecycleState === "active"
    && connection.kind !== "pi_session"
    && typeof connection.secretRef === "string"
    && connection.secretRef.trim().length > 0;
}

function modelsUrl(endpointUrl: string): string {
  const base = endpointUrl.endsWith("/") ? endpointUrl : `${endpointUrl}/`;
  return new URL("models", base).toString();
}
