import type { DatabaseSync } from "node:sqlite";
import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  isOrchestratedRuntimeEvidenceV1,
} from "@hepha/shared";
import {
  mapRuntimeAttemptRow,
  mapRuntimeInvocationReceiptRow,
  mapRuntimeRouteChangeEventRow,
  type RuntimeSqliteRow,
} from "./runtime-invocation-row-mapper.js";

/** Validates the complete predecessor authority before any schema or row mutation. */
export function validateRuntimeInvocationAuthorityForMigration(database: DatabaseSync): void {
  const prohibited = database.prepare(
    "select count(*) as count from hepha_runtime_route_change_events where kind = 'direct_session_handoff'",
  ).get() as { count: number };
  if (prohibited.count > 0) throw new Error("RUNTIME_ROUTE_CHANGE_SCHEMA_MIGRATION_BLOCKED");

  const foreignKeyFailures = database.prepare("pragma foreign_key_check").all();
  if (foreignKeyFailures.length > 0) throw new Error("RUNTIME_PERSISTENCE_CORRUPT");

  const chainRows = database.prepare(
    "select * from hepha_runtime_invocation_chains order by opened_at, invocation_id",
  ).all() as RuntimeSqliteRow[];
  for (const row of chainRows) {
    if ("mode" in row && row.mode !== "orchestrated") throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
    const invocationId = rowString(row.invocation_id);
    const storedAttemptIds = parseIds(row.attempt_ids_json);
    const storedEventIds = parseIds(row.route_change_event_ids_json);
    const attemptRows = database.prepare(
      "select * from hepha_runtime_attempts where invocation_id=? order by attempt_index, attempt_id",
    ).all(invocationId) as RuntimeSqliteRow[];
    const eventRows = database.prepare(
      "select * from hepha_runtime_route_change_events where invocation_id=? order by event_index, event_id",
    ).all(invocationId) as RuntimeSqliteRow[];
    const queriedAttemptIds = attemptRows.map((item) => rowString(item.attempt_id));
    const queriedEventIds = eventRows.map((item) => rowString(item.event_id));
    if (!sameIds(storedAttemptIds, queriedAttemptIds) || !sameIds(storedEventIds, queriedEventIds)) {
      throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
    }
    const evidence: unknown = {
      schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
      mode: "orchestrated",
      receipt: mapRuntimeInvocationReceiptRow(row, storedAttemptIds, storedEventIds),
      attempts: attemptRows.map(mapRuntimeAttemptRow),
      routeChangeEvents: eventRows.map(mapRuntimeRouteChangeEventRow),
    };
    if (!isOrchestratedRuntimeEvidenceV1(evidence, {
      isRegisteredAction: () => true,
      isTrustedDirectInstrumentation: () => false,
    })) throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
  }
}

function parseIds(value: unknown): string[] {
  if (typeof value !== "string") throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
  }
  return parsed;
}
function rowString(value: unknown): string {
  if (typeof value !== "string") throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
  return value;
}
function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
