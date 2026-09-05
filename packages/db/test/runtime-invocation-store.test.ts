import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { RUNTIME_EXECUTION_SCHEMA_VERSION } from "@hepha/shared";
import { RuntimeInvocationStore } from "../src/runtime-invocation/runtime-invocation-store.js";
import {
  fallbackAttempt,
  fallbackEvent,
  preparingAttempt,
  planHash,
  primaryRoute,
  runningReceipt,
  runtimePlan,
  secondRoute,
} from "./support/runtime-invocation-fixture.js";

function opened(store: RuntimeInvocationStore, withSecond = false, receipt = runningReceipt({}, withSecond)) {
  const result = store.openInvocation({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, plan: runtimePlan(withSecond), receipt });
  expect(result).toEqual({ ok: true, value: receipt });
  return receipt;
}

function started(store: RuntimeInvocationStore, attempt = preparingAttempt()) {
  const result = store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt, routeChangeEvent: null });
  expect(result).toEqual({ ok: true, value: attempt });
  return attempt;
}

function spawned(store: RuntimeInvocationStore, attempt = preparingAttempt()) {
  const running = {
    ...attempt,
    actualRoute: primaryRoute,
    status: "running" as const,
    startedAt: "2026-07-23T10:00:01.000Z",
    spawnedAt: "2026-07-23T10:00:01.000Z",
  };
  expect(store.markAttemptSpawned(running)).toEqual({ ok: true, value: running });
  return running;
}

