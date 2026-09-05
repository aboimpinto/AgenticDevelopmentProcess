/** Additive exact-scope defect-class and replan governance evidence schema. */
export const REVIEW_GOVERNANCE_MIGRATION_V3_SQL = `
create table if not exists hepha_review_defect_class_observations (
  observation_event_id text primary key,
  aggregate_id text not null,
  project_id text not null, feature_id text not null, phase_number integer not null, review_gate_id text not null, defect_class text not null,
  observation_kind text not null check (observation_kind in ('POST_FIX_MANIFESTATION', 'SCOPE_EXPANSION_ACCEPTED', 'FINDING_EXHAUSTIVENESS')),
  trigger_manifest_hash text not null references hepha_review_artifacts(content_hash),
  basis_manifest_hash text not null references hepha_review_artifacts(content_hash),
  finding_observation_id text references hepha_review_finding_observations(observation_id),
  remediation_cycle_id text references hepha_review_remediation_cycles(cycle_id),
  decision_id text,
  created_at text not null,
  unique(project_id, feature_id, phase_number, review_gate_id, defect_class, observation_kind, trigger_manifest_hash),
  unique(finding_observation_id, decision_id)
);
create table if not exists hepha_review_replan_requests (
  request_id text primary key, aggregate_id text not null,
  project_id text not null, feature_id text not null, phase_number integer not null, review_gate_id text not null, defect_class text not null,
  trigger_event_id text not null references hepha_review_defect_class_observations(observation_event_id),
  plan_hash text not null references hepha_review_artifacts(content_hash), plan_version integer not null check (plan_version > 0),
  proposal_author_actor text not null, producer_invocation_id text not null,
  policy_id text not null check (policy_id = 'replan-governance-v1'), policy_version integer not null check (policy_version = 1),
  eligible_roles_json text not null default '["ARCHITECTURE_STEWARD"]' check (eligible_roles_json = '["ARCHITECTURE_STEWARD"]'),
  requested_at text not null,
  unique(project_id, feature_id, phase_number, review_gate_id, defect_class, aggregate_id, plan_version), unique(project_id, feature_id, phase_number, review_gate_id, defect_class, aggregate_id, plan_hash)
);
create table if not exists hepha_review_scope_expansion_decisions (
  decision_id text primary key, aggregate_id text not null,
  project_id text not null, feature_id text not null, phase_number integer not null, review_gate_id text not null, defect_class text not null,
  finding_observation_id text not null references hepha_review_finding_observations(observation_id),
  outcome text not null check (outcome in ('ACCEPT', 'REJECT')), actor_id text not null,
  authorized_role text not null check (authorized_role = 'FEATURE_OWNER'),
  policy_id text not null check (policy_id = 'replan-governance-v1'), policy_version integer not null check (policy_version = 1),
  reason text not null, expected_version integer not null check (expected_version >= 0), resulting_version integer not null check (resulting_version = expected_version + 1), decided_at text not null,
  unique(finding_observation_id)
);
create table if not exists hepha_review_replan_decisions (
  decision_id text primary key, request_id text not null references hepha_review_replan_requests(request_id),
  aggregate_id text not null, project_id text not null, feature_id text not null, phase_number integer not null, review_gate_id text not null, defect_class text not null,
  plan_hash text not null references hepha_review_artifacts(content_hash), plan_version integer not null check (plan_version > 0),
  outcome text not null check (outcome in ('APPROVE', 'REJECT')), actor_id text not null,
  authorized_role text not null check (authorized_role = 'ARCHITECTURE_STEWARD'),
  policy_id text not null check (policy_id = 'replan-governance-v1'), policy_version integer not null check (policy_version = 1),
  reason text not null, expected_version integer not null check (expected_version >= 0), resulting_version integer not null check (resulting_version = expected_version + 1), decided_at text not null,
  unique(request_id, plan_version)
);
create table if not exists hepha_review_replan_transition_events (
  transition_id text primary key, aggregate_id text not null,
  project_id text not null, feature_id text not null, phase_number integer not null, review_gate_id text not null, defect_class text not null,
  from_state text not null check (from_state in ('NORMAL_REMEDIATION', 'REMEDIATION_REPLAN_REQUIRED', 'REPLAN_PENDING_APPROVAL', 'REPLAN_APPROVED', 'REPLAN_REJECTED', 'BOUNDED_REMEDIATION_DISPATCHED', 'REVIEW_PENDING')),
  to_state text not null check (to_state in ('NORMAL_REMEDIATION', 'REMEDIATION_REPLAN_REQUIRED', 'REPLAN_PENDING_APPROVAL', 'REPLAN_APPROVED', 'REPLAN_REJECTED', 'BOUNDED_REMEDIATION_DISPATCHED', 'REVIEW_PENDING')),
  reason_code text not null, trigger_record_id text not null, trigger_hash text references hepha_review_artifacts(content_hash),
  expected_version integer not null check (expected_version >= 0), resulting_version integer not null check (resulting_version = expected_version + 1), transitioned_at text not null,
  unique(project_id, feature_id, phase_number, review_gate_id, defect_class, aggregate_id, resulting_version)
);
create table if not exists hepha_review_replan_dispatch_attempts (
  attempt_event_id text primary key, dispatch_id text not null, aggregate_id text not null,
  project_id text not null, feature_id text not null, phase_number integer not null, review_gate_id text not null, defect_class text not null,
  request_id text not null references hepha_review_replan_requests(request_id), plan_hash text not null references hepha_review_artifacts(content_hash), plan_version integer not null check (plan_version > 0),
  approval_decision_id text not null references hepha_review_replan_decisions(decision_id), approval_event_version integer not null check (approval_event_version >= 0),
  outcome text not null check (outcome in ('STARTED', 'START_FAILED')), reason_code text, workflow_run_id text not null, attempted_at text not null,
  unique(dispatch_id, outcome), unique(project_id, feature_id, phase_number, review_gate_id, defect_class, aggregate_id, request_id, plan_version, outcome)
);
create table if not exists hepha_review_replan_review_assessments (
  assessment_id text primary key, aggregate_id text not null,
  project_id text not null, feature_id text not null, phase_number integer not null, review_gate_id text not null, defect_class text not null,
  dispatch_id text not null, review_manifest_hash text not null references hepha_review_artifacts(content_hash),
  review_run_id text not null references hepha_review_runs(review_run_id), plan_hash text not null references hepha_review_artifacts(content_hash), plan_version integer not null check (plan_version > 0), outcome text not null, assessed_surface_ids_json text not null, assessed_remediation_item_ids_json text not null, assessed_test_ids_json text not null, created_at text not null,
  unique(dispatch_id, review_manifest_hash)
);
create index if not exists idx_review_replan_observation_scope on hepha_review_defect_class_observations (project_id, feature_id, phase_number, review_gate_id, defect_class, created_at);
create index if not exists idx_review_replan_request_scope on hepha_review_replan_requests (project_id, feature_id, phase_number, review_gate_id, defect_class, plan_version);
create index if not exists idx_review_scope_expansion_decision_scope on hepha_review_scope_expansion_decisions (project_id, feature_id, phase_number, review_gate_id, defect_class, resulting_version);
create index if not exists idx_review_replan_transition_scope on hepha_review_replan_transition_events (project_id, feature_id, phase_number, review_gate_id, defect_class, resulting_version);
create index if not exists idx_review_replan_dispatch_scope on hepha_review_replan_dispatch_attempts (project_id, feature_id, phase_number, review_gate_id, defect_class, attempted_at);
create trigger if not exists trg_replan_observations_no_update before update on hepha_review_defect_class_observations begin select raise(abort, 'append-only: hepha_review_defect_class_observations'); end;
create trigger if not exists trg_replan_observations_no_delete before delete on hepha_review_defect_class_observations begin select raise(abort, 'append-only: hepha_review_defect_class_observations'); end;
create trigger if not exists trg_replan_requests_no_update before update on hepha_review_replan_requests begin select raise(abort, 'append-only: hepha_review_replan_requests'); end;
create trigger if not exists trg_replan_requests_no_delete before delete on hepha_review_replan_requests begin select raise(abort, 'append-only: hepha_review_replan_requests'); end;
create trigger if not exists trg_scope_expansion_decisions_no_update before update on hepha_review_scope_expansion_decisions begin select raise(abort, 'append-only: hepha_review_scope_expansion_decisions'); end;
create trigger if not exists trg_scope_expansion_decisions_no_delete before delete on hepha_review_scope_expansion_decisions begin select raise(abort, 'append-only: hepha_review_scope_expansion_decisions'); end;
create trigger if not exists trg_replan_decisions_no_update before update on hepha_review_replan_decisions begin select raise(abort, 'append-only: hepha_review_replan_decisions'); end;
create trigger if not exists trg_replan_decisions_no_delete before delete on hepha_review_replan_decisions begin select raise(abort, 'append-only: hepha_review_replan_decisions'); end;
create trigger if not exists trg_replan_transitions_no_update before update on hepha_review_replan_transition_events begin select raise(abort, 'append-only: hepha_review_replan_transition_events'); end;
create trigger if not exists trg_replan_transitions_no_delete before delete on hepha_review_replan_transition_events begin select raise(abort, 'append-only: hepha_review_replan_transition_events'); end;
create trigger if not exists trg_replan_dispatch_no_update before update on hepha_review_replan_dispatch_attempts begin select raise(abort, 'append-only: hepha_review_replan_dispatch_attempts'); end;
create trigger if not exists trg_replan_dispatch_no_delete before delete on hepha_review_replan_dispatch_attempts begin select raise(abort, 'append-only: hepha_review_replan_dispatch_attempts'); end;
create trigger if not exists trg_replan_assessments_no_update before update on hepha_review_replan_review_assessments begin select raise(abort, 'append-only: hepha_review_replan_review_assessments'); end;
create trigger if not exists trg_replan_assessments_no_delete before delete on hepha_review_replan_review_assessments begin select raise(abort, 'append-only: hepha_review_replan_review_assessments'); end;
`;
