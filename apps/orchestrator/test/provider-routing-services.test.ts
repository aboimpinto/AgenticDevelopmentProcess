import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_ROUTING_SCHEMA_VERSION, CATALOG_RECONCILIATION_TARGET_VERSION, type ProviderConnectionId, type RouteIdentityV1 } from "@hepha/shared";
import { AgentRegistry } from "../src/agent-routing/agent-registry.js";
import { createProviderRoutingServices } from "../src/bootstrap/provider-routing-services.js";

const now = "2026-07-25T02:00:00.000Z";

describe("createProviderRoutingServices matrix composition", () => {
  it("wires validated provider, catalog, state, registry, policy, projector, and store authorities into one complete snapshot", () => {
    const root = mkdtempSync(join(tmpdir(), "hepha-routing-matrix-composition-"));
    const services = createProviderRoutingServices({
      localStateDir: root,
      runtimeEnv: { HEPHA_VAULT_KEY: "routing-matrix-composition-key" },
    });
    const connectionId = "composition-connection" as ProviderConnectionId;
    const route = { connectionId, modelId: "composition-model" } as RouteIdentityV1;
    try {
      services.providerConnectionStore.insertConnection({
        connectionId,
        kind: "pi_session",
        label: "Composition Connection",
        provider: { kind: "pi_session" },
        endpointUrl: "https://api.openai.com/v1",
        endpointLocal: false,
        lifecycleState: "active",
        secretRef: null,
        secretVersion: null,
        createdAt: now,
        updatedAt: now,
      });
      services.modelCatalogStore.applyScanOutcome({
        connectionId,
        models: [{
          schemaVersion: "model-catalog/v1",
          identity: route,
          providerKind: "pi_session",
          providerLabel: "Composition Connection",
          displayName: "Composition Model",
          description: null,
          contextWindowTokens: 128_000,
          maxOutputTokens: 16_000,
          inputModalities: ["text"],
          capabilities: { reasoning: true, tools: true, api: true },
          pricing: null,
          availability: "available",
          lastSuccessfulScanAt: now,
        }],
        diagnostic: {
          schemaVersion: "model-catalog/v1",
          diagnosticId: "composition-diagnostic",
          connectionId,
          scanCorrelationId: "composition-attempt",
          outcome: "success",
          safeMessage: "Models are available.",
          httpStatusCode: 200,
          occurredAt: now,
        },
      });
      expect(services.catalogReconciliationStore.claimAttempt({
        connectionId,
        reconciliationVersion: CATALOG_RECONCILIATION_TARGET_VERSION,
        trigger: "individual_retry",
        attemptId: "composition-attempt",
        claimedAt: now,
        mode: "force_settled",
      })).toMatchObject({ kind: "claimed" });
      services.catalogReconciliationStore.settleAttempt({
        connectionId,
        reconciliationVersion: CATALOG_RECONCILIATION_TARGET_VERSION,
        attemptId: "composition-attempt",
        settledAt: now,
        settledOutcome: "available",
        modelCount: 1,
        outcomeCode: "success",
        safeOutcomeMessage: "Models are available.",
        diagnosticId: "composition-diagnostic",
      });
      expect(services.agentRoutingStore.applyMutation({
        schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
        registryVersion: new AgentRegistry().version,
        expectedRevisionId: null,
        reason: "bootstrap",
        occurredAt: now,
        actor: "composition-test",
        correlationId: null,
        selectors: [{
          schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
          scope: { kind: "global" },
          selector: { kind: "route", route },
          failurePolicy: { kind: "fail_immediately" },
        }],
      }, {
        schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
        registry: new AgentRegistry().list(),
        routes: [{
          schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
          route,
          connectionActive: true,
          available: true,
          contextWindowTokens: 128_000,
          tools: true,
          api: true,
          reasoning: true,
        }],
      })).toMatchObject({ ok: true });

      expect(services.routingPolicyHttpService.getRoutingMatrix()).toMatchObject({
        ok: true,
        value: {
          global: { effectiveRoute: { route, connectionLabel: "Composition Connection", modelDisplayLabel: "Composition Model" } },
          groups: expect.arrayContaining([expect.objectContaining({ actionType: "implementation" })]),
        },
      });
    } finally {
      services.agentRoutingStore.close();
      services.catalogReconciliationStore.close();
      services.modelCatalogStore.close();
      services.providerConnectionStore.close();
      services.secretVault.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
