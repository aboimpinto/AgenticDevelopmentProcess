import type { DatabaseSync } from "node:sqlite";

export class SqliteMetadataSchema {
  private ready = false;

  constructor(private readonly database: DatabaseSync) {}

  ensure() {
    if (this.ready) {
      return;
    }

    this.database.exec(
      `
      create table if not exists hepha_card_metadata (
        project_id text not null,
        card_key text not null,
        kind text not null check (kind in ('epic', 'feature')),
        external_id text not null,
        title text not null,
        state_folder text not null,
        source_document_path text,
        source_document_hash text,
        source_document_mtime text,
        source_document_size integer,
        last_hepha_deep_dive_at text,
        last_hepha_deep_dive_run_id text,
        last_hepha_deep_dive_source_hash text,
        last_hepha_deep_dive_semantic_source text,
        last_hepha_deep_dive_source_mtime text,
        ui_requirement_decision text check (ui_requirement_decision in ('requires_ui', 'no_ui')),
        ui_requirement_reason text,
        ui_requirement_source_hash text,
        ui_requirement_checked_at text,
        design_feature_completed_at text,
        refine_feature_completed_at text,
        user_code_review_completed_at text,
        manual_tests_completed_at text,
        workflow_command text check (workflow_command in ('deep-dive-epic', 'deep-dive-feature', 'design-feature', 'refine-feature', 'start-implementing', 'continue-implementing', 'complete-feature')),
        workflow_status text check (workflow_status in ('running', 'completed', 'failed', 'blocked', 'cancelled')),
        workflow_run_id text,
        workflow_started_at text,
        workflow_completed_at text,
        workflow_current_node_id text,
        workflow_current_step text,
        workflow_summary text,
        workflow_error text,
        workflow_recovery_attempt_count integer not null default 0,
        workflow_last_recovery_at text,
        created_at text not null,
        updated_at text not null,
        primary key (project_id, card_key)
      );

      create index if not exists hepha_card_metadata_project_external_idx
        on hepha_card_metadata (project_id, external_id);

      create index if not exists hepha_card_metadata_deep_dive_idx
        on hepha_card_metadata (project_id, kind, last_hepha_deep_dive_at);

      create table if not exists hepha_deep_dive_sessions (
        id text primary key,
        project_id text not null,
        card_key text not null,
        card_id text not null,
        card_external_id text not null,
        card_kind text not null check (card_kind in ('epic', 'feature')),
        card_title text not null,
        status text not null,
        agent_connection_status text not null,
        original_document_path text,
        original_document_hash text not null,
        original_document_mtime text,
        original_document text not null,
        questions text not null,
        created_at text not null,
        updated_at text not null,
        completed_at text
      );

      create index if not exists hepha_deep_dive_sessions_project_card_idx
        on hepha_deep_dive_sessions (project_id, card_key, status);

      create table if not exists hepha_implementation_phase_runs (
        project_id text not null,
        card_key text not null,
        workflow_run_id text not null,
        phase_number integer not null,
        phase_title text not null,
        status text not null check (status in (
          'pending',
          'planning',
          'implementing',
          'code_review',
          'checkpoint',
          'verifying',
          'completed',
          'blocked',
          'failed'
        )),
        current_step text,
        agent text,
        model text,
        summary text,
        report_path text,
        error text,
        started_at text,
        completed_at text,
        updated_at text not null,
        primary key (project_id, card_key, workflow_run_id, phase_number)
      );

      create index if not exists hepha_implementation_phase_runs_card_idx
        on hepha_implementation_phase_runs (project_id, card_key, workflow_run_id, phase_number);

      create table if not exists hepha_implementation_task_runs (
        project_id text not null,
        card_key text not null,
        phase_number integer not null,
        task_id text not null,
        task_index integer not null,
        task_title text not null,
        phase_title text not null,
        section text not null,
        status text not null check (status in ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED')),
        current_step text,
        summary text,
        error text,
        workflow_run_id text not null,
        source_line integer,
        started_at text,
        completed_at text,
        updated_at text not null,
        primary key (project_id, card_key, phase_number, task_id)
      );

      create index if not exists hepha_implementation_task_runs_phase_idx
        on hepha_implementation_task_runs (project_id, card_key, phase_number, task_index);

      create table if not exists hepha_implementation_agent_runs (
        id text primary key,
        project_id text not null,
        card_key text not null,
        workflow_run_id text not null,
        phase_number integer,
        phase_title text,
        agent_role text not null,
        agent_name text not null,
        model text not null,
        status text not null check (status in ('running', 'completed', 'failed', 'blocked')),
        current_step text,
        summary text,
        report_path text,
        error text,
        started_at text not null,
        completed_at text,
        updated_at text not null
      );

      create index if not exists hepha_implementation_agent_runs_workflow_idx
        on hepha_implementation_agent_runs (project_id, card_key, workflow_run_id, phase_number);

      create table if not exists hepha_feature_findings (
        id text primary key,
        project_id text not null,
        card_key text not null,
        status text not null check (status in ('open', 'agent_running', 'agent_response', 'closed')),
        title text not null,
        events text not null default '[]',
        agent_run_id text,
        current_step text,
        summary text,
        error text,
        created_at text not null,
        updated_at text not null,
        closed_at text
      );

      create index if not exists hepha_feature_findings_card_idx
        on hepha_feature_findings (project_id, card_key, status, created_at);

      create table if not exists hepha_approval_requests (
        id text primary key,
        project_id text not null,
        card_key text not null,
        workflow_run_id text,
        run_id text,
        action_summary text not null,
        policy_reason text not null,
        risk_category text not null,
        safe_command_summary text,
        matched_rule_id text not null,
        policy_decision_json text not null,
        status text not null check (status in ('pending', 'approved', 'denied', 'timed_out')),
        timeout_deadline text,
        requested_at text not null,
        resolved_at text,
        resolved_by text check (resolved_by in ('operator', 'timeout', 'system')),
        resolution_reason text,
        updated_at text not null
      );

      create index if not exists hepha_approval_requests_status_idx
        on hepha_approval_requests (project_id, status, requested_at);

      create index if not exists hepha_approval_requests_card_idx
        on hepha_approval_requests (project_id, card_key, status);

      create index if not exists hepha_approval_requests_timeout_idx
        on hepha_approval_requests (status, timeout_deadline);

      -- Agent invocation timeline
      create table if not exists hepha_agent_invocations (
        id text primary key,
        project_id text not null,
        card_key text,
        workflow_run_id text,
        workflow_command text,
        workflow_node_id text,
        phase_number integer,
        phase_title text,
        agent_role text,
        agent_name text,
        model text,
        provider text,
        status text not null check (status in ('running', 'completed', 'failed', 'timed_out')),
        exit_code integer,
        error_message text,
        timeout_marker integer not null default 0,
        parent_invocation_id text references hepha_agent_invocations(id),
        log_path text,
        receipt_path text,
        review_report_path text,
        raw_ref_json text,
        started_at text not null,
        completed_at text,
        duration_ms integer,
        created_at text not null,
        updated_at text not null
      );

      create index if not exists hepha_agent_invocations_project_idx
        on hepha_agent_invocations (project_id, card_key, workflow_run_id);

      create index if not exists hepha_agent_invocations_phase_idx
        on hepha_agent_invocations (project_id, card_key, phase_number);

      create index if not exists hepha_agent_invocations_agent_idx
        on hepha_agent_invocations (project_id, agent_role, agent_name);

      create index if not exists hepha_agent_invocations_model_idx
        on hepha_agent_invocations (project_id, model);

      create index if not exists hepha_agent_invocations_timestamp_idx
        on hepha_agent_invocations (started_at);

      create index if not exists hepha_agent_invocations_parent_idx
        on hepha_agent_invocations (parent_invocation_id);

      -- Normalized lifecycle events
      create table if not exists hepha_normalized_events (
        id text primary key,
        invocation_id text,
        project_id text not null,
        card_key text,
        workflow_run_id text,
        event_type text not null check (event_type in ('agent.started', 'agent.finished', 'agent.failed', 'agent.timeout')),
        timestamp text not null,
        workflow_command text,
        workflow_node text,
        phase text,
        agent_role text,
        model text,
        pid integer,
        log_path text,
        receipt_path text,
        raw_ref_json text,
        error_message text,
        exit_code integer,
        metadata_json text,
        created_at text not null
      );

      create index if not exists hepha_normalized_events_invocation_idx
        on hepha_normalized_events (invocation_id);

      create index if not exists hepha_normalized_events_project_idx
        on hepha_normalized_events (project_id, card_key, workflow_run_id);

      create index if not exists hepha_normalized_events_type_idx
        on hepha_normalized_events (project_id, event_type, timestamp);

      create index if not exists hepha_normalized_events_timestamp_idx
        on hepha_normalized_events (project_id, timestamp);

      -- Phase lifecycle live activity events
      create table if not exists hepha_phase_lifecycle_events (
        id text primary key,
        project_id text not null,
        category text not null,
        event_type text not null,
        occurred_at text not null,
        card_id text,
        run_id text,
        phase_number integer,
        phase_title text,
        phase_status text,
        summary text not null,
        metadata text,
        created_at text not null default (datetime('now'))
      );

      create index if not exists hepha_phase_lifecycle_events_replay_idx
        on hepha_phase_lifecycle_events (project_id, occurred_at, id);

      create index if not exists hepha_phase_lifecycle_events_card_idx
        on hepha_phase_lifecycle_events (project_id, card_id, occurred_at);

      create index if not exists hepha_phase_lifecycle_events_run_idx
        on hepha_phase_lifecycle_events (project_id, run_id);

      -- Start transition metadata
      create table if not exists hepha_start_transitions (
        card_key text not null,
        project_id text not null,
        run_id text not null,
        delivery_policy text not null check (delivery_policy in ('direct_merge', 'pull_request')),
        base_branch text not null,
        implementation_branch text,
        worktree_path text,
        repo_root text not null,
        start_commit text not null,
        transition_status text not null check (transition_status in (
          'prerequisites_ready',
          'prerequisites_blocked',
          'branch_preparing',
          'branch_ready',
          'folder_moving',
          'transition_completed',
          'transition_failed',
          'rollback_needed',
          'rolled_back'
        )),
        transition_step text not null default 'pending',
        failure_reason text,
        rolled_back integer not null default 0,
        started_at text not null,
        completed_at text,
        primary key (project_id, card_key, run_id)
      );

      create index if not exists hepha_start_transitions_card_idx
        on hepha_start_transitions (project_id, card_key, transition_status);

      create table if not exists hepha_start_transition_exceptions (
        card_key text not null,
        project_id text not null,
        run_id text not null,
        failed_at_step text not null,
        failure_reason text not null,
        rolled_back integer not null default 0,
        effective_state_after text not null,
        cleaned_at text not null,
        primary key (project_id, card_key, run_id)
      );

      create table if not exists hepha_delivery_metadata (
        project_id text not null,
        card_key text not null,
        delivery_mode text not null default 'direct_merge' check (delivery_mode in ('direct_merge', 'pull_request')),
        target_branch text not null default 'master',
        github_issue integer,
        issue_role text not null default 'feature_issue' check (issue_role in ('feature_issue', 'tracking', 'epic')),
        issue_update_mode text not null default 'pr_body' check (issue_update_mode in ('pr_body', 'checklist', 'comment')),
        pull_request integer,
        delivery_status text not null default 'not_applicable' check (delivery_status in ('not_applicable', 'blocked', 'ready', 'preparing', 'open', 'error')),
        delivery_error text,
        created_at text not null,
        updated_at text not null,
        primary key (project_id, card_key)
      );
      `,
    );

    this.ensureColumns("hepha_card_metadata", [
      ["last_hepha_deep_dive_semantic_source", "text"],
      ["ui_requirement_decision", "text check (ui_requirement_decision in ('requires_ui', 'no_ui'))"],
      ["ui_requirement_reason", "text"],
      ["ui_requirement_source_hash", "text"],
      ["ui_requirement_checked_at", "text"],
      ["design_feature_completed_at", "text"],
      ["refine_feature_completed_at", "text"],
      ["user_code_review_completed_at", "text"],
      ["manual_tests_completed_at", "text"],
      ["workflow_command", "text"],
      ["workflow_status", "text check (workflow_status in ('running', 'completed', 'failed', 'blocked', 'cancelled'))"],
      ["workflow_run_id", "text"],
      ["workflow_started_at", "text"],
      ["workflow_completed_at", "text"],
      ["workflow_current_node_id", "text"],
      ["workflow_current_step", "text"],
      ["workflow_summary", "text"],
      ["workflow_error", "text"],
      ["workflow_recovery_attempt_count", "integer not null default 0"],
      ["workflow_last_recovery_at", "text"],
    ]);
    this.ensureColumns("hepha_implementation_agent_runs", [
      ["invocation_id", "text"],
    ]);
    this.ensureCardMetadataWorkflowConstraints();
    this.ensureCardMetadataIndexes();

    // Code-review finding ledger schema
    this.database.exec(
      `
      create table if not exists hepha_review_finding_ledger (
        id text primary key,
        project_id text not null,
        card_key text not null,
        phase_number integer not null,
        phase_title text not null,
        workflow_run_id text,
        review_report_path text,
        agent_invocation_id text,
        timeline_entry_id text,
        finding_index integer not null,
        finding_summary text not null,
        finding_text text,
        affected_area text,
        severity text,
        fingerprint text not null,
        decision_classification text,
        resolution_state text not null default 'unresolved',
        decision_rationale text,
        superseded_by text,
        created_at text not null,
        updated_at text not null,
        resolved_at text
      );

      create index if not exists hepha_review_finding_ledger_card_idx
        on hepha_review_finding_ledger (project_id, card_key, phase_number, finding_index);

      create index if not exists hepha_review_finding_ledger_fingerprint_idx
        on hepha_review_finding_ledger (project_id, card_key, fingerprint);

      create index if not exists hepha_review_finding_ledger_report_idx
        on hepha_review_finding_ledger (review_report_path);

      create index if not exists hepha_review_finding_ledger_invocation_idx
        on hepha_review_finding_ledger (agent_invocation_id);

      create table if not exists hepha_review_finding_decisions (
        id text primary key,
        finding_ledger_id text not null,
        project_id text not null,
        card_key text not null,
        classification text not null,
        rationale text,
        decided_by text,
        workflow_run_id text,
        created_at text not null,
        superseded_at text
      );

      create index if not exists hepha_review_finding_decisions_ledger_idx
        on hepha_review_finding_decisions (finding_ledger_id, created_at);

      create table if not exists hepha_review_repair_attempts (
        id text primary key,
        project_id text not null,
        card_key text not null,
        phase_number integer not null,
        repair_generated_at text,
        repair_context_text text,
        repair_workflow_run_id text,
        rerun_review_report_path text,
        rerun_result text,
        unresolved_before_count integer not null default 0,
        unresolved_after_count integer not null default 0,
        escalated integer not null default 0,
        escalation_reason text,
        created_at text not null,
        completed_at text
      );

      create index if not exists hepha_review_repair_attempts_card_idx
        on hepha_review_repair_attempts (project_id, card_key, phase_number, created_at);

      create table if not exists hepha_review_fingerprint_decisions (
        id text primary key,
        project_id text not null,
        card_key text not null,
        phase_number integer not null,
        review_gate_id text not null,
        decision_classification text not null,
        should_continue integer not null default 1,
        unresolved_fingerprints_json text not null,
        prior_same_gate_fingerprints_json text,
        same_fingerprint_repeat_count integer not null default 0,
        absolute_recovery_attempt_count integer not null default 0,
        current_unresolved_count integer not null default 0,
        prior_unresolved_count integer not null default 0,
        added_fingerprint_count integer not null default 0,
        removed_fingerprint_count integer not null default 0,
        unchanged_fingerprint_count integer not null default 0,
        reason_text text not null,
        latest_report_path text,
        created_at text not null
      );

      create index if not exists hepha_review_fingerprint_decisions_card_idx
        on hepha_review_fingerprint_decisions (project_id, card_key, phase_number, review_gate_id, created_at);

      -- Final verification runner evidence
      create table if not exists hepha_final_verification_runs (
        id text primary key,
        project_id text not null,
        card_key text not null,
        workflow_run_id text not null,
        execution_root text not null,
        aggregate_status text not null,
        blocked_reason text,
        persistence_warning text,
        duration integer not null,
        started_at text not null,
        completed_at text not null
      );

      create index if not exists hepha_final_verification_runs_card_idx
        on hepha_final_verification_runs (project_id, card_key, started_at);

      create table if not exists hepha_final_verification_checks (
        id text primary key,
        run_id text not null,
        project_id text not null,
        card_key text not null,
        check_id text not null,
        intent text not null,
        description text not null,
        command text not null,
        working_directory text not null,
        outcome text not null,
        duration integer not null,
        exit_code integer,
        started_at text not null,
        output_summary text not null,
        required_check integer not null,
        foreign key (run_id) references hepha_final_verification_runs(id)
      );

      create index if not exists hepha_final_verification_checks_run_idx
        on hepha_final_verification_checks (run_id, started_at);

      -- Manual Test Verification Pack
      create table if not exists hepha_manual_test_packs (
        id text primary key,
        project_id text not null,
        card_key text not null,
        version text not null,
        state text not null check (state in ('current', 'stale', 'render_failed')),
        manifest_hash text not null,
        markdown_path text not null,
        pdf_path text,
        render_error text,
        created_at text not null,
        superseded_at text
      );

      create index if not exists hepha_manual_test_packs_card_idx
        on hepha_manual_test_packs (project_id, card_key, state, created_at);

      create table if not exists hepha_manual_test_reviews (
        id text primary key,
        project_id text not null,
        card_key text not null,
        pack_id text not null,
        reviewed_at text not null,
        state text not null check (state in ('current', 'invalidated')),
        invalidated_at text,
        invalidated_reason text
      );

      create index if not exists hepha_manual_test_reviews_card_idx
        on hepha_manual_test_reviews (project_id, card_key, pack_id, state);

      create table if not exists hepha_manual_test_results (
        id text primary key,
        project_id text not null,
        card_key text not null,
        pack_id text not null,
        review_id text not null,
        test_id text not null,
        result text not null check (result in ('pass', 'fail')),
        actual_result text,
        notes text,
        finding_id text,
        recorded_at text not null
      );

      create index if not exists hepha_manual_test_results_pack_idx
        on hepha_manual_test_results (project_id, card_key, pack_id, recorded_at);

      create index if not exists hepha_manual_test_results_finding_idx
        on hepha_manual_test_results (project_id, finding_id);
      `,
    );

    this.ready = true;
  }

