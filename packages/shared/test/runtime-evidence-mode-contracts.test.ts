import { describe, expect, it } from "vitest";
import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  isRuntimeEvidenceRecordV1,
  isRuntimeExecutionEvidenceViewV1,
  isRuntimePhaseExecutionEvidencePageV1,
  type RuntimeEvidenceGuardContextV1,
  type RuntimeInvocationEvidenceV1,
} from "../src/index.js";

const route = { connectionId: "connection-primary", modelId: "model-primary" } as const;
const legacyOrchestrated: RuntimeInvocationEvidenceV1 = {
  schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
  receipt: {
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    invocationId: "invocation-1",
    rootInvocationId: "invocation-1",
    parentInvocationId: null,
    invocationKind: "root",
    planHash: "a".repeat(64),
    actionId: "start-feature",
    actionType: "implementation",
    roleId: "implementation-agent",
    promptVersion: "start-feature/v1",
    policySource: "action",
    revisionId: "revision-1",
    approvedPrimaryRoute: route,
    approvedSecondRoute: null,
    projectId: "HEPHA",
    cardKey: "feature:FEAT-071",
    workflowRunId: "workflow-1",
    workflowNodeId: "post-process",
    phaseExecutionContractId: null,
    phaseNumber: null,
    taskId: null,
    correlationId: "correlation-1",
    selectedLessonIds: [],
    attemptIds: ["attempt-1"],
    routeChangeEventIds: [],
    status: "running",
    openedAt: "2026-07-26T01:00:00.000Z",
    settledAt: null,
    durationMs: null,
    failureCode: null,
  },
  attempts: [{
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    attemptId: "attempt-1",
    invocationId: "invocation-1",
    attemptIndex: 0,
    attemptKind: "primary",
    approvedRoute: route,
    actualRoute: null,
    providerId: null,
    authenticationConnectionId: null,
    authenticationKind: null,
    credentialVersion: null,
    workState: "none",
    checkpointId: null,
    checkpointCursor: null,
    status: "preparing",
    preparationStartedAt: "2026-07-26T01:00:00.000Z",
    startedAt: null,
    spawnedAt: null,
    terminalAt: null,
    durationMs: null,
    exitCode: null,
    timeoutMarker: false,
    failureCode: null,
  }],
  routeChangeEvents: [],
};
const direct = {
  schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
  mode: "direct_host",
  evidenceId: "direct-1",
  projectId: "HEPHA",
  cardKey: "feature:FEAT-071",
  phaseExecutionContractId: "foundation-contract",
  phaseNumber: 2,
  taskId: "task-1",
  procedureId: "start-feature",
  actionId: "start-feature",
  hostKind: "pi",
  hostIdentity: null,
  startedAt: "2026-07-26T01:00:00.000Z",
  settledAt: "2026-07-26T01:01:00.000Z",
  durationMs: 60_000,
  outcome: "completed",
  failureCode: null,
  stateSync: { status: "not_requested" },
  modelEvidence: { status: "not_recorded" },
} as const;
const supersededDirectHandoffEvent = {
  schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
  eventId: "event-direct-handoff",
  invocationId: "invocation-1",
  eventIndex: 0,
  sourceInvocationId: "invocation-1",
  sourceAttemptId: "attempt-1",
  targetInvocationId: "invocation-transfer",
  targetAttemptId: "attempt-transfer",
  kind: "direct_session_handoff",
  reasonCode: "invalid_input",
  occurredAt: "2026-07-26T01:00:01.000Z",
  sourceApprovedRoute: route,
  targetApprovedRoute: { connectionId: "connection-transfer", modelId: "model-transfer" },
  result: "started",
} as const;
const context: RuntimeEvidenceGuardContextV1 = {
  isRegisteredAction: (actionId) => actionId === "start-feature",
  isTrustedDirectInstrumentation: ({ hostKind, instrumentationSource }) =>
    hostKind === "pi" && instrumentationSource === "trusted-pi-fixture/v1",
};
const orchestratedView = {
  mode: "orchestrated",
  invocationId: "invocation-1",
  rootInvocationId: "invocation-1",
  parentInvocationId: null,
  invocationKind: "root",
  approvedPlan: {
    planHash: "a".repeat(64),
    actionId: "start-feature",
    actionType: "implementation",
    roleId: "implementation-agent",
    promptVersion: "start-feature/v1",
    policySource: "action",
    revisionId: "revision-1",
    primaryRoute: route,
    secondRoute: null,
    selectedLessonIds: [],
  },
  phaseExecutionContractId: "foundation-contract",
  phaseNumber: 2,
  status: "running",
  openedAt: "2026-07-26T01:00:00.000Z",
  settledAt: null,
  durationMs: null,
  failureCode: null,
  attempts: [{
    attemptId: "attempt-1",
    attemptIndex: 0,
    attemptKind: "primary",
    approvedRoute: route,
    actualRoute: null,
    providerId: null,
    authenticationConnectionId: null,
    authenticationKind: null,
    credentialVersion: null,
    workState: "none",
    checkpointId: null,
    status: "preparing",
    preparationStartedAt: "2026-07-26T01:00:00.000Z",
    startedAt: null,
    spawnedAt: null,
    terminalAt: null,
    durationMs: null,
    exitCode: null,
    timeoutMarker: false,
    failureCode: null,
  }],
  routeChangeEvents: [],
} as const;

