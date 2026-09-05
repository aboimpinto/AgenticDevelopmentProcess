import { describe, expect, it } from "vitest";
import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  isRuntimeFeatureEvidenceV1,
  isRuntimePhaseExecutionEvidencePageV1,
  type RuntimeFeatureEvidenceV1,
  type RuntimePhaseExecutionEvidencePageV1,
} from "../src/index.js";

const route = { connectionId: "connection-a", modelId: "model-a" };
const summary: RuntimeFeatureEvidenceV1 = {
  schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
  projectId: "project-a",
  cardKey: "feature:FEAT-A",
  phases: [{
    phaseExecutionContractId: "contract-a",
    phaseNumber: 1,
    phaseTitle: "Delivery",
    state: "completed",
    invocationCount: 1,
    executionModes: ["orchestrated"],
    directModelEvidence: [],
    actualRoutes: [route],
    aggregateDurationMs: 1_000,
    finalOutcome: "completed",
    failureCode: null,
  }],
};
const page: RuntimePhaseExecutionEvidencePageV1 = {
  schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
  projectId: "project-a",
  cardKey: "feature:FEAT-A",
  phaseExecutionContractId: "contract-a",
  executions: [{
    mode: "orchestrated",
    invocationId: "invocation-a",
    rootInvocationId: "invocation-a",
    parentInvocationId: null,
    invocationKind: "root",
    approvedPlan: {
      planHash: "a".repeat(64),
      actionId: "continue-implementing",
      actionType: "implementation",
      roleId: "implementation-agent",
      promptVersion: "implementation/v1",
      policySource: "action",
      revisionId: "revision-a",
      primaryRoute: route,
      secondRoute: null,
      selectedLessonIds: [],
    },
    phaseExecutionContractId: "contract-a",
    phaseNumber: 1,
    status: "completed",
    openedAt: "2026-07-23T10:00:00.000Z",
    settledAt: "2026-07-23T10:00:01.000Z",
    durationMs: 1_000,
    failureCode: null,
    attempts: [{
      attemptId: "attempt-a",
      attemptIndex: 0,
      attemptKind: "primary",
      approvedRoute: route,
      actualRoute: route,
      providerId: "provider-a",
      authenticationConnectionId: "connection-a",
      authenticationKind: "pi_session",
      credentialVersion: null,
      workState: "none",
      checkpointId: null,
      status: "completed",
      preparationStartedAt: "2026-07-23T10:00:00.000Z",
      startedAt: "2026-07-23T10:00:00.100Z",
      spawnedAt: "2026-07-23T10:00:00.200Z",
      terminalAt: "2026-07-23T10:00:01.000Z",
      durationMs: 1_000,
      exitCode: 0,
      timeoutMarker: false,
      failureCode: null,
    }],
    routeChangeEvents: [],
  }],
  nextCursor: null,
};

