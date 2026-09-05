import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ProviderConnectionStore } from "@hepha/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CatalogScanCoordinator } from "../src/model-catalog/catalog-scan-coordinator.js";
import { FakeEndpointTransport } from "../src/provider-connections/endpoint-policy.js";
import { ProviderConnectionService } from "../src/provider-connections/service.js";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";

const envKeys = [
  "HEPHA_AGENT_CWD",
  "HEPHA_AGENT_ROUTING_DATABASE_PATH",
  "HEPHA_DATABASE_PATH",
  "HEPHA_DISABLE_METADATA_STORE",
  "HEPHA_MODEL_CATALOG_DATABASE_PATH",
  "HEPHA_PROJECT_STORE_PATH",
  "HEPHA_PROVIDER_CONNECTION_DATABASE_PATH",
  "HEPHA_VAULT_DATABASE_PATH",
  "HEPHA_VAULT_KEY",
  "PI_CODING_AGENT_DIR",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

let fixtureRoot: string;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  fixtureRoot = mkdtempSync(resolve(tmpdir(), "hepha-agent-routing-root-"));
  mkdirSync(resolve(fixtureRoot, ".git"), { recursive: true });
  const featureFolder = resolve(fixtureRoot, "MemoryBank", "Features", "01_SUBMITTED", "FEAT-061-routing-composition");
  mkdirSync(featureFolder, { recursive: true });
  writeFileSync(resolve(featureFolder, "FeatureDescription.md"), [
    "# Routing composition",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Feature ID | FEAT-061 |",
    "| Status | SUBMITTED |",
    "",
    "## Summary",
    "",
    "Exercises the resolver-backed production composition.",
  ].join("\n"));
  const state = resolve(fixtureRoot, "state");
  mkdirSync(state, { recursive: true });
  process.env.HEPHA_AGENT_CWD = fixtureRoot;
  process.env.HEPHA_AGENT_ROUTING_DATABASE_PATH = resolve(state, "routing.sqlite");
  process.env.HEPHA_DATABASE_PATH = resolve(state, "metadata.sqlite");
  process.env.HEPHA_DISABLE_METADATA_STORE = "1";
  process.env.HEPHA_MODEL_CATALOG_DATABASE_PATH = resolve(state, "catalog.sqlite");
  process.env.HEPHA_PROJECT_STORE_PATH = resolve(state, "projects.json");
  process.env.HEPHA_PROVIDER_CONNECTION_DATABASE_PATH = resolve(state, "providers.sqlite");
  process.env.HEPHA_VAULT_DATABASE_PATH = resolve(state, "vault.sqlite");
  process.env.HEPHA_VAULT_KEY = "routing-composition-vault-key";

  const piSettingsDirectory = resolve(fixtureRoot, "pi-settings");
  mkdirSync(piSettingsDirectory, { recursive: true });
  writeFileSync(resolve(piSettingsDirectory, "settings.json"), JSON.stringify({
    defaultProvider: "openai-codex",
    defaultModel: "gpt-5.6-sol",
  }));
  process.env.PI_CODING_AGENT_DIR = piSettingsDirectory;

  const providerStore = new ProviderConnectionStore(process.env.HEPHA_PROVIDER_CONNECTION_DATABASE_PATH);
  const providerService = new ProviderConnectionService({
    store: providerStore,
    vault: new InMemorySecretVault(),
    transport: new FakeEndpointTransport(),
  });
  const created = await providerService.createConnection({
    kind: "pi_session",
    label: "Pi OpenAI",
    provider: { kind: "pi_session" },
    endpointUrl: "https://api.openai.com/v1",
  });
  providerStore.close();
  if (!created.data) throw new Error("Expected the Pi installation connection fixture to be created.");

  const startupScan = vi.spyOn(CatalogScanCoordinator.prototype, "scanConnection")
    .mockResolvedValue({} as never);
  const { createOrchestratorRequestListener } = await import("../src/index.js");
  expect(startupScan).toHaveBeenCalledWith({
    connectionId: created.data.connectionId,
    trigger: "startup_reconciliation",
    mode: "eligible_only",
  });
  startupScan.mockRestore();

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
  if (server?.listening) {
    await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  }
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (fixtureRoot) rmSync(fixtureRoot, { force: true, recursive: true });
});

describe("agent routing orchestrator composition", () => {
  it("refreshes an uncataloged Pi default and exposes closed routing reads on the production listener", async () => {
    const projectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memoryBankPath: resolve(fixtureRoot, "MemoryBank"),
        name: "Routing composition",
        rootPath: fixtureRoot,
      }),
    });
    expect(projectResponse.status).toBe(201);
    const projectBody = await projectResponse.json() as { project: { id: string } };
    const workItemsResponse = await fetch(`${baseUrl}/api/projects/${projectBody.project.id}/work-items`);
    expect(workItemsResponse.status).toBe(200);
    await expect(workItemsResponse.json()).resolves.toMatchObject({
      items: [expect.objectContaining({ externalId: "FEAT-061" })],
    });

    const matrixResponse = await fetch(`${baseUrl}/api/agent-routing/matrix`);
    expect(matrixResponse.status).toBe(409);
    await expect(matrixResponse.json()).resolves.toEqual({
      error: {
        code: "ROUTING_BOOTSTRAP_REQUIRED",
        message: "Global Default is unset and no valid bootstrap route is available.",
      },
    });
    expect((await fetch(`${baseUrl}/api/agent-routing/registry`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/agent-routing/policy`)).status).toBe(404);
  });
});
