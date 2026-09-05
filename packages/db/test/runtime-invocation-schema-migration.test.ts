import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { RUNTIME_EXECUTION_SCHEMA_VERSION, type RuntimeRouteChangeKind } from "@hepha/shared";
import { ensureRuntimeInvocationSchema } from "../src/runtime-invocation/runtime-invocation-schema.js";
import { RuntimeInvocationStore } from "../src/runtime-invocation/runtime-invocation-store.js";
import {
  fallbackEvent,
  preparingAttempt,
  primaryRoute,
  runningReceipt,
  runtimePlan,
  secondRoute,
} from "./support/runtime-invocation-fixture.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true })));

function databasePath(): string {
  const root = mkdtempSync(join(tmpdir(), "hepha-route-schema-"));
  roots.push(root);
  return join(root, "hepha.sqlite");
}

function seedRouteChange(store: RuntimeInvocationStore, prefix: string, kind: RuntimeRouteChangeKind): void {
  const invocationId = `${prefix}-invocation`;
  const primaryAttemptId = `${prefix}-primary`;
  const targetAttemptId = `${prefix}-target`;
  const eventId = `${prefix}-event`;
  const receipt = runningReceipt({
    invocationId,
    rootInvocationId: invocationId,
    attemptIds: [primaryAttemptId],
    routeChangeEventIds: [],
    correlationId: `${prefix}-correlation`,
  }, true);
  expect(store.openInvocation({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, plan: runtimePlan(true), receipt }))
    .toEqual({ ok: true, value: receipt });

  let primary = preparingAttempt({ attemptId: primaryAttemptId, invocationId });
  expect(store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt: primary, routeChangeEvent: null }))
    .toEqual({ ok: true, value: primary });
  if (kind === "recovery") {
    primary = {
      ...primary,
      actualRoute: primaryRoute,
      status: "running",
      startedAt: "2026-07-23T10:00:01.000Z",
      spawnedAt: "2026-07-23T10:00:01.000Z",
    };
    expect(store.markAttemptSpawned(primary)).toEqual({ ok: true, value: primary });
    primary = { ...primary, workState: "started" };
    expect(store.markSubstantiveWorkStarted(primary)).toEqual({ ok: true, value: primary });
    primary = { ...primary, workState: "checkpointed", checkpointId: `${prefix}-checkpoint`, checkpointCursor: `${prefix}-cursor` };
    expect(store.recordCheckpoint(primary)).toEqual({ ok: true, value: primary });
  }
  const failed = {
    ...primary,
    status: "failed" as const,
    terminalAt: "2026-07-23T10:01:00.000Z",
    durationMs: 60_000,
    failureCode: "rate_limited" as const,
  };
  expect(store.settleAttempt(failed)).toEqual({ ok: true, value: failed });

  const target = preparingAttempt({
    attemptId: targetAttemptId,
    invocationId,
    attemptIndex: 1,
    attemptKind: kind,
    approvedRoute: secondRoute,
    authenticationConnectionId: secondRoute.connectionId,
    preparationStartedAt: "2026-07-23T10:01:01.000Z",
  });
  const event = {
    ...fallbackEvent(),
    eventId,
    invocationId,
    sourceInvocationId: invocationId,
    sourceAttemptId: primaryAttemptId,
    targetInvocationId: invocationId,
    targetAttemptId,
    kind,
  };
  expect(store.startAttempt({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, attempt: target, routeChangeEvent: event }))
    .toEqual({ ok: true, value: target });
}

function installLegacyConstraint(path: string): void {
  const database = new DatabaseSync(path);
  database.exec(`
    pragma foreign_keys = on;
    begin immediate;
    create table hepha_runtime_route_change_events_legacy (
      event_id text primary key,
      schema_version text not null check (schema_version = 'runtime-execution/v1'),
      invocation_id text not null references hepha_runtime_invocation_chains(invocation_id) on delete restrict,
      event_index integer not null check (event_index = 0),
      source_invocation_id text not null references hepha_runtime_invocation_chains(invocation_id) on delete restrict,
      source_attempt_id text not null references hepha_runtime_attempts(attempt_id) on delete restrict,
      target_invocation_id text not null references hepha_runtime_invocation_chains(invocation_id) on delete restrict,
      target_attempt_id text not null references hepha_runtime_attempts(attempt_id) on delete restrict,
      kind text not null check (kind in ('direct_session_handoff', 'fallback', 'recovery')),
      reason_code text not null,
      occurred_at text not null,
      source_connection_id text not null,
      source_model_id text not null,
      target_connection_id text not null,
      target_model_id text not null,
      result text not null check (result in ('started', 'completed', 'failed')),
      unique(invocation_id, event_index)
    );
    insert into hepha_runtime_route_change_events_legacy select * from hepha_runtime_route_change_events;
    drop table hepha_runtime_route_change_events;
    alter table hepha_runtime_route_change_events_legacy rename to hepha_runtime_route_change_events;
    create index idx_runtime_events_chain
      on hepha_runtime_route_change_events(invocation_id, event_index, event_id);
    commit;
  `);
  database.close();
}

