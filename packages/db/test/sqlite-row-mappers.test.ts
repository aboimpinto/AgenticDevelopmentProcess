import { describe, expect, it } from "vitest";
import { mapApprovalRequestRow } from "../src/sqlite/row-mappers/approval-row-mapper.js";
import { mapDeepDiveSessionRow, mapStoredMetadataRow } from "../src/sqlite/row-mappers/card-row-mappers.js";
import { mapStartTransitionRow } from "../src/sqlite/row-mappers/delivery-row-mapper.js";
import { mapManualTestResultRow, mapManualTestVerificationPackRow, mapManualTestVerificationReviewRow } from "../src/sqlite/row-mappers/manual-test-row-mappers.js";
import { mapFinalVerificationCheckRow, mapFinalVerificationRunRow, mapReviewFindingDecisionRow, mapReviewFindingLedgerRow, mapReviewFingerprintDecisionRow, mapReviewRepairAttemptRow } from "../src/sqlite/row-mappers/review-row-mappers.js";
import { mapAgentInvocationRow, mapNormalizedEventRow, mapPhaseLifecycleEventRow } from "../src/sqlite/row-mappers/telemetry-row-mappers.js";
import { mapFeatureFindingRow, mapImplementationAgentRunRow, mapImplementationPhaseRunRow, mapImplementationTaskRunRow, normalizeFeatureFindingEvents } from "../src/sqlite/row-mappers/workflow-row-mappers.js";
import { normalizeJsonArray, toIsoString } from "../src/sqlite/value-normalizers.js";

const timestamp = "2026-01-01T00:00:00.000Z";

