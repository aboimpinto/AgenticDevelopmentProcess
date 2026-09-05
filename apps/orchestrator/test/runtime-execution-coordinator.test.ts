import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { RuntimeInvocationStore } from "@hepha/db";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  type HandoffPlanV1,
  type ProviderConnectionRecord,
  type RouteIdentityV1,
} from "@hepha/shared";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";
import {
  HandoffPlanExecutor,
  type HandoffPlanAttemptResult,
  type PiAttemptProcessRequest,
  type PiAttemptProcessResult,
  type RuntimeAttemptContextV1,
} from "../src/runtime/pi/handoff-plan-executor.js";
import {
  RUNTIME_WORK_STATE_SCHEMA_VERSION,
  RuntimeExecutionCoordinator,
  RuntimeInvocationDurableWorkStatePort,
  WorkflowTaskDurableWorkStatePort,
  type DurableWorkStatePort,
} from "../src/runtime/pi/runtime-execution-coordinator.js";

const featurePath = fileURLToPath(new URL("./feat-062-worker-execution.feature", import.meta.url));
const primaryRoute = { connectionId: "primary-connection", modelId: "primary-model" } as RouteIdentityV1;
const secondRoute = { connectionId: "second-connection", modelId: "second-model" } as RouteIdentityV1;

function plan(steps = 2, actionId = "continue-implementing"): HandoffPlanV1 {
  return {
    schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
    resolvedRoute: {
      schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
      action: {
        schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
        actionId,
        actionType: "implementation",
        actionTypeLabel: "Implementation",
        actionTypeDisplayOrder: 2,
        label: "Implementation Action",
        displayOrder: 1,
        roleId: "implementation-agent",
        promptVersion: "implementation/v1",
        capabilityRequirements: { minimumContextWindowTokens: 1, requiresTools: true, requiresApi: true, requiresReasoning: false },
      },
      route: primaryRoute,
      policySource: steps === 1 ? "global" : "action",
      revisionId: "revision-1",
    },
    steps: steps === 1
      ? [{ kind: "primary", route: primaryRoute }]
      : [{ kind: "primary", route: primaryRoute }, { kind: "recovery", route: secondRoute }],
  };
}

function context(invocationId = "invocation-1"): RuntimeAttemptContextV1 {
  return {
    projectId: "HEPHA",
    cardKey: "FEAT-fixture",
    workflowRunId: "workflow-1",
    workflowNodeId: "node-1",
    phaseExecutionContractId: "generic-implementation",
    phaseNumber: 2,
    taskId: "task-current",
    correlationId: "correlation-1",
    selectedLessonIds: [],
    invocationKind: "root",
    rootInvocationId: invocationId,
    parentInvocationId: null,
  };
}

function connection(route: RouteIdentityV1): ProviderConnectionRecord {
  return {
    connectionId: route.connectionId,
    kind: "pi_session",
    label: route.connectionId,
    provider: { kind: "pi_session" },
    endpointUrl: null,
    endpointLocal: true,
    lifecycleState: "active",
    secretRef: null,
    secretVersion: null,
    createdAt: "2026-07-23T10:00:00.000Z",
    updatedAt: "2026-07-23T10:00:00.000Z",
  };
}

function createFixture(options: {
  readonly selectedPlan?: HandoffPlanV1;
  readonly process?: (request: PiAttemptProcessRequest, store: RuntimeInvocationStore) => Promise<PiAttemptProcessResult>;
  readonly workState?: DurableWorkStatePort;
} = {}) {
  const selectedPlan = options.selectedPlan ?? plan();
  const store = RuntimeInvocationStore.createInMemory();
  const calls: PiAttemptProcessRequest[] = [];
  let id = 0;
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 6, 23, 10, 0, tick++)).toISOString();
  const executor = new HandoffPlanExecutor({
    connections: { getConnection: (id) => id === primaryRoute.connectionId ? connection(primaryRoute) : id === secondRoute.connectionId ? connection(secondRoute) : null },
    contextFactory: {
      prepare: async ({ attemptId }) => ({
        configurationRoot: `/runtime/${attemptId}`,
        sessionDirectory: `/runtime/${attemptId}/sessions`,
        buildEnvironment: () => ({ PATH: "/bin" }),
        cleanup: async () => true,
      }),
    },
    createId: () => `runtime-${++id}`,
    now,
    process: {
      execute: async (request) => {
        calls.push(request);
        return options.process
          ? options.process(request, store)
          : request.approvedRoute.connectionId === primaryRoute.connectionId
            ? { status: "failed", exitCode: 1, failureCode: "provider_unavailable" }
            : { status: "completed", exitCode: 0, failureCode: null, output: "continued" };
      },
    },
    providerIdForConnection: (record) => record.connectionId,
    receipts: store,
    vault: new InMemorySecretVault(),
  });
  const coordinator = new RuntimeExecutionCoordinator({
    executor,
    now,
    receipts: store,
    workState: options.workState ?? new RuntimeInvocationDurableWorkStatePort(store),
  });
  return { calls, coordinator, executor, now, selectedPlan, store };
}

