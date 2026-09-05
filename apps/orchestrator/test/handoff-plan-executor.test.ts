import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeInvocationStore } from "@hepha/db";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  type HandoffPlanV1,
  type ProviderConnectionRecord,
  type RouteIdentityV1,
  runtimePersistenceRejection,
  type RuntimeAttemptV1,
  type RuntimeSafeFailureCode,
} from "@hepha/shared";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";
import {
  HandoffPlanExecutor,
  type HandoffPlanExecutorDependencies,
  type PiAttemptProcessRequest,
  type PiAttemptProcessResult,
} from "../src/runtime/pi/handoff-plan-executor.js";
import {
  IsolatedPiWorkerContext,
  IsolatedPiWorkerPreparationError,
  type PreparedIsolatedPiWorkerContext,
} from "../src/runtime/pi/isolated-pi-worker-context.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const primaryRoute = { connectionId: "connection-primary", modelId: "model-primary" } as RouteIdentityV1;
const secondRoute = { connectionId: "connection-second", modelId: "model-second" } as RouteIdentityV1;

function plan(route = primaryRoute, second = false): HandoffPlanV1 {
  return {
    schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
    resolvedRoute: {
      schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
      action: {
        schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
        actionId: "continue-implementing",
        actionType: "implementation",
        actionTypeLabel: "Implementation",
        actionTypeDisplayOrder: 2,
        label: "Continue Implementing",
        displayOrder: 2,
        roleId: "implementation-agent",
        promptVersion: "implementation/v1",
        capabilityRequirements: { minimumContextWindowTokens: 64_000, requiresTools: true, requiresApi: true, requiresReasoning: true },
      },
      route,
      policySource: "action",
      revisionId: "revision-41",
    },
    steps: second ? [{ kind: "primary", route }, { kind: "recovery", route: secondRoute }] : [{ kind: "primary", route }],
  };
}

function connection(overrides: Partial<ProviderConnectionRecord> = {}): ProviderConnectionRecord {
  return {
    connectionId: primaryRoute.connectionId,
    kind: "pi_session",
    label: "Pi Session",
    provider: { kind: "pi_session" },
    endpointUrl: "https://api.openai.com/v1",
    endpointLocal: false,
    lifecycleState: "active",
    secretRef: null,
    secretVersion: null,
    createdAt: "2026-07-23T10:00:00.000Z",
    updatedAt: "2026-07-23T10:00:00.000Z",
    ...overrides,
  } as ProviderConnectionRecord;
}

function context(invocationId: string) {
  return {
    projectId: "HEPHA",
    cardKey: "FEAT-example",
    workflowRunId: "workflow-a",
    workflowNodeId: "node-a",
    phaseExecutionContractId: "implementation-contract",
    phaseNumber: 3,
    taskId: "task-a",
    correlationId: `correlation-${invocationId}`,
    selectedLessonIds: ["lesson-a", "lesson-b"],
    invocationKind: "root" as const,
    rootInvocationId: invocationId,
    parentInvocationId: null,
  };
}

