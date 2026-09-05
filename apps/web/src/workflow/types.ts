/**
 * FEAT-056: Workflow And Phase Interaction Decomposition
 *
 * Phase 2 — Data Layer: typed workflow view-model, action, and result contracts.
 *
 * These types represent authoritative workflow state returned by the orchestrator.
 * They are pure view-models built from `FeatureWorkflowActionResponse` and
 * `WorkItemCard.featureWorkflow` — no policy, no HTTP, no JSX.
 */

import type {
  FeatureWorkflowSummary,
  FeatReadinessReason,
  FeatureFindingSummary,
  ImplementationPhaseRunSummary,
  ImplementationTaskRunSummary,
  PhaseSummary,
  ManualTestPackDashboardStatus,
  DeepDiveSession,
} from "@hepha/shared";

// ─── Workflow snapshot view-model ───────────────────────────────────────────

/**
 * Authoritative workflow state snapshot for the current work item.
 * Derived from `WorkItemCard.featureWorkflow` and related scanner facts.
 */
export interface WorkflowSnapshot {
  /** The full workflow summary from the scanner. */
  readonly workflow: FeatureWorkflowSummary | null;

  /** Scanned phase list (authoritative ordering from file system). */
  readonly phases: readonly PhaseSummary[];

  /** Ordered implementation phase runs from the last/active workflow run. */
  readonly implementationPhases: readonly ImplementationPhaseRunSummary[];

  /** Implementation task runs from the last/active workflow run. */
  readonly implementationTasks: readonly ImplementationTaskRunSummary[];

  /** Active findings. */
  readonly findings: readonly FeatureFindingSummary[];

  /** Manual test pack dashboard status. */
  readonly manualTestStatus: ManualTestPackDashboardStatus | null;
}

// ─── Action descriptor ──────────────────────────────────────────────────────

/**
 * Stable identifier for a workflow action made available by the orchestrator.
 * Maps to a specific API route and intent payload shape.
 */
export type WorkflowActionId =
  | "check-ui-requirement"
  | "create-ui-requirements"
  | "refine-feature"
  | "start-implementing"
  | "continue-implementing"
  | "complete-feature"
  | "cancel-workflow"
  | "record-user-code-review"
  | "submit-finding"
  | "add-finding-detail"
  | "resolve-finding"
  | "accept-human-review-findings"
  | "generate-manual-test-pack"
  | "review-manual-test-pack"
  | "record-manual-test-result"
  | "fetch-manual-test-status";

/**
 * Describes an available workflow action with its label, availability, and reason.
 * The UI renders these without re-evaluating policy predicates.
 */
export interface WorkflowActionDescriptor {
  /** Stable action id. */
  readonly id: WorkflowActionId;

  /** Human-readable label. */
  readonly label: string;

  /** Whether the action is currently available. */
  readonly available: boolean;

  /** Whether the action is busy/pending. */
  readonly busy: boolean;

  /** Visible reason when unavailable or busy. */
  readonly reason: string | null;

  /** A completed human gate stays visible as a disabled success control. */
  readonly completed?: boolean;

  /** Mutually exclusive action group (only one in a group can be active). */
  readonly group: string | null;
}

// ─── Structured command result ──────────────────────────────────────────────

/**
 * Outcome kind for a workflow command.
 */
export type WorkflowCommandOutcomeKind =
  | "success"
  | "validation_failure"
  | "blocked"
  | "unavailable"
  | "conflict";

/**
 * Base fields for all command outcomes.
 */
interface WorkflowCommandResultBase {
  readonly message: string;
  readonly reasons: readonly FeatReadinessReason[];
}

/**
 * Successful command execution returns the refreshed authoritative snapshot.
 */
export interface WorkflowCommandSuccess extends WorkflowCommandResultBase {
  readonly kind: "success";
  readonly snapshot: WorkflowSnapshot;
  /** A Continue request started a required, persisted Deep-Dive recovery. */
  readonly deepDiveRecoverySession?: DeepDiveSession;
}

/**
 * Rejected command: validation failure, blocked, unavailable, or conflict.
 * A snapshot may be provided for diagnostic context even on rejection.
 */
export interface WorkflowCommandRejection extends WorkflowCommandResultBase {
  readonly kind: Exclude<WorkflowCommandOutcomeKind, "success">;
  readonly snapshot: WorkflowSnapshot | null;
}

/**
 * Discriminated union for all workflow command outcomes.
 */
export type WorkflowCommandResult = WorkflowCommandSuccess | WorkflowCommandRejection;

// ─── Workflow read model ────────────────────────────────────────────────────

/**
 * Read-optimized workflow view model returned by read contracts.
 * Contains all state the UI needs to render workflow panels without
 * re-evaluating policy.
 */
export interface WorkflowReadModel {
  /** Whether the workflow snapshot is available (item has a feature workflow). */
  readonly available: boolean;

  /** Authoritative workflow snapshot. */
  readonly snapshot: WorkflowSnapshot | null;

  /** Ordered list of available action descriptors. */
  readonly actions: readonly WorkflowActionDescriptor[];

  /** Blocking readiness reasons. */
  readonly blockingReasons: readonly FeatReadinessReason[];

  /** Whether the workflow has an active run. */
  readonly hasActiveRun: boolean;

  /** Whether implementation is marked completed. */
  readonly implementationCompleted: boolean;

  /** Whether manual tests are done. */
  readonly manualTestsDone: boolean;

  /** Whether user code review is done. */
  readonly userCodeReviewDone: boolean;

  /** Whether human review findings are being accepted. */
  readonly canAcceptHumanReviewFindings: boolean;
}

// ─── Action intent ──────────────────────────────────────────────────────────

/**
 * Typed intent payload for dispatching a workflow action.
 * The controller uses this to construct the API call.
 */
export interface WorkflowActionIntent {
  readonly actionId: WorkflowActionId;
  readonly cardId: string;
  readonly projectId: string;
  readonly autonomous?: boolean;
  readonly payload?: Record<string, unknown>;
}

// ─── Transport error ────────────────────────────────────────────────────────

/**
 * Distinguishes an HTTP/transport failure from an authoritative server rejection.
 * The controller keeps the last confirmed snapshot on transport errors.
 */
export interface WorkflowTransportError {
  readonly kind: "transport_error";
  readonly message: string;
  readonly statusCode: number | undefined;
}

// ─── Controller state fragment ──────────────────────────────────────────────

/**
 * Local state managed by the workflow controller (useWorkflowController hook).
 * Does not duplicate workflow policy or eligibility predicates.
 */
export interface WorkflowControllerState {
  /** Last confirmed authoritative snapshot. Retained on refresh/error. */
  readonly confirmedSnapshot: WorkflowSnapshot | null;

  /** Whether a command is in flight. */
  readonly isPending: boolean;

  /** Pending action id when a command is in flight. */
  readonly pendingActionId: WorkflowActionId | null;

  /** Last structured command result, if any. */
  readonly lastResult: WorkflowCommandResult | null;

  /** Last transport error, if any. */
  readonly lastTransportError: WorkflowTransportError | null;

  /** Draft content for the findings form. */
  readonly findingDraft: string;

  /** Findings form mode. */
  readonly findingFormMode: "new" | "detail" | null;

  /** Finding id being detailed, if in detail mode. */
  readonly findingFormFindingId: string | null;

  /** Autonomous mode toggle state. */
  readonly autonomousMode: boolean;
}