describe("RuntimeExecutionCoordinator", () => {
  it("binds the generic failure and recovery scenarios to the public coordinator", () => {
    const feature = readFileSync(featurePath, "utf8");
    for (const tag of ["E011-FAIL-001", "E011-FAIL-002", "E011-FAIL-003", "E011-FAIL-004", "E011-FAIL-005", "WF-RUNTIME-FALLBACK", "WF-RUNTIME-RECOVERY", "WF-RUNTIME-TERMINAL"]) {
      expect(feature).toContain(`@${tag}`);
    }
    expect(feature).toContain("Scenario: A pre-substantive primary failure consumes the approved second route once");
    expect(feature).toContain("Scenario: A checkpointed primary failure hands off without replay");
  });

  it("uses the approved second route exactly once as fallback before substantive work", async () => {
    const { calls, coordinator, selectedPlan, store } = createFixture();
    const result = await coordinator.execute({ plan: selectedPlan, invocationId: "invocation-1", context: context(), inputRef: "prompt:1" });

    expect(result).toMatchObject({ ok: true, classification: "fallback" });
    expect(calls.map((call) => call.approvedRoute)).toEqual([primaryRoute, secondRoute]);
    expect(calls[1]?.recoveryContext).toBeNull();
    const evidence = store.getInvocation("invocation-1");
    expect(evidence).toMatchObject({ ok: true, value: { receipt: { status: "completed" } } });
    if (evidence.ok) {
      expect(evidence.value?.attempts.map((attempt) => attempt.attemptKind)).toEqual(["primary", "fallback"]);
      expect(evidence.value?.routeChangeEvents).toMatchObject([{ kind: "fallback", result: "completed" }]);
    }
    store.close();
  });

  it("creates one checkpoint-bound recovery context without replaying completed task identities", async () => {
    const taskRows = vi.fn(async () => [
      { taskId: "task-a", taskIndex: 0, status: "COMPLETED" },
      { taskId: "task-b", taskIndex: 1, status: "SKIPPED" },
      { taskId: "task-current", taskIndex: 2, status: "IN_PROGRESS" },
    ] as never);
    const fixture = createFixture({
      process: async (request, receipts) => {
        if (request.approvedRoute.connectionId === primaryRoute.connectionId) {
          const current = receipts.listFeatureInvocations({ schemaVersion: "runtime-execution/v1", projectId: "HEPHA", cardKey: "FEAT-fixture", limit: 10 });
          if (!current.ok) throw new Error(current.code);
          const running = current.value[0]!.attempts[0]!;
          const started = { ...running, workState: "started" as const };
          if (!receipts.markSubstantiveWorkStarted(started).ok) throw new Error("mark-started");
          if (!receipts.recordCheckpoint({ ...started, workState: "checkpointed", checkpointId: "checkpoint-1", checkpointCursor: "cursor-opaque-1" }).ok) throw new Error("checkpoint");
          return { status: "failed", exitCode: 1, failureCode: "provider_unavailable" };
        }
        return { status: "completed", exitCode: 0, failureCode: null, output: "recovered" };
      },
    });
    const coordinator = new RuntimeExecutionCoordinator({
      executor: fixture.executor,
      now: fixture.now,
      receipts: fixture.store,
      workState: new WorkflowTaskDurableWorkStatePort(fixture.store, { listImplementationTaskRuns: taskRows }),
    });

    const result = await coordinator.execute({ plan: fixture.selectedPlan, invocationId: "invocation-1", context: context(), inputRef: "prompt:1" });
    expect(result).toMatchObject({ ok: true, classification: "recovery" });
    expect(fixture.calls).toHaveLength(2);
    expect(fixture.calls[1]?.recoveryContext).toEqual({
      priorInvocationId: "invocation-1",
      checkpointId: "checkpoint-1",
      checkpointCursor: "cursor-opaque-1",
      unresolvedTaskCursor: "task-current",
      completedTaskIds: ["task-a", "task-b"],
    });
    const evidence = fixture.store.getInvocation("invocation-1");
    if (evidence.ok) expect(evidence.value?.attempts.map((attempt) => attempt.attemptKind)).toEqual(["primary", "recovery"]);
    expect(taskRows).toHaveBeenCalledWith("HEPHA", "FEAT-fixture", 2);
    fixture.store.close();
  });

  it("terminates started-without-checkpoint, malformed work evidence, and one-step failures without a substitute", async () => {
    for (const row of [
      {
        name: "started",
        selectedPlan: plan(),
        workState: { read: ({ invocationId, attemptId }: { invocationId: string; attemptId: string }) => ({
          schemaVersion: RUNTIME_WORK_STATE_SCHEMA_VERSION, invocationId, attemptId, workState: "started",
          checkpointId: null, checkpointCursor: null, unresolvedTaskCursor: null, completedTaskIds: [],
        }) },
        code: "RUNTIME_RECOVERY_CHECKPOINT_REQUIRED",
      },
      { name: "malformed", selectedPlan: plan(), workState: { read: () => ({ workState: "none" }) }, code: "RUNTIME_RECOVERY_CHECKPOINT_REQUIRED" },
      { name: "one-step", selectedPlan: plan(1), workState: { read: () => { throw new Error("must not read"); } }, code: "RUNTIME_ROUTE_SEQUENCE_EXHAUSTED" },
    ] as const) {
      const fixture = createFixture({ selectedPlan: row.selectedPlan, workState: row.workState });
      const result = await fixture.coordinator.execute({ plan: row.selectedPlan, invocationId: "invocation-1", context: context(), inputRef: "prompt:1" });
      expect(result, row.name).toMatchObject({ ok: false, code: row.code, classification: "terminal" });
      expect(fixture.calls, row.name).toHaveLength(1);
      const evidence = fixture.store.getInvocation("invocation-1");
      expect(evidence, row.name).toMatchObject({ ok: true, value: { receipt: { status: "failed" } } });
      fixture.store.close();
    }
  });

  it("primary-persistence-failure-terminal: never classifies or executes a second route after receipt authority fails", async () => {
    const normal = createFixture({ selectedPlan: plan(1) });
    const terminal = await normal.executor.executeAttempt({
      plan: plan(1), invocationId: "invocation-1", context: context(), inputRef: "prompt:1",
      stepIndex: 0, attemptKind: "primary",
    });
    if (terminal.ok || !terminal.attempt || !terminal.receipt) throw new Error("expected terminal fixture");
    normal.store.close();

    for (const primary of [
      { ok: false, code: "RUNTIME_PERSISTENCE_FAILED", attempt: null, receipt: null },
      { ok: false, code: "RUNTIME_PERSISTENCE_FAILED", attempt: null, receipt: terminal.receipt },
      { ...terminal, code: "RUNTIME_PERSISTENCE_FAILED" },
    ] as HandoffPlanAttemptResult[]) {
      const executeAttempt = vi.fn(async () => primary);
      const read = vi.fn();
      const settleAttempt = vi.fn(() => ({ ok: true, value: terminal.attempt! }));
      const settleInvocation = vi.fn(() => ({ ok: true, value: terminal.receipt! }));
      const coordinator = new RuntimeExecutionCoordinator({
        executor: { executeAttempt }, now: () => terminal.receipt!.settledAt!,
        receipts: {
          getInvocation: () => ({ ok: true, value: primary.attempt ? {
            schemaVersion: "runtime-execution/v1", receipt: terminal.receipt!, attempts: [terminal.attempt!], routeChangeEvents: [],
          } : null }),
          settleAttempt, settleInvocation,
        } as never,
        workState: { read },
      });
      const result = await coordinator.execute({ plan: plan(), invocationId: "invocation-1", context: context(), inputRef: "prompt:1" });
      expect(result).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_FAILED", classification: "terminal" });
      expect(read).not.toHaveBeenCalled();
      expect(executeAttempt).toHaveBeenCalledOnce();
      if (primary.attempt) {
        expect(settleAttempt).toHaveBeenCalledOnce();
        expect(settleInvocation).toHaveBeenCalledOnce();
      }
    }
  });

  it("work-state-read-failure-terminal: sanitizes synchronous and asynchronous authority failures", async () => {
    for (const read of [
      vi.fn(() => { throw new Error("raw sqlite secret detail"); }),
      vi.fn(async () => { throw new Error("raw rejected database detail"); }),
    ]) {
      const fixture = createFixture({ workState: { read } });
      const result = await fixture.coordinator.execute({ plan: fixture.selectedPlan, invocationId: "invocation-1", context: context(), inputRef: "prompt:1" });
      expect(result).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_FAILED", classification: "terminal" });
      expect(JSON.stringify(result)).not.toMatch(/sqlite|secret|database detail/i);
      expect(read).toHaveBeenCalledOnce();
      expect(fixture.calls).toHaveLength(1);
      expect(fixture.store.getInvocation("invocation-1")).toMatchObject({ ok: true, value: { receipt: { status: "failed" } } });
      fixture.store.close();
    }
  });

  it("work-state-classification-matrix: rejects every incomplete recovery authority without replay", async () => {
    const rows: readonly [string, (invocationId: string, attemptId: string) => unknown][] = [
      ["absent", () => null],
      ["malformed outer", () => "none"],
      ["mismatched invocation", (_invocationId, attemptId) => ({ schemaVersion: RUNTIME_WORK_STATE_SCHEMA_VERSION, invocationId: "other", attemptId, workState: "none", checkpointId: null, checkpointCursor: null, unresolvedTaskCursor: null, completedTaskIds: [] })],
      ["mismatched attempt", (invocationId) => ({ schemaVersion: RUNTIME_WORK_STATE_SCHEMA_VERSION, invocationId, attemptId: "other", workState: "none", checkpointId: null, checkpointCursor: null, unresolvedTaskCursor: null, completedTaskIds: [] })],
      ["mismatched persisted work", (invocationId, attemptId) => ({ schemaVersion: RUNTIME_WORK_STATE_SCHEMA_VERSION, invocationId, attemptId, workState: "started", checkpointId: null, checkpointCursor: null, unresolvedTaskCursor: null, completedTaskIds: [] })],
      ["missing checkpoint id", (invocationId, attemptId) => ({ schemaVersion: RUNTIME_WORK_STATE_SCHEMA_VERSION, invocationId, attemptId, workState: "checkpointed", checkpointId: null, checkpointCursor: "cursor", unresolvedTaskCursor: "task", completedTaskIds: [] })],
      ["missing checkpoint cursor", (invocationId, attemptId) => ({ schemaVersion: RUNTIME_WORK_STATE_SCHEMA_VERSION, invocationId, attemptId, workState: "checkpointed", checkpointId: "checkpoint", checkpointCursor: null, unresolvedTaskCursor: "task", completedTaskIds: [] })],
      ["missing unresolved cursor", (invocationId, attemptId) => ({ schemaVersion: RUNTIME_WORK_STATE_SCHEMA_VERSION, invocationId, attemptId, workState: "checkpointed", checkpointId: "checkpoint", checkpointCursor: "cursor", unresolvedTaskCursor: null, completedTaskIds: [] })],
    ];
    for (const [name, snapshot] of rows) {
      const fixture = createFixture({ workState: { read: ({ invocationId, attemptId }) => snapshot(invocationId, attemptId) } });
      const result = await fixture.coordinator.execute({ plan: fixture.selectedPlan, invocationId: "invocation-1", context: context(), inputRef: "prompt:1" });
      expect(result, name).toMatchObject({ ok: false, code: "RUNTIME_RECOVERY_CHECKPOINT_REQUIRED", classification: "terminal" });
      expect(fixture.calls, name).toHaveLength(1);
      fixture.store.close();
    }
  });

  it("makes a failed second attempt terminal without recursive resolution or a third process call", async () => {
    const { calls, coordinator, selectedPlan, store } = createFixture({
      process: async () => ({ status: "failed", exitCode: 1, failureCode: "provider_unavailable" }),
    });
    const result = await coordinator.execute({ plan: selectedPlan, invocationId: "invocation-1", context: context(), inputRef: "prompt:1" });
    expect(result).toMatchObject({ ok: false, code: "RUNTIME_ROUTE_SEQUENCE_EXHAUSTED", classification: "fallback" });
    expect(calls).toHaveLength(2);
    const evidence = store.getInvocation("invocation-1");
    expect(evidence).toMatchObject({ ok: true, value: { receipt: { status: "failed" } } });
    if (evidence.ok) expect(evidence.value?.attempts).toHaveLength(2);
    store.close();
  });
});