  private ensureCardMetadataWorkflowConstraints() {
    const row = this.get<{ sql: string | null }>(
      "select sql from sqlite_schema where type = 'table' and name = 'hepha_card_metadata'",
    );
    const sql = row?.sql ?? "";
    const hasWorkflowCommandCheck = /workflow_command\s+text\s+check/i.test(sql);
    const hasWorkflowStatusCheck = /workflow_status\s+text\s+check/i.test(sql);
    const commandCheckIsCurrent = !hasWorkflowCommandCheck || sql.includes("'deep-dive-epic'");
    const statusCheckIsCurrent = !hasWorkflowStatusCheck || (sql.includes("'blocked'") && sql.includes("'cancelled'"));

    if (commandCheckIsCurrent && statusCheckIsCurrent) {
      return;
    }

    this.database.exec("begin immediate");

    try {
      this.database.exec(
        `
        drop index if exists hepha_card_metadata_project_external_idx;
        drop index if exists hepha_card_metadata_deep_dive_idx;

        alter table hepha_card_metadata rename to hepha_card_metadata_old_workflow_constraints;

        create table hepha_card_metadata (
          project_id text not null,
          card_key text not null,
          kind text not null check (kind in ('epic', 'feature')),
          external_id text not null,
          title text not null,
          state_folder text not null,
          source_document_path text,
          source_document_hash text,
          source_document_mtime text,
          source_document_size integer,
          last_hepha_deep_dive_at text,
          last_hepha_deep_dive_run_id text,
          last_hepha_deep_dive_source_hash text,
          last_hepha_deep_dive_semantic_source text,
          last_hepha_deep_dive_source_mtime text,
          ui_requirement_decision text check (ui_requirement_decision in ('requires_ui', 'no_ui')),
          ui_requirement_reason text,
          ui_requirement_source_hash text,
          ui_requirement_checked_at text,
          design_feature_completed_at text,
          refine_feature_completed_at text,
          user_code_review_completed_at text,
          manual_tests_completed_at text,
          workflow_command text check (workflow_command in ('deep-dive-epic', 'deep-dive-feature', 'design-feature', 'refine-feature', 'start-implementing', 'continue-implementing', 'complete-feature')),
          workflow_status text check (workflow_status in ('running', 'completed', 'failed', 'blocked', 'cancelled')),
          workflow_run_id text,
          workflow_started_at text,
          workflow_completed_at text,
          workflow_current_node_id text,
          workflow_current_step text,
          workflow_summary text,
          workflow_error text,
          workflow_recovery_attempt_count integer not null default 0,
          workflow_last_recovery_at text,
          created_at text not null,
          updated_at text not null,
          primary key (project_id, card_key)
        );

        insert into hepha_card_metadata (
          project_id,
          card_key,
          kind,
          external_id,
          title,
          state_folder,
          source_document_path,
          source_document_hash,
          source_document_mtime,
          source_document_size,
          last_hepha_deep_dive_at,
          last_hepha_deep_dive_run_id,
          last_hepha_deep_dive_source_hash,
          last_hepha_deep_dive_semantic_source,
          last_hepha_deep_dive_source_mtime,
          ui_requirement_decision,
          ui_requirement_reason,
          ui_requirement_source_hash,
          ui_requirement_checked_at,
          design_feature_completed_at,
          refine_feature_completed_at,
          user_code_review_completed_at,
          manual_tests_completed_at,
          workflow_command,
          workflow_status,
          workflow_run_id,
          workflow_started_at,
          workflow_completed_at,
          workflow_current_node_id,
          workflow_current_step,
          workflow_summary,
          workflow_error,
          workflow_recovery_attempt_count,
          workflow_last_recovery_at,
          created_at,
          updated_at
        )
        select
          project_id,
          card_key,
          kind,
          external_id,
          title,
          state_folder,
          source_document_path,
          source_document_hash,
          source_document_mtime,
          source_document_size,
          last_hepha_deep_dive_at,
          last_hepha_deep_dive_run_id,
          last_hepha_deep_dive_source_hash,
          last_hepha_deep_dive_semantic_source,
          last_hepha_deep_dive_source_mtime,
          ui_requirement_decision,
          ui_requirement_reason,
          ui_requirement_source_hash,
          ui_requirement_checked_at,
          design_feature_completed_at,
          refine_feature_completed_at,
          user_code_review_completed_at,
          manual_tests_completed_at,
          workflow_command,
          workflow_status,
          workflow_run_id,
          workflow_started_at,
          workflow_completed_at,
          workflow_current_node_id,
          workflow_current_step,
          workflow_summary,
          workflow_error,
          workflow_recovery_attempt_count,
          workflow_last_recovery_at,
          created_at,
          updated_at
        from hepha_card_metadata_old_workflow_constraints;

        drop table hepha_card_metadata_old_workflow_constraints;
        `,
      );
      this.database.exec("commit");
    } catch (error) {
      this.database.exec("rollback");
      throw error;
    }
  }

  private ensureCardMetadataIndexes() {
    this.database.exec(
      `
      create index if not exists hepha_card_metadata_project_external_idx
        on hepha_card_metadata (project_id, external_id);

      create index if not exists hepha_card_metadata_deep_dive_idx
        on hepha_card_metadata (project_id, kind, last_hepha_deep_dive_at);
      `,
    );
  }

  private ensureColumns(tableName: string, columns: Array<[string, string]>) {
    const existingColumns = new Set(
      this.all<{ name: string }>(`pragma table_info(${tableName})`).map((column) => column.name),
    );

    for (const [columnName, definition] of columns) {
      if (!existingColumns.has(columnName)) {
        this.database.exec(`alter table ${tableName} add column ${columnName} ${definition};`);
      }
    }
  }

  private get<T>(sql: string) {
    return (this.database.prepare(sql).get() as T | undefined) ?? null;
  }

  private all<T>(sql: string) {
    return this.database.prepare(sql).all() as T[];
  }
}

