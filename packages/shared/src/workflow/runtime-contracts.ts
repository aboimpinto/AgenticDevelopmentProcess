import type { WorkflowPositionSummary } from "../workflow-position.js";
import type { FeatureFindingSummary } from "../findings/contracts.js";
import type { ManualTestPackDashboardStatus } from "../manual-tests/contracts.js";

export type FeatureUiRequirementDecision = "unknown" | "requires_ui" | "no_ui";

export interface FeatureWorkflowSummary {
  activeRun: FeatureWorkflowRunSummary | null;
  canAcceptHumanReviewFindings: boolean;
  canRecordManualTests: boolean;
  canRecordUserCodeReview: boolean;
  canSubmitFinding: boolean;
  canContinueImplementing: boolean;
  canCreateUiRequirements: boolean;
  canRefineFeature: boolean;
  canStartImplementing: boolean;
  defaultImplementationModel: string | null;
  designCompletedAt: string | null;
  hasDesignArtifacts: boolean;
  /**
   * True when the durable execution contract can select and resume an
   * unresolved task. Refinement-only satellite artifacts are not authority for
   * this decision.
   */
  hasContinuationArtifacts?: boolean;
  hasRefinementArtifacts: boolean;
  implementationCompleted: boolean;
  implementationPhases: ImplementationPhaseRunSummary[];
  /**
   * Persisted execution records for every implementation-workflow agent.
   * Optional so API consumers created before timing telemetry remain valid.
   */
  implementationAgentRuns?: ImplementationAgentRunSummary[];
  implementationTasks: ImplementationTaskRunSummary[];
  findings: FeatureFindingSummary[];
  lastRun: FeatureWorkflowRunSummary | null;
  manualTestsCompletedAt: string | null;

  // --- FEAT-045: Manual Test Verification Pack ---
  manualTestPackStatus: ManualTestPackDashboardStatus | null;
  canGenerateManualTestPack: boolean;
  canReviewManualTestPack: boolean;
  canRecordManualTestPass: boolean;
  canRecordManualTestFail: boolean;
  refineCompletedAt: string | null;
  uiRequirementCheckedAt: string | null;
  uiRequirementDecision: FeatureUiRequirementDecision;
  uiRequirementReason: string | null;
  userCodeReviewCompletedAt: string | null;
  workflowMessage: string;
  /**
   * Readiness for the current lifecycle action (for example Continue
   * Implementing). Complete Feature obligations are projected separately and
   * must never make an available current action appear blocked.
   */
  readiness: FeatureReadinessSummary | null;

  /** FEAT-035: Workflow-position summary (optional — populated by scanner when available). */
  workflowPosition: WorkflowPositionSummary | null;
}

// -------------------------------------------------------------------------

/** FEAT-018: Readiness gate reason codes and messages. */
export type FeatReadinessFailureCode =
  | "missing_required_document"
  | "empty_document"
  | "invalid_refine_artifacts"
  | "validation_markers_present"
  | "deep_dive_not_recorded"
  | "deep_dive_stale"
  | "deep_dive_metadata_unavailable"
  | "ui_requirement_unknown"
  | "missing_design_artifacts"
  | "folder_state_mismatch"
  | "manual_bootstrap_required";

export interface FeatReadinessReason {
  code: FeatReadinessFailureCode;
  message: string;
  blocking: boolean;
  affectedPath?: string;
  detail?: string;
}

/** FEAT-018: Readiness gate summary for dashboard display. */
export interface FeatureReadinessSummary {
  ready: boolean;
  reasons: FeatReadinessReason[];
}

export type FeatureWorkflowCommand =
  | "deep-dive-epic"
  | "deep-dive-feature"
  | "design-feature"
  | "refine-feature"
  | "start-implementing"
  | "continue-implementing"
  | "complete-feature";

/**
 * Serialization-safe summary of a single workflow definition node.
 * This is the validated shape available to orchestrator and dashboard consumers.
 */
export interface WorkflowDefinitionNodeSummary {
  id: string;
  kind: "action" | "prompt" | "loop" | "gate";
  dependsOn: string[];
  status: string;
  summary: string | null;
  action: string | null;
  /** Registered launch authority after exact raw agent_action validation. */
  agentAction: string | null;
  prompt: string | null;
  loopUntil: string | null;

  // FEAT-026: Optional tool profile override declared in workflow node metadata.
  toolProfile: string | null;

  // FEAT-047/052: Optional skill reference for skill-backed prompt nodes.
  // Value is the kebab-case skill name (without path or extension).
  skill: string | null;
}

/**
 * Serialization-safe summary of a validated workflow definition.
 * Exposed through shared types so the orchestrator and dashboard can
 * inspect available workflows without raw YAML parsing.
 */
export interface WorkflowDefinitionSummary {
  command: FeatureWorkflowCommand;
  name: string;
  description: string | null;
  path: string;
  nodes: WorkflowDefinitionNodeSummary[];
}

export type FeatureWorkflowRunStatus = "running" | "completed" | "failed" | "blocked" | "cancelled";
export type FeatureWorkflowStepStatus = "pending" | "running" | "completed" | "failed";
export type ImplementationPhaseRunStatus =
  | "pending"
  | "planning"
  | "implementing"
  | "code_review"
  | "checkpoint"
  | "verifying"
  | "completed"
  | "blocked"
  | "failed";
export type ImplementationTaskRunStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";

export interface FeatureWorkflowRunSummary {
  command: FeatureWorkflowCommand;
  completedAt: string | null;
  currentNodeId: string | null;
  currentStep: string | null;
  error: string | null;
  runId: string;
  startedAt: string;
  status: FeatureWorkflowRunStatus;
  summary: string | null;
  workflowProgress: FeatureWorkflowProgressSummary | null;
}

export interface FeatureWorkflowProgressSummary {
  currentNodeId: string | null;
  steps: FeatureWorkflowStepSummary[];
}

export interface FeatureWorkflowStepSummary {
  detail: string | null;
  id: string;
  kind: "action" | "prompt" | "loop" | "gate";
  label: string;
  status: FeatureWorkflowStepStatus;
}

export interface ImplementationPhaseRunSummary {
  agent: string | null;
  completedAt: string | null;
  currentStep: string | null;
  error: string | null;
  model: string | null;
  phaseNumber: number;
  phaseTitle: string;
  reportPath: string | null;
  startedAt: string | null;
  status: ImplementationPhaseRunStatus;
  summary: string | null;
  updatedAt: string;
  workflowRunId: string;
}

export interface ImplementationAgentRunSummary {
  agentName: string;
  agentRole: string;
  completedAt: string | null;
  currentStep: string | null;
  error: string | null;
  id: string;
  /** Model selected by the immutable orchestrator command plan; observed runtime routing is separate evidence. */
  model: string;
  phaseNumber: number | null;
  phaseTitle: string | null;
  reportPath: string | null;
  startedAt: string;
  status: "running" | "completed" | "failed" | "blocked";
  summary: string | null;
  updatedAt: string;
  workflowRunId: string;
}

export interface ImplementationTaskRunSummary {
  completedAt: string | null;
  currentStep: string | null;
  error: string | null;
  phaseNumber: number;
  phaseTitle: string;
  section: string;
  sourceLine: number | null;
  startedAt: string | null;
  status: ImplementationTaskRunStatus;
  summary: string | null;
  taskId: string;
  taskIndex: number;
  taskTitle: string;
  updatedAt: string;
  workflowRunId: string;
}
