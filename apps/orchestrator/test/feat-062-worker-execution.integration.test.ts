import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { RuntimeInvocationStore } from "@hepha/db";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  type HandoffPlanV1,
  type ProviderConnectionRecord,
  type RouteIdentityV1,
} from "@hepha/shared";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";
import { HandoffPlanExecutor } from "../src/runtime/pi/handoff-plan-executor.js";
import { IsolatedPiWorkerContext } from "../src/runtime/pi/isolated-pi-worker-context.js";
import {
  createPlanBoundDetachedPromptLauncher,
  createPlanBoundPiPromptRunner,
} from "../src/runtime/pi/plan-bound-pi-prompt-runner.js";

const featurePath = fileURLToPath(new URL("./feat-062-worker-execution.feature", import.meta.url));
const root = await mkdtemp(resolve(tmpdir(), "hepha-plan-launch-integration-"));
afterAll(() => rm(root, { recursive: true, force: true }));

const route = { connectionId: "connection-custom", modelId: "model-approved" } as RouteIdentityV1;
const plan: HandoffPlanV1 = {
  schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
  resolvedRoute: {
    schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
    action: {
      schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
      actionId: "start-feature",
      actionType: "implementation",
      actionTypeLabel: "Implementation",
      actionTypeDisplayOrder: 2,
      label: "Start Feature",
      displayOrder: 1,
      roleId: "implementation-agent",
      promptVersion: "implementation/v1",
      capabilityRequirements: { minimumContextWindowTokens: 64_000, requiresTools: true, requiresApi: true, requiresReasoning: true },
    },
    route,
    policySource: "global",
    revisionId: "bootstrap-revision-1",
  },
  steps: [{ kind: "primary", route }],
};
const connection = {
  connectionId: route.connectionId,
  kind: "custom",
  label: "Custom",
  provider: { kind: "custom", label: "Custom" },
  endpointUrl: "https://custom.example/v1",
  endpointLocal: false,
  lifecycleState: "active",
  secretRef: "vault-custom",
  secretVersion: 4,
  createdAt: "2026-07-23T10:00:00.000Z",
  updatedAt: "2026-07-23T10:00:00.000Z",
} as ProviderConnectionRecord;