async function fixture(options: {
  connection?: ProviderConnectionRecord | null;
  process?: (request: PiAttemptProcessRequest) => Promise<unknown>;
  vault?: InMemorySecretVault;
  baseEnvironment?: NodeJS.ProcessEnv;
  contextFactory?: HandoffPlanExecutorDependencies["contextFactory"];
  markAttemptSpawned?: (attempt: RuntimeAttemptV1) => ReturnType<RuntimeInvocationStore["markAttemptSpawned"]>;
  vaultReadThrows?: boolean;
} = {}) {
  const root = await mkdtemp(resolve(tmpdir(), "hepha-isolated-pi-"));
  roots.push(root);
  const store = RuntimeInvocationStore.createInMemory();
  const vault = options.vault ?? new InMemorySecretVault();
  const selectedConnection = options.connection === undefined ? connection() : options.connection;
  const process = vi.fn(options.process ?? (async () => ({ status: "completed" as const, exitCode: 0, failureCode: null, output: "done" })));
  const readSecret = vi.spyOn(vault, "readSecret");
  if (options.vaultReadThrows) readSecret.mockRejectedValue(new Error("private vault detail"));
  let id = 0;
  let tick = 0;
  const contextFactory = options.contextFactory ?? new IsolatedPiWorkerContext({
    baseEnvironment: options.baseEnvironment ?? { PATH: "/bin", OPENAI_API_KEY: "parent-secret", HEPHA_DATABASE_PATH: "/private/db" },
    createUniqueId: () => `isolation-${++id}`,
    runtimeRoot: root,
  });
  const receipts: HandoffPlanExecutorDependencies["receipts"] = {
    appendRouteChange: (event) => store.appendRouteChange(event),
    getInvocation: (invocationId) => store.getInvocation(invocationId),
    openInvocation: (input) => store.openInvocation(input),
    startAttempt: (input) => store.startAttempt(input),
    markAttemptSpawned: options.markAttemptSpawned ?? ((attempt) => store.markAttemptSpawned(attempt)),
    settleAttempt: (attempt) => store.settleAttempt(attempt),
    settleInvocation: (receipt) => store.settleInvocation(receipt),
  };
  const executor = new HandoffPlanExecutor({
    connections: { getConnection: () => selectedConnection },
    contextFactory,
    createId: () => `attempt-${++id}`,
    now: () => new Date(Date.UTC(2026, 6, 23, 10, 0, tick++)).toISOString(),
    process: { execute: process as (request: PiAttemptProcessRequest) => Promise<PiAttemptProcessResult> },
    providerIdForConnection: (record) => record.kind === "pi_session" ? "openai" : record.provider.kind === "known" ? record.provider.providerId : `hepha-${record.connectionId}`,
    receipts,
    vault,
  });
  return { executor, process, readSecret, root, store, vault };
}

function execute(executor: HandoffPlanExecutor, invocationId = "invocation-a", selectedPlan = plan()) {
  return executor.executeAttempt({
    plan: selectedPlan,
    stepIndex: 0,
    attemptKind: "primary",
    invocationId,
    context: context(invocationId),
    inputRef: "prompt-artifact-a",
  });
}

