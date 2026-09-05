import type { DatabaseSync } from "node:sqlite";
import { validateRuntimeInvocationAuthorityForMigration } from "./runtime-invocation-migration.js";

interface RuntimeTableNames {
  readonly chains: string;
  readonly attempts: string;
  readonly events: string;
}

const CURRENT_TABLES: RuntimeTableNames = {
  chains: "hepha_runtime_invocation_chains",
  attempts: "hepha_runtime_attempts",
  events: "hepha_runtime_route_change_events",
};
const NEXT_TABLES: RuntimeTableNames = {
  chains: "hepha_runtime_invocation_chains_next",
  attempts: "hepha_runtime_attempts_next",
  events: "hepha_runtime_route_change_events_next",
};

/** Installs or atomically migrates the normalized runtime invocation authority. */
export function ensureRuntimeInvocationSchema(database: DatabaseSync): void {
  const installed = installedRuntimeTables(database);
  if (!installed.has(CURRENT_TABLES.chains)) {
    if (installed.has(CURRENT_TABLES.attempts) || installed.has(CURRENT_TABLES.events)) {
      throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
    }
    database.exec(schemaSql(CURRENT_TABLES, true, true));
    return;
  }
  if (!installed.has(CURRENT_TABLES.attempts) || !installed.has(CURRENT_TABLES.events)) {
    throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
  }

  const mode = (database.prepare(`pragma table_info(${CURRENT_TABLES.chains})`).all() as Array<{
    name: string;
    notnull: number;
    dflt_value: string | null;
  }>).find((column) => column.name === "mode");
  const eventSql = tableSql(database, CURRENT_TABLES.events);
  const needsMigration = !mode || mode.notnull !== 1 || mode.dflt_value !== null
    || eventSql.includes("direct_session_handoff");
  if (!needsMigration) return;

  rebuildRuntimeInvocationAuthority(database);
}

function rebuildRuntimeInvocationAuthority(database: DatabaseSync): void {
  database.exec("pragma foreign_keys = off");
  database.exec("begin immediate");
  try {
    // Validate the complete predecessor authority inside the migration transaction.
    // If validation fails, no schema or row mutation survives the rollback.
    // pragma foreign_key_check works independently of pragma foreign_keys.
    validateRuntimeInvocationAuthorityForMigration(database);

    database.exec(schemaSql(NEXT_TABLES, false, false));
    const chainColumns = chainColumnList(false);
    database.exec(`
      insert into ${NEXT_TABLES.chains} (${chainColumnList(true)})
        select invocation_id, schema_version, 'orchestrated', ${chainColumns.slice("invocation_id, schema_version, ".length)}
        from ${CURRENT_TABLES.chains};
      insert into ${NEXT_TABLES.attempts} (${ATTEMPT_COLUMNS}) select ${ATTEMPT_COLUMNS} from ${CURRENT_TABLES.attempts};
      insert into ${NEXT_TABLES.events} (${EVENT_COLUMNS}) select ${EVENT_COLUMNS} from ${CURRENT_TABLES.events};
      drop table ${CURRENT_TABLES.events};
      drop table ${CURRENT_TABLES.attempts};
      drop table ${CURRENT_TABLES.chains};
      alter table ${NEXT_TABLES.chains} rename to ${CURRENT_TABLES.chains};
      alter table ${NEXT_TABLES.attempts} rename to ${CURRENT_TABLES.attempts};
      alter table ${NEXT_TABLES.events} rename to ${CURRENT_TABLES.events};
      ${indexSql()}
    `);
    const foreignKeyFailures = database.prepare("pragma foreign_key_check").all();
    if (foreignKeyFailures.length > 0) throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
    database.exec("commit");
  } catch (error) {
    database.exec("rollback");
    throw error;
  } finally {
    database.exec("pragma foreign_keys = on");
  }
}

