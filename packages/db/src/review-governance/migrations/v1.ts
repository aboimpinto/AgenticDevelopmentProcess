/** Initial immutable review evidence schema. */
export const REVIEW_GOVERNANCE_MIGRATION_V1_SQL = `
-- Migration ledger (version tracking, never replaced)
create table if not exists hepha_review_schema_migrations (
  version integer primary key,
  applied_at text not null
);

-- Immutable review artifacts
create table if not exists hepha_review_artifacts (
  content_hash text primary key check (content_hash GLOB '[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]'),
  artifact_id text not null,
  artifact_kind text not null check (artifact_kind in ('review_manifest', 'remediation_response', 'verification_receipt', 'replan_plan', 'debt_observation')),
  schema_version integer not null default 1 check (typeof(schema_version) = 'integer' and schema_version = 1),
  project_id text not null,
  feature_id text not null,
  phase_number integer not null,
  review_gate_id text not null,
  feature_root_path text not null,
  artifact_relative_path text not null,
  canonical_json text not null,
  source_mode text not null check (source_mode = 'v1_validated_ingress'),
  ingested_at text not null,
  unique(project_id, feature_id, phase_number, review_gate_id, artifact_kind, artifact_id)
);

-- Immutable artifact lineage
create table if not exists hepha_review_artifact_lineage (
  artifact_hash text not null references hepha_review_artifacts(content_hash),
  predecessor_hash text not null references hepha_review_artifacts(content_hash),
  relation_kind text not null check (relation_kind in ('predecessor', 'supersedes')),
  primary key (artifact_hash, predecessor_hash, relation_kind)
);

-- At most one supersedes edge per artifact (F2: aggregate binding)
create unique index if not exists idx_review_lineage_at_most_one_supersedes
  on hepha_review_artifact_lineage (artifact_hash)
  where relation_kind = 'supersedes';

-- Immutable review runs (manifest_hash is unique — only manifests create runs)
create table if not exists hepha_review_runs (
  review_run_id text primary key,
  manifest_hash text not null unique references hepha_review_artifacts(content_hash),
  project_id text not null,
  feature_id text not null,
  phase_number integer not null,
  review_gate_id text not null,
  manifest_result text not null check (manifest_result in ('APPROVED', 'NEEDS_CHANGES', 'BLOCKED')),
  workflow_run_id text,
  agent_invocation_id text,
  created_at text not null
);

-- Immutable review findings
create table if not exists hepha_review_findings (
  review_run_id text not null references hepha_review_runs(review_run_id),
  finding_id text not null,
  project_id text not null,
  feature_id text not null,
  phase_number integer not null,
  review_gate_id text not null,
  disposition text not null check (disposition in ('IN_SCOPE_BLOCKER', 'SCOPE_EXPANSION', 'ARCHITECTURE_DEBT', 'OBSERVATION')),
  claim_type text not null check (claim_type in ('architecture', 'security', 'policy', 'quality', 'feature_correctness')),
  severity text not null check (severity in ('blocker', 'required', 'note', 'info')),
  defect_class text not null,
  summary text not null,
  rule_reference text,
  rule_id text,
  rule_version text,
  rule_hash text,
  ac_source_path text,
  ac_section text,
  primary key (review_run_id, finding_id)
);

-- Immutable review finding observations
create table if not exists hepha_review_finding_observations (
  observation_id text primary key,
  review_run_id text not null,
  finding_id text not null,
  surface_json text not null,
  remediation_items_json text not null,
  test_matrix_json text not null,
  root_cause text,
  scope_rationale text,
  created_at text not null,
  unique(review_run_id, finding_id),
  foreign key (review_run_id, finding_id) references hepha_review_findings(review_run_id, finding_id)
);

-- Immutable remediation cycles
create table if not exists hepha_review_remediation_cycles (
  cycle_id text primary key,
  project_id text not null,
  feature_id text not null,
  phase_number integer not null,
  review_gate_id text not null,
  basis_manifest_hash text not null references hepha_review_artifacts(content_hash),
  predecessor_cycle_id text references hepha_review_remediation_cycles(cycle_id),
  cycle_state text not null check (cycle_state in (
    'NO_REMEDIATION_REQUIRED', 'REMEDIATION_VERIFIED',
    'OPEN', 'AWAITING_RESPONSE', 'AWAITING_RECEIPT', 'REVIEW_PENDING', 'REPLAN_REQUIRED'
  )),
  reason_code text,
  created_at text not null
);

-- Immutable remediation item events
create table if not exists hepha_review_remediation_items (
  item_event_id text primary key,
  cycle_id text not null references hepha_review_remediation_cycles(cycle_id),
  review_run_id text not null,
  finding_id text not null,
  remediation_item_id text not null,
  event_kind text not null,
  response_hash text references hepha_review_artifacts(content_hash),
  decision text check (decision is null or decision in ('APPLIED', 'NOT_APPLIED', 'NOT_APPLICABLE')),
  outcome_summary text,
  created_at text not null,
  foreign key (review_run_id, finding_id) references hepha_review_findings(review_run_id, finding_id)
);

-- Immutable verification receipts
create table if not exists hepha_review_verification_receipts (
  receipt_event_id text primary key,
  cycle_id text not null references hepha_review_remediation_cycles(cycle_id),
  receipt_hash text not null references hepha_review_artifacts(content_hash),
  review_run_id text not null,
  finding_id text not null,
  subject_kind text not null check (subject_kind in ('remediation_item', 'test')),
  subject_id text not null,
  outcome text not null check (
    (subject_kind = 'remediation_item' and outcome in ('VERIFIED', 'FAILED', 'NOT_VERIFIABLE')) or
    (subject_kind = 'test' and outcome in ('PASSED', 'FAILED', 'NOT_RUN', 'NOT_VERIFIABLE'))
  ),
  evidence_summary text,
  created_at text not null,
  foreign key (review_run_id, finding_id) references hepha_review_findings(review_run_id, finding_id)
);

-- Phase-gate decisions (append-only; greatest gate_decision_id is current)
create table if not exists hepha_review_phase_gate_decisions (
  gate_decision_id integer primary key autoincrement,
  project_id text not null,
  feature_id text not null,
  phase_number integer not null,
  review_gate_id text not null,
  trigger_artifact_hash text not null references hepha_review_artifacts(content_hash),
  basis_manifest_hash text not null references hepha_review_artifacts(content_hash),
  cycle_id text references hepha_review_remediation_cycles(cycle_id),
  gate_state text not null check (gate_state in ('APPROVED', 'REJECTED', 'BLOCKED', 'PENDING')),
  reason_code text not null,
  evidence_hashes_json text not null default '[]',
  decided_at text not null
);

-- Safe incidents (append-only, secret-safe)
create table if not exists hepha_review_safe_incidents (
  incident_id text primary key,
  project_id text not null,
  feature_id text,
  phase_number integer,
  review_gate_id text,
  stage text not null,
  incident_code text not null,
  content_hash text,
  created_at text not null
);

-- Query indexes
create index if not exists idx_review_artifacts_scope
  on hepha_review_artifacts (project_id, feature_id, phase_number, review_gate_id, ingested_at);
create index if not exists idx_review_artifacts_kind_id
  on hepha_review_artifacts (artifact_kind, artifact_id);
create index if not exists idx_review_runs_scope
  on hepha_review_runs (project_id, feature_id, phase_number, review_gate_id, created_at);
create index if not exists idx_review_findings_defect
  on hepha_review_findings (project_id, feature_id, phase_number, review_gate_id, defect_class);
create index if not exists idx_review_observations_run
  on hepha_review_finding_observations (review_run_id);
create index if not exists idx_review_cycles_scope
  on hepha_review_remediation_cycles (project_id, feature_id, phase_number, review_gate_id, created_at);
create index if not exists idx_review_receipts_cycle
  on hepha_review_verification_receipts (cycle_id);
create index if not exists idx_review_gate_decisions_scope
  on hepha_review_phase_gate_decisions (project_id, feature_id, phase_number, review_gate_id, gate_decision_id desc);

-- Append-only triggers (immutable tables)
create trigger if not exists trg_review_artifacts_no_update
  before update on hepha_review_artifacts begin select raise(abort, 'append-only: hepha_review_artifacts'); end;
create trigger if not exists trg_review_artifacts_no_delete
  before delete on hepha_review_artifacts begin select raise(abort, 'append-only: hepha_review_artifacts'); end;

create trigger if not exists trg_review_lineage_no_update
  before update on hepha_review_artifact_lineage begin select raise(abort, 'append-only: hepha_review_artifact_lineage'); end;
create trigger if not exists trg_review_lineage_no_delete
  before delete on hepha_review_artifact_lineage begin select raise(abort, 'append-only: hepha_review_artifact_lineage'); end;

create trigger if not exists trg_review_runs_no_update
  before update on hepha_review_runs begin select raise(abort, 'append-only: hepha_review_runs'); end;
create trigger if not exists trg_review_runs_no_delete
  before delete on hepha_review_runs begin select raise(abort, 'append-only: hepha_review_runs'); end;

create trigger if not exists trg_review_findings_no_update
  before update on hepha_review_findings begin select raise(abort, 'append-only: hepha_review_findings'); end;
create trigger if not exists trg_review_findings_no_delete
  before delete on hepha_review_findings begin select raise(abort, 'append-only: hepha_review_findings'); end;

create trigger if not exists trg_review_observations_no_update
  before update on hepha_review_finding_observations begin select raise(abort, 'append-only: hepha_review_finding_observations'); end;
create trigger if not exists trg_review_observations_no_delete
  before delete on hepha_review_finding_observations begin select raise(abort, 'append-only: hepha_review_finding_observations'); end;

create trigger if not exists trg_review_cycles_no_update
  before update on hepha_review_remediation_cycles begin select raise(abort, 'append-only: hepha_review_remediation_cycles'); end;
create trigger if not exists trg_review_cycles_no_delete
  before delete on hepha_review_remediation_cycles begin select raise(abort, 'append-only: hepha_review_remediation_cycles'); end;

create trigger if not exists trg_review_items_no_update
  before update on hepha_review_remediation_items begin select raise(abort, 'append-only: hepha_review_remediation_items'); end;
create trigger if not exists trg_review_items_no_delete
  before delete on hepha_review_remediation_items begin select raise(abort, 'append-only: hepha_review_remediation_items'); end;

create trigger if not exists trg_review_receipts_no_update
  before update on hepha_review_verification_receipts begin select raise(abort, 'append-only: hepha_review_verification_receipts'); end;
create trigger if not exists trg_review_receipts_no_delete
  before delete on hepha_review_verification_receipts begin select raise(abort, 'append-only: hepha_review_verification_receipts'); end;

create trigger if not exists trg_review_gates_no_update
  before update on hepha_review_phase_gate_decisions begin select raise(abort, 'append-only: hepha_review_phase_gate_decisions'); end;
create trigger if not exists trg_review_gates_no_delete
  before delete on hepha_review_phase_gate_decisions begin select raise(abort, 'append-only: hepha_review_phase_gate_decisions'); end;

create trigger if not exists trg_review_incidents_no_update
  before update on hepha_review_safe_incidents begin select raise(abort, 'append-only: hepha_review_safe_incidents'); end;
create trigger if not exists trg_review_incidents_no_delete
  before delete on hepha_review_safe_incidents begin select raise(abort, 'append-only: hepha_review_safe_incidents'); end;
`;