describe("HandoffPlanExecutor", () => {
  it("rejects malformed input and a coordinator-owned second step before every side effect", async () => {
    const { executor, process, readSecret, store } = await fixture();

    await expect(executor.executeAttempt(null)).resolves.toMatchObject({ ok: false, code: "RUNTIME_INVALID_CONTEXT" });
    await expect(executor.executeAttempt({
      plan: plan(primaryRoute, true), stepIndex: 1, attemptKind: "recovery", invocationId: "invocation-a",
      context: context("invocation-a"), inputRef: "prompt-artifact-a",
    })).resolves.toMatchObject({ ok: false, code: "RUNTIME_INVALID_STEP" });

    expect(process).not.toHaveBeenCalled();
    expect(readSecret).not.toHaveBeenCalled();
    expect(store.listFeatureInvocations({ schemaVersion: "runtime-execution/v1", projectId: "HEPHA", cardKey: "FEAT-example", limit: 10 }))
      .toMatchObject({ ok: true, value: [] });
  });

  it("accepts the first zero-based contract phase as valid runtime context", async () => {
    const { executor, process } = await fixture();
    const invocationId = "invocation-phase-zero";

    const result = await executor.executeAttempt({
      plan: plan(),
      stepIndex: 0,
      attemptKind: "primary",
      invocationId,
      context: { ...context(invocationId), phaseNumber: 0 },
      inputRef: "prompt-phase-zero",
    });

    expect(result).toMatchObject({ ok: true, output: "done" });
    expect(process).toHaveBeenCalledOnce();
  });

  it("executes a Pi Session plan unchanged with no HEPHA vault read", async () => {
    const { executor, process, readSecret, store } = await fixture();

    const result = await execute(executor);

    expect(result).toMatchObject({
      ok: true,
      attempt: {
        actualRoute: primaryRoute,
        authenticationConnectionId: primaryRoute.connectionId,
        authenticationKind: "pi_session",
        credentialVersion: null,
        providerId: "openai",
        status: "completed",
      },
      receipt: { revisionId: "revision-41", policySource: "action", approvedPrimaryRoute: primaryRoute },
      output: "done",
    });
    expect(readSecret).not.toHaveBeenCalled();
    const request = process.mock.calls[0]![0];
    expect(request.arguments).toEqual(["--provider", "openai", "--model", "model-primary"]);
    expect(request.arguments.join(" ")).not.toMatch(/api.?key|secret/i);
    expect(request.environment).not.toHaveProperty("OPENAI_API_KEY");
    expect(request.environment).not.toHaveProperty("HEPHA_DATABASE_PATH");
    expect(request.environment).not.toHaveProperty("HEPHA_PI_PROVIDER_SECRET");
    expect(existsSync(request.configurationRoot)).toBe(false);
    expect(store.getInvocation("invocation-a")).toMatchObject({ ok: true, value: { receipt: { status: "completed" } } });
  });

  it("delivers one selected custom secret only in the child environment and cleans metadata", async () => {
    const vault = new InMemorySecretVault();
    await vault.createSecret("vault-primary", "distinctive-selected-secret");
    let observedModels = "";
    const custom = connection({
      kind: "custom",
      label: "Custom",
      provider: { kind: "custom", label: "Custom" },
      endpointUrl: "https://custom.example/v1",
      secretRef: "vault-primary",
      secretVersion: 7,
    });
    const { executor, process, readSecret, root } = await fixture({
      connection: custom,
      vault,
      process: async (request) => {
        observedModels = readFileSync(resolve(request.configurationRoot, "models.json"), "utf8");
        expect(request.environment.HEPHA_PI_PROVIDER_SECRET).toBe("distinctive-selected-secret");
        return { status: "completed", exitCode: 0, failureCode: null, output: "custom done" };
      },
    });

    const result = await execute(executor);

    expect(result).toMatchObject({ ok: true, attempt: { credentialVersion: 7, authenticationKind: "injected_connection_secret" } });
    expect(readSecret).toHaveBeenCalledOnce();
    expect(readSecret).toHaveBeenCalledWith("vault-primary");
    expect(observedModels).toContain("$HEPHA_PI_PROVIDER_SECRET");
    expect(observedModels).toContain("model-primary");
    expect(observedModels).not.toContain("distinctive-selected-secret");
    expect(process.mock.calls[0]![0].arguments.join(" ")).not.toContain("distinctive-selected-secret");
    expect(readFileOrEmptyTree(root)).not.toContain("distinctive-selected-secret");
  });

  it("keeps parallel roots, routes, credentials, and receipts isolated", async () => {
    const firstVault = new InMemorySecretVault();
    const secondVault = new InMemorySecretVault();
    await firstVault.createSecret("vault-a", "secret-a-distinctive");
    await secondVault.createSecret("vault-b", "secret-b-distinctive");
    const observed: PiAttemptProcessRequest[] = [];
    const first = await fixture({
      connection: connection({ kind: "known", provider: { kind: "known", providerId: "deepseek" }, secretRef: "vault-a", secretVersion: 1 }),
      vault: firstVault,
      baseEnvironment: { PATH: "/bin", PI_CODING_AGENT_DIR: "/host/pi-auth" },
      process: async (request) => { observed.push(request); await new Promise((done) => setTimeout(done, 10)); return { status: "completed", exitCode: 0, failureCode: null }; },
    });
    const secondRoutePlan = plan({ connectionId: "connection-second", modelId: "model-second" } as RouteIdentityV1);
    const second = await fixture({
      connection: connection({ connectionId: "connection-second" as ProviderConnectionRecord["connectionId"], kind: "known", provider: { kind: "known", providerId: "openai" }, secretRef: "vault-b", secretVersion: 2 }),
      vault: secondVault,
      baseEnvironment: { PATH: "/bin", PI_CODING_AGENT_DIR: "/host/pi-auth" },
      process: async (request) => { observed.push(request); return { status: "completed", exitCode: 0, failureCode: null }; },
    });

    await Promise.all([execute(first.executor, "invocation-a"), execute(second.executor, "invocation-b", secondRoutePlan)]);

    expect(observed).toHaveLength(2);
    expect(observed[0]!.configurationRoot).not.toBe(observed[1]!.configurationRoot);
    expect(observed[0]!.sessionDirectory).not.toBe(observed[1]!.sessionDirectory);
    expect(observed.every((request) => request.environment.PI_CODING_AGENT_DIR === request.configurationRoot)).toBe(true);
    expect(observed.every((request) => request.environment.PI_CODING_AGENT_DIR !== "/host/pi-auth")).toBe(true);
    expect(observed.map((request) => request.approvedRoute.modelId).sort()).toEqual(["model-primary", "model-second"]);
    expect(observed.map((request) => request.environment.HEPHA_PI_PROVIDER_SECRET).sort()).toEqual(["secret-a-distinctive", "secret-b-distinctive"]);
  });

  it("records a safe preparation failure without vault, context, process, or actual route", async () => {
    const { executor, process, readSecret, store, root } = await fixture({ connection: null });

    const result = await execute(executor);

    expect(result).toMatchObject({
      ok: false,
      code: "RUNTIME_CONNECTION_UNAVAILABLE",
      attempt: { actualRoute: null, status: "failed", failureCode: "connection_unavailable" },
      receipt: { status: "failed", failureCode: "connection_unavailable" },
    });
    expect(readSecret).not.toHaveBeenCalled();
    expect(process).not.toHaveBeenCalled();
    expect(readFileOrEmptyTree(root)).toBe("");
    expect(store.getInvocation("invocation-a")).toMatchObject({ ok: true, value: { attempts: [{ actualRoute: null }] } });
  });

  it("pins each credential version and cleans after a terminal process failure", async () => {
    const vault = new InMemorySecretVault();
    await vault.createSecret("vault-primary", "secret-version-one");
    const first = await fixture({
      connection: connection({ kind: "known", provider: { kind: "known", providerId: "openai" }, secretRef: "vault-primary", secretVersion: 1 }),
      vault,
      process: async () => ({ status: "failed", exitCode: 9, failureCode: "provider_unavailable" }),
    });

    const failed = await execute(first.executor, "invocation-v1");
    await vault.rotateSecret("vault-primary", "secret-version-two");
    const second = await fixture({
      connection: connection({ kind: "known", provider: { kind: "known", providerId: "openai" }, secretRef: "vault-primary", secretVersion: 2 }),
      vault,
    });
    const completed = await execute(second.executor, "invocation-v2");

    expect(failed).toMatchObject({ ok: false, code: "RUNTIME_ATTEMPT_FAILED", attempt: { credentialVersion: 1, exitCode: 9 } });
    expect(completed).toMatchObject({ ok: true, attempt: { credentialVersion: 2 } });
    expect(first.process.mock.calls[0]![0].environment.HEPHA_PI_PROVIDER_SECRET).toBe("secret-version-one");
    expect(second.process.mock.calls[0]![0].environment.HEPHA_PI_PROVIDER_SECRET).toBe("secret-version-two");
    expect(existsSync(first.process.mock.calls[0]![0].configurationRoot)).toBe(false);
  });

  it("pi-session-host-root-projection preserves an explicit host root and isolates parallel sessions", async () => {
    const providerMetadataObserved: boolean[] = [];
    const observePiSession = async (request: PiAttemptProcessRequest) => {
      providerMetadataObserved.push(existsSync(resolve(request.configurationRoot, "models.json")));
      return { status: "completed" as const, exitCode: 0, failureCode: null };
    };
    const first = await fixture({ baseEnvironment: { PATH: "/bin", PI_CODING_AGENT_DIR: "/host/pi-auth" }, process: observePiSession });
    const second = await fixture({ baseEnvironment: { PATH: "/bin", PI_CODING_AGENT_DIR: "/host/pi-auth" }, process: observePiSession });

    await Promise.all([execute(first.executor, "invocation-pi-first"), execute(second.executor, "invocation-pi-second")]);

    const firstRequest = first.process.mock.calls[0]![0];
    const secondRequest = second.process.mock.calls[0]![0];
    expect(firstRequest.environment.PI_CODING_AGENT_DIR).toBe("/host/pi-auth");
    expect(secondRequest.environment.PI_CODING_AGENT_DIR).toBe("/host/pi-auth");
    expect(firstRequest.environment.PI_CODING_AGENT_SESSION_DIR).toBe(firstRequest.sessionDirectory);
    expect(secondRequest.environment.PI_CODING_AGENT_SESSION_DIR).toBe(secondRequest.sessionDirectory);
    expect(firstRequest.sessionDirectory).not.toBe(secondRequest.sessionDirectory);
    expect(firstRequest.environment).not.toHaveProperty("HEPHA_PI_PROVIDER_SECRET");
    expect(secondRequest.environment).not.toHaveProperty("HEPHA_PI_PROVIDER_SECRET");
    expect(firstRequest.arguments).toEqual(["--provider", "openai", "--model", "model-primary"]);
    expect(secondRequest.arguments).toEqual(["--provider", "openai", "--model", "model-primary"]);
    expect(providerMetadataObserved).toEqual([false, false]);
    expect(first.readSecret).not.toHaveBeenCalled();
    expect(second.readSecret).not.toHaveBeenCalled();
  });

  it.each([undefined, ""])("pi-session-default-root-control leaves an absent or empty host selector absent (%s)", async (hostRoot) => {
    const { executor, process, readSecret } = await fixture({
      baseEnvironment: { PATH: "/bin", ...(hostRoot === undefined ? {} : { PI_CODING_AGENT_DIR: hostRoot }) },
    });

    await expect(execute(executor)).resolves.toMatchObject({ ok: true });

    const request = process.mock.calls[0]![0];
    expect(request.environment).not.toHaveProperty("PI_CODING_AGENT_DIR");
    expect(request.environment.PI_CODING_AGENT_SESSION_DIR).toBe(request.sessionDirectory);
    expect(readSecret).not.toHaveBeenCalled();
  });

  it("injected-root-override-control replaces the host root for injected launches", async () => {
    const cases = [
      {
        name: "known",
        connection: injectedConnection(),
        selectedValue: "known-selected-only",
        providerId: "openai",
      },
      {
        name: "custom",
        connection: connection({
          kind: "custom",
          label: "Custom",
          provider: { kind: "custom", label: "Custom" },
          endpointUrl: "https://custom.example/v1",
          secretRef: "vault-primary",
          secretVersion: 2,
        }),
        selectedValue: "custom-selected-only",
        providerId: "hepha-connection-primary",
      },
    ] as const;
    const requests: PiAttemptProcessRequest[] = [];

    for (const testCase of cases) {
      const vault = new InMemorySecretVault();
      await vault.createSecret("vault-primary", testCase.selectedValue);
      const current = await fixture({
        baseEnvironment: {
          PATH: "/bin",
          PI_CODING_AGENT_DIR: "/host/pi-auth",
          OPENAI_API_KEY: "unselected-openai",
          ANTHROPIC_API_KEY: "unselected-anthropic",
        },
        connection: testCase.connection,
        vault,
      });

      await expect(execute(current.executor, `invocation-injected-${testCase.name}`)).resolves.toMatchObject({
        ok: true,
        attempt: { actualRoute: primaryRoute, providerId: testCase.providerId, status: "completed" },
      });

      const request = current.process.mock.calls[0]![0];
      requests.push(request);
      expect(request.approvedRoute).toEqual(primaryRoute);
      expect(request.arguments).toEqual(["--provider", testCase.providerId, "--model", primaryRoute.modelId]);
      expect(request.environment.PI_CODING_AGENT_DIR).toBe(request.configurationRoot);
      expect(request.environment.PI_CODING_AGENT_DIR).not.toBe("/host/pi-auth");
      expect(request.environment.PI_CODING_AGENT_SESSION_DIR).toBe(request.sessionDirectory);
      expect(request.sessionDirectory).toBe(resolve(request.configurationRoot, "sessions"));
      expect(request.environment.HEPHA_PI_PROVIDER_SECRET).toBe(testCase.selectedValue);
      expect(Object.entries(request.environment).filter(([, value]) => value === testCase.selectedValue))
        .toEqual([["HEPHA_PI_PROVIDER_SECRET", testCase.selectedValue]]);
      expect(request.environment).not.toHaveProperty("OPENAI_API_KEY");
      expect(request.environment).not.toHaveProperty("ANTHROPIC_API_KEY");
    }

    expect(requests[0]!.configurationRoot).not.toBe(requests[1]!.configurationRoot);
    expect(requests[0]!.sessionDirectory).not.toBe(requests[1]!.sessionDirectory);
  });

  it("early-cleanup-outcome-matrix preserves cleanup authority before process execution", async () => {
    const cases = [
      { stage: "secret" as const, cleanup: "true" as const, vaultThrows: false, code: "RUNTIME_SECRET_READ_FAILED", failureCode: "secret_read_failed" },
      { stage: "secret" as const, cleanup: "false" as const, vaultThrows: false, code: "RUNTIME_CLEANUP_FAILED", failureCode: "cleanup_failed" },
      { stage: "secret" as const, cleanup: "throw" as const, vaultThrows: false, code: "RUNTIME_CLEANUP_FAILED", failureCode: "cleanup_failed" },
      { stage: "secret" as const, cleanup: "true" as const, vaultThrows: true, code: "RUNTIME_SECRET_READ_FAILED", failureCode: "secret_read_failed" },
      { stage: "secret" as const, cleanup: "false" as const, vaultThrows: true, code: "RUNTIME_CLEANUP_FAILED", failureCode: "cleanup_failed" },
      { stage: "secret" as const, cleanup: "throw" as const, vaultThrows: true, code: "RUNTIME_CLEANUP_FAILED", failureCode: "cleanup_failed" },
      { stage: "environment" as const, cleanup: "true" as const, vaultThrows: false, code: "RUNTIME_CONTEXT_PREPARATION_FAILED", failureCode: "context_preparation_failed" },
      { stage: "environment" as const, cleanup: "false" as const, vaultThrows: false, code: "RUNTIME_CLEANUP_FAILED", failureCode: "cleanup_failed" },
      { stage: "environment" as const, cleanup: "throw" as const, vaultThrows: false, code: "RUNTIME_CLEANUP_FAILED", failureCode: "cleanup_failed" },
      { stage: "spawn-persistence" as const, cleanup: "true" as const, vaultThrows: false, code: "RUNTIME_PERSISTENCE_FAILED", failureCode: null },
      { stage: "spawn-persistence" as const, cleanup: "false" as const, vaultThrows: false, code: "RUNTIME_CLEANUP_FAILED", failureCode: "cleanup_failed" },
      { stage: "spawn-persistence" as const, cleanup: "throw" as const, vaultThrows: false, code: "RUNTIME_CLEANUP_FAILED", failureCode: "cleanup_failed" },
    ];

    for (const [index, testCase] of cases.entries()) {
      const vault = new InMemorySecretVault();
      if (testCase.stage !== "secret") await vault.createSecret("vault-primary", "selected-only");
      const cleanup = vi.fn(async () => {
        if (testCase.cleanup === "throw") throw new Error("private cleanup detail");
        return testCase.cleanup === "true";
      });
      const contextFactory = {
        prepare: vi.fn(async () => preparedContext(
          cleanup,
          testCase.stage === "environment" ? () => { throw new Error("private environment detail"); } : undefined,
        )),
      };
      const current = await fixture({
        connection: injectedConnection(),
        vault,
        contextFactory,
        markAttemptSpawned: testCase.stage === "spawn-persistence"
          ? () => runtimePersistenceRejection("RUNTIME_PERSISTENCE_CONFLICT")
          : undefined,
        vaultReadThrows: testCase.vaultThrows,
      });

      const result = await execute(current.executor, `invocation-early-${index}`);

      expect(result).toMatchObject({ ok: false, code: testCase.code });
      expect(cleanup).toHaveBeenCalledOnce();
      expect(current.process).not.toHaveBeenCalled();
      if (testCase.failureCode !== null) {
        expect(result).toMatchObject({ attempt: { actualRoute: null, status: "failed", failureCode: testCase.failureCode } });
        expect(current.store.getInvocation(`invocation-early-${index}`)).toMatchObject({
          ok: true,
          value: { receipt: { status: "failed", failureCode: testCase.failureCode }, attempts: [{ actualRoute: null, failureCode: testCase.failureCode }] },
        });
      } else {
        expect(result).toMatchObject({ attempt: { actualRoute: null, status: "preparing" } });
      }
    }
  });

  it("process-result-normalization-matrix closes every status and failure-code combination", async () => {
    const validCases: Array<{ result: unknown; code: string | null; status: string; failureCode: RuntimeSafeFailureCode | null }> = [
      { result: { status: "completed", exitCode: 0, failureCode: null, output: "ok" }, code: null, status: "completed", failureCode: null },
      { result: { status: "timed_out", exitCode: null, failureCode: null }, code: "RUNTIME_ATTEMPT_TIMED_OUT", status: "timed_out", failureCode: "timed_out" },
      { result: { status: "timed_out", exitCode: null, failureCode: "timed_out" }, code: "RUNTIME_ATTEMPT_TIMED_OUT", status: "timed_out", failureCode: "timed_out" },
      { result: { status: "cancelled", exitCode: null, failureCode: null }, code: "RUNTIME_ATTEMPT_CANCELLED", status: "cancelled", failureCode: "cancelled" },
      { result: { status: "cancelled", exitCode: null, failureCode: "cancelled" }, code: "RUNTIME_ATTEMPT_CANCELLED", status: "cancelled", failureCode: "cancelled" },
      { result: { status: "failed", exitCode: 1, failureCode: null }, code: "RUNTIME_ATTEMPT_FAILED", status: "failed", failureCode: "provider_unavailable" },
    ];
    const ordinaryFailureCodes = SAFE_PROCESS_FAILURE_CODES.filter((code) => code !== "timed_out" && code !== "cancelled");
    for (const failureCode of ordinaryFailureCodes) {
      validCases.push({
        result: { status: "failed", exitCode: 1, failureCode },
        code: failureCode === "spawn_failed" ? "RUNTIME_SPAWN_FAILED" : "RUNTIME_ATTEMPT_FAILED",
        status: "failed",
        failureCode,
      });
    }
    const invalidCases: unknown[] = [
      null,
      {},
      { status: "unknown", exitCode: null, failureCode: null },
      { status: "completed", exitCode: 0, failureCode: "provider_unavailable" },
      { status: "timed_out", exitCode: null, failureCode: "provider_unavailable" },
      { status: "cancelled", exitCode: null, failureCode: "provider_unavailable" },
      { status: "failed", exitCode: 1, failureCode: "timed_out" },
      { status: "failed", exitCode: 1, failureCode: "cancelled" },
      { status: "failed", exitCode: "1", failureCode: null },
      { status: "failed", exitCode: 1, failureCode: "unknown" },
      { status: "failed", exitCode: 1, failureCode: null, output: 7 },
      { status: "failed", exitCode: 1, failureCode: null, extra: true },
    ];

    const allCases = [
      ...validCases,
      ...invalidCases.map((result) => ({ result, code: "RUNTIME_ATTEMPT_FAILED", status: "failed", failureCode: "invalid_output" as const })),
    ];
    for (const [index, testCase] of allCases.entries()) {
      const current = await fixture({ process: async () => testCase.result });
      const invocationId = `invocation-process-${index}`;

      const result = await execute(current.executor, invocationId);

      if (testCase.code === null) expect(result).toMatchObject({ ok: true, output: "ok" });
      else expect(result).toMatchObject({ ok: false, code: testCase.code });
      expect(result).toMatchObject({
        attempt: { status: testCase.status, failureCode: testCase.failureCode, timeoutMarker: testCase.status === "timed_out" },
      });
      expect(current.store.getInvocation(invocationId)).toMatchObject({
        ok: true,
        value: { receipt: { status: testCase.status, failureCode: testCase.failureCode }, attempts: [{ status: testCase.status, failureCode: testCase.failureCode }] },
      });
      expect(result).not.toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_FAILED" });
    }
  });

  it("process-terminal-cleanup-positive-control preserves or overrides every terminal outcome", async () => {
    const outcomes: PiAttemptProcessResult[] = [
      { status: "completed", exitCode: 0, failureCode: null },
      { status: "failed", exitCode: 1, failureCode: "provider_unavailable" },
      { status: "timed_out", exitCode: null, failureCode: "timed_out" },
      { status: "cancelled", exitCode: null, failureCode: "cancelled" },
    ];
    for (const [index, outcome] of outcomes.entries()) {
      for (const cleanupSucceeded of [true, false]) {
        const cleanup = vi.fn(async () => cleanupSucceeded);
        const current = await fixture({
          contextFactory: { prepare: async () => preparedContext(cleanup) },
          process: async () => outcome,
        });
        const invocationId = `invocation-terminal-${index}-${cleanupSucceeded}`;

        const result = await execute(current.executor, invocationId);

        expect(cleanup).toHaveBeenCalledOnce();
        if (cleanupSucceeded) {
          expect(result).toMatchObject({ attempt: { status: outcome.status, failureCode: outcome.failureCode } });
        } else {
          expect(result).toMatchObject({ ok: false, code: "RUNTIME_CLEANUP_FAILED", attempt: { status: "failed", failureCode: "cleanup_failed" } });
          expect(current.store.getInvocation(invocationId)).toMatchObject({
            ok: true,
            value: { receipt: { status: "failed", failureCode: "cleanup_failed" }, attempts: [{ status: "failed", failureCode: "cleanup_failed" }] },
          });
        }
      }
    }
  });
});


