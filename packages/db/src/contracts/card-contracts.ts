import type { FeatureWorkflowCommand } from "./workflow-contracts.js";

export interface ScannedCardMetadata {
  cardKey: string;
  /** Hash of the authoritative Deep-Dive preparation document set. */
  deepDiveSourceHash?: string | null;
  documentHash: string | null;
  documentPath: string | null;
  documentSize: number | null;
  documentUpdatedAt: string | null;
  externalId: string;
  kind: "epic" | "feature";
  projectId: string;
  stateFolder: string;
  title: string;
}

export interface StoredCardMetadata {
  designFeatureCompletedAt: string | null;
  cardKey: string;
  lastDeepDiveAt: string | null;
  lastDeepDiveRunId: string | null;
  lastDeepDiveSourceHash: string | null;
  /** Normalized FeatureDescription source captured when the Deep-Dive completed. */
  lastDeepDiveSemanticSource?: string | null;
  lastDeepDiveSourceUpdatedAt: string | null;
  manualTestsCompletedAt: string | null;
  refineFeatureCompletedAt: string | null;
  uiRequirementCheckedAt: string | null;
  uiRequirementDecision: "requires_ui" | "no_ui" | null;
  uiRequirementReason: string | null;
  uiRequirementSourceHash: string | null;
  userCodeReviewCompletedAt: string | null;
  workflowCompletedAt: string | null;
  workflowCommand: FeatureWorkflowCommand | null;
  workflowCurrentNodeId: string | null;
  workflowCurrentStep: string | null;
  workflowError: string | null;
  workflowRunId: string | null;
  workflowStartedAt: string | null;
  workflowStatus: "running" | "completed" | "failed" | "blocked" | "cancelled" | null;
  workflowRecoveryAttemptCount: number;
  workflowLastRecoveryAt: string | null;
  workflowSummary: string | null;
}

export interface HephaDeepDiveRecord {
  cardKey: string;
  projectId: string;
  runId: string;
  sourceDocumentHash: string;
  sourceDocumentUpdatedAt: string | null;
  /** Normalized semantic source snapshot used for conservative stale recovery. */
  semanticSource?: string | null;
}

export interface FeatureUiRequirementRecord {
  cardKey: string;
  decision: "requires_ui" | "no_ui";
  projectId: string;
  reason: string;
  sourceDocumentHash: string;
}

export interface FeatureReadinessSourceConfirmationRecord {
  cardKey: string;
  projectId: string;
  sourceDocumentHash: string;
  sourceDocumentUpdatedAt: string | null;
  semanticSource?: string | null;
  uiRequirementSourceHash?: string | null;
}

// ---------------------------------------------------------------------------
// FEAT-039: Start Transition Metadata Records
// ---------------------------------------------------------------------------

/**
 * Durable start transition metadata recorded before the FEAT enters
 * the implementation phase. Backward-compatible with existing workflow
 * run records that do not have start transition metadata.
 */
