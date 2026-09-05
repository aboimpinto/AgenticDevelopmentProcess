import type { StartTransitionRecord } from "../../contracts/delivery-contracts.js";
import { toIsoString } from "../value-normalizers.js";

// --- FEAT-039: Start transition row types and mapper ---

export interface StartTransitionRow {
  card_key: string;
  project_id: string;
  run_id: string;
  delivery_policy: string;
  base_branch: string;
  implementation_branch: string | null;
  worktree_path: string | null;
  repo_root: string;
  start_commit: string;
  transition_status: string;
  transition_step: string;
  failure_reason: string | null;
  rolled_back: number;
  started_at: string;
  completed_at: string | null;
}

export function mapStartTransitionRow(row: StartTransitionRow): StartTransitionRecord {
  return {
    cardKey: row.card_key,
    projectId: row.project_id,
    runId: row.run_id,
    deliveryPolicy: row.delivery_policy,
    baseBranch: row.base_branch,
    implementationBranch: row.implementation_branch,
    worktreePath: row.worktree_path,
    repoRoot: row.repo_root,
    startCommit: row.start_commit,
    transitionStatus: row.transition_status,
    transitionStep: row.transition_step,
    failureReason: row.failure_reason,
    rolledBack: row.rolled_back === 1,
    startedAt: toIsoString(row.started_at) ?? new Date().toISOString(),
    completedAt: toIsoString(row.completed_at) ?? null,
  };
}
