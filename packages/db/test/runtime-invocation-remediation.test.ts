import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  isRuntimeAttemptV1,
  isRuntimeInvocationEvidenceV1,
  isRuntimeInvocationReceiptV1,
  isRuntimeRouteChangeEventV1,
  type HandoffPlanV1,
  type RouteIdentityV1,
  type RuntimeAttemptV1,
  type RuntimeInvocationReceiptV1,
  type RuntimeRouteChangeEventV1,
} from "@hepha/shared";
import { RuntimeInvocationStore } from "../src/runtime-invocation/runtime-invocation-store.js";
import {
  fallbackAttempt,
  fallbackEvent,
  planHash,
  preparingAttempt,
  primaryRoute,
  runningReceipt,
  runtimePlan,
  secondRoute,
} from "./support/runtime-invocation-fixture.js";

const open = (store: RuntimeInvocationStore, receipt = runningReceipt(), plan = runtimePlan()) =>
  store.openInvocation({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, plan, receipt });
const start = (store: RuntimeInvocationStore, attempt = preparingAttempt()) =>
  store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt, routeChangeEvent: null });
const evidence = (store: RuntimeInvocationStore, id = "invocation-root") => store.getInvocation(id);

function runningAttempt(attempt = preparingAttempt()): RuntimeAttemptV1 {
  return {
    ...attempt,
    actualRoute: attempt.approvedRoute,
    status: "running",
    startedAt: "2026-07-23T10:00:01.000Z",
    spawnedAt: "2026-07-23T10:00:01.000Z",
  };
}

function terminalAttempt(
  attempt: RuntimeAttemptV1,
  status: "completed" | "failed" | "timed_out" | "cancelled",
  terminalAt = "2026-07-23T10:01:00.000Z",
): RuntimeAttemptV1 {
  const durationMs = new Date(terminalAt).getTime() - new Date(attempt.preparationStartedAt).getTime();
  if (status === "completed") return { ...attempt, status, terminalAt, durationMs, exitCode: 0, failureCode: null };
  if (status === "timed_out") return { ...attempt, status, terminalAt, durationMs, timeoutMarker: true, failureCode: "timed_out" };
  if (status === "cancelled") return { ...attempt, status, terminalAt, durationMs, failureCode: "cancelled" };
  return { ...attempt, status, terminalAt, durationMs, failureCode: "rate_limited" };
}

function terminalReceipt(receipt: RuntimeInvocationReceiptV1, attempt: RuntimeAttemptV1, settledAt = attempt.terminalAt!): RuntimeInvocationReceiptV1 {
  const durationMs = new Date(settledAt).getTime() - new Date(receipt.openedAt).getTime();
  if (attempt.status === "completed") return { ...receipt, status: "completed", settledAt, durationMs, failureCode: null };
  if (attempt.status === "timed_out") return { ...receipt, status: "timed_out", settledAt, durationMs, failureCode: "timed_out" };
  if (attempt.status === "cancelled") return { ...receipt, status: "cancelled", settledAt, durationMs, failureCode: "cancelled" };
  return { ...receipt, status: "failed", settledAt, durationMs, failureCode: attempt.failureCode };
}

function planWithRoute(route: RouteIdentityV1): HandoffPlanV1 {
  const base = runtimePlan();
  return { ...base, resolvedRoute: { ...base.resolvedRoute, route }, steps: [{ kind: "primary", route }] };
}

function receiptForPlan(plan: HandoffPlanV1, overrides: Partial<RuntimeInvocationReceiptV1> = {}): RuntimeInvocationReceiptV1 {
  return runningReceipt({
    planHash: planHash(plan),
    actionId: plan.resolvedRoute.action.actionId,
    actionType: plan.resolvedRoute.action.actionType,
    roleId: plan.resolvedRoute.action.roleId,
    promptVersion: plan.resolvedRoute.action.promptVersion,
    policySource: plan.resolvedRoute.policySource,
    revisionId: plan.resolvedRoute.revisionId,
    approvedPrimaryRoute: plan.steps[0]!.route,
    approvedSecondRoute: plan.steps[1]?.route ?? null,
    ...overrides,
  }, plan.steps.length === 2);
}