describe("runtime execution-mode evidence public guard", () => {
  it("accepts complete orchestrated and route-free direct controls", () => {
    expect(isRuntimeEvidenceRecordV1({ ...legacyOrchestrated, mode: "orchestrated" }, context)).toBe(true);
    expect(isRuntimeEvidenceRecordV1(direct, context)).toBe(true);
  });

  it("guards both view discriminators and their ordered mixed-mode phase page", () => {
    expect(isRuntimeExecutionEvidenceViewV1(orchestratedView, context)).toBe(true);
    expect(isRuntimeExecutionEvidenceViewV1(direct, context)).toBe(true);
    expect(isRuntimePhaseExecutionEvidencePageV1({
      schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
      projectId: "HEPHA",
      cardKey: "feature:FEAT-071",
      phaseExecutionContractId: "foundation-contract",
      executions: [direct, orchestratedView],
      nextCursor: null,
    }, context)).toBe(true);
    expect(isRuntimeExecutionEvidenceViewV1({ ...orchestratedView, modelEvidence: { status: "not_recorded" } }, context)).toBe(false);
  });

  it("accepts every direct host, outcome, and closed state-sync discriminator", () => {
    for (const hostKind of ["pi", "codex", "claude_code", "unknown"] as const) {
      expect(isRuntimeEvidenceRecordV1({ ...direct, hostKind }, context)).toBe(true);
    }
    expect(isRuntimeEvidenceRecordV1({
      ...direct,
      settledAt: null,
      durationMs: null,
      outcome: "running",
    }, context)).toBe(true);
    expect(isRuntimeEvidenceRecordV1({ ...direct, outcome: "failed", failureCode: "invalid_output" }, context)).toBe(true);
    expect(isRuntimeEvidenceRecordV1({ ...direct, outcome: "timed_out", failureCode: "timed_out" }, context)).toBe(true);
    expect(isRuntimeEvidenceRecordV1({ ...direct, outcome: "cancelled", failureCode: "cancelled" }, context)).toBe(true);
    expect(isRuntimeEvidenceRecordV1({
      ...direct,
      stateSync: { status: "completed", operationId: "sync-1" },
    }, context)).toBe(true);
    expect(isRuntimeEvidenceRecordV1({
      ...direct,
      stateSync: { status: "failed", code: "persistence_failed" },
    }, context)).toBe(true);
  });

  it("accepts trusted direct model telemetry only with provenance inside the run interval", () => {
    const recorded = {
      ...direct,
      modelEvidence: {
        status: "recorded",
        modelId: "session-model",
        providerId: "session-provider",
        instrumentationSource: "trusted-pi-fixture/v1",
        observedAt: "2026-07-26T01:00:30.000Z",
      },
    } as const;
    expect(isRuntimeEvidenceRecordV1(recorded, context)).toBe(true);
    expect(isRuntimeEvidenceRecordV1({
      ...recorded,
      modelEvidence: { ...recorded.modelEvidence, instrumentationSource: "untrusted-source" },
    }, context)).toBe(false);
    expect(isRuntimeEvidenceRecordV1({
      ...recorded,
      modelEvidence: { ...recorded.modelEvidence, observedAt: "2026-07-26T01:02:00.000Z" },
    }, context)).toBe(false);
  });

  it("rejects credential-shaped content from every direct textual leaf", () => {
    const assignment = "token=synthetic-value";
    const mutations = [
      { ...direct, evidenceId: assignment },
      { ...direct, projectId: assignment },
      { ...direct, cardKey: assignment },
      { ...direct, phaseExecutionContractId: assignment },
      { ...direct, taskId: assignment },
      { ...direct, procedureId: assignment },
      { ...direct, actionId: "secret=value" },
      { ...direct, hostIdentity: assignment },
      { ...direct, stateSync: { status: "completed", operationId: assignment } },
      { ...direct, modelEvidence: { status: "recorded", modelId: assignment, providerId: null, instrumentationSource: "trusted-pi-fixture/v1", observedAt: "2026-07-26T01:00:30.000Z" } },
      { ...direct, modelEvidence: { status: "recorded", modelId: "model", providerId: "Bearer synthetic-token", instrumentationSource: "trusted-pi-fixture/v1", observedAt: "2026-07-26T01:00:30.000Z" } },
      { ...direct, modelEvidence: { status: "recorded", modelId: "model", providerId: null, instrumentationSource: "-----BEGIN PRIVATE KEY-----", observedAt: "2026-07-26T01:00:30.000Z" } },
      { ...direct, modelEvidence: { status: "recorded", modelId: "sk-synthetic123456", providerId: null, instrumentationSource: "trusted-pi-fixture/v1", observedAt: "2026-07-26T01:00:30.000Z" } },
      { ...direct, hostIdentity: "malformed-\ud800" },
    ];
    for (const candidate of mutations) expect(isRuntimeEvidenceRecordV1(candidate, context)).toBe(false);
    expect(isRuntimeEvidenceRecordV1({ ...direct, hostIdentity: "Pi host \u007f" }, context)).toBe(false);
    expect(isRuntimeEvidenceRecordV1({ ...direct, hostIdentity: "host-😀" }, context)).toBe(true);
  });

  it.each([
    ["absent record", undefined],
    ["null record", null],
    ["primitive record", "direct_host"],
    ["missing mode", (({ mode: _mode, ...rest }) => rest)(direct)],
    ["unknown mode", { ...direct, mode: "legacy" }],
    ["extra direct route", { ...direct, approvedPrimaryRoute: route }],
    ["extra direct policy", { ...direct, revisionId: "revision-1" }],
    ["extra direct authentication", { ...direct, authenticationConnectionId: "connection-primary" }],
    ["orchestrated direct field", { ...legacyOrchestrated, mode: "orchestrated", hostKind: "pi" }],
    ["superseded direct handoff event", {
      ...legacyOrchestrated,
      mode: "orchestrated",
      receipt: { ...legacyOrchestrated.receipt, routeChangeEventIds: ["event-direct-handoff"] },
      routeChangeEvents: [supersededDirectHandoffEvent],
    }],
    ["unregistered direct action", { ...direct, actionId: "unknown-action" }],
    ["neither procedure nor action", { ...direct, procedureId: null, actionId: null }],
    ["split phase identity", { ...direct, phaseExecutionContractId: null }],
    ["task without phase", { ...direct, phaseExecutionContractId: null, phaseNumber: null }],
    ["duration mismatch", { ...direct, durationMs: 1 }],
    ["completed with failure", { ...direct, failureCode: "invalid_output" }],
    ["failed with timeout code", { ...direct, outcome: "failed", failureCode: "timed_out" }],
    ["running with settlement", { ...direct, outcome: "running" }],
    ["failed state sync raw error", { ...direct, stateSync: { status: "failed", code: "persistence_failed", rawError: "secret" } }],
    ["model claim without provenance", { ...direct, modelEvidence: { status: "recorded", modelId: "model" } }],
  ])("rejects %s without throwing or coercing mode", (_name, candidate) => {
    expect(() => isRuntimeEvidenceRecordV1(candidate, context)).not.toThrow();
    expect(isRuntimeEvidenceRecordV1(candidate, context)).toBe(false);
  });
});
