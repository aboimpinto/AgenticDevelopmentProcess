import { createHash } from "node:crypto";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  canonicalizeHandoffPlanV1,
  type HandoffPlanV1,
  type RouteIdentityV1,
  type RuntimeAttemptV1,
  type RuntimeInvocationReceiptV1,
  type RuntimeRouteChangeEventV1,
} from "@hepha/shared";

export const primaryRoute: RouteIdentityV1 = { connectionId: "connection-primary", modelId: "model-primary" } as RouteIdentityV1;
export const secondRoute: RouteIdentityV1 = { connectionId: "connection-second", modelId: "model-second" } as RouteIdentityV1;

export function runtimePlan(withSecond = false): HandoffPlanV1 {
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
      route: primaryRoute,
      policySource: "action",
      revisionId: "revision-1",
    },
    steps: withSecond
      ? [{ kind: "primary", route: primaryRoute }, { kind: "recovery", route: secondRoute }]
      : [{ kind: "primary", route: primaryRoute }],
  };
}

export function planHash(plan: HandoffPlanV1): string {
  const canonical = canonicalizeHandoffPlanV1(plan);
  if (canonical === null) throw new Error("Invalid fixture plan.");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function runningReceipt(overrides: Partial<RuntimeInvocationReceiptV1> = {}, withSecond = false): RuntimeInvocationReceiptV1 {
  const plan = runtimePlan(withSecond);
  return {
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    invocationId: "invocation-root",
    rootInvocationId: "invocation-root",
    parentInvocationId: null,
    invocationKind: "root",
    planHash: planHash(plan),
    actionId: plan.resolvedRoute.action.actionId,
    actionType: plan.resolvedRoute.action.actionType,
    roleId: plan.resolvedRoute.action.roleId,
    promptVersion: plan.resolvedRoute.action.promptVersion,
    policySource: plan.resolvedRoute.policySource,
    revisionId: plan.resolvedRoute.revisionId,
    approvedPrimaryRoute: primaryRoute,
    approvedSecondRoute: withSecond ? secondRoute : null,
    projectId: "project-a",
    cardKey: "FEAT-example",
    workflowRunId: "workflow-a",
    workflowNodeId: "node-a",
    phaseExecutionContractId: "implementation-contract",
    phaseNumber: 3,
    taskId: "task-a",
    correlationId: "correlation-a",
    selectedLessonIds: ["lesson-a", "lesson-b"],
    attemptIds: ["attempt-primary"],
    routeChangeEventIds: [],
    status: "running",
    openedAt: "2026-07-23T10:00:00.000Z",
    settledAt: null,
    durationMs: null,
    failureCode: null,
    ...overrides,
  };
}

export function preparingAttempt(overrides: Partial<RuntimeAttemptV1> = {}): RuntimeAttemptV1 {
  return {
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    attemptId: "attempt-primary",
    invocationId: "invocation-root",
    attemptIndex: 0,
    attemptKind: "primary",
    approvedRoute: primaryRoute,
    actualRoute: null,
    providerId: "openai",
    authenticationConnectionId: "connection-primary",
    authenticationKind: "pi_session",
    credentialVersion: null,
    workState: "none",
    checkpointId: null,
    checkpointCursor: null,
    status: "preparing",
    preparationStartedAt: "2026-07-23T10:00:00.000Z",
    startedAt: null,
    spawnedAt: null,
    terminalAt: null,
    durationMs: null,
    exitCode: null,
    timeoutMarker: false,
    failureCode: null,
    ...overrides,
  };
}

export function fallbackAttempt(): RuntimeAttemptV1 {
  return preparingAttempt({
    attemptId: "attempt-second",
    attemptIndex: 1,
    attemptKind: "fallback",
    approvedRoute: secondRoute,
    providerId: "openai",
    authenticationConnectionId: "connection-second",
    preparationStartedAt: "2026-07-23T10:01:01.000Z",
  });
}

export function fallbackEvent(): RuntimeRouteChangeEventV1 {
  return {
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    eventId: "event-fallback",
    invocationId: "invocation-root",
    eventIndex: 0,
    sourceInvocationId: "invocation-root",
    sourceAttemptId: "attempt-primary",
    targetInvocationId: "invocation-root",
    targetAttemptId: "attempt-second",
    kind: "fallback",
    reasonCode: "rate_limited",
    occurredAt: "2026-07-23T10:01:01.000Z",
    sourceApprovedRoute: primaryRoute,
    targetApprovedRoute: secondRoute,
    result: "started",
  };
}