describe("IsolatedPiWorkerContext", () => {
  it("partial-context-cleanup-matrix distinguishes removed and leaked partial roots safely", async () => {
    for (const preparationFailure of ["mkdir", "metadata"] as const) {
      for (const cleanupSucceeded of [true, false]) {
        let rootPresent = false;
        const fileSystem = {
          mkdir: vi.fn(async () => {
            rootPresent = true;
            if (preparationFailure === "mkdir") throw new Error("private mkdir detail");
          }),
          writeFile: vi.fn(async () => { throw new Error("private metadata detail"); }),
          rm: vi.fn(async () => {
            if (!cleanupSucceeded) throw new Error("private path detail");
            rootPresent = false;
          }),
        };
        const factory = new IsolatedPiWorkerContext({
          baseEnvironment: { PATH: "/bin" },
          createUniqueId: () => "partial",
          runtimeRoot: "/private/runtime-root",
          fileSystem,
        });

        const failure = await factory.prepare({
          attemptId: "attempt-partial",
          connection: connection({ kind: "custom", provider: { kind: "custom", label: "Custom" }, secretRef: "vault-primary", secretVersion: 1 }),
          providerId: "hepha-custom",
          route: primaryRoute,
        }).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(IsolatedPiWorkerPreparationError);
        expect(failure).toMatchObject({ cleanupSucceeded });
        expect(String(failure)).toBe(cleanupSucceeded
          ? "IsolatedPiWorkerPreparationError: RUNTIME_CONTEXT_PREPARATION_FAILED"
          : "IsolatedPiWorkerPreparationError: RUNTIME_CLEANUP_FAILED");
        expect(String(failure)).not.toMatch(/private|runtime-root|mkdir detail|metadata detail|path detail/i);
        expect(fileSystem.rm).toHaveBeenCalledOnce();
        expect(rootPresent).toBe(!cleanupSucceeded);
      }
    }

    const root = await mkdtemp(resolve(tmpdir(), "hepha-context-positive-"));
    roots.push(root);
    const factory = new IsolatedPiWorkerContext({ baseEnvironment: { PATH: "/bin" }, createUniqueId: () => "valid", runtimeRoot: root });
    const prepared = await factory.prepare({ attemptId: "attempt-valid", connection: connection(), providerId: "openai", route: primaryRoute });
    await expect(prepared.cleanup()).resolves.toBe(true);
    await expect(prepared.cleanup()).resolves.toBe(true);
    expect(existsSync(prepared.configurationRoot)).toBe(false);
  });
});

