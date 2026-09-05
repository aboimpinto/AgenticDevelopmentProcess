import type { DatabaseSync } from "node:sqlite";

/** Installs the route-incapable direct-host runtime evidence authority. */
export function ensureDirectHostRuntimeEvidenceSchema(database: DatabaseSync): void {
  database.exec(`
    create table if not exists hepha_direct_host_runtime_evidence (
      evidence_id text primary key,
      schema_version text not null check (schema_version = 'runtime-execution/v1'),
      mode text not null check (mode = 'direct_host'),
      project_id text not null,
      card_key text,
      phase_execution_contract_id text,
      phase_number integer,
      task_id text,
      procedure_id text,
      action_id text,
      host_kind text not null check (host_kind in ('pi', 'codex', 'claude_code', 'unknown')),
      host_identity text,
      started_at text not null,
      settled_at text,
      duration_ms integer,
      outcome text not null check (outcome in ('running', 'completed', 'failed', 'timed_out', 'cancelled')),
      failure_code text,
      state_sync_status text not null check (state_sync_status in ('not_requested', 'completed', 'failed')),
      state_sync_operation_id text,
      state_sync_failure_code text,
      model_evidence_status text not null check (model_evidence_status in ('not_recorded', 'recorded')),
      model_id text,
      provider_id text,
      instrumentation_source text,
      model_observed_at text,
      check ((phase_execution_contract_id is null and phase_number is null)
        or (phase_execution_contract_id is not null and phase_number is not null)),
      check (task_id is null or phase_execution_contract_id is not null),
      check (procedure_id is not null or action_id is not null),
      check ((state_sync_status = 'not_requested' and state_sync_operation_id is null and state_sync_failure_code is null)
        or (state_sync_status = 'completed' and state_sync_operation_id is not null and state_sync_failure_code is null)
        or (state_sync_status = 'failed' and state_sync_operation_id is null and state_sync_failure_code is not null)),
      check ((model_evidence_status = 'not_recorded' and model_id is null and provider_id is null
          and instrumentation_source is null and model_observed_at is null)
        or (model_evidence_status = 'recorded' and model_id is not null
          and instrumentation_source is not null and model_observed_at is not null))
    );

    create index if not exists idx_direct_host_runtime_evidence_feature
      on hepha_direct_host_runtime_evidence(project_id, card_key, started_at, evidence_id);
    create index if not exists idx_direct_host_runtime_evidence_phase
      on hepha_direct_host_runtime_evidence(project_id, card_key, phase_execution_contract_id, started_at, evidence_id);
  `);
}