describe("RuntimeInvocationStore", () => {
  it("persists every lifecycle mutation and reopens a lossless canonical receipt", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-runtime-receipt-"));
    const databasePath = join(directory, "hepha.sqlite");
    const store = new RuntimeInvocationStore(databasePath);
    try {
      const receipt = opened(store);
      const preparing = started(store, preparingAttempt({ authenticationKind: "injected_connection_secret", credentialVersion: 7 }));
      const running = spawned(store, preparing);
      const substantive = { ...running, workState: "started" as const };
      expect(store.markSubstantiveWorkStarted(substantive)).toEqual({ ok: true, value: substantive });
      const checkpointed = { ...substantive, workState: "checkpointed" as const, checkpointId: "checkpoint-a", checkpointCursor: "cursor-a" };
      expect(store.recordCheckpoint(checkpointed)).toEqual({ ok: true, value: checkpointed });
      const completed = {
        ...checkpointed,
        status: "completed" as const,
        terminalAt: "2026-07-23T10:02:00.000Z",
        durationMs: 120_000,
        exitCode: 0,
      };
      expect(store.settleAttempt(completed)).toEqual({ ok: true, value: completed });
      const settled = {
        ...receipt,
        status: "completed" as const,
        settledAt: "2026-07-23T10:02:00.000Z",
        durationMs: 120_000,
      };
      expect(store.settleInvocation(settled)).toEqual({ ok: true, value: settled });
      expect(store.getInvocation(receipt.invocationId)).toEqual({
        ok: true,
        value: { schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, mode: "orchestrated", receipt: settled, attempts: [completed], routeChangeEvents: [] },
      });
      expect(store.settleInvocation(settled)).toEqual({ ok: true, value: settled });
    } finally { store.close(); }

    const reopened = new RuntimeInvocationStore(databasePath);
    try {
      const result = reopened.getInvocation("invocation-root");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.receipt.selectedLessonIds).toEqual(["lesson-a", "lesson-b"]);
        expect(result.value?.attempts[0]).toMatchObject({ checkpointCursor: "cursor-a", authenticationConnectionId: "connection-primary", credentialVersion: 7 });
      }
    } finally { reopened.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it("rejects malformed, secret-bearing, hash-mismatched, and conflicting writes without side effects", () => {
    const store = RuntimeInvocationStore.createInMemory();
    try {
      const receipt = runningReceipt();
      const secret = "DISTINCTIVE_RUNTIME_SECRET_7f14";
      expect(store.openInvocation(null)).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      expect(store.openInvocation({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, plan: runtimePlan(), receipt: { ...receipt, apiKey: secret } })).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      expect(store.openInvocation({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, plan: runtimePlan(), receipt: { ...receipt, planHash: "b".repeat(64) } })).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      expect(store.getInvocation(receipt.invocationId)).toEqual({ ok: true, value: null });

      opened(store);
      started(store);
      expect(store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt: { ...preparingAttempt(), providerId: "other" }, routeChangeEvent: null })).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
      expect(store.markAttemptSpawned({ ...preparingAttempt(), actualRoute: { connectionId: "other", modelId: "other" }, status: "running", startedAt: "2026-07-23T10:00:01.000Z", spawnedAt: "2026-07-23T10:00:01.000Z" })).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      const result = store.getInvocation(receipt.invocationId);
      expect(result.ok && result.value?.attempts).toEqual([preparingAttempt()]);
    } finally { store.close(); }
  });

  it("atomically records the only legal second attempt and matching route-change edge", () => {
    const store = RuntimeInvocationStore.createInMemory();
    try {
      opened(store, true);
      const primary = started(store);
      const failed = {
        ...primary,
        status: "failed" as const,
        terminalAt: "2026-07-23T10:01:00.000Z",
        durationMs: 60_000,
        failureCode: "rate_limited" as const,
      };
      expect(store.settleAttempt(failed)).toEqual({ ok: true, value: failed });
      const second = fallbackAttempt();
      const event = fallbackEvent();
      expect(store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt: second, routeChangeEvent: event })).toEqual({ ok: true, value: second });
      const evidence = store.getInvocation("invocation-root");
      expect(evidence.ok).toBe(true);
      if (evidence.ok) {
        expect(evidence.value?.receipt.attemptIds).toEqual(["attempt-primary", "attempt-second"]);
        expect(evidence.value?.receipt.routeChangeEventIds).toEqual(["event-fallback"]);
        expect(evidence.value?.routeChangeEvents).toEqual([event]);
      }
      expect(store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt: { ...second, attemptId: "attempt-third" }, routeChangeEvent: { ...event, eventId: "event-third", targetAttemptId: "attempt-third" } })).toMatchObject({ ok: false });
      expect(store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt: second, routeChangeEvent: { ...event, reasonCode: "payment_required" } })).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });

      const secondRunning = { ...second, actualRoute: second.approvedRoute, status: "running" as const, startedAt: "2026-07-23T10:01:02.000Z", spawnedAt: "2026-07-23T10:01:02.000Z" };
      expect(store.markAttemptSpawned(secondRunning)).toEqual({ ok: true, value: secondRunning });
      const secondCompleted = { ...secondRunning, status: "completed" as const, terminalAt: "2026-07-23T10:02:00.000Z", durationMs: 59_000, exitCode: 0 };
      expect(store.settleAttempt(secondCompleted)).toEqual({ ok: true, value: secondCompleted });
      const completedEvent = { ...event, result: "completed" as const };
      expect(store.appendRouteChange(completedEvent)).toEqual({ ok: true, value: completedEvent });
      const settledReceipt = { ...runningReceipt({}, true), attemptIds: ["attempt-primary", "attempt-second"], routeChangeEventIds: ["event-fallback"], status: "completed" as const, settledAt: "2026-07-23T10:02:00.000Z", durationMs: 120_000 };
      expect(store.settleInvocation(settledReceipt)).toEqual({ ok: true, value: settledReceipt });
    } finally { store.close(); }
  });

  it("rolls back a second attempt when the matching event insertion fails", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-runtime-rollback-"));
    const databasePath = join(directory, "hepha.sqlite");
    const store = new RuntimeInvocationStore(databasePath);
    try {
      opened(store, true);
      const primary = started(store);
      expect(store.settleAttempt({ ...primary, status: "failed", terminalAt: "2026-07-23T10:01:00.000Z", durationMs: 60_000, failureCode: "rate_limited" })).toMatchObject({ ok: true });
      const database = new DatabaseSync(databasePath);
      database.exec("create trigger fail_runtime_event before insert on hepha_runtime_route_change_events begin select raise(abort, 'injected'); end;");
      database.close();
      expect(store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt: fallbackAttempt(), routeChangeEvent: fallbackEvent() })).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CONFLICT" });
      const evidence = store.getInvocation("invocation-root");
      expect(evidence.ok && evidence.value?.attempts.map((item) => item.attemptId)).toEqual(["attempt-primary"]);
      expect(evidence.ok && evidence.value?.routeChangeEvents).toEqual([]);
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it("enforces parent/root lineage and preserves chronological feature ordering", () => {
    const store = RuntimeInvocationStore.createInMemory();
    try {
      opened(store);
      started(store);
      const basePlan = runtimePlan();
      const nestedPlan = { ...basePlan, resolvedRoute: { ...basePlan.resolvedRoute, route: secondRoute }, steps: [{ kind: "primary" as const, route: secondRoute }] };
      const nested = runningReceipt({
        invocationId: "invocation-child",
        rootInvocationId: "invocation-root",
        parentInvocationId: "invocation-root",
        invocationKind: "nested",
        planHash: planHash(nestedPlan),
        approvedPrimaryRoute: secondRoute,
        attemptIds: ["attempt-child"],
        openedAt: "2026-07-23T10:01:00.000Z",
      });
      expect(store.openInvocation({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, plan: nestedPlan, receipt: nested })).toEqual({ ok: true, value: nested });
      expect(store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt: preparingAttempt({ attemptId: "attempt-child", invocationId: "invocation-child", approvedRoute: secondRoute, authenticationConnectionId: "connection-second", preparationStartedAt: "2026-07-23T10:01:00.000Z" }), routeChangeEvent: null })).toMatchObject({ ok: true });
      const handoff = { schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, eventId: "event-handoff", invocationId: "invocation-root", eventIndex: 0 as const, sourceInvocationId: "invocation-root", sourceAttemptId: "attempt-primary", targetInvocationId: "invocation-child", targetAttemptId: "attempt-child", kind: "direct_session_handoff" as const, reasonCode: "invalid_input" as const, occurredAt: "2026-07-23T10:01:00.000Z", sourceApprovedRoute: primaryRoute, targetApprovedRoute: secondRoute, result: "started" as const };
      expect(store.appendRouteChange(handoff)).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      const invalidOrphan = runningReceipt({ invocationId: "invocation-orphan", rootInvocationId: "missing-root", parentInvocationId: "missing-parent", invocationKind: "nested", attemptIds: ["attempt-orphan"] });
      expect(store.openInvocation({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, plan: runtimePlan(), receipt: invalidOrphan })).toMatchObject({ ok: false, code: "RUNTIME_INVALID_RECEIPT" });
      const list = store.listFeatureInvocations({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, projectId: "project-a", cardKey: "FEAT-example", limit: 32 });
      expect(list.ok && list.value.map((item) => item.receipt.invocationId)).toEqual(["invocation-root", "invocation-child"]);
      expect(store.listFeatureInvocations({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, projectId: "project-a", cardKey: "FEAT-example", limit: 257 })).toMatchObject({ ok: false, code: "RUNTIME_EVIDENCE_HISTORY_LIMIT" });
    } finally { store.close(); }
  });

  it("detects malformed persisted rows and installs only normalized secret-free tables", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-runtime-corrupt-"));
    const databasePath = join(directory, "hepha.sqlite");
    const store = new RuntimeInvocationStore(databasePath);
    try {
      opened(store);
      started(store);
      const database = new DatabaseSync(databasePath);
      const tables = database.prepare("select name from sqlite_master where type='table' and name like 'hepha_runtime_%' order by name").all() as { name: string }[];
      expect(tables.map((row) => row.name)).toEqual(["hepha_runtime_attempts", "hepha_runtime_invocation_chains", "hepha_runtime_route_change_events"]);
      database.exec("pragma foreign_keys = off; update hepha_runtime_attempts set approved_model_id = ''; pragma foreign_keys = on;");
      database.close();
      expect(store.getInvocation("invocation-root")).toMatchObject({ ok: false, code: "RUNTIME_PERSISTENCE_CORRUPT" });
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});