const SAFE_PROCESS_FAILURE_CODES: readonly RuntimeSafeFailureCode[] = [
  "invalid_input", "connection_unavailable", "auth_unavailable", "provider_unsupported", "secret_read_failed",
  "context_preparation_failed", "spawn_failed", "payment_required", "quota_exceeded", "rate_limited",
  "endpoint_unavailable", "provider_unavailable", "timed_out", "cancelled", "safety_rejected", "invalid_output",
  "checkpoint_required", "cleanup_failed", "persistence_failed",
];

function injectedConnection(): ProviderConnectionRecord {
  return connection({
    kind: "known",
    provider: { kind: "known", providerId: "openai" },
    secretRef: "vault-primary",
    secretVersion: 1,
  });
}

function preparedContext(
  cleanup: () => Promise<boolean>,
  buildEnvironment: ((secretValue?: string) => NodeJS.ProcessEnv) = (secretValue) => ({
    PATH: "/bin",
    PI_CODING_AGENT_DIR: "/isolated/root",
    PI_CODING_AGENT_SESSION_DIR: "/isolated/root/session",
    ...(secretValue === undefined ? {} : { HEPHA_PI_PROVIDER_SECRET: secretValue }),
  }),
): PreparedIsolatedPiWorkerContext {
  return {
    configurationRoot: "/isolated/root",
    sessionDirectory: "/isolated/root/session",
    providerId: "openai",
    secretEnvironmentKey: "HEPHA_PI_PROVIDER_SECRET",
    buildEnvironment,
    cleanup,
  };
}

function readFileOrEmptyTree(root: string): string {
  try {
    return readFileSync(resolve(root, "models.json"), "utf8");
  } catch {
    return "";
  }
}