describe("runtime evidence projection guards", () => {
  it("accepts closed summary/detail positive controls", () => {
    expect(isRuntimeFeatureEvidenceV1(summary)).toBe(true);
    expect(isRuntimeFeatureEvidenceV1({ ...summary, phases: [{ ...summary.phases[0]!, phaseNumber: 0 }] })).toBe(true);
    expect(isRuntimePhaseExecutionEvidencePageV1(page)).toBe(true);
    expect(isRuntimePhaseExecutionEvidencePageV1({ ...page, executions: [{ ...page.executions[0]!, phaseNumber: 0 }] })).toBe(true);
  });

  it.each([
    null,
    { ...summary, secret: "must-not-pass" },
    { ...summary, phases: null },
    { ...summary, phases: [{ ...summary.phases[0], actualRoutes: [{ ...route, token: "x" }] }] },
    { ...summary, phases: [{ ...summary.phases[0], state: "not_recorded", invocationCount: 1 }] },
  ])("rejects malformed summary outer/nested values %#", (candidate) => {
    expect(() => isRuntimeFeatureEvidenceV1(candidate)).not.toThrow();
    expect(isRuntimeFeatureEvidenceV1(candidate)).toBe(false);
  });

  it.each([
    { ...page, executions: null },
    { ...page, phaseExecutionContractId: "other" },
    { ...page, executions: [{ ...page.executions[0], rawError: "provider secret" }] },
    { ...page, executions: [{ ...page.executions[0], attempts: [{ ...page.executions[0]!.attempts[0], actualRoute: { connectionId: "other", modelId: "other" } }] }] },
    { ...page, executions: [{ ...page.executions[0], approvedPlan: { ...page.executions[0]!.approvedPlan, roleId: "unknown-role" } }] },
  ])("rejects malformed page identities and nested members %#", (candidate) => {
    expect(() => isRuntimePhaseExecutionEvidencePageV1(candidate)).not.toThrow();
    expect(isRuntimePhaseExecutionEvidencePageV1(candidate)).toBe(false);
  });

  it("enforces the complete summary state, failure, uniqueness, and route-cardinality matrix", () => {
    const phase = summary.phases[0]!;
    const routeB = { connectionId: "connection-b", modelId: "model-b" };
    const routeC = { connectionId: "connection-c", modelId: "model-c" };
    const valid = [
      { ...phase, state: "not_yet_run", invocationCount: 0, executionModes: [], directModelEvidence: [], actualRoutes: [], aggregateDurationMs: null, finalOutcome: null, failureCode: null },
      { ...phase, state: "not_recorded", invocationCount: 0, executionModes: [], directModelEvidence: [], actualRoutes: [], aggregateDurationMs: null, finalOutcome: null, failureCode: null },
      { ...phase, state: "running", invocationCount: 1, actualRoutes: [route], aggregateDurationMs: null, finalOutcome: "running", failureCode: null },
      phase,
      { ...phase, state: "failed", finalOutcome: "failed", failureCode: "cancelled" },
      { ...phase, state: "timed_out", finalOutcome: "timed_out", failureCode: "timed_out" },
      { ...phase, actualRoutes: [route, routeB] },
    ];
    for (const candidate of valid) expect(isRuntimeFeatureEvidenceV1({ ...summary, phases: [candidate] })).toBe(true);

    const invalid = [
      { ...phase, state: "running", finalOutcome: "running", failureCode: "payment_required" },
      { ...phase, state: "completed", failureCode: "payment_required" },
      { ...phase, state: "failed", finalOutcome: "failed", failureCode: null },
      { ...phase, state: "failed", finalOutcome: "failed", failureCode: "timed_out" },
      { ...phase, state: "timed_out", finalOutcome: "timed_out", failureCode: "payment_required" },
      { ...phase, actualRoutes: [route, route] },
      { ...phase, actualRoutes: [route, routeB, routeC] },
    ];
    for (const candidate of invalid) expect(isRuntimeFeatureEvidenceV1({ ...summary, phases: [candidate] })).toBe(false);
  });

  it("enforces the complete execution-mode summary ownership matrix", () => {
    const phase = summary.phases[0]!;
    const notRecorded = { status: "not_recorded" as const };
    const recorded = {
      status: "recorded" as const,
      modelId: "model-observed",
      providerId: "provider-observed",
      instrumentationSource: "trusted-host/v1",
      observedAt: "2026-07-23T10:00:00.000Z",
    };
    const valid = [
      { ...phase, state: "not_yet_run", invocationCount: 0, executionModes: [], directModelEvidence: [], actualRoutes: [], aggregateDurationMs: null, finalOutcome: null, failureCode: null },
      { ...phase, state: "not_recorded", invocationCount: 0, executionModes: [], directModelEvidence: [], actualRoutes: [], aggregateDurationMs: null, finalOutcome: null, failureCode: null },
      { ...phase, executionModes: ["direct_host"], directModelEvidence: [notRecorded], actualRoutes: [] },
      { ...phase, executionModes: ["direct_host"], directModelEvidence: [recorded], actualRoutes: [] },
      { ...phase, executionModes: ["orchestrated"], directModelEvidence: [], actualRoutes: [] },
      phase,
      { ...phase, invocationCount: 2, executionModes: ["direct_host", "orchestrated"], directModelEvidence: [notRecorded], actualRoutes: [route] },
    ];
    for (const candidate of valid) expect(isRuntimeFeatureEvidenceV1({ ...summary, phases: [candidate] })).toBe(true);

    const invalid = [
      { ...phase, executionModes: ["direct_host"], directModelEvidence: [notRecorded], actualRoutes: [route] },
      { ...phase, executionModes: ["orchestrated"], directModelEvidence: [notRecorded], actualRoutes: [route] },
      { ...phase, executionModes: ["direct_host"], directModelEvidence: [], actualRoutes: [] },
      { ...phase, executionModes: ["direct_host", "orchestrated"], directModelEvidence: [notRecorded], actualRoutes: [route] },
      { ...phase, invocationCount: 1, executionModes: ["direct_host", "orchestrated"], directModelEvidence: [notRecorded], actualRoutes: [route] },
      { ...phase, invocationCount: 1, executionModes: ["direct_host", "orchestrated"], directModelEvidence: [notRecorded], actualRoutes: [route] },
      { ...phase, invocationCount: 2, executionModes: ["direct_host", "direct_host"], directModelEvidence: [notRecorded], actualRoutes: [] },
      { ...phase, invocationCount: 2, executionModes: ["direct_host"], directModelEvidence: [notRecorded, notRecorded], actualRoutes: [] },
      { ...phase, state: "not_yet_run", invocationCount: 0, executionModes: ["direct_host"], directModelEvidence: [], actualRoutes: [], aggregateDurationMs: null, finalOutcome: null, failureCode: null },
      { ...phase, state: "not_recorded", invocationCount: 0, executionModes: [], directModelEvidence: [notRecorded], actualRoutes: [], aggregateDurationMs: null, finalOutcome: null, failureCode: null },
      { ...phase, state: "not_yet_run", invocationCount: 0, executionModes: [], directModelEvidence: [], actualRoutes: [route], aggregateDurationMs: null, finalOutcome: null, failureCode: null },
    ];
    for (const candidate of invalid) expect(isRuntimeFeatureEvidenceV1({ ...summary, phases: [candidate] })).toBe(false);
  });

  it("keeps equal raw IDs distinct across direct and orchestrated public ordering", () => {
    const direct = directExecution("invocation-a", "2026-07-23T10:00:00.000Z");
    expect(isRuntimePhaseExecutionEvidencePageV1({ ...page, executions: [direct, page.executions[0]!] })).toBe(true);
    expect(isRuntimePhaseExecutionEvidencePageV1({ ...page, executions: [page.executions[0]!, direct] })).toBe(false);
  });

  it("accepts valid no-event, fallback, recovery, and direct-handoff public pages", () => {
    expect(isRuntimePhaseExecutionEvidencePageV1(page)).toBe(true);
    expect(isRuntimePhaseExecutionEvidencePageV1(twoAttemptPage("fallback"))).toBe(true);
    expect(isRuntimePhaseExecutionEvidencePageV1(twoAttemptPage("recovery"))).toBe(true);
    expect(isRuntimePhaseExecutionEvidencePageV1(directHandoffPage())).toBe(false);
  });

  it("rejects every contradictory fallback/recovery binding through the public page guard", () => {
    for (const kind of ["fallback", "recovery"] as const) {
      const mutations: Array<(candidate: MutablePage) => void> = [
        (candidate) => { candidate.executions[0]!.approvedPlan.secondRoute = route; },
        (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.kind = "direct_session_handoff"; },
        (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.sourceInvocationId = "foreign"; },
        (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.targetInvocationId = "foreign"; },
        (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.sourceAttemptId = "foreign"; },
        (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.targetAttemptId = "foreign"; },
        (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.sourceApprovedRoute = routeB(); },
        (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.targetApprovedRoute = route; },
        (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.reasonCode = "quota_exceeded"; },
        (candidate) => { candidate.executions[0]!.attempts[0]!.workState = kind === "fallback" ? "checkpointed" : "none"; candidate.executions[0]!.attempts[0]!.checkpointId = kind === "fallback" ? "checkpoint-a" : null; },
        (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.occurredAt = "2026-07-23T09:59:59.999Z"; },
        (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.occurredAt = "2026-07-23T10:00:01.001Z"; },
        (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.result = "failed"; },
      ];
      for (const mutate of mutations) {
        const candidate = clone(twoAttemptPage(kind));
        mutate(candidate);
        expect(isRuntimePhaseExecutionEvidencePageV1(candidate)).toBe(false);
      }
    }
  });

  it("rejects every contradictory direct-session handoff binding through the public page guard", () => {
    const mutations: Array<(candidate: MutablePage) => void> = [
      (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.kind = "fallback"; },
      (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.sourceInvocationId = "foreign"; },
      (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.sourceAttemptId = "foreign"; },
      (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.targetInvocationId = "invocation-a"; },
      (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.sourceApprovedRoute = routeB(); },
      (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.targetApprovedRoute = route; },
      (candidate) => { candidate.executions[0]!.attempts[0]!.workState = "started"; },
      (candidate) => { candidate.executions[0]!.routeChangeEvents[0]!.occurredAt = "2026-07-23T09:59:59.999Z"; },
    ];
    for (const mutate of mutations) {
      const candidate = clone(directHandoffPage());
      mutate(candidate);
      expect(isRuntimePhaseExecutionEvidencePageV1(candidate)).toBe(false);
    }
  });

  it("enforces strict UTF-16 code-unit order for directly sorted execution page positions", () => {
    // UTF-16 code-unit order: Z (0x5A) < _ (0x5F) < z (0x7A) < ä (0xE4)
    const startedAt = "2026-07-23T10:00:00.000Z";
    const directZ = directExecution("Z-execution", startedAt);
    const directUnderscore = directExecution("_execution", startedAt);
    const directZLower = directExecution("z-execution", startedAt);
    const directAUmlaut = directExecution("ä-execution", startedAt);
    // Canonical UTF-16 order on the same timestamp uses mode then execution ID
    expect(isRuntimePhaseExecutionEvidencePageV1({
      ...page,
      phaseExecutionContractId: "contract-a",
      executions: [directZ, directUnderscore, directZLower, directAUmlaut],
    })).toBe(true);
    // Swapped adjacent pair: ä should be last, z should be before ä
    expect(isRuntimePhaseExecutionEvidencePageV1({
      ...page,
      phaseExecutionContractId: "contract-a",
      executions: [directAUmlaut, directZLower],
    })).toBe(false);
    // Same timestamp, IDs sorted by UTF-16 code-unit (a < c)
    expect(isRuntimePhaseExecutionEvidencePageV1({
      ...page,
      executions: [
        directExecution("invocation-a", "2026-07-23T10:00:00.000Z"),
        directExecution("invocation-c", "2026-07-23T10:00:00.000Z"),
      ],
    })).toBe(true);
  });

  it("rejects direct model evidence that is not in strict UTF-16 code-unit order", () => {
    const unorderedCases: Array<readonly string[]> = [
      ["z", "a"],  // z comes after a in UTF-16, but z is first
      ["ä", "z"],  // ä comes after z in UTF-16, but ä is first
      ["_", "Z"],  // Z comes before _ in UTF-16, but _ is first
    ];
    for (const modelIds of unorderedCases) {
      const state = {
        ...summary.phases[0]!,
        state: "completed",
        invocationCount: modelIds.length,
        executionModes: ["direct_host"],
        directModelEvidence: modelIds.map((id) => ({
          status: "recorded" as const, modelId: id, providerId: null,
          instrumentationSource: "trusted-pi-fixture/v1", observedAt: "2026-07-23T10:00:00.000Z",
        })),
        actualRoutes: [],
        aggregateDurationMs: 1000,
        finalOutcome: "completed",
        failureCode: null,
      };
      expect(isRuntimeFeatureEvidenceV1({ ...summary, phases: [state] })).toBe(false);
    }
  });

  it("accepts sorted direct model identity summary with non-ASCII characters", () => {
    // isRuntimeFeatureEvidenceV1 validates that directModelEvidence is sortedUnique by its identity string
    // UTF-16 code-unit order: Z (0x5A) < _ (0x5F) < a (0x61) < z (0x7A) < ä (0xE4)
    const phase = summary.phases[0]!;
    // Pre-sorted by strict UTF-16 code-unit
    const sortedEvidence = ["Z-model", "_model", "ascii-model", "z-model", "ä-model"];
    const state = {
      ...phase,
      state: "completed",
      invocationCount: sortedEvidence.length,
      executionModes: ["direct_host"],
      directModelEvidence: sortedEvidence.map((modelId) => ({
        status: "recorded" as const, modelId, providerId: null,
        instrumentationSource: "trusted-pi-fixture/v1", observedAt: "2026-07-23T10:00:00.000Z",
      })),
      actualRoutes: [],
      aggregateDurationMs: sortedEvidence.length * 1000,
      finalOutcome: "completed",
      failureCode: null,
    };
    expect(isRuntimeFeatureEvidenceV1({ ...summary, phases: [state] })).toBe(true);
  });

  it("rejects unsorted direct model identity summary with non-ASCII characters", () => {
    const phase = summary.phases[0]!;
    const unsortedEvidence = ["z-model", "ä-model", "Z-model", "_model", "a-model"];
    const state = {
      ...phase,
      state: "completed",
      invocationCount: unsortedEvidence.length,
      executionModes: ["direct_host"],
      directModelEvidence: unsortedEvidence.map((modelId) => ({
        status: "recorded" as const, modelId, providerId: null,
        instrumentationSource: "trusted-pi-fixture/v1", observedAt: "2026-07-23T10:00:00.000Z",
      })),
      actualRoutes: [],
      aggregateDurationMs: unsortedEvidence.length * 1000,
      finalOutcome: "completed",
      failureCode: null,
    };
    expect(isRuntimeFeatureEvidenceV1({ ...summary, phases: [state] })).toBe(false);
  });

  it("rejects non-canonical attempt status/failure pairs through the public page guard", () => {
    const mutations: Array<(candidate: MutablePage) => void> = [
      (candidate) => { candidate.executions[0]!.attempts[0]!.status = "completed"; candidate.executions[0]!.attempts[0]!.failureCode = "payment_required"; },
      (candidate) => { candidate.executions[0]!.attempts[0]!.status = "failed"; candidate.executions[0]!.attempts[0]!.failureCode = "timed_out"; },
      (candidate) => { candidate.executions[0]!.attempts[0]!.status = "failed"; candidate.executions[0]!.attempts[0]!.failureCode = "cancelled"; },
      (candidate) => { candidate.executions[0]!.attempts[0]!.status = "timed_out"; candidate.executions[0]!.attempts[0]!.failureCode = "payment_required"; candidate.executions[0]!.attempts[0]!.timeoutMarker = true; },
      (candidate) => { candidate.executions[0]!.attempts[0]!.status = "cancelled"; candidate.executions[0]!.attempts[0]!.failureCode = "payment_required"; },
    ];
    for (const mutate of mutations) {
      const candidate = clone(page);
      mutate(candidate);
      expect(isRuntimePhaseExecutionEvidencePageV1(candidate)).toBe(false);
    }
  });
});