function schemaSnapshot(path: string) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return {
      sql: (database.prepare("select sql from sqlite_master where type='table' and name='hepha_runtime_route_change_events'").get() as { sql: string }).sql,
      indexes: database.prepare("select name, sql from sqlite_master where type='index' and tbl_name='hepha_runtime_route_change_events' order by name").all(),
      foreignKeys: database.prepare("pragma foreign_key_list('hepha_runtime_route_change_events')").all(),
      rows: database.prepare("select * from hepha_runtime_route_change_events order by event_id").all(),
    };
  } finally {
    database.close();
  }
}

describe("runtime route-change schema migration", () => {
  it("installs the current schema on fresh databases and reopens idempotently", () => {
    const path = databasePath();
    const store = new RuntimeInvocationStore(path);
    seedRouteChange(store, "fresh", "fallback");
    store.close();

    const before = schemaSnapshot(path);
    expect(before.sql).toContain("'fallback', 'recovery'");
    expect(before.sql).not.toContain("direct_session_handoff");
    expect(before.foreignKeys).toHaveLength(5);
    expect(before.indexes.some((index) => (index as { name: string }).name === "idx_runtime_events_chain")).toBe(true);
    const database = new DatabaseSync(path);
    expect(() => database.exec("update hepha_runtime_route_change_events set kind='direct_session_handoff' where event_id='fresh-event'"))
      .toThrow();
    database.close();

    new RuntimeInvocationStore(path).close();
    new RuntimeInvocationStore(path).close();
    expect(schemaSnapshot(path)).toEqual(before);
  });

  it("transactionally migrates valid legacy fallback and recovery rows without identity or index loss", () => {
    const path = databasePath();
    const seed = new RuntimeInvocationStore(path);
    seedRouteChange(seed, "fallback", "fallback");
    seedRouteChange(seed, "recovery", "recovery");
    seed.close();
    const preMode = new DatabaseSync(path);
    preMode.exec("alter table hepha_runtime_invocation_chains drop column mode");
    preMode.close();
    installLegacyConstraint(path);
    const legacy = schemaSnapshot(path);
    expect(legacy.sql).toContain("direct_session_handoff");

    const migrated = new RuntimeInvocationStore(path);
    expect(migrated.getInvocation("fallback-invocation")).toMatchObject({ ok: true, value: { mode: "orchestrated", routeChangeEvents: [{ kind: "fallback" }] } });
    expect(migrated.getInvocation("recovery-invocation")).toMatchObject({ ok: true, value: { mode: "orchestrated", routeChangeEvents: [{ kind: "recovery" }] } });
    migrated.close();

    const current = schemaSnapshot(path);
    expect(current.sql).not.toContain("direct_session_handoff");
    expect(current.rows).toEqual(legacy.rows);
    expect(current.foreignKeys).toEqual(legacy.foreignKeys);
    expect(current.indexes.map((index) => (index as { name: string }).name))
      .toEqual(legacy.indexes.map((index) => (index as { name: string }).name));
    expect(() => {
      const database = new DatabaseSync(path);
      try {
        database.exec("insert into hepha_runtime_route_change_events select 'duplicate-event', schema_version, invocation_id, event_index, source_invocation_id, source_attempt_id, target_invocation_id, target_attempt_id, kind, reason_code, occurred_at, source_connection_id, source_model_id, target_connection_id, target_model_id, result from hepha_runtime_route_change_events where event_id='fallback-event'");
      } finally {
        database.close();
      }
    }).toThrow();
  });

  it("rejects a prohibited legacy row and rolls back the complete installed schema", () => {
    const path = databasePath();
    const seed = new RuntimeInvocationStore(path);
    seedRouteChange(seed, "blocked", "fallback");
    seed.close();
    installLegacyConstraint(path);
    const database = new DatabaseSync(path);
    database.exec("update hepha_runtime_route_change_events set kind='direct_session_handoff' where event_id='blocked-event'");
    database.close();
    const before = schemaSnapshot(path);

    const migrationDatabase = new DatabaseSync(path);
    migrationDatabase.exec("pragma foreign_keys = on");
    expect(() => ensureRuntimeInvocationSchema(migrationDatabase)).toThrow("RUNTIME_ROUTE_CHANGE_SCHEMA_MIGRATION_BLOCKED");
    migrationDatabase.close();
    expect(schemaSnapshot(path)).toEqual(before);
    expect(() => new RuntimeInvocationStore(path)).toThrow("RUNTIME_ROUTE_CHANGE_SCHEMA_MIGRATION_BLOCKED");
    expect(schemaSnapshot(path)).toEqual(before);
  });
});