describe("SQLite row mappers", () => {
  it("normalizes JSON arrays and nullable timestamps", () => {
    expect(normalizeJsonArray('[{"id":"one"}]')).toEqual([{ id: "one" }]);
    expect(normalizeJsonArray("invalid")).toEqual([]);
    expect(normalizeJsonArray({})).toEqual([]);
    expect(toIsoString(timestamp)).toBe(timestamp);
    expect(toIsoString(null)).toBeNull();
  });

  it("maps card and deep-dive rows", () => {
    const deepDive = mapDeepDiveSessionRow({ agent_connection_status: "finished", card_external_id: "ITEM", card_id: "card", card_key: "card", card_kind: "feature", card_title: "Title", completed_at: timestamp, created_at: timestamp, id: "session", original_document: "source", original_document_hash: "hash", original_document_mtime: timestamp, original_document_path: "/doc", project_id: "project", questions: "[]", status: "completed", updated_at: timestamp });
    const metadata = mapStoredMetadataRow({ card_key: "card", design_feature_completed_at: null, last_hepha_deep_dive_at: timestamp, last_hepha_deep_dive_run_id: "run", last_hepha_deep_dive_source_hash: "hash", last_hepha_deep_dive_semantic_source: "source", last_hepha_deep_dive_source_mtime: timestamp, manual_tests_completed_at: null, refine_feature_completed_at: null, ui_requirement_checked_at: null, ui_requirement_decision: null, ui_requirement_reason: null, ui_requirement_source_hash: null, user_code_review_completed_at: null, workflow_command: "continue-implementing", workflow_completed_at: null, workflow_current_node_id: "node", workflow_current_step: "step", workflow_error: null, workflow_run_id: "run", workflow_started_at: timestamp, workflow_status: "running", workflow_summary: null, workflow_recovery_attempt_count: null, workflow_last_recovery_at: null });
    expect(deepDive.questions).toEqual([]);
    expect(metadata.workflowRecoveryAttemptCount).toBe(0);
  });

  it("maps approval and workflow rows", () => {
    const approval = mapApprovalRequestRow({ id: "approval", project_id: "project", card_key: "card", workflow_run_id: "workflow", run_id: "run", action_summary: "action", policy_reason: "reason", risk_category: "risk", safe_command_summary: null, matched_rule_id: "rule", policy_decision_json: "{}", status: "approved", timeout_deadline: null, requested_at: timestamp, resolved_at: timestamp, resolved_by: "actor", resolution_reason: "accepted", updated_at: timestamp });
    const finding = mapFeatureFindingRow({ agent_run_id: null, card_key: "card", closed_at: null, created_at: timestamp, current_step: null, error: null, events: JSON.stringify([{ id: "event", content: "text", createdAt: timestamp, kind: "finding", role: "user" }, { invalid: true }]), id: "finding", project_id: "project", status: "open", summary: null, title: "Finding", updated_at: timestamp });
    const phase = mapImplementationPhaseRunRow({ agent: null, card_key: "card", completed_at: null, current_step: "implement", error: null, model: "model", phase_number: 1, phase_title: "Title", project_id: "project", report_path: null, started_at: timestamp, status: "implementing", summary: null, updated_at: timestamp, workflow_run_id: "workflow" });
    const agent = mapImplementationAgentRunRow({ agent_name: "agent", agent_role: "implementation", card_key: "card", completed_at: timestamp, current_step: null, error: null, id: "agent-run", model: "model", phase_number: 1, phase_title: "Title", project_id: "project", report_path: null, started_at: timestamp, status: "completed", summary: null, updated_at: timestamp, workflow_run_id: "workflow" });
    const task = mapImplementationTaskRunRow({ card_key: "card", completed_at: timestamp, current_step: null, error: null, phase_number: 1, phase_title: "Title", project_id: "project", section: "Tasks", source_line: 10, started_at: timestamp, status: "COMPLETED", summary: null, task_id: "task", task_index: 0, task_title: "Task", updated_at: timestamp, workflow_run_id: "workflow" });
    expect(approval.status).toBe("approved");
    expect(finding.events).toHaveLength(1);
    expect(normalizeFeatureFindingEvents("invalid")).toEqual([]);
    expect([phase.status, agent.status, task.status]).toEqual(["implementing", "completed", "COMPLETED"]);
  });

  it("maps invocation and lifecycle telemetry rows", () => {
    const invocation = mapAgentInvocationRow({ id: "invocation", project_id: "project", card_key: "card", workflow_run_id: "workflow", workflow_command: "continue", workflow_node_id: "node", phase_number: 1, phase_title: "Title", agent_role: "implementation", agent_name: "agent", model: "model", provider: "provider", status: "completed", exit_code: 0, error_message: null, timeout_marker: 0, parent_invocation_id: null, log_path: null, receipt_path: null, review_report_path: null, raw_ref_json: null, started_at: timestamp, completed_at: timestamp, duration_ms: 1, created_at: timestamp, updated_at: timestamp });
    const event = mapNormalizedEventRow({ id: "event", invocation_id: "invocation", project_id: "project", card_key: "card", workflow_run_id: "workflow", event_type: "agent.finished", timestamp, workflow_command: "continue", workflow_node: "node", phase: "1", agent_role: "implementation", model: "model", pid: 1, log_path: null, receipt_path: null, raw_ref_json: null, error_message: null, exit_code: 0, metadata_json: null, created_at: timestamp });
    const lifecycle = mapPhaseLifecycleEventRow({ id: "lifecycle", project_id: "project", category: "phase", event_type: "completed", occurred_at: timestamp, card_id: "card", run_id: "run", phase_number: 1, phase_title: "Title", phase_status: "completed", summary: "done", metadata: null, created_at: timestamp });
    expect(invocation.timeoutMarker).toBe(false);
    expect(event.eventType).toBe("agent.finished");
    expect(lifecycle.phaseStatus).toBe("completed");
  });

  it("maps start-transition rows", () => {
    const result = mapStartTransitionRow({ card_key: "card", project_id: "project", run_id: "run", delivery_policy: "pull_request", base_branch: "master", implementation_branch: "work/item", worktree_path: null, repo_root: "/repo", start_commit: "hash", transition_status: "transition_completed", transition_step: "complete", failure_reason: null, rolled_back: 0, started_at: timestamp, completed_at: timestamp });
    expect(result.rolledBack).toBe(false);
    expect(result.implementationBranch).toBe("work/item");
  });

  it("maps review and final-verification rows", () => {
    const ledger = mapReviewFindingLedgerRow({ id: "ledger", project_id: "project", card_key: "card", phase_number: 1, phase_title: "Title", workflow_run_id: "workflow", review_report_path: null, agent_invocation_id: null, timeline_entry_id: null, finding_index: 0, finding_summary: "summary", finding_text: null, affected_area: null, severity: "required", fingerprint: "fingerprint", decision_classification: null, resolution_state: "open", decision_rationale: null, superseded_by: null, created_at: timestamp, updated_at: timestamp, resolved_at: null });
    const decision = mapReviewFindingDecisionRow({ id: "decision", finding_ledger_id: "ledger", project_id: "project", card_key: "card", classification: "fix", rationale: null, decided_by: null, workflow_run_id: null, created_at: timestamp, superseded_at: null });
    const repair = mapReviewRepairAttemptRow({ id: "repair", project_id: "project", card_key: "card", phase_number: 1, repair_generated_at: timestamp, repair_context_text: null, repair_workflow_run_id: null, rerun_review_report_path: null, rerun_result: null, unresolved_before_count: 1, unresolved_after_count: 0, escalated: 0, escalation_reason: null, created_at: timestamp, completed_at: timestamp });
    const fingerprint = mapReviewFingerprintDecisionRow({ id: "fingerprint", project_id: "project", card_key: "card", phase_number: 1, review_gate_id: "review", decision_classification: "continue", should_continue: 1, unresolved_fingerprints_json: "[]", prior_same_gate_fingerprints_json: null, same_fingerprint_repeat_count: 0, absolute_recovery_attempt_count: 1, current_unresolved_count: 0, prior_unresolved_count: 1, added_fingerprint_count: 0, removed_fingerprint_count: 1, unchanged_fingerprint_count: 0, reason_text: "progress", latest_report_path: null, created_at: timestamp });
    const run = mapFinalVerificationRunRow({ id: "verification", project_id: "project", card_key: "card", workflow_run_id: "workflow", execution_root: "/repo", aggregate_status: "passed", blocked_reason: null, persistence_warning: null, duration: 1, started_at: timestamp, completed_at: timestamp });
    const check = mapFinalVerificationCheckRow({ id: "check", run_id: "verification", project_id: "project", card_key: "card", check_id: "build", intent: "build", description: "Build", command: "build", working_directory: "/repo", outcome: "passed", duration: 1, exit_code: 0, started_at: timestamp, output_summary: "green", required_check: 1 });
    expect([ledger.id, decision.id, repair.id, fingerprint.id, run.id, check.id]).toHaveLength(6);
    expect(check.required).toBe(true);
  });

  it("maps manual verification rows", () => {
    const pack = mapManualTestVerificationPackRow({ id: "pack", project_id: "project", card_key: "card", version: "1", state: "current", manifest_hash: "hash", markdown_path: "pack.md", pdf_path: "pack.pdf", render_error: null, created_at: timestamp, superseded_at: null });
    const review = mapManualTestVerificationReviewRow({ id: "review", project_id: "project", card_key: "card", pack_id: "pack", reviewed_at: timestamp, state: "current", invalidated_at: null, invalidated_reason: null });
    const result = mapManualTestResultRow({ id: "result", project_id: "project", card_key: "card", pack_id: "pack", review_id: "review", test_id: "test", result: "pass", actual_result: "ok", notes: null, finding_id: null, recorded_at: timestamp });
    expect([pack.state, review.state, result.result]).toEqual(["current", "current", "pass"]);
  });
});