const routeB = () => ({ connectionId: "connection-b", modelId: "model-b" });
type DeepMutable<T> = T extends readonly (infer U)[]
  ? DeepMutable<U>[]
  : T extends object ? { -readonly [K in keyof T]: DeepMutable<T[K]> } : T;
type MutablePage = DeepMutable<RuntimePhaseExecutionEvidencePageV1>;
function clone<T>(value: T): DeepMutable<T> { return structuredClone(value) as DeepMutable<T>; }
function twoAttemptPage(kind: "fallback" | "recovery"): RuntimePhaseExecutionEvidencePageV1 {
  const candidate = clone(page) as MutablePage;
  const chain = candidate.executions[0]!;
  chain.approvedPlan.secondRoute = routeB();
  chain.status = "completed";
  chain.settledAt = "2026-07-23T10:00:02.000Z";
  chain.durationMs = 2_000;
  chain.attempts[0]!.status = "failed";
  chain.attempts[0]!.workState = kind === "fallback" ? "none" : "checkpointed";
  chain.attempts[0]!.checkpointId = kind === "fallback" ? null : "checkpoint-a";
  chain.attempts[0]!.failureCode = "payment_required";
  chain.attempts[0]!.exitCode = 1;
  chain.attempts.push({
    ...clone(chain.attempts[0]!),
    attemptId: "attempt-b",
    attemptIndex: 1,
    attemptKind: kind,
    approvedRoute: routeB(),
    actualRoute: routeB(),
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
  });
  chain.routeChangeEvents.push({
    eventId: "event-a",
    sourceInvocationId: "invocation-a",
    sourceAttemptId: "attempt-a",
    targetInvocationId: "invocation-a",
    targetAttemptId: "attempt-b",
    kind,
    reasonCode: "payment_required",
    occurredAt: "2026-07-23T10:00:01.000Z",
    sourceApprovedRoute: route,
    targetApprovedRoute: routeB(),
    result: "completed",
  });
  return candidate;
}
function directExecution(evidenceId: string, startedAt: string): RuntimePhaseExecutionEvidencePageV1["executions"][number] {
  return {
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    mode: "direct_host",
    evidenceId,
    projectId: "project-a",
    cardKey: "feature:FEAT-A",
    phaseExecutionContractId: "contract-a",
    phaseNumber: 1,
    taskId: null,
    procedureId: "continue-implementation",
    actionId: "continue-implementing",
    hostKind: "pi",
    hostIdentity: null,
    startedAt,
    settledAt: "2026-07-23T10:00:01.000Z",
    durationMs: 1_000,
    outcome: "completed",
    failureCode: null,
    stateSync: { status: "not_requested" },
    modelEvidence: { status: "not_recorded" },
  };
}
function directHandoffPage(): RuntimePhaseExecutionEvidencePageV1 {
  const candidate = clone(page) as MutablePage;
  const chain = candidate.executions[0]!;
  chain.status = "running";
  chain.settledAt = null;
  chain.durationMs = null;
  chain.attempts[0] = {
    ...chain.attempts[0]!,
    actualRoute: null,
    providerId: null,
    authenticationConnectionId: null,
    authenticationKind: null,
    status: "preparing",
    startedAt: null,
    spawnedAt: null,
    terminalAt: null,
    durationMs: null,
    exitCode: null,
  };
  chain.routeChangeEvents.push({
    eventId: "event-a",
    sourceInvocationId: "invocation-a",
    sourceAttemptId: "attempt-a",
    targetInvocationId: "invocation-child",
    targetAttemptId: "attempt-child",
    kind: "direct_session_handoff",
    reasonCode: "invalid_input",
    occurredAt: "2026-07-23T10:00:00.000Z",
    sourceApprovedRoute: route,
    targetApprovedRoute: routeB(),
    result: "started",
  });
  return candidate;
}