function schemaSql(names: RuntimeTableNames, ifNotExists: boolean, withIndexes: boolean): string {
  const optional = ifNotExists ? "if not exists " : "";
  return `
    create table ${optional}${names.chains} (
      invocation_id text primary key,
      schema_version text not null check (schema_version = 'runtime-execution/v1'),
      mode text not null check (mode = 'orchestrated'),
      root_invocation_id text not null references ${names.chains}(invocation_id),
      parent_invocation_id text references ${names.chains}(invocation_id),
      invocation_kind text not null check (invocation_kind in ('root', 'nested')),
      plan_hash text not null,
      action_id text not null,
      action_type text not null,
      role_id text not null,
      prompt_version text not null,
      policy_source text not null check (policy_source in ('global', 'action_type', 'action')),
      revision_id text not null,
      primary_connection_id text not null,
      primary_model_id text not null,
      second_connection_id text,
      second_model_id text,
      project_id text not null,
      card_key text,
      workflow_run_id text,
      workflow_node_id text,
      phase_execution_contract_id text,
      phase_number integer,
      task_id text,
      correlation_id text not null,
      selected_lesson_ids_json text not null,
      attempt_ids_json text not null,
      route_change_event_ids_json text not null,
      status text not null check (status in ('running', 'completed', 'failed', 'timed_out', 'cancelled')),
      opened_at text not null,
      settled_at text,
      duration_ms integer,
      failure_code text,
      check ((invocation_kind = 'root' and invocation_id = root_invocation_id and parent_invocation_id is null)
        or (invocation_kind = 'nested' and parent_invocation_id is not null and invocation_id <> root_invocation_id)),
      check ((second_connection_id is null and second_model_id is null) or (second_connection_id is not null and second_model_id is not null)),
      check ((phase_execution_contract_id is null and phase_number is null) or (phase_execution_contract_id is not null and phase_number is not null))
    );

    create table ${optional}${names.attempts} (
      attempt_id text primary key,
      schema_version text not null check (schema_version = 'runtime-execution/v1'),
      invocation_id text not null references ${names.chains}(invocation_id) on delete restrict,
      attempt_index integer not null check (attempt_index in (0, 1)),
      attempt_kind text not null check (attempt_kind in ('primary', 'fallback', 'recovery')),
      approved_connection_id text not null,
      approved_model_id text not null,
      actual_connection_id text,
      actual_model_id text,
      provider_id text,
      authentication_connection_id text,
      authentication_kind text check (authentication_kind in ('pi_session', 'injected_connection_secret')),
      credential_version integer,
      work_state text not null check (work_state in ('none', 'started', 'checkpointed')),
      checkpoint_id text,
      checkpoint_cursor text,
      status text not null check (status in ('preparing', 'running', 'completed', 'failed', 'timed_out', 'cancelled')),
      preparation_started_at text not null,
      started_at text,
      spawned_at text,
      terminal_at text,
      duration_ms integer,
      exit_code integer,
      timeout_marker integer not null check (timeout_marker in (0, 1)),
      failure_code text,
      unique(invocation_id, attempt_index),
      check ((actual_connection_id is null and actual_model_id is null) or (actual_connection_id is not null and actual_model_id is not null)),
      check ((checkpoint_id is null and checkpoint_cursor is null) or (checkpoint_id is not null and checkpoint_cursor is not null))
    );

    create table ${optional}${names.events} (
      event_id text primary key,
      schema_version text not null check (schema_version = 'runtime-execution/v1'),
      invocation_id text not null references ${names.chains}(invocation_id) on delete restrict,
      event_index integer not null check (event_index = 0),
      source_invocation_id text not null references ${names.chains}(invocation_id) on delete restrict,
      source_attempt_id text not null references ${names.attempts}(attempt_id) on delete restrict,
      target_invocation_id text not null references ${names.chains}(invocation_id) on delete restrict,
      target_attempt_id text not null references ${names.attempts}(attempt_id) on delete restrict,
      kind text not null check (kind in ('fallback', 'recovery')),
      reason_code text not null,
      occurred_at text not null,
      source_connection_id text not null,
      source_model_id text not null,
      target_connection_id text not null,
      target_model_id text not null,
      result text not null check (result in ('started', 'completed', 'failed')),
      unique(invocation_id, event_index)
    );
    ${withIndexes ? indexSql() : ""}
  `;
}

function indexSql(): string {
  return `
    create index idx_runtime_chains_feature
      on ${CURRENT_TABLES.chains}(project_id, card_key, opened_at, invocation_id);
    create index idx_runtime_chains_parent
      on ${CURRENT_TABLES.chains}(parent_invocation_id);
    create index idx_runtime_attempts_chain
      on ${CURRENT_TABLES.attempts}(invocation_id, attempt_index, attempt_id);
    create index idx_runtime_events_chain
      on ${CURRENT_TABLES.events}(invocation_id, event_index, event_id);
  `;
}

function installedRuntimeTables(database: DatabaseSync): Set<string> {
  return new Set((database.prepare(
    "select name from sqlite_master where type='table' and name in (?, ?, ?)",
  ).all(CURRENT_TABLES.chains, CURRENT_TABLES.attempts, CURRENT_TABLES.events) as Array<{ name: string }>)
    .map((row) => row.name));
}
function tableSql(database: DatabaseSync, table: string): string {
  const row = database.prepare("select sql from sqlite_master where type='table' and name=?").get(table) as { sql: string | null } | undefined;
  if (!row?.sql) throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
  return row.sql;
}
function chainColumnList(withMode: boolean): string {
  const columns = [
    "invocation_id", "schema_version", ...(withMode ? ["mode"] : []), "root_invocation_id",
    "parent_invocation_id", "invocation_kind", "plan_hash", "action_id", "action_type", "role_id",
    "prompt_version", "policy_source", "revision_id", "primary_connection_id", "primary_model_id",
    "second_connection_id", "second_model_id", "project_id", "card_key", "workflow_run_id",
    "workflow_node_id", "phase_execution_contract_id", "phase_number", "task_id", "correlation_id",
    "selected_lesson_ids_json", "attempt_ids_json", "route_change_event_ids_json", "status", "opened_at",
    "settled_at", "duration_ms", "failure_code",
  ];
  return columns.join(", ");
}
const ATTEMPT_COLUMNS = [
  "attempt_id", "schema_version", "invocation_id", "attempt_index", "attempt_kind", "approved_connection_id",
  "approved_model_id", "actual_connection_id", "actual_model_id", "provider_id", "authentication_connection_id",
  "authentication_kind", "credential_version", "work_state", "checkpoint_id", "checkpoint_cursor", "status",
  "preparation_started_at", "started_at", "spawned_at", "terminal_at", "duration_ms", "exit_code", "timeout_marker",
  "failure_code",
].join(", ");
const EVENT_COLUMNS = [
  "event_id", "schema_version", "invocation_id", "event_index", "source_invocation_id", "source_attempt_id",
  "target_invocation_id", "target_attempt_id", "kind", "reason_code", "occurred_at", "source_connection_id",
  "source_model_id", "target_connection_id", "target_model_id", "result",
].join(", ");
