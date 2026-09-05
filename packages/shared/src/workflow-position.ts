/**
 * FEAT-035: Workflow-Position Shared Types
 *
 * Additive read-model contracts for the workflow-position summary
 * displayed on FEAT cards and FEAT detail headers.
 *
 * All fields are readonly and optional where safe — the projection
 * must tolerate sparse durable state and incomplete phase lifecycle
 * persistence.
 */

// ---------------------------------------------------------------------------
// Workflow Position Read Model
// ---------------------------------------------------------------------------

/**
 * Execution state of the current or most recent workflow run.
 */
export type WorkflowExecutionState =
  | "idle"
  | "queued"
  | "running"
  | "blocked"
  | "failed"
  | "completed"
  | "unknown";

/**
 * Derived phase lifecycle status shown on cards.
 */
export type PhaseLifecycleStatus =
  | "pending"
  | "in-progress"
  | "completed"
  | "skipped"
  | "blocked"
  | "failed"
  | "unknown";

/**
 * Aggregated quality-gate state for the current active phase.
 */
export type QualityGateState =
  | "satisfied"
  | "waived"
  | "missing"
  | "not_applicable"
  | "unknown";

/**
 * Semantic Deep-Dive freshness classification.
 * Lifecycle-only metadata changes do not set stale; requirement/
 * scope changes do.
 */
export type DeepDiveFreshness =
  | "current"
  | "stale"
  | "not_recorded"
  | "metadata_unavailable";

/**
 * Source classifier for each model field's evidence.
 */
export type EvidenceSource =
  | "durable_event"
  | "phase_document"
  | "card_metadata"
  | "feature_tasks";

/**
 * Trace of how a single model field was derived — useful for
 * debugging, tests, and operator confidence.
 */
export interface WorkflowPositionEvidence {
  /** Which model field this evidence supports. */
  readonly field: string;
  /** Source classification. */
  readonly source: EvidenceSource;
  /** The resolved value (may be null when source is absent). */
  readonly value: string | null;
  /** Optional human-readable explanation of the derivation. */
  readonly detail: string | null;
}

/**
 * Pure read model for workflow-position summary.
 *
 * Derived from durable run timeline events, phase lifecycle events,
 * phase documents, card metadata, and FeatureTasks.md planning rows
 * using the precedence defined in FEAT-035 planning-analysis-report.md.
 */
export interface WorkflowPositionSummary {
  /**
   * Human-readable label for the current or most recent workflow
   * command (e.g. "start-implementing", "continue-implementing"). May
   * be null when no run has been started or no command is recorded.
   */
  readonly commandLabel: string | null;

  /**
   * Current execution state of the workflow run.
   * Never null — defaults to "unknown" when no evidence exists.
   */
  readonly executionState: WorkflowExecutionState;

  /**
   * Active phase number when a specific phase is in progress,
   * blocked, or otherwise the current focus. Null when no phase
   * is active or when all phases are completed.
   */
  readonly activePhaseNumber: number | null;

  /**
   * Human-readable title of the active phase.
   * Null when activePhaseNumber is null.
   */
  readonly activePhaseTitle: string | null;

  /**
   * Derived phase lifecycle status from durable events and
   * documented fallback precedence. Never null — defaults to
   * "unknown" when no evidence exists.
   */
  readonly phaseStatus: PhaseLifecycleStatus;

  /**
   * Aggregated quality-gate state for the active phase.
   * Never null — defaults to "unknown" when no evidence exists.
   */
  readonly qualityGateState: QualityGateState;

  /**
   * Semantic Deep-Dive freshness for the feature.
   * Lifecycle-only metadata changes do not set stale.
   */
  readonly deepDiveFreshness: DeepDiveFreshness;

  /**
   * Compact human-readable summary suitable for FEAT detail
   * header display. Never null — defaults to a safe fallback
   * message when no state is known.
   */
  readonly synopsis: string;

  /**
   * Source evidence records used to derive each model field.
   * Useful for debugging and test assertions. Empty when no
   * evidence contributed (initial/unknown state).
   */
  readonly evidence: readonly WorkflowPositionEvidence[];
}
