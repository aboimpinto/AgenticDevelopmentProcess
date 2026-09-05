import { describe, expect, it } from "vitest";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  canonicalizeHandoffPlanV1,
  classifyRuntimeEvidenceSource,
  isRuntimeAttemptV1,
  isRuntimeInvocationEvidenceV1,
  isRuntimeInvocationOpenV1,
  isRuntimeInvocationReceiptV1,
  isRuntimeRouteChangeEventV1,
  type HandoffPlanV1,
  type RuntimeAttemptV1,
  type RuntimeInvocationReceiptV1,
} from "../src/index.js";

const route = { connectionId: "connection-primary", modelId: "model-primary" } as const;
const plan: HandoffPlanV1 = {
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
    revisionId: "revision-1",
  },
  steps: [{ kind: "primary", route }],
};
const receipt: RuntimeInvocationReceiptV1 = {
  schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
  invocationId: "invocation-1",
  rootInvocationId: "invocation-1",
  parentInvocationId: null,
  invocationKind: "root",
  planHash: "a".repeat(64),
  actionId: "continue-implementing",
  actionType: "implementation",
  roleId: "implementation-agent",
  promptVersion: "implementation/v1",
  policySource: "action",
  revisionId: "revision-1",
  approvedPrimaryRoute: route,
  approvedSecondRoute: null,
  projectId: "project-a",
  cardKey: "FEAT-example",
  workflowRunId: "workflow-1",
  workflowNodeId: "node-1",
  phaseExecutionContractId: "implementation-contract",
  phaseNumber: 3,
  taskId: "task-1",
  correlationId: "correlation-1",
  selectedLessonIds: ["lesson-a", "lesson-b"],
  attemptIds: ["attempt-1"],
  routeChangeEventIds: [],
  status: "running",
  openedAt: "2026-07-23T10:00:00.000Z",
  settledAt: null,
  durationMs: null,
  failureCode: null,
};
const attempt: RuntimeAttemptV1 = {
  schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
  attemptId: "attempt-1",
  invocationId: "invocation-1",
  attemptIndex: 0,
  attemptKind: "primary",
  approvedRoute: route,
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
};

describe("runtime execution V1 guards", () => {
  it("accepts a complete safe chain, attempt, and evidence projection", () => {
    expect(isRuntimeInvocationReceiptV1(receipt)).toBe(true);
    expect(isRuntimeInvocationReceiptV1({ ...receipt, phaseNumber: 0 })).toBe(true);
    expect(isRuntimeAttemptV1(attempt)).toBe(true);
    expect(isRuntimeInvocationEvidenceV1({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, receipt, attempts: [attempt], routeChangeEvents: [] })).toBe(true);
  });

  it.each([
    ["primitive receipt", null],
    ["unknown secret field", { ...receipt, apiKey: "distinctive-secret" }],
    ["unsorted lessons", { ...receipt, selectedLessonIds: ["lesson-b", "lesson-a"] }],
    ["malformed route", { ...receipt, approvedPrimaryRoute: { connectionId: "", modelId: "model" } }],
    ["phase identity split", { ...receipt, phaseExecutionContractId: null }],
    ["negative phase index", { ...receipt, phaseNumber: -1 }],
    ["noncanonical time", { ...receipt, openedAt: "2026-07-23 10:00" }],
  ])("rejects %s without throwing", (_name, candidate) => {
    expect(() => isRuntimeInvocationReceiptV1(candidate)).not.toThrow();
    expect(isRuntimeInvocationReceiptV1(candidate)).toBe(false);
  });

  it("rejects malformed attempt members and forbidden payload fields", () => {
    expect(isRuntimeAttemptV1({ ...attempt, environment: { API_KEY: "secret" } })).toBe(false);
    expect(isRuntimeAttemptV1({ ...attempt, workState: "checkpointed", checkpointId: null, checkpointCursor: null })).toBe(false);
    expect(isRuntimeAttemptV1({ ...attempt, actualRoute: route })).toBe(false);
  });

  it("rejects malformed route-change members before relation use", () => {
    const event = {
      schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
      eventId: "event-1",
      invocationId: "invocation-1",
      eventIndex: 0,
      sourceInvocationId: "invocation-1",
      sourceAttemptId: "attempt-1",
      targetInvocationId: "invocation-1",
      targetAttemptId: "attempt-2",
      kind: "fallback",
      reasonCode: "rate_limited",
      occurredAt: "2026-07-23T10:01:00.000Z",
      sourceApprovedRoute: route,
      targetApprovedRoute: { connectionId: "connection-second", modelId: "model-second" },
      result: "started",
    };
    expect(isRuntimeRouteChangeEventV1(event)).toBe(true);
    expect(isRuntimeRouteChangeEventV1({ ...event, rawError: "provider secret" })).toBe(false);
    expect(isRuntimeRouteChangeEventV1({ ...event, targetApprovedRoute: route })).toBe(false);
  });

  it("binds an open receipt to all normalized plan facts", () => {
    const canonical = canonicalizeHandoffPlanV1(plan);
    expect(canonical).not.toBeNull();
    expect(isRuntimeInvocationOpenV1({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, plan, receipt })).toBe(true);
    expect(isRuntimeInvocationOpenV1({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, plan, receipt: { ...receipt, revisionId: "other" } })).toBe(false);
  });

  it("classifies absent legacy evidence without inventing runtime facts", () => {
    expect(classifyRuntimeEvidenceSource(true, true, true)).toBe("current");
    expect(classifyRuntimeEvidenceSource(false, false, false)).toBe("not_yet_run");
    expect(classifyRuntimeEvidenceSource(false, true, false)).toBe("not_recorded");
    expect(classifyRuntimeEvidenceSource(false, false, true)).toBe("not_recorded");
  });
});