function expectUnchanged(store: RuntimeInvocationStore, before: unknown): void {
  expect(evidence(store)).toEqual(before);
}

function withFailedPrimary(workState: "none" | "started" | "checkpointed" = "none", databasePath = ":memory:") {
  const store = databasePath === ":memory:" ? RuntimeInvocationStore.createInMemory() : new RuntimeInvocationStore(databasePath);
  expect(open(store, runningReceipt({}, true), runtimePlan(true))).toMatchObject({ ok: true });
  expect(start(store)).toMatchObject({ ok: true });
  let current = preparingAttempt();
  if (workState !== "none") {
    current = runningAttempt(current);
    expect(store.markAttemptSpawned(current)).toMatchObject({ ok: true });
    current = { ...current, workState: "started" };
    expect(store.markSubstantiveWorkStarted(current)).toMatchObject({ ok: true });
    if (workState === "checkpointed") {
      current = { ...current, workState: "checkpointed", checkpointId: "checkpoint-a", checkpointCursor: "cursor-a" };
      expect(store.recordCheckpoint(current)).toMatchObject({ ok: true });
    }
  }
  const failed = terminalAttempt(current, "failed");
  expect(store.settleAttempt(failed)).toMatchObject({ ok: true });
  return { store, failed };
}

describe("RuntimeInvocationStore review remediation", () => {
  it("runtime-route-negative-matrix rejects every malformed runtime route at guards and the public store", () => {
    const assertRejected = (name: string, route: unknown) => {
      const store = RuntimeInvocationStore.createInMemory();
      try {
        expect(isRuntimeInvocationReceiptV1({ ...runningReceipt(), approvedPrimaryRoute: route }), `${name} receipt`).toBe(false);
        expect(isRuntimeAttemptV1({ ...preparingAttempt(), approvedRoute: route }), `${name} attempt`).toBe(false);
        expect(isRuntimeRouteChangeEventV1({ ...fallbackEvent(), sourceApprovedRoute: route }), `${name} event`).toBe(false);
        expect(open(store, { ...runningReceipt(), approvedPrimaryRoute: route } as RuntimeInvocationReceiptV1)).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
        expect(evidence(store)).toEqual({ ok: true, value: null });
      } finally { store.close(); }
    };
    for (const [name, route] of [["absent route", undefined], ["null route", null], ["primitive route", "route"], ["array route", []]] as const) {
      assertRejected(name, route);
    }
    for (const member of ["connectionId", "modelId"] as const) {
      const other = member === "connectionId" ? "modelId" : "connectionId";
      const invalidMembers: readonly [string, unknown][] = [
        ["non-string", 1], ["empty", ""], ["padded", " padded"], ["over limit", "x".repeat(513)],
        ["NUL", "value\0bad"], ["newline", "value\nbad"], ["DEL", "value\u007fbad"],
      ];
      assertRejected(`${member}: missing member`, { [other]: "safe-value" });
      assertRejected(`${member}: extra key`, { connectionId: "connection", modelId: "model", apiKey: "forbidden" });
      for (const [name, value] of invalidMembers) {
        assertRejected(`${member}: ${name}`, { connectionId: "connection", modelId: "model", [member]: value });
      }
    }
  });

  it("runtime-route-positive-control preserves maximum safe receipt, attempt, and event routes byte-for-byte", () => {
    const route = { connectionId: "c".repeat(512), modelId: "m".repeat(512) } as RouteIdentityV1;
    const nextRoute = { connectionId: "d".repeat(512), modelId: "n".repeat(512) } as RouteIdentityV1;
    const base = runtimePlan(true);
    const plan: HandoffPlanV1 = { ...base, resolvedRoute: { ...base.resolvedRoute, route }, steps: [{ kind: "primary", route }, { kind: "recovery", route: nextRoute }] };
    const receipt = receiptForPlan(plan);
    const attempt = preparingAttempt({ approvedRoute: route, authenticationConnectionId: route.connectionId });
    const second = fallbackAttempt();
    const routedSecond = { ...second, approvedRoute: nextRoute, authenticationConnectionId: nextRoute.connectionId };
    const event = { ...fallbackEvent(), sourceApprovedRoute: route, targetApprovedRoute: nextRoute };
    const store = RuntimeInvocationStore.createInMemory();
    try {
      expect(open(store, receipt, plan)).toEqual({ ok: true, value: receipt });
      expect(start(store, attempt)).toEqual({ ok: true, value: attempt });
      const failed = terminalAttempt(attempt, "failed");
      expect(store.settleAttempt(failed)).toMatchObject({ ok: true });
      expect(store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt: routedSecond, routeChangeEvent: event })).toEqual({ ok: true, value: routedSecond });
      expect(evidence(store)).toMatchObject({ ok: true, value: { receipt: { approvedPrimaryRoute: route, approvedSecondRoute: nextRoute }, attempts: [{ approvedRoute: route }, { approvedRoute: nextRoute }], routeChangeEvents: [event] } });
    } finally { store.close(); }
  });

  it("open-replay-field-mutations conflict for every valid changed open fact", () => {
    const store = RuntimeInvocationStore.createInMemory();
    const original = runningReceipt();
    try {
      expect(open(store, original)).toMatchObject({ ok: true });
      const originalEvidence = evidence(store);
      const contextMutations: readonly [string, Partial<RuntimeInvocationReceiptV1>][] = [
        ["primary attempt identity", { attemptIds: ["attempt-other"] }],
        ["project", { projectId: "project-other" }], ["card", { cardKey: "FEAT-other" }],
        ["workflow run", { workflowRunId: "workflow-other" }], ["workflow node", { workflowNodeId: "node-other" }],
        ["phase contract and number", { phaseExecutionContractId: "other-contract", phaseNumber: 4 }],
        ["task", { taskId: "task-other" }], ["correlation", { correlationId: "correlation-other" }],
        ["lessons", { selectedLessonIds: ["lesson-c"] }], ["opened timestamp", { openedAt: "2026-07-23T09:59:59.000Z" }],
      ];
      for (const [name, change] of contextMutations) {
        expect(open(store, { ...original, ...change }), name).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
        expectUnchanged(store, originalEvidence);
      }

      const planCases: HandoffPlanV1[] = [];
      const promptPlan = runtimePlan();
      planCases.push({ ...promptPlan, resolvedRoute: { ...promptPlan.resolvedRoute, action: { ...promptPlan.resolvedRoute.action, promptVersion: "implementation/v2" } } });
      const revisionPlan = runtimePlan();
      planCases.push({ ...revisionPlan, resolvedRoute: { ...revisionPlan.resolvedRoute, revisionId: "revision-2" } });
      planCases.push(planWithRoute({ connectionId: "connection-other", modelId: "model-other" } as RouteIdentityV1));
      for (const plan of planCases) {
        const changed = receiptForPlan(plan);
        expect(open(store, changed, plan)).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
        expectUnchanged(store, originalEvidence);
      }
    } finally { store.close(); }
  });

  it("open-replay-positive-controls allow one fresh and one exact duplicate only", () => {
    const store = RuntimeInvocationStore.createInMemory();
    const receipt = runningReceipt();
    try {
      expect(open(store, receipt)).toEqual({ ok: true, value: receipt });
      expect(open(store, receipt)).toEqual({ ok: true, value: receipt });
      expect(start(store)).toMatchObject({ ok: true });
      expect(evidence(store)).toMatchObject({ ok: true, value: { receipt: { attemptIds: ["attempt-primary"] }, attempts: [{ attemptId: "attempt-primary" }] } });
    } finally { store.close(); }
  });

  it("open-replay-advanced-negative rejects replay after a second attempt or settlement", () => {
    const { store } = withFailedPrimary();
    const initial = runningReceipt({}, true);
    try {
      expect(store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt: fallbackAttempt(), routeChangeEvent: fallbackEvent() })).toMatchObject({ ok: true });
      const advanced = evidence(store);
      expect(open(store, initial, runtimePlan(true))).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
      expectUnchanged(store, advanced);
    } finally { store.close(); }

    const settledStore = RuntimeInvocationStore.createInMemory();
    try {
      const receipt = runningReceipt();
      expect(open(settledStore, receipt)).toMatchObject({ ok: true });
      const attempt = preparingAttempt();
      expect(start(settledStore, attempt)).toMatchObject({ ok: true });
      const failed = terminalAttempt(attempt, "failed");
      expect(settledStore.settleAttempt(failed)).toMatchObject({ ok: true });
      expect(settledStore.settleInvocation(terminalReceipt(receipt, failed))).toMatchObject({ ok: true });
      const advanced = evidence(settledStore);
      expect(open(settledStore, receipt)).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
      expectUnchanged(settledStore, advanced);
    } finally { settledStore.close(); }
  });

  it("lifecycle-method-state-matrix binds no-op replay to each method post-state", () => {
    const store = RuntimeInvocationStore.createInMemory();
    try {
      expect(open(store)).toMatchObject({ ok: true });
      const preparing = preparingAttempt();
      expect(start(store, preparing)).toMatchObject({ ok: true });
      let before = evidence(store);
      expect(store.markAttemptSpawned(preparing)).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
      expect(store.settleAttempt(preparing)).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
      expectUnchanged(store, before);

      const running = runningAttempt(preparing);
      expect(store.markAttemptSpawned(running)).toEqual({ ok: true, value: running });
      expect(store.markAttemptSpawned(running)).toEqual({ ok: true, value: running });
      before = evidence(store);
      const routeDrift = { ...running, approvedRoute: secondRoute, actualRoute: secondRoute };
      expect(store.markAttemptSpawned(routeDrift)).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
      expectUnchanged(store, before);
      expect(store.markSubstantiveWorkStarted(running)).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
      expect(store.recordCheckpoint({ ...running, workState: "checkpointed", checkpointId: "checkpoint-a", checkpointCursor: "cursor-a" })).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
      expectUnchanged(store, before);

      const startedWork = { ...running, workState: "started" as const };
      expect(store.markSubstantiveWorkStarted(startedWork)).toEqual({ ok: true, value: startedWork });
      expect(store.markSubstantiveWorkStarted(startedWork)).toEqual({ ok: true, value: startedWork });
      before = evidence(store);
      expect(store.recordCheckpoint(startedWork)).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
      expectUnchanged(store, before);

      const checkpointed = { ...startedWork, workState: "checkpointed" as const, checkpointId: "checkpoint-a", checkpointCursor: "cursor-a" };
      expect(store.recordCheckpoint(checkpointed)).toEqual({ ok: true, value: checkpointed });
      expect(store.recordCheckpoint(checkpointed)).toEqual({ ok: true, value: checkpointed });
      before = evidence(store);
      expect(store.recordCheckpoint(startedWork)).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
      expectUnchanged(store, before);
      expect(store.settleAttempt(checkpointed)).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
      expectUnchanged(store, before);

      const completed = terminalAttempt(checkpointed, "completed");
      expect(store.settleAttempt(completed)).toEqual({ ok: true, value: completed });
      expect(store.settleAttempt(completed)).toEqual({ ok: true, value: completed });
      const conflicting = { ...completed, status: "failed" as const, exitCode: null, failureCode: "rate_limited" as const };
      expect(store.settleAttempt(conflicting)).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
      expect(evidence(store)).toMatchObject({ ok: true, value: { attempts: [completed] } });
    } finally { store.close(); }
  });

  it("route-change-negative-matrix rejects invalid edge ownership, state, result, and chronology atomically", () => {
    const cases: readonly [string, "none" | "started" | "checkpointed", (attempt: RuntimeAttemptV1, event: RuntimeRouteChangeEventV1) => { attempt: RuntimeAttemptV1; event: RuntimeRouteChangeEventV1 }][] = [
      ["wrong owner", "none", (attempt, event) => ({ attempt, event: { ...event, invocationId: "invocation-other" } })],
      ["completed insertion", "none", (attempt, event) => ({ attempt, event: { ...event, result: "completed" } })],
      ["failed insertion", "none", (attempt, event) => ({ attempt, event: { ...event, result: "failed" } })],
      ["before source terminal", "none", (attempt, event) => ({ attempt: { ...attempt, preparationStartedAt: "2026-07-23T10:01:01.000Z" }, event: { ...event, occurredAt: "2026-07-23T10:00:59.000Z" } })],
      ["after target preparation", "none", (attempt, event) => ({ attempt, event: { ...event, occurredAt: "2026-07-23T10:01:02.000Z" } })],
      ["fallback after started work", "started", (attempt, event) => ({ attempt, event })],
      ["fallback after checkpoint", "checkpointed", (attempt, event) => ({ attempt, event })],
      ["recovery without checkpoint", "none", (attempt, event) => ({ attempt: { ...attempt, attemptKind: "recovery" }, event: { ...event, kind: "recovery" } })],
    ];
    for (const [name, workState, mutate] of cases) {
      const { store } = withFailedPrimary(workState);
      try {
        const before = evidence(store);
        const input = mutate(fallbackAttempt(), fallbackEvent());
        expect(store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, ...input }), name).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
        expectUnchanged(store, before);
      } finally { store.close(); }
    }
  });

  it("route-change-positive-controls persist fallback and recovery edges and settle both terminal result classes", () => {
    const fallbackDirectory = mkdtempSync(join(tmpdir(), "hepha-runtime-fallback-"));
    const fallbackPath = join(fallbackDirectory, "hepha.sqlite");
    const fallback = withFailedPrimary("none", fallbackPath);
    try {
      const attempt = fallbackAttempt();
      const event = fallbackEvent();
      expect(fallback.store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt, routeChangeEvent: event })).toMatchObject({ ok: true });
      const running = { ...runningAttempt(attempt), startedAt: "2026-07-23T10:01:02.000Z", spawnedAt: "2026-07-23T10:01:02.000Z" };
      expect(fallback.store.markAttemptSpawned(running)).toMatchObject({ ok: true });
      const completed = terminalAttempt(running, "completed", "2026-07-23T10:02:00.000Z");
      expect(fallback.store.settleAttempt(completed)).toMatchObject({ ok: true });
      expect(fallback.store.appendRouteChange({ ...event, result: "completed" })).toMatchObject({ ok: true });
      expect(fallback.store.appendRouteChange({ ...event, result: "completed" })).toMatchObject({ ok: true });
    } finally { fallback.store.close(); }
    const fallbackReopened = new RuntimeInvocationStore(fallbackPath);
    try { expect(evidence(fallbackReopened)).toMatchObject({ ok: true, value: { routeChangeEvents: [{ kind: "fallback", result: "completed" }] } }); }
    finally { fallbackReopened.close(); rmSync(fallbackDirectory, { recursive: true, force: true }); }

    const recoveryDirectory = mkdtempSync(join(tmpdir(), "hepha-runtime-recovery-"));
    const recoveryPath = join(recoveryDirectory, "hepha.sqlite");
    const recovery = withFailedPrimary("checkpointed", recoveryPath);
    try {
      const attempt = { ...fallbackAttempt(), attemptKind: "recovery" as const };
      const event = { ...fallbackEvent(), kind: "recovery" as const };
      expect(recovery.store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt, routeChangeEvent: event })).toMatchObject({ ok: true });
      const failed = terminalAttempt(attempt, "failed", "2026-07-23T10:02:00.000Z");
      expect(recovery.store.settleAttempt(failed)).toMatchObject({ ok: true });
      expect(recovery.store.appendRouteChange({ ...event, result: "failed" })).toMatchObject({ ok: true });
      expect(recovery.store.appendRouteChange({ ...event, result: "failed" })).toMatchObject({ ok: true });
    } finally { recovery.store.close(); }
    const recoveryReopened = new RuntimeInvocationStore(recoveryPath);
    try { expect(evidence(recoveryReopened)).toMatchObject({ ok: true, value: { routeChangeEvents: [{ kind: "recovery", result: "failed" }] } }); }
    finally { recoveryReopened.close(); rmSync(recoveryDirectory, { recursive: true, force: true }); }
  });

  it("route-change direct-session controls require pre-work source state and survive restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-runtime-direct-handoff-"));
    const databasePath = join(directory, "hepha.sqlite");
    const store = new RuntimeInvocationStore(databasePath);
    const base = runtimePlan();
    const nestedPlan: HandoffPlanV1 = { ...base, resolvedRoute: { ...base.resolvedRoute, route: secondRoute }, steps: [{ kind: "primary", route: secondRoute }] };
    const nestedReceipt = receiptForPlan(nestedPlan, {
      invocationId: "invocation-child", rootInvocationId: "invocation-root", parentInvocationId: "invocation-root",
      invocationKind: "nested", attemptIds: ["attempt-child"], openedAt: "2026-07-23T10:01:00.000Z",
    });
    const childAttempt = preparingAttempt({
      attemptId: "attempt-child", invocationId: "invocation-child", approvedRoute: secondRoute,
      authenticationConnectionId: secondRoute.connectionId, preparationStartedAt: "2026-07-23T10:01:00.000Z",
    });
    const handoff = {
      schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, eventId: "event-handoff", invocationId: "invocation-root", eventIndex: 0,
      sourceInvocationId: "invocation-root", sourceAttemptId: "attempt-primary", targetInvocationId: "invocation-child",
      targetAttemptId: "attempt-child", kind: "direct_session_handoff", reasonCode: "invalid_input",
      occurredAt: "2026-07-23T10:01:00.000Z", sourceApprovedRoute: primaryRoute, targetApprovedRoute: secondRoute, result: "started",
    };
    try {
      expect(open(store)).toMatchObject({ ok: true });
      expect(start(store)).toMatchObject({ ok: true });
      expect(open(store, nestedReceipt, nestedPlan)).toMatchObject({ ok: true });
      expect(start(store, childAttempt)).toMatchObject({ ok: true });
      expect(store.appendRouteChange({ ...handoff, result: "completed" })).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      expect(store.appendRouteChange(handoff)).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      const afterStartedHandoff = store.getInvocation("invocation-root");
      expect(afterStartedHandoff).toMatchObject({ ok: true, value: { routeChangeEvents: [] } });
      expect(store.appendRouteChange({ ...handoff, eventId: "event-handoff-other" })).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      expect(store.getInvocation("invocation-root")).toEqual(afterStartedHandoff);
      const sourceFailed = terminalAttempt(preparingAttempt(), "failed", "2026-07-23T10:00:30.000Z");
      expect(store.settleAttempt(sourceFailed)).toMatchObject({ ok: true });
      expect(store.settleInvocation(terminalReceipt(runningReceipt(), sourceFailed))).toMatchObject({ ok: true });
      const childRunning = { ...runningAttempt(childAttempt), startedAt: "2026-07-23T10:01:01.000Z", spawnedAt: "2026-07-23T10:01:01.000Z" };
      expect(store.markAttemptSpawned(childRunning)).toMatchObject({ ok: true });
      const childCompleted = terminalAttempt(childRunning, "completed", "2026-07-23T10:02:00.000Z");
      expect(store.settleAttempt(childCompleted)).toMatchObject({ ok: true });
      const completedHandoff = { ...handoff, result: "completed" as const };
      expect(store.appendRouteChange(completedHandoff)).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      expect(store.appendRouteChange(completedHandoff)).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
    } finally { store.close(); }

    const reopened = new RuntimeInvocationStore(databasePath);
    try {
      expect(reopened.getInvocation("invocation-root")).toMatchObject({ ok: true, value: { routeChangeEvents: [] } });
    } finally { reopened.close(); rmSync(directory, { recursive: true, force: true }); }

    const rejected = RuntimeInvocationStore.createInMemory();
    try {
      expect(open(rejected)).toMatchObject({ ok: true });
      const sourceRunning = runningAttempt();
      expect(start(rejected)).toMatchObject({ ok: true });
      expect(rejected.markAttemptSpawned(sourceRunning)).toMatchObject({ ok: true });
      expect(rejected.markSubstantiveWorkStarted({ ...sourceRunning, workState: "started" })).toMatchObject({ ok: true });
      expect(open(rejected, nestedReceipt, nestedPlan)).toMatchObject({ ok: true });
      expect(start(rejected, childAttempt)).toMatchObject({ ok: true });
      const before = rejected.getInvocation("invocation-root");
      expect(rejected.appendRouteChange(handoff)).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      expect(rejected.getInvocation("invocation-root")).toEqual(before);
    } finally { rejected.close(); }
  });

  it("route-change-corruption-controls reject owner, source, reason, route, and chronology corruption", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-runtime-event-corrupt-"));
    const databasePath = join(directory, "hepha.sqlite");
    const { store } = (() => {
      const value = new RuntimeInvocationStore(databasePath);
      expect(open(value, runningReceipt({}, true), runtimePlan(true))).toMatchObject({ ok: true });
      const primary = preparingAttempt();
      expect(start(value, primary)).toMatchObject({ ok: true });
      expect(value.settleAttempt(terminalAttempt(primary, "failed"))).toMatchObject({ ok: true });
      expect(value.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt: fallbackAttempt(), routeChangeEvent: fallbackEvent() })).toMatchObject({ ok: true });
      return { store: value };
    })();
    try {
      expect(evidence(store)).toMatchObject({ ok: true });
      const mutations: readonly [string, string, string][] = [
        ["owner", "invocation_id='other-owner'", "invocation_id='invocation-root'"],
        ["source", "source_invocation_id='other-source'", "source_invocation_id='invocation-root'"],
        ["reason", "reason_code='payment_required'", "reason_code='rate_limited'"],
        ["route", "source_connection_id='other-connection'", "source_connection_id='connection-primary'"],
        ["chronology", "occurred_at='2026-07-23T10:00:59.000Z'", "occurred_at='2026-07-23T10:01:01.000Z'"],
      ];
      for (const [name, mutation, restore] of mutations) {
        const database = new DatabaseSync(databasePath);
        database.exec(`pragma foreign_keys=off; update hepha_runtime_route_change_events set ${mutation} where event_id='event-fallback'; pragma foreign_keys=on;`);
        database.close();
        expect(evidence(store), name).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CORRUPT" });
        expect(store.listFeatureInvocations({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, projectId: "project-a", cardKey: "FEAT-example", limit: 32 })).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CORRUPT" });
        const repair = new DatabaseSync(databasePath);
        repair.exec(`pragma foreign_keys=off; update hepha_runtime_route_change_events set ${restore} where event_id='event-fallback' or invocation_id='other-owner'; pragma foreign_keys=on;`);
        repair.close();
        expect(evidence(store), `${name} restored`).toMatchObject({ ok: true });
      }
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it("chain-lifecycle-status-matrix accepts exact terminal outcomes and rejects mismatches", () => {
    for (const status of ["completed", "failed", "timed_out", "cancelled"] as const) {
      const store = RuntimeInvocationStore.createInMemory();
      try {
        const receipt = runningReceipt();
        expect(open(store, receipt)).toMatchObject({ ok: true });
        let attempt = preparingAttempt();
        expect(start(store, attempt)).toMatchObject({ ok: true });
        if (status === "completed" || status === "timed_out") {
          attempt = runningAttempt(attempt);
          expect(store.markAttemptSpawned(attempt)).toMatchObject({ ok: true });
        }
        const terminal = terminalAttempt(attempt, status);
        expect(store.settleAttempt(terminal)).toMatchObject({ ok: true });
        const settled = terminalReceipt(receipt, terminal);
        expect(store.settleInvocation(settled), status).toEqual({ ok: true, value: settled });
        expect(evidence(store)).toMatchObject({ ok: true, value: { receipt: settled, attempts: [terminal] } });
      } finally { store.close(); }
    }

    const preparing = preparingAttempt();
    const completedReceipt = { ...runningReceipt(), status: "completed" as const, settledAt: "2026-07-23T10:01:00.000Z", durationMs: 60_000 };
    expect(isRuntimeInvocationEvidenceV1({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, receipt: completedReceipt, attempts: [preparing], routeChangeEvents: [] })).toBe(false);
  });

  it("chain-lifecycle-chronology-matrix rejects preparation and settlement clock regressions", () => {
    const store = RuntimeInvocationStore.createInMemory();
    try {
      expect(open(store)).toMatchObject({ ok: true });
      expect(start(store, preparingAttempt({ preparationStartedAt: "2026-07-23T09:59:59.999Z" }))).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      expect(evidence(store)).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CORRUPT" });
    } finally { store.close(); }

    const settledStore = RuntimeInvocationStore.createInMemory();
    try {
      const receipt = runningReceipt();
      expect(open(settledStore, receipt)).toMatchObject({ ok: true });
      const attempt = preparingAttempt();
      expect(start(settledStore, attempt)).toMatchObject({ ok: true });
      const failed = terminalAttempt(attempt, "failed", "2026-07-23T10:01:00.000Z");
      expect(settledStore.settleAttempt(failed)).toMatchObject({ ok: true });
      const tooEarly = terminalReceipt(receipt, failed, "2026-07-23T10:00:59.999Z");
      expect(settledStore.settleInvocation(tooEarly)).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      expect(evidence(settledStore)).toMatchObject({ ok: true, value: { receipt: { status: "running" }, attempts: [failed] } });
      const equal = terminalReceipt(receipt, failed);
      expect(settledStore.settleInvocation(equal)).toEqual({ ok: true, value: equal });
    } finally { settledStore.close(); }
  });

  it("chain-lifecycle-corruption-read rejects terminal lifecycle corruption without partial evidence", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-runtime-lifecycle-corrupt-"));
    const databasePath = join(directory, "hepha.sqlite");
    const store = new RuntimeInvocationStore(databasePath);
    try {
      const receipt = runningReceipt();
      expect(open(store, receipt)).toMatchObject({ ok: true });
      const attempt = preparingAttempt();
      expect(start(store, attempt)).toMatchObject({ ok: true });
      const failed = terminalAttempt(attempt, "failed");
      expect(store.settleAttempt(failed)).toMatchObject({ ok: true });
      const settled = terminalReceipt(receipt, failed);
      expect(store.settleInvocation(settled)).toMatchObject({ ok: true });
      expect(evidence(store)).toMatchObject({ ok: true });

      const database = new DatabaseSync(databasePath);
      database.exec("update hepha_runtime_attempts set status='preparing', terminal_at=null, duration_ms=null, failure_code=null where attempt_id='attempt-primary'");
      database.close();
      expect(evidence(store)).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CORRUPT" });
      expect(store.listFeatureInvocations({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, projectId: "project-a", cardKey: "FEAT-example", limit: 32 })).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CORRUPT" });
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});
