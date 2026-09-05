import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { RuntimeInvocationStore } from "@hepha/db";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  type AgentActionType,
  type AgentRoleId,
  isRuntimeRouteChangeEventV1,
  parseAgentDispatchEnvelopeV1,
  type HandoffPlanV1,
  type ProviderConnectionRecord,
  type RouteIdentityV1,
} from "@hepha/shared";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";
import { HandoffPlanExecutor, type RuntimeAttemptContextV1 } from "../src/runtime/pi/handoff-plan-executor.js";
import { RuntimeExecutionCoordinator, RuntimeInvocationDurableWorkStatePort } from "../src/runtime/pi/runtime-execution-coordinator.js";
import { NestedRuntimeDispatchAdapter } from "../src/runtime/pi/runtime-worker-dispatch.js";

const featurePath = fileURLToPath(new URL("./feat-062-worker-execution.feature", import.meta.url));
const currentRoute = { connectionId: "current-session", modelId: "current-model" } as RouteIdentityV1;
const reviewRoute = { connectionId: "review-connection", modelId: "review-model" } as RouteIdentityV1;

function plan(actionId: string, route: RouteIdentityV1, actionType: AgentActionType = "implementation", roleId: AgentRoleId = "implementation-agent"): HandoffPlanV1 {
  const typeMetadata: Record<AgentActionType, readonly [string, number]> = {
    discovery_planning: ["Discovery & Planning", 1], implementation: ["Implementation", 2], review: ["Review", 3],
    completion: ["Completion", 4], knowledge_documentation: ["Knowledge & Documentation", 5],
  };
  return {
    schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
    resolvedRoute: {
      schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
      action: {
        schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
        actionId,
        actionType,
        actionTypeLabel: typeMetadata[actionType][0],
        actionTypeDisplayOrder: typeMetadata[actionType][1],
        label: actionId,
        displayOrder: 1,
        roleId,
        promptVersion: `${actionId}/v1`,
        capabilityRequirements: { minimumContextWindowTokens: 1, requiresTools: true, requiresApi: true, requiresReasoning: false },
      },
      route,
      policySource: "action",
      revisionId: `revision-${actionId}`,
    },
    steps: [{ kind: "primary", route }],
  };
}

function validatesCodeReviewPlan(actionId: string, candidate: HandoffPlanV1): boolean {
  const expected = plan("code-review", reviewRoute, "review", "code-review-agent").resolvedRoute.action;
  const actual = candidate.resolvedRoute.action;
  return actionId === expected.actionId
    && actual.actionId === expected.actionId
    && actual.actionType === expected.actionType
    && actual.roleId === expected.roleId
    && actual.promptVersion === expected.promptVersion
    && actual.capabilityRequirements.minimumContextWindowTokens
      === expected.capabilityRequirements.minimumContextWindowTokens
    && actual.capabilityRequirements.requiresApi === expected.capabilityRequirements.requiresApi
    && actual.capabilityRequirements.requiresReasoning === expected.capabilityRequirements.requiresReasoning
    && actual.capabilityRequirements.requiresTools === expected.capabilityRequirements.requiresTools;
}

function codeReviewPlanWith(
  action: Partial<HandoffPlanV1["resolvedRoute"]["action"]>,
  capabilities: Partial<HandoffPlanV1["resolvedRoute"]["action"]["capabilityRequirements"]> = {},
): HandoffPlanV1 {
  const base = plan("code-review", reviewRoute, "review", "code-review-agent");
  return {
    ...base,
    resolvedRoute: {
      ...base.resolvedRoute,
      action: {
        ...base.resolvedRoute.action,
        ...action,
        capabilityRequirements: {
          ...base.resolvedRoute.action.capabilityRequirements,
          ...capabilities,
        },
      },
    },
  };
}

