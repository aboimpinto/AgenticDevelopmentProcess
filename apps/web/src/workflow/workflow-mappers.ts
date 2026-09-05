/**
 * FEAT-056: Workflow And Phase Interaction Decomposition
 *
 * Phase 2 — Data Layer: pure mappers for authoritative workflow facts.
 *
 * These are pure functions that transform supplied scanner/API data into
 * UI-friendly view-models. They do NOT:
 * - Evaluate readiness, recovery, or completion eligibility
 * - Read files, databases, or metadata
 * - Trigger side effects or transitions
 */

import type {
  WorkItemCard,
  FeatureWorkflowSummary,
  FeatReadinessReason,
  PhaseSummary,
  ImplementationPhaseRunSummary,
  ImplementationTaskRunSummary,
  FeatureFindingSummary,
  ManualTestPackDashboardStatus,
  FeatureWorkflowCommand,
} from "@hepha/shared";
import { getTerminalWorkItemLifecycle } from "@hepha/shared";

import type {
  WorkflowSnapshot,
  WorkflowActionDescriptor,
  WorkflowActionId,
  WorkflowReadModel,
} from "./types.js";

// ─── Snapshot mapper ────────────────────────────────────────────────────────

/**
 * Build a WorkflowSnapshot from a work item card.
 * Returns null when the card has no feature workflow.
 *
 * This is the single authoritative snapshot constructor for the workflow region.
 * It must not supplement missing scanner data with local inference.
 */
export function createWorkflowSnapshot(item: WorkItemCard): WorkflowSnapshot | null {
  const workflow = item.featureWorkflow ?? null;
  if (workflow === null && item.phases.length === 0) {
    return null;
  }

  return {
    workflow,
    phases: item.phases,
    implementationPhases: workflow?.implementationPhases ?? [],
    implementationTasks: workflow?.implementationTasks ?? [],
    findings: workflow?.findings ?? [],
    manualTestStatus: workflow?.manualTestPackStatus ?? null,
  };
}

// ─── Status label mapper ────────────────────────────────────────────────────

/**
 * Normalized status display label.
 * Safe for unknown/missing values: returns a fallback rather than throwing.
 */
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  planning: "Planning",
  implementing: "Implementing",
  recovering: "Recovering",
  code_review: "Code Review",
  checkpoint: "Checkpoint",
  verifying: "Verifying",
  completed: "Completed",
  blocked: "Blocked",
  failed: "Failed",
  cancelled: "Cancelled",
  submitted: "Submitted",
  ready_to_develop: "Ready To Develop",
  in_progress: "In Progress",

  // Feature workflow commands
  "deep-dive-epic": "Deep-Dive EPIC",
  "deep-dive-feature": "Deep-Dive Feature",
  "design-feature": "Design Feature",
  "refine-feature": "Refine Feature",
  "start-implementing": "Start Implementing",
  "continue-implementing": "Continue Implementing",
  "complete-feature": "Complete Feature",
};

export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  const lower = status.toLowerCase();
  return STATUS_LABELS[lower] ?? status;
}

// ─── Workflow command display ───────────────────────────────────────────────

const COMMAND_LABELS: Record<string, string> = {
  "deep-dive-epic": "Deep-Dive (EPIC)",
  "deep-dive-feature": "Deep-Dive (Feature)",
  "design-feature": "Design",
  "refine-feature": "Refine",
  "start-implementing": "Start Implementation",
  "continue-implementing": "Continue Implementation",
  "complete-feature": "Complete Feature",
};

export function formatWorkflowCommand(command: string | null | undefined): string {
  if (!command) return "Unknown";
  return COMMAND_LABELS[command] ?? command;
}

// ─── Phase order projection ─────────────────────────────────────────────────

/**
 * Returns an ordered list of phases sorted by phase number.
 * Safe for null/missing numbers.
 */
export function sortPhasesByNumber(
  phases: readonly PhaseSummary[],
): readonly PhaseSummary[] {
  return [...phases].sort((a, b) => {
    const an = a.number ?? Number.MAX_SAFE_INTEGER;
    const bn = b.number ?? Number.MAX_SAFE_INTEGER;
    return an - bn;
  });
}

/**
 * Find the earliest non-completed, non-skipped phase.
 * Returns null when all phases are completed or skipped.
 */
export function findCurrentPhase(
  phases: readonly PhaseSummary[],
): PhaseSummary | null {
  return (
    sortPhasesByNumber(phases).find(
      (p) =>
        p.status !== "completed" &&
        p.status !== "COMPLETED" &&
        p.status !== "skipped" &&
        p.status !== "SKIPPED",
    ) ?? null
  );
}

// ─── Action availability mapping ────────────────────────────────────────────

