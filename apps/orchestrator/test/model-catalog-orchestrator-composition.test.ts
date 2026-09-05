import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const envKeys = [
  "HEPHA_AGENT_CWD",
  "HEPHA_DATABASE_PATH",
  "HEPHA_DISABLE_METADATA_STORE",
  "HEPHA_PROJECT_STORE_PATH",
  "HEPHA_PROVIDER_CONNECTION_DATABASE_PATH",
  "HEPHA_PI_REFINE_FEATURE_TIMEOUT_MS",
  "HEPHA_VAULT_DATABASE_PATH",
  "HEPHA_VAULT_KEY",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

let fixtureRoot: string;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  fixtureRoot = mkdtempSync(resolve(tmpdir(), "hepha-model-catalog-root-"));
  mkdirSync(resolve(fixtureRoot, ".git"), { recursive: true });
  mkdirSync(resolve(fixtureRoot, "MemoryBank"), { recursive: true });
  const state = resolve(fixtureRoot, "state");
  mkdirSync(state, { recursive: true });
  process.env.HEPHA_AGENT_CWD = fixtureRoot;
  process.env.HEPHA_DATABASE_PATH = resolve(state, "metadata.sqlite");
  process.env.HEPHA_DISABLE_METADATA_STORE = "1";
  process.env.HEPHA_PROJECT_STORE_PATH = resolve(state, "projects.json");
  process.env.HEPHA_PROVIDER_CONNECTION_DATABASE_PATH = resolve(state, "providers.sqlite");
  process.env.HEPHA_VAULT_DATABASE_PATH = resolve(state, "vault.sqlite");
  process.env.HEPHA_VAULT_KEY = "catalog-composition-vault-key";
  process.env.HEPHA_PI_REFINE_FEATURE_TIMEOUT_MS = "1200000";
  vi.resetModules();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const { createOrchestratorRequestListener } = await import("../src/index.js");
  expect(warning).toHaveBeenCalledWith(
    "HEPHA_PI_REFINE_FEATURE_TIMEOUT_MS is deprecated; use HEPHA_PI_REFINE_FEATURE_MAX_RUNTIME_MS for an explicit wall-clock safety cap.",
  );
  warning.mockRestore();
  server = createServer(createOrchestratorRequestListener(() => undefined));
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected an ephemeral TCP address");
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 30_000);

afterAll(async () => {
  if (server?.listening) await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (fixtureRoot) rmSync(fixtureRoot, { force: true, recursive: true });
});

describe("model catalog orchestrator composition", () => {
  it("registers the safe catalog and authoritative connection-state reads on the production listener", async () => {
    const catalogResponse = await fetch(`${baseUrl}/api/model-catalog`);
    const connectionStateResponse = await fetch(`${baseUrl}/api/model-catalog/connections`);

    expect(catalogResponse.status).toBe(200);
    await expect(catalogResponse.json()).resolves.toEqual({ schemaVersion: "model-catalog/v1", models: [] });
    expect(connectionStateResponse.status).toBe(200);
    await expect(connectionStateResponse.json()).resolves.toEqual({
      schemaVersion: "catalog-reconciliation/v1",
      connections: [],
    });
  });
});