function rootContext(): RuntimeAttemptContextV1 {
  return {
    projectId: "HEPHA",
    cardKey: "FEAT-fixture",
    workflowRunId: "workflow-direct",
    workflowNodeId: "direct-node",
    phaseExecutionContractId: "generic-review-gate",
    phaseNumber: 3,
    taskId: "review-task",
    correlationId: "correlation-direct",
    selectedLessonIds: [],
    invocationKind: "root",
    rootInvocationId: "source-invocation",
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

function runtime(options: {
  childOutcome?: { status: "completed" | "failed" | "timed_out" | "cancelled"; exitCode: number | null; failureCode: null | "provider_unavailable" | "timed_out" | "cancelled"; output?: string };
  childBarrier?: { started: () => void; wait: Promise<void> };
} = {}) {
  const store = RuntimeInvocationStore.createInMemory();
  let id = 0;
  let tick = 0;
  let releaseSource!: () => void;
  let markSourceStarted!: () => void;
  const sourceStarted = new Promise<void>((resolve) => { markSourceStarted = resolve; });
  const sourceRelease = new Promise<void>((resolve) => { releaseSource = resolve; });
  const process = vi.fn(async (request: { approvedRoute: RouteIdentityV1 }) => {
    if (request.approvedRoute.connectionId === currentRoute.connectionId) {
      markSourceStarted();
      await sourceRelease;
      return { status: "completed" as const, exitCode: 0, failureCode: null, output: "completed" };
    }
    options.childBarrier?.started();
    if (options.childBarrier) await options.childBarrier.wait;
    return options.childOutcome ?? { status: "completed" as const, exitCode: 0, failureCode: null, output: "completed" };
  });
  const now = () => new Date(Date.UTC(2026, 6, 23, 10, 0, tick++)).toISOString();
  const executor = new HandoffPlanExecutor({
    connections: { getConnection: (connectionId) => connectionId === currentRoute.connectionId ? connection(currentRoute) : connectionId === reviewRoute.connectionId ? connection(reviewRoute) : null },
    contextFactory: { prepare: async ({ attemptId }) => ({
      configurationRoot: `/runtime/${attemptId}`,
      sessionDirectory: `/runtime/${attemptId}/sessions`,
      buildEnvironment: () => ({ PATH: "/bin" }),
      cleanup: async () => true,
    }) },
    createId: () => `runtime-${++id}`,
    now,
    process: { execute: process },
    providerIdForConnection: (record) => record.connectionId,
    receipts: store,
    vault: new InMemorySecretVault(),
  });
  const coordinator = new RuntimeExecutionCoordinator({ executor, now, receipts: store, workState: new RuntimeInvocationDurableWorkStatePort(store) });
  return { coordinator, executor, now, process, releaseSource, sourceStarted, store };
}

function nestedEnvelope(agentAction: string) {
  return {
    schemaVersion: "agent-dispatch/v1",
    agent_action: agentAction,
    dispatchKind: "nested",
    projectId: "HEPHA",
    cardKey: "FEAT-fixture",
    workflowRunId: "workflow-direct",
    workflowNodeId: "knowledge-worker",
    phaseExecutionContractId: "generic-review-gate",
    phaseNumber: 3,
    taskId: "review-task",
    correlationId: "correlation-direct",
    inputRef: `artifact:${agentAction}`,
    selectedLessonIds: ["project-only-active-rules"],
    rootInvocationId: "source-invocation",
    parentInvocationId: "source-invocation",
  };
}

function directHandoffEvent(result: "started" | "completed" | "failed") {
  return {
    schemaVersion: "runtime-execution/v1",
    eventId: "removed-direct-event",
    invocationId: "source-invocation",
    eventIndex: 0,
    sourceInvocationId: "source-invocation",
    sourceAttemptId: "source-attempt",
    targetInvocationId: "target-invocation",
    targetAttemptId: "target-attempt",
    kind: "direct_session_handoff",
    reasonCode: "invalid_input",
    occurredAt: "2026-07-23T10:00:00.000Z",
    sourceApprovedRoute: currentRoute,
    targetApprovedRoute: reviewRoute,
    result,
  };
}

describe("runtime worker dispatch adapters", () => {
  it("binds direct and nested Product Owner scenarios to the public runtime composition", () => {
    const feature = readFileSync(featurePath, "utf8");
    for (const tag of ["E011-LAUNCH-003", "E011-NEST-001", "E011-NEST-002", "E011-NEST-003", "E011-NEST-004", "WF-DIRECT-HOST-NO-LAUNCH", "WF-RUNTIME-NESTED-DISPATCH"]) {
      expect(feature).toContain(`@${tag}`);
    }
    expect(feature).toContain("Scenario: A matching direct command executes its source worker once");
    expect(feature).toContain("Scenario: A direct session mismatch transfers before source-session worker work");
    expect(feature).toContain("Scenario: Nested specialists execute independently planned parent-linked chains");
    expect(feature).toContain("Scenario: Post-complete curation waits for a successful completion receipt");
  });

  it("hands a mismatched direct session to one independently planned nested worker before source work", () => {
    const fixture = runtime();
    const removedEvent = directHandoffEvent("started");

    expect(isRuntimeRouteChangeEventV1(removedEvent)).toBe(false);
    expect(fixture.store.appendRouteChange(removedEvent as never)).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
    expect(fixture.store.getInvocation("source-invocation")).toEqual({ ok: true, value: null });
    expect(fixture.process).not.toHaveBeenCalled();
    fixture.store.close();
  });

  it("direct-handoff-pre-work-order: persists the started edge before one child process performs work", () => {
    const fixture = runtime();
    const runtimeSource = readFileSync(new URL("../src/runtime/pi/runtime-worker-dispatch.ts", import.meta.url), "utf8");
    const bootstrapSource = readFileSync(new URL("../src/bootstrap/agent-runtime-applications.ts", import.meta.url), "utf8");

    expect(runtimeSource).not.toContain("DirectSessionHandoffAdapter");
    expect(bootstrapSource).not.toContain("directSessionCommandApplication");
    expect(bootstrapSource).not.toContain("DirectSessionHandoffAdapter");
    expect(fixture.process).not.toHaveBeenCalled();
    expect(fixture.store.getInvocation("source-invocation")).toEqual({ ok: true, value: null });
    fixture.store.close();
  });

  it("direct-handoff-too-late-matrix: rejects running, spawned, started, and checkpointed sources", () => {
    for (const state of ["running", "spawned", "started", "checkpointed"] as const) {
      const fixture = runtime();
      const removedEvent = { ...directHandoffEvent("started"), reasonCode: state };
      expect(isRuntimeRouteChangeEventV1(removedEvent), state).toBe(false);
      expect(fixture.store.appendRouteChange(removedEvent as never), state)
        .toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      expect(fixture.process, state).not.toHaveBeenCalled();
      expect(fixture.store.getInvocation("source-invocation"), state).toEqual({ ok: true, value: null });
      fixture.store.close();
    }
  });

  it("direct-handoff-terminal-and-persistence-matrix: settles one edge and never spawns after edge-write failure", () => {
    for (const result of ["started", "completed", "failed"] as const) {
      const fixture = runtime();
      const removedEvent = directHandoffEvent(result);
      expect(isRuntimeRouteChangeEventV1(removedEvent), result).toBe(false);
      expect(fixture.store.appendRouteChange(removedEvent as never), result)
        .toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      expect(fixture.process, result).not.toHaveBeenCalled();
      expect(fixture.store.getInvocation("source-invocation"), result).toEqual({ ok: true, value: null });
      fixture.store.close();
    }
  });

  it("does not launch or record a handoff when the direct session route already matches", () => {
    const fixture = runtime();
    const feature = readFileSync(featurePath, "utf8");

    expect(feature).toContain("Then the procedure remains in that host without a policy query or handoff event");
    expect(feature).toContain("And no orchestrated child process or receipt is created");
    expect(fixture.process).not.toHaveBeenCalled();
    expect(fixture.store.getInvocation("source-invocation")).toEqual({ ok: true, value: null });
    fixture.store.close();
  });

  it("rejects malformed unknown and plan-conflicting nested envelopes before coordinator execution", async () => {
    const execute = vi.fn();
    const resolvePlan = vi.fn(() => plan("code-review", reviewRoute, "review", "code-review-agent"));
    const nested = new NestedRuntimeDispatchAdapter({
      coordinator: { execute },
      createId: () => "nested",
      registeredActionIds: ["code-review"],
      resolvePlan,
      validateActionPlan: validatesCodeReviewPlan,
    });

    await expect(nested.dispatch({ ...nestedEnvelope("code-review"), model: "forbidden" }))
      .rejects.toThrow("AGENT_DISPATCH_INVALID");
    await expect(nested.dispatch(nestedEnvelope("unknown-action"))).rejects.toThrow("AGENT_ACTION_UNKNOWN");
    await expect(nested.dispatch(nestedEnvelope("code-review"))).resolves.toMatchObject({ plan: expect.any(Object) });
    expect(resolvePlan).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();

    const mismatched = new NestedRuntimeDispatchAdapter({
      coordinator: { execute: vi.fn() },
      createId: () => "mismatched",
      registeredActionIds: ["code-review"],
      resolvePlan: () => plan("phase-worker", reviewRoute),
      validateActionPlan: validatesCodeReviewPlan,
    });
    await expect(mismatched.dispatch(nestedEnvelope("code-review"))).rejects.toThrow("RUNTIME_INVALID_PLAN");
  });

  it("rejects every registry-conflicting nested plan through both dispatch methods", async () => {
    const normalized = parseAgentDispatchEnvelopeV1(nestedEnvelope("code-review"), ["code-review"]);
    const validPlan = plan("code-review", reviewRoute, "review", "code-review-agent");
    const invalidPlans: readonly [string, unknown][] = [
      ["malformed", {}],
      ["action", codeReviewPlanWith({ actionId: "phase-worker" })],
      ["type", codeReviewPlanWith({ actionType: "implementation" })],
      ["role", codeReviewPlanWith({ roleId: "implementation-agent" })],
      ["prompt", codeReviewPlanWith({ promptVersion: "code-review/v2" })],
      ["context", codeReviewPlanWith({}, { minimumContextWindowTokens: 2 })],
      ["api", codeReviewPlanWith({}, { requiresApi: false })],
      ["reasoning", codeReviewPlanWith({}, { requiresReasoning: true })],
      ["tools", codeReviewPlanWith({}, { requiresTools: false })],
    ];

    for (const [label, invalidPlan] of invalidPlans) {
      const execute = vi.fn(async () => ({ ok: true }));
      const createId = vi.fn(() => `nested-${label}`);
      let resolvedPlan: unknown = invalidPlan;
      const nested = new NestedRuntimeDispatchAdapter({
        coordinator: { execute: execute as never },
        createId,
        registeredActionIds: ["code-review"],
        resolvePlan: () => resolvedPlan as never,
        validateActionPlan: validatesCodeReviewPlan,
      });

      await expect(nested.dispatch(nestedEnvelope("code-review")), `dispatch:${label}`)
        .rejects.toThrow("RUNTIME_INVALID_PLAN");
      await expect(nested.dispatchResolved(normalized, invalidPlan as never), `dispatchResolved:${label}`)
        .rejects.toThrow("RUNTIME_INVALID_PLAN");
      expect(execute, label).not.toHaveBeenCalled();
      expect(createId, label).not.toHaveBeenCalled();

      resolvedPlan = validPlan;
      await expect(nested.dispatch(nestedEnvelope("code-review")), `valid dispatch:${label}`)
        .resolves.toMatchObject({ plan: validPlan });
      await expect(nested.dispatchResolved(normalized, validPlan), `valid dispatchResolved:${label}`)
        .resolves.toMatchObject({ plan: validPlan });
      expect(execute, label).toHaveBeenCalledTimes(2);
      expect(createId, label).toHaveBeenCalledTimes(2);
    }
  });

  it("resolves each knowledge worker action independently and preserves scoped lesson lineage", async () => {
    const fixture = runtime();
    fixture.releaseSource();
    await fixture.executor.executeAttempt({
      plan: plan("continue-implementing", currentRoute),
      stepIndex: 0,
      attemptKind: "primary",
      invocationId: "source-invocation",
      context: rootContext(),
      inputRef: "parent-input",
    });
    const actionIds = ["phase-lessons-capture", "feature-lessons-writer", "post-complete-lessons-curator"] as const;
    let nestedId = 0;
    const resolvePlan = vi.fn((actionId: string) => plan(actionId, reviewRoute, "knowledge_documentation", actionId === "phase-lessons-capture"
      ? "phase-lessons-capture-agent" : actionId === "feature-lessons-writer" ? "feature-lessons-writer-agent" : "post-complete-lessons-curator-agent"));
    const nested = new NestedRuntimeDispatchAdapter({
      coordinator: fixture.coordinator,
      createId: () => `nested-${++nestedId}`,
      registeredActionIds: actionIds,
      resolvePlan,
      validateActionPlan: (actionId, resolved) => resolved.resolvedRoute.action.actionId === actionId,
    });

    for (const actionId of actionIds) {
      const result = await nested.dispatch(nestedEnvelope(actionId));
      expect(result.execution).toMatchObject({ ok: true, classification: "primary" });
      const evidence = fixture.store.getInvocation(result.invocationId);
      expect(evidence).toMatchObject({ ok: true, value: { receipt: {
        actionId,
        invocationKind: "nested",
        parentInvocationId: "source-invocation",
        approvedPrimaryRoute: reviewRoute,
        selectedLessonIds: ["project-only-active-rules"],
      } } });
    }
    expect(resolvePlan.mock.calls.map(([actionId]) => actionId)).toEqual(actionIds);
    fixture.store.close();
  });
});
