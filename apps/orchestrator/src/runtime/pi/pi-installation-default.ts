import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ModelCatalogStore, ProviderConnectionStore } from "@hepha/db";
import type {
  ProviderConnectionId,
  ProviderConnectionRecord,
  RouteIdentityV1,
} from "@hepha/shared";

const MAX_SETTINGS_BYTES = 1_048_576;
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MODEL_ID_PATTERN = /^[^\s]{1,512}$/;

export interface PiInstallationDefault {
  readonly providerId: string;
  readonly route: RouteIdentityV1;
}

/**
 * Reads only Pi's explicit installation default and binds it to one active
 * Pi-session connection by code-owned endpoint identity. Labels, workflow
 * model fields, environment model aliases, and arbitrary fallbacks are never
 * considered.
 */
export function readPiInstallationDefault(
  runtimeEnv: NodeJS.ProcessEnv,
  connectionStore: Pick<ProviderConnectionStore, "listConnections">,
): PiInstallationDefault | null {
  const settings = readSafeSettings(runtimeEnv);
  if (!settings) return null;
  const candidates = connectionStore.listConnections().filter((connection) =>
    connection.kind === "pi_session"
    && connection.lifecycleState === "active"
    && piProviderIdsForEndpoint(connection.endpointUrl).includes(settings.providerId),
  );
  if (candidates.length !== 1) return null;
  return {
    providerId: settings.providerId,
    route: {
      connectionId: candidates[0]!.connectionId,
      modelId: settings.modelId,
    },
  };
}

/** Returns the explicit Pi providers represented by a code-owned endpoint. */
export function piProviderIdsForEndpoint(endpointUrl: string): readonly string[] {
  try {
    const endpoint = new URL(endpointUrl);
    const hostname = endpoint.hostname.toLowerCase();
    if (hostname === "api.deepseek.com") return ["deepseek"];
    if (hostname === "api.openai.com") return ["openai", "openai-codex"];
  } catch {
    return [];
  }
  return [];
}

/** Verifies that the prepared installation route exists in the safe catalog. */
export function isCatalogedPiInstallationDefault(
  installationDefault: PiInstallationDefault,
  catalogStore: Pick<ModelCatalogStore, "listModels">,
): boolean {
  return catalogStore.listModels().some((model) =>
    model.identity.connectionId === installationDefault.route.connectionId
    && model.identity.modelId === installationDefault.route.modelId
    && model.availability === "available",
  );
}

export function piRuntimeProvidersByConnection(
  installationDefault: PiInstallationDefault | null,
): ReadonlyMap<ProviderConnectionId, string> {
  return installationDefault
    ? new Map([[installationDefault.route.connectionId, installationDefault.providerId]])
    : new Map();
}

/** Reads only validated top-level provider identities; credential values never leave this boundary. */
export function readPiAuthenticatedProviderIds(runtimeEnv: NodeJS.ProcessEnv): readonly string[] {
  try {
    const text = readFileSync(join(resolvePiAgentDirectory(runtimeEnv), "auth.json"), "utf8");
    if (Buffer.byteLength(text) > MAX_SETTINGS_BYTES) return [];
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) return [];
    return Object.keys(value).filter((providerId) => PROVIDER_ID_PATTERN.test(providerId)).sort();
  } catch {
    return [];
  }
}

function readSafeSettings(runtimeEnv: NodeJS.ProcessEnv): { readonly providerId: string; readonly modelId: string } | null {
  try {
    const text = readFileSync(join(resolvePiAgentDirectory(runtimeEnv), "settings.json"), "utf8");
    if (Buffer.byteLength(text) > MAX_SETTINGS_BYTES) return null;
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) return null;
    if (typeof value.defaultProvider !== "string" || !PROVIDER_ID_PATTERN.test(value.defaultProvider)) return null;
    if (typeof value.defaultModel !== "string" || !MODEL_ID_PATTERN.test(value.defaultModel)) return null;
    return { providerId: value.defaultProvider, modelId: value.defaultModel };
  } catch {
    return null;
  }
}

function resolvePiAgentDirectory(runtimeEnv: NodeJS.ProcessEnv): string {
  const configuredDirectory = runtimeEnv.PI_CODING_AGENT_DIR?.trim();
  return configuredDirectory
    ? resolve(expandHome(configuredDirectory))
    : join(homedir(), ".pi", "agent");
}

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return join(homedir(), value.slice(2));
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function connectionProviderIds(connection: ProviderConnectionRecord): readonly string[] {
  if (connection.provider.kind === "known") return [connection.provider.providerId];
  if (connection.kind === "pi_session") return piProviderIdsForEndpoint(connection.endpointUrl);
  return [];
}

/**
 * Resolves the provider identity used by an isolated Pi launch.
 *
 * A Pi-session endpoint that represents exactly one code-owned provider does
 * not need to be the installation default. Ambiguous endpoints (currently the
 * OpenAI endpoint can represent openai or openai-codex) require the explicit
 * installation default to disambiguate them. Custom connections retain their
 * generated provider identity.
 */
export function runtimeProviderIdForConnection(
  connection: ProviderConnectionRecord,
  installationDefault: PiInstallationDefault | null,
  authenticatedProviderIds: readonly string[] = [],
): string | null {
  if (connection.provider.kind === "known") return connection.provider.providerId;
  if (connection.provider.kind === "custom") return connection.connectionId;

  const endpointProviderIds = connectionProviderIds(connection);
  if (installationDefault?.route.connectionId === connection.connectionId) {
    // Trust the installation default when the endpoint has no recognized
    // provider IDs (unknown/null endpoint) or when the default providerId
    // is explicitly valid for this endpoint. Reject only when the endpoint
    // is known and the claimed providerId is not among its valid choices.
    if (endpointProviderIds.length === 0) return installationDefault.providerId;
    return endpointProviderIds.includes(installationDefault.providerId)
      ? installationDefault.providerId
      : null;
  }
  const authenticatedCandidates = endpointProviderIds.filter((providerId) =>
    authenticatedProviderIds.includes(providerId),
  );
  if (authenticatedCandidates.length === 1) return authenticatedCandidates[0]!;
  return endpointProviderIds.length === 1 ? endpointProviderIds[0]! : null;
}
