import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  type RouteIdentityV1,
  type RuntimeFeatureEvidenceV1,
  type RuntimePhaseExecutionEvidencePageV1,
} from "@hepha/shared";
import { createRuntimeEvidenceApi } from "./runtime-evidence-api.js";

const summary: RuntimeFeatureEvidenceV1 = {
  schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
  projectId: "project-a",
  cardKey: "feature:FEAT-A",
  phases: [],
};
const page: RuntimePhaseExecutionEvidencePageV1 = {
  schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
  projectId: "project-a",
  cardKey: "feature:FEAT-A",
  phaseExecutionContractId: "contract-a",
  executions: [],
  nextCursor: null,
};

afterEach(() => vi.unstubAllGlobals());
function respond(value: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok,
    headers: { get: () => "application/json" },
    json: async () => value,
  })));
}

describe("runtime evidence web API", () => {
  it("accepts complete closed summary and detail responses", async () => {
    respond(summary);
    const api = createRuntimeEvidenceApi();
    await expect(api.fetchFeature("project-a", "feature:FEAT-A")).resolves.toEqual(summary);
    respond(page);
    await expect(api.fetchPhase("project-a", "feature:FEAT-A", "contract-a", null)).resolves.toEqual(page);
  });

  it.each([
    { ...summary, secret: "must-not-render" },
    { ...summary, phases: null },
  ])("rejects a malformed summary before React receives it %#", async (value) => {
    respond(value);
    await expect(createRuntimeEvidenceApi().fetchFeature("project-a", "feature:FEAT-A")).rejects.toThrow("Runtime evidence response is invalid.");
  });

  it.each([
    { ...page, executions: null },
    { ...page, nextCursor: "raw sql cursor!" },
  ])("rejects a malformed detail page before React receives it %#", async (value) => {
    respond(value);
    await expect(createRuntimeEvidenceApi().fetchPhase("project-a", "feature:FEAT-A", "contract-a", null)).rejects.toThrow("Runtime evidence response is invalid.");
  });

  it("accepts route-free direct evidence and rejects cross-mode contamination before React", async () => {
    const direct = directPage();
    respond(direct);
    await expect(createRuntimeEvidenceApi().fetchPhase("project-a", "feature:FEAT-A", "contract-a", null)).resolves.toEqual(direct);
    respond({ ...direct, executions: [{ ...direct.executions[0], revisionId: "forbidden-policy" }] });
    await expect(createRuntimeEvidenceApi().fetchPhase("project-a", "feature:FEAT-A", "contract-a", null))
      .rejects.toThrow("Runtime evidence response is invalid.");
  });

  it("maps transport diagnostics to one fixed safe error", async () => {
    respond({ error: "raw provider error with token" }, false);
    await expect(createRuntimeEvidenceApi().fetchFeature("project-a", "feature:FEAT-A")).rejects.toThrow("Runtime evidence is unavailable.");
  });

  it.each(["fallback", "recovery", "direct_session_handoff"] as const)(
    "accepts a valid %s page and rejects its cross-field contradiction before React receives it",
    async (kind) => {
      const valid = eventPage(kind);
      respond(valid);
      const initial = createRuntimeEvidenceApi().fetchPhase("project-a", "feature:FEAT-A", "contract-a", null);
      if (kind === "direct_session_handoff") {
        await expect(initial).rejects.toThrow("Runtime evidence response is invalid.");
        return;
      }
      await expect(initial).resolves.toEqual(valid);
      const invalid = clone(valid);
      const execution = invalid.executions[0];
      if (execution?.mode !== "orchestrated") throw new Error("Expected orchestrated fixture.");
      execution.routeChangeEvents[0]!.sourceInvocationId = "foreign-invocation";
      respond(invalid);
      await expect(createRuntimeEvidenceApi().fetchPhase("project-a", "feature:FEAT-A", "contract-a", null))
        .rejects.toThrow("Runtime evidence response is invalid.");
    },
  );
});

function directPage(): RuntimePhaseExecutionEvidencePageV1 {
  return {
    ...page,
    executions: [{
      schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
      mode: "direct_host",
      evidenceId: "direct-a",
      projectId: "project-a",
      cardKey: "feature:FEAT-A",
      phaseExecutionContractId: "contract-a",
      phaseNumber: 1,
      taskId: "task-a",
      procedureId: "continue-implementation",
      actionId: "continue-implementing",
      hostKind: "codex",
      hostIdentity: null,
      startedAt: "2026-07-23T10:00:00.000Z",
      settledAt: "2026-07-23T10:00:01.000Z",
      durationMs: 1_000,
      outcome: "completed",
      failureCode: null,
      stateSync: { status: "completed", operationId: "sync-a" },
      modelEvidence: { status: "not_recorded" },
    }],
  };
}