describe("FEAT-062 plan-bound worker execution integration", () => {
  it("binds the Product Owner launch scenarios to the public executor", () => {
    const feature = readFileSync(featurePath, "utf8");
    for (const tag of ["E011-PROV-004", "E011-ROUTE-001", "E011-ROUTE-005", "E011-LAUNCH-001", "E011-LAUNCH-002", "E011-LAUNCH-004"]) {
      expect(feature).toContain(`@${tag}`);
    }
    expect(feature).toContain("Scenario: An accepted Pi Session plan launches unchanged without a copied key");
    expect(feature).toContain("Scenario: A selected connection secret is launch-scoped and version-pinned");
    expect(feature).toContain("Scenario: Parallel plan-bound attempts remain isolated");
    expect(feature).toContain("@WF-RUNTIME-PLAN-EXECUTE");
    expect(feature).toContain("@WF-RUNTIME-LAUNCH-REJECT");
    expect(feature).not.toMatch(/Phase \d+|Task \d+/i);
  });

  it("discovers every owned Product Owner backend scenario and generic runtime transition", () => {
    const feature = readFileSync(featurePath, "utf8");
    for (const tag of [
      "E011-PROV-004", "E011-ROUTE-001", "E011-ROUTE-005", "E011-LAUNCH-001", "E011-LAUNCH-002", "E011-LAUNCH-003", "E011-LAUNCH-004",
      "E011-FAIL-001", "E011-FAIL-002", "E011-FAIL-003", "E011-FAIL-004", "E011-FAIL-005", "E011-FAIL-006",
      "E011-NEST-001", "E011-NEST-002", "E011-NEST-003", "E011-NEST-004",
      "WF-RUNTIME-PLAN-EXECUTE", "WF-RUNTIME-LAUNCH-REJECT", "WF-RUNTIME-FALLBACK", "WF-RUNTIME-RECOVERY",
      "WF-RUNTIME-TERMINAL", "WF-DIRECT-HOST-NO-LAUNCH", "WF-RUNTIME-NESTED-DISPATCH", "WF-RUNTIME-RESUMED-SPECIALIST", "WF-RUNTIME-RECEIPT-SETTLE",
    ]) {
      expect(feature).toContain(`@${tag}`);
    }
    for (const scenario of [
      "An accepted Pi Session plan launches unchanged without a copied key",
      "A selected connection secret is launch-scoped and version-pinned",
      "Parallel plan-bound attempts remain isolated",
      "Malformed and unavailable launch inputs cannot invent a route",
      "A pre-substantive primary failure consumes the approved second route once",
      "A successful fallback owns its mutations and completes the worker",
      "A plan without a legal runtime second hop terminates without workflow advance",
      "A checkpointed primary failure hands off without replay",
      "A direct session mismatch transfers before source-session worker work",
      "Nested specialists execute independently planned parent-linked chains",
      "A resumed specialist starts honestly when the new run has no parent invocation",
      "Post-complete curation waits for a successful completion receipt",
    ]) {
      expect(feature).toContain(`Scenario: ${scenario}`);
    }
    expect(feature).not.toMatch(/Phase \d+|Task \d+/i);
  });

  it("executes an accepted bootstrap plan through isolation, process, and durable receipt composition", async () => {
    const vault = new InMemorySecretVault();
    await vault.createSecret("vault-custom", "integration-secret-never-persist");
    const readSecret = vi.spyOn(vault, "readSecret");
    const store = RuntimeInvocationStore.createInMemory();
    const process = vi.fn(async (request: Parameters<ConstructorParameters<typeof HandoffPlanExecutor>[0]["process"]["execute"]>[0]) => {
      const models = readFileSync(resolve(request.configurationRoot, "models.json"), "utf8");
      expect(models).toContain("$HEPHA_PI_PROVIDER_SECRET");
      expect(models).not.toContain("integration-secret-never-persist");
      expect(request.environment.HEPHA_PI_PROVIDER_SECRET).toBe("integration-secret-never-persist");
      return { status: "completed" as const, exitCode: 0, failureCode: null, output: "accepted" };
    });
    let tick = 0;
    let id = 0;
    const executor = new HandoffPlanExecutor({
      connections: { getConnection: () => connection },
      contextFactory: new IsolatedPiWorkerContext({ baseEnvironment: { PATH: "/bin", OPENAI_API_KEY: "unselected" }, createUniqueId: () => `root-${++id}`, runtimeRoot: root }),
      createId: () => `attempt-${++id}`,
      now: () => new Date(Date.UTC(2026, 6, 23, 10, 0, tick++)).toISOString(),
      process: { execute: process },
      providerIdForConnection: () => "hepha-connection-custom",
      receipts: store,
      vault,
    });

    const result = await executor.executeAttempt({
      plan,
      stepIndex: 0,
      attemptKind: "primary",
      invocationId: "invocation-bootstrap",
      context: {
        projectId: "HEPHA", cardKey: "FEAT-example", workflowRunId: "workflow-bootstrap", workflowNodeId: "start-node",
        phaseExecutionContractId: "implementation-contract", phaseNumber: 1, taskId: "task-start",
        correlationId: "correlation-bootstrap", selectedLessonIds: [], invocationKind: "root",
        rootInvocationId: "invocation-bootstrap", parentInvocationId: null,
      },
      inputRef: "prompt-artifact-bootstrap",
    });

    expect(result).toMatchObject({ ok: true, receipt: { revisionId: "bootstrap-revision-1" }, attempt: { actualRoute: route, credentialVersion: 4 } });
    expect(process).toHaveBeenCalledOnce();
    expect(process.mock.calls[0]![0].arguments).toEqual(["--provider", "hepha-connection-custom", "--model", "model-approved"]);
    expect(process.mock.calls[0]![0].environment).not.toHaveProperty("OPENAI_API_KEY");
    expect(readSecret).toHaveBeenCalledOnce();
    expect(existsSync(process.mock.calls[0]![0].configurationRoot)).toBe(false);
    expect(JSON.stringify(store.getInvocation("invocation-bootstrap"))).not.toContain("integration-secret-never-persist");
    store.close();
  });

  it("routes the real prompt host through the guarded executor without a model-key adapter", async () => {
    const vault = new InMemorySecretVault();
    await vault.createSecret("vault-custom", "host-secret-delivery-control");
    const store = RuntimeInvocationStore.createInMemory();
    const runPinnedPrompt = vi.fn(async (_prompt, launch) => {
      expect(launch.model).toEqual({ provider: "hepha-connection-custom", model: "model-approved" });
      expect(launch.environment.HEPHA_PI_PROVIDER_SECRET).toBe("host-secret-delivery-control");
      return "host accepted";
    });
    const runPrompt = createPlanBoundPiPromptRunner({
      connections: { getConnection: () => connection },
      contextFactory: new IsolatedPiWorkerContext({
        baseEnvironment: () => ({ PATH: "/bin", OPENAI_API_KEY: "must-not-inherit" }),
        createUniqueId: () => `host-${randomUUID()}`,
        runtimeRoot: root,
      }),
      providerIdForConnection: () => "hepha-connection-custom",
      receipts: store,
      runPinnedPrompt,
      vault,
      workspaceRoot: root,
    });

    await expect(runPrompt("approved prompt", plan, { cwd: root, workflowRunId: "workflow-host" }))
      .resolves.toBe("host accepted");
    expect(runPinnedPrompt).toHaveBeenCalledOnce();
    expect(runPinnedPrompt.mock.calls[0]![1].environment).not.toHaveProperty("OPENAI_API_KEY");
    expect(store.listFeatureInvocations({ schemaVersion: "runtime-execution/v1", projectId: root, cardKey: null, limit: 10 }).ok).toBe(true);
    store.close();
  });

  it("preserves the primary stall cause and checkpoints artifact mutations before route exhaustion", async () => {
    const store = RuntimeInvocationStore.createInMemory();
    const runPrompt = createPlanBoundPiPromptRunner({
      connections: { getConnection: () => ({ ...connection, kind: "pi_session", provider: { kind: "pi_session" }, secretRef: null, secretVersion: null }) },
      contextFactory: new IsolatedPiWorkerContext({
        baseEnvironment: () => ({ PATH: "/bin" }),
        createUniqueId: () => `progress-${randomUUID()}`,
        runtimeRoot: root,
      }),
      providerIdForConnection: () => "hepha-connection-custom",
      receipts: store,
      runPinnedPrompt: async (_prompt, _launch, options) => {
        options?.onPiEvent?.({
          type: "tool_execution_start", toolCallId: "write-1", toolName: "write", args: { path: "/feature/FeatureTasks.md" },
        });
        options?.onPiEvent?.({
          type: "tool_execution_end", toolCallId: "write-1", toolName: "write", isError: false,
        });
        throw new Error("Refine Feature Pi run stalled after 900 seconds without observable Pi or tool activity.");
      },
      vault: new InMemorySecretVault(),
      workspaceRoot: root,
    });

    await expect(runPrompt("approved prompt", plan, { cwd: root, workflowRunId: "workflow-progress" }))
      .rejects.toThrow(/Refine Feature Pi run stalled.*Runtime route outcome: RUNTIME_ROUTE_SEQUENCE_EXHAUSTED/u);
    const evidence = store.listFeatureInvocations({ schemaVersion: "runtime-execution/v1", projectId: root, cardKey: null, limit: 10 });
    if (!evidence.ok) throw new Error(evidence.code);
    expect(evidence.value[0]).toMatchObject({
      receipt: { status: "timed_out" },
      attempts: [{ status: "timed_out", workState: "checkpointed", checkpointCursor: "artifact:/feature/FeatureTasks.md" }],
    });
    store.close();
  });

  it("explains an unstartable primary route and gives a deterministic recovery action", async () => {
    const store = RuntimeInvocationStore.createInMemory();
    const refinePlan: HandoffPlanV1 = {
      ...plan,
      resolvedRoute: {
        ...plan.resolvedRoute,
        action: { ...plan.resolvedRoute.action, actionId: "refine-feature", label: "Refine Feature" },
      },
    };
    const runPrompt = createPlanBoundPiPromptRunner({
      connections: {
        getConnection: () => ({
          ...connection,
          kind: "pi_session",
          label: "OpenAI",
          provider: { kind: "pi_session" },
          endpointUrl: "https://api.openai.com/v1",
          secretRef: null,
          secretVersion: null,
        }),
      },
      contextFactory: new IsolatedPiWorkerContext({
        baseEnvironment: () => ({ PATH: "/bin" }),
        createUniqueId: () => `unsupported-${randomUUID()}`,
        runtimeRoot: root,
      }),
      providerIdForConnection: () => null,
      receipts: store,
      runPinnedPrompt: vi.fn(),
      vault: new InMemorySecretVault(),
      workspaceRoot: root,
    });

    await expect(runPrompt("approved prompt", refinePlan, {
      cwd: root,
      workflowRunId: "workflow-provider-unsupported",
    })).rejects.toThrow(
      "RUNTIME_ROUTE_SEQUENCE_EXHAUSTED: Refine Feature could not start its primary route OpenAI / model-approved because provider_unsupported. No fallback route is configured. Recovery: configure a supported primary provider or add a fallback for Refine Feature in Projects > Agent Routing, then retry Refine Feature.",
    );
    store.close();
  });

  it("settles a detached launch only after its pinned process completion", async () => {
    const store = RuntimeInvocationStore.createInMemory();
    const vault = new InMemorySecretVault();
    await vault.createSecret("vault-custom", "detached-launch-secret");
    const completion = Promise.resolve({ exitCode: 0, signal: null });
    const runPinnedDetached = vi.fn(async (_prompt, launch) => {
      expect(launch.model).toEqual({ provider: "hepha-connection-custom", model: "model-approved" });
      return { launch: { pid: 62, streamLogPath: "/tmp/feat-062.log" }, completion };
    });
    const launchPrompt = createPlanBoundDetachedPromptLauncher({
      connections: { getConnection: () => connection },
      contextFactory: new IsolatedPiWorkerContext({
        baseEnvironment: () => ({ PATH: "/bin" }),
        createUniqueId: () => `detached-${randomUUID()}`,
        runtimeRoot: root,
      }),
      providerIdForConnection: () => "hepha-connection-custom",
      receipts: store,
      runPinnedDetached,
      vault,
      workspaceRoot: root,
    });

    const launch = await launchPrompt("detached prompt", plan, {
      cwd: root,
      workflowRunId: "workflow-detached",
      runtimeContext: { cardKey: "FEAT-062", phaseExecutionContractId: "detached-contract", phaseNumber: 7, taskId: "detached-task" },
    });

    expect(launch).toMatchObject({ pid: 62, streamLogPath: "/tmp/feat-062.log" });
    await expect(launch.completion).resolves.toMatchObject({
      ok: true,
      attemptResult: { ok: true, attempt: { status: "completed" } },
    });
    const evidence = store.listFeatureInvocations({ schemaVersion: "runtime-execution/v1", projectId: root, cardKey: "FEAT-062", limit: 10 });
    if (!evidence.ok) throw new Error(evidence.code);
    expect(evidence.value[0]).toMatchObject({ receipt: { status: "completed" }, attempts: [{ actualRoute: route }] });
    expect(runPinnedDetached).toHaveBeenCalledOnce();
    store.close();
  });

  it("keeps a provider-resolution failure on the primary while a checkpointed fallback completes", async () => {
    const fallbackRoute = { connectionId: "connection-fallback", modelId: "gpt-5.6-sol" } as RouteIdentityV1;
    const fallbackPlan: HandoffPlanV1 = {
      ...plan,
      resolvedRoute: { ...plan.resolvedRoute, policySource: "action" },
      steps: [{ kind: "primary", route }, { kind: "recovery", route: fallbackRoute }],
    };
    const store = RuntimeInvocationStore.createInMemory();
    const fallbackLaunches: RouteIdentityV1[] = [];
    const runPrompt = createPlanBoundPiPromptRunner({
      connections: {
        getConnection: (connectionId) => ({
          ...connection,
          connectionId,
          kind: "pi_session",
          provider: { kind: "pi_session" },
          endpointUrl: connectionId === route.connectionId
            ? "https://provider.example/v1"
            : "https://api.openai.com/v1",
          endpointLocal: false,
          secretRef: null,
          secretVersion: null,
        } as ProviderConnectionRecord),
      },
      contextFactory: new IsolatedPiWorkerContext({
        baseEnvironment: () => ({ PATH: "/bin" }),
        createUniqueId: () => `fallback-mutation-${randomUUID()}`,
        runtimeRoot: root,
      }),
      providerIdForConnection: (record) => record.connectionId === route.connectionId
        ? null
        : "openai-codex",
      receipts: store,
      runPinnedPrompt: async (_prompt, launch, options) => {
        fallbackLaunches.push({ connectionId: launch.model.provider, modelId: launch.model.model });
        options?.onPiEvent?.({
          type: "tool_execution_start",
          toolCallId: "write-fallback",
          toolName: "write",
          args: { path: "src/fallback-output.ts" },
        });
        options?.onPiEvent?.({
          type: "tool_execution_end",
          toolCallId: "write-fallback",
          toolName: "write",
          isError: false,
        });
        return "fallback completed";
      },
      vault: new InMemorySecretVault(),
      workspaceRoot: root,
    });

    await expect(runPrompt("approved prompt", fallbackPlan, {
      cwd: root,
      workflowRunId: "workflow-provider-fallback",
    })).resolves.toBe("fallback completed");
    expect(fallbackLaunches).toEqual([
      { connectionId: "openai-codex", modelId: fallbackRoute.modelId },
    ]);
    const evidence = store.listFeatureInvocations({
      schemaVersion: "runtime-execution/v1",
      projectId: root,
      cardKey: null,
      limit: 10,
    });
    if (!evidence.ok) throw new Error(evidence.code);
    expect(evidence.value[0]).toMatchObject({
      receipt: { status: "completed", failureCode: null },
      attempts: [
        {
          attemptKind: "primary",
          status: "failed",
          workState: "none",
          actualRoute: null,
          failureCode: "provider_unsupported",
        },
        {
          attemptKind: "fallback",
          status: "completed",
          workState: "checkpointed",
          checkpointCursor: "artifact:src/fallback-output.ts",
          actualRoute: fallbackRoute,
          failureCode: null,
        },
      ],
      routeChangeEvents: [{
        kind: "fallback",
        reasonCode: "provider_unsupported",
        result: "completed",
        targetApprovedRoute: fallbackRoute,
      }],
    });
    store.close();
  });

  it("executes the approved fallback once through the production prompt-host coordinator", async () => {
    const fallbackRoute = { connectionId: "connection-fallback", modelId: "model-fallback" } as RouteIdentityV1;
    const fallbackPlan: HandoffPlanV1 = {
      ...plan,
      resolvedRoute: { ...plan.resolvedRoute, policySource: "action" },
      steps: [{ kind: "primary", route }, { kind: "recovery", route: fallbackRoute }],
    };
    const store = RuntimeInvocationStore.createInMemory();
    const launches: RouteIdentityV1[] = [];
    const runPrompt = createPlanBoundPiPromptRunner({
      connections: { getConnection: (connectionId) => ({
        ...connection,
        connectionId,
        kind: "pi_session",
        provider: { kind: "pi_session" },
        endpointUrl: null,
        endpointLocal: true,
        secretRef: null,
        secretVersion: null,
      } as ProviderConnectionRecord) },
      contextFactory: new IsolatedPiWorkerContext({
        baseEnvironment: () => ({ PATH: "/bin" }),
        createUniqueId: () => `fallback-${randomUUID()}`,
        runtimeRoot: root,
      }),
      providerIdForConnection: (record) => record.connectionId,
      receipts: store,
      runPinnedPrompt: async (_prompt, launch) => {
        launches.push({ connectionId: launch.model.provider, modelId: launch.model.model });
        if (launches.length === 1) throw new Error("provider unavailable");
        return "fallback accepted";
      },
      vault: new InMemorySecretVault(),
      workspaceRoot: root,
    });

    await expect(runPrompt("approved prompt", fallbackPlan, { cwd: root, workflowRunId: "workflow-fallback" }))
      .resolves.toBe("fallback accepted");
    expect(launches).toEqual([route, fallbackRoute]);
    const evidence = store.listFeatureInvocations({ schemaVersion: "runtime-execution/v1", projectId: root, cardKey: null, limit: 10 });
    if (!evidence.ok) throw new Error(evidence.code);
    expect(evidence.value[0]).toMatchObject({
      receipt: { status: "completed" },
      attempts: [{ attemptKind: "primary" }, { attemptKind: "fallback" }],
      routeChangeEvents: [{ kind: "fallback", result: "completed" }],
    });
    store.close();
  });
});