/**
 * Maps `FeatureWorkflowSummary` availability booleans to a list of
 * `WorkflowActionDescriptor`. The UI renders these descriptors without
 * re-evaluating eligibility.
 */
export function mapAvailableActions(
  workflow: FeatureWorkflowSummary | null,
  isActive: boolean,
): readonly WorkflowActionDescriptor[] {
  if (!workflow) return [];

  const actions: WorkflowActionDescriptor[] = [];

  // Readiness recovery actions
  actions.push(
    descriptor("check-ui-requirement", "Check UI Requirement", !!workflow.canCreateUiRequirements, false, null),
    descriptor("create-ui-requirements", "Create UI Requirements", !!workflow.canCreateUiRequirements, false, null),
    descriptor("refine-feature", "Refine Feature", !!workflow.canRefineFeature, false, null),
  );

  // Implementation actions
  actions.push(
    descriptor("start-implementing", "Start Implementing", !!workflow.canStartImplementing, isActive, null),
    descriptor("continue-implementing", "Continue Implementing", !!workflow.canContinueImplementing, isActive, null),
    descriptor(
      "complete-feature",
      "Complete Feature",
      !!workflow.implementationCompleted && !workflow.canContinueImplementing && !workflow.activeRun,
      isActive,
      null,
    ),
    descriptor("cancel-workflow", "Cancel Workflow", !!workflow.activeRun, false, null),
  );

  // Human review actions
  actions.push(
    descriptor(
      "record-user-code-review",
      workflow.userCodeReviewCompletedAt ? "User Code Review Complete" : "User Code Review",
      !!workflow.canRecordUserCodeReview,
      false,
      workflow.userCodeReviewCompletedAt ? `Recorded ${workflow.userCodeReviewCompletedAt}` : null,
      null,
      Boolean(workflow.userCodeReviewCompletedAt),
    ),
    descriptor("submit-finding", "Submit Finding", !!workflow.canSubmitFinding, false, null),
    descriptor("accept-human-review-findings", "Accept Findings", !!workflow.canAcceptHumanReviewFindings, false, null),
  );

  // Manual test actions
  actions.push(
    descriptor("generate-manual-test-pack", "Generate Test Pack", !!workflow.canGenerateManualTestPack, false, null),
    descriptor("review-manual-test-pack", "Review Test Pack", !!workflow.canReviewManualTestPack, false, null),
    descriptor("record-manual-test-result", "Record Test Result", !!workflow.canRecordManualTestPass || !!workflow.canRecordManualTestFail, false, null),
  );

  return actions;
}

function descriptor(
  id: WorkflowActionId,
  label: string,
  available: boolean,
  busy: boolean,
  reason: string | null,
  group: string | null = null,
  completed = false,
): WorkflowActionDescriptor {
  return { id, label, available, busy, reason, group, completed };
}

// ─── Blocking reasons ───────────────────────────────────────────────────────

/**
 * Extract only blocking readiness reasons from a workflow summary.
 */
export function getBlockingReadinessReasons(
  workflow: FeatureWorkflowSummary | null,
): readonly FeatReadinessReason[] {
  if (!workflow || workflow.activeRun || workflow.canContinueImplementing || workflow.implementationCompleted) {
    return [];
  }
  return workflow.readiness?.reasons?.filter((reason) => reason.blocking) ?? [];
}

/**
 * Check whether a specific readiness failure code is among the blocking reasons.
 */
export function hasBlockingReason(
  workflow: FeatureWorkflowSummary | null,
  code: string,
): boolean {
  return getBlockingReadinessReasons(workflow).some((r) => r.code === code);
}

// ─── Read model builder ─────────────────────────────────────────────────────

/**
 * Build the complete WorkflowReadModel from authoritative scan data.
 * This is the single composition point for the workflow overview panel.
 */
export function buildWorkflowReadModel(
  item: WorkItemCard,
  isBusy: (actionId: WorkflowActionId) => boolean,
): WorkflowReadModel {
  const workflow = item.featureWorkflow ?? null;
  const snapshot = createWorkflowSnapshot(item);
  const terminalLifecycle = getTerminalWorkItemLifecycle(item);
  const blockingReasons = terminalLifecycle ? [] : getBlockingReadinessReasons(workflow);

  const actions = terminalLifecycle
    ? []
    : mapAvailableActions(workflow, false).map((action) => ({
        ...action,
        busy: isBusy(action.id),
      }));

  return {
    available: snapshot !== null,
    snapshot,
    actions,
    blockingReasons,
    hasActiveRun: workflow?.activeRun !== null,
    implementationCompleted: !!workflow?.implementationCompleted,
    manualTestsDone: !!workflow?.manualTestsCompletedAt,
    userCodeReviewDone: !!workflow?.userCodeReviewCompletedAt,
    canAcceptHumanReviewFindings: !!workflow?.canAcceptHumanReviewFindings,
  };
}