const primaryRoute = { connectionId: "connection-a", modelId: "model-a" } as RouteIdentityV1;
const secondRoute = { connectionId: "connection-b", modelId: "model-b" } as RouteIdentityV1;
type DeepMutable<T> = T extends string | number | boolean | bigint | symbol | null | undefined ? T
  : T extends readonly (infer U)[] ? DeepMutable<U>[]
    : T extends object ? { -readonly [K in keyof T]: DeepMutable<T[K]> } : T;
function clone<T>(value: T): DeepMutable<T> { return structuredClone(value) as DeepMutable<T>; }
function eventPage(kind: "fallback" | "recovery" | "direct_session_handoff"): RuntimePhaseExecutionEvidencePageV1 {
  const direct = kind === "direct_session_handoff";
  const chain = {
    mode: "orchestrated" as const,
    invocationId: "invocation-a",
    rootInvocationId: "invocation-a",
    parentInvocationId: null,
    invocationKind: "root" as const,
    approvedPlan: {
      planHash: "a".repeat(64),
      actionId: "continue-implementing",
      actionType: "implementation" as const,
      roleId: "implementation-agent" as const,
      promptVersion: "implementation/v1",
      policySource: "action" as const,
      revisionId: "revision-a",
      primaryRoute,
      secondRoute: direct ? null : secondRoute,
      selectedLessonIds: [],
    },
    phaseExecutionContractId: "contract-a",
    phaseNumber: 1,
    status: direct ? "running" as const : "completed" as const,
    openedAt: "2026-07-23T10:00:00.000Z",
    settledAt: direct ? null : "2026-07-23T10:00:02.000Z",
    durationMs: direct ? null : 2_000,
    failureCode: null,
    attempts: [{
      attemptId: "attempt-a",
      attemptIndex: 0 as const,
      attemptKind: "primary" as const,
      approvedRoute: primaryRoute,
      actualRoute: direct ? null : primaryRoute,
      providerId: direct ? null : "provider-a",
      authenticationConnectionId: direct ? null : "connection-a",
      authenticationKind: direct ? null : "pi_session" as const,
      credentialVersion: null,
      workState: direct || kind === "fallback" ? "none" as const : "checkpointed" as const,
      checkpointId: kind === "recovery" ? "checkpoint-a" : null,
      status: direct ? "preparing" as const : "failed" as const,
      preparationStartedAt: "2026-07-23T10:00:00.000Z",
      startedAt: direct ? null : "2026-07-23T10:00:00.100Z",
      spawnedAt: direct ? null : "2026-07-23T10:00:00.200Z",
      terminalAt: direct ? null : "2026-07-23T10:00:01.000Z",
      durationMs: direct ? null : 1_000,
      exitCode: direct ? null : 1,
      timeoutMarker: false,
      failureCode: direct ? null : "payment_required" as const,
    }],
    routeChangeEvents: [{
      eventId: "event-a",
      sourceInvocationId: "invocation-a",
      sourceAttemptId: "attempt-a",
      targetInvocationId: direct ? "invocation-child" : "invocation-a",
      targetAttemptId: direct ? "attempt-child" : "attempt-b",
      kind,
      reasonCode: direct ? "invalid_input" as const : "payment_required" as const,
      occurredAt: direct ? "2026-07-23T10:00:00.000Z" : "2026-07-23T10:00:01.000Z",
      sourceApprovedRoute: primaryRoute,
      targetApprovedRoute: secondRoute,
      result: direct ? "started" as const : "completed" as const,
    }],
  };
  if (!direct) chain.attempts.push({
    ...chain.attempts[0]!,
    attemptId: "attempt-b",
    attemptIndex: 1,
    attemptKind: kind,
    approvedRoute: secondRoute,
    actualRoute: secondRoute,
    workState: "none",
    checkpointId: null,
    status: "completed",
    preparationStartedAt: "2026-07-23T10:00:01.000Z",
    startedAt: "2026-07-23T10:00:01.100Z",
    spawnedAt: "2026-07-23T10:00:01.200Z",
    terminalAt: "2026-07-23T10:00:02.000Z",
    durationMs: 1_000,
    exitCode: 0,
    failureCode: null,
  } as unknown as typeof chain.attempts[number]);
  return { ...page, executions: [chain] } as unknown as RuntimePhaseExecutionEvidencePageV1;
}
