/**
 * FEAT-035: Workflow Position Presentation Helpers
 *
 * Pure display helpers that transform the WorkflowPositionSummary
 * into compact card labels, detail synopsis text, and accessibility
 * attributes. No React dependency — safe to use from both orchestrator
 * and web packages.
 *
 * All functions are deterministic and side-effect free.
 */

import type {
  WorkflowPositionSummary,
  WorkflowExecutionState,
  PhaseLifecycleStatus,
  QualityGateState,
  DeepDiveFreshness,
} from "./workflow-position.js";

// ---------------------------------------------------------------------------
// Execution State Labels
// ---------------------------------------------------------------------------

const EXECUTION_STATE_LABELS: Record<WorkflowExecutionState, string> = {
  idle: "Idle",
  queued: "Queued",
  running: "Running",
  blocked: "Blocked",
  failed: "Failed",
  completed: "Completed",
  unknown: "Unknown",
};

const EXECUTION_STATE_CSS_CLASS: Record<WorkflowExecutionState, string> = {
  idle: "state-idle",
  queued: "state-queued",
  running: "state-running",
  blocked: "state-blocked",
  failed: "state-failed",
  completed: "state-completed",
  unknown: "state-unknown",
};

/**
 * Get a human-readable label for an execution state.
 * Never returns null or empty string — always a safe label.
 */
export function formatExecutionState(state: WorkflowExecutionState): string {
  return EXECUTION_STATE_LABELS[state] ?? "Unknown";
}

/**
 * Get a CSS class name for an execution state (color-independent).
 */
export function formatExecutionStateCssClass(state: WorkflowExecutionState): string {
  return EXECUTION_STATE_CSS_CLASS[state] ?? "state-unknown";
}

/**
 * Get an accessible long description for an execution state.
 */
export function formatExecutionStateAriaLabel(state: WorkflowExecutionState): string {
  switch (state) {
    case "idle":
      return "Workflow is idle — no active run";
    case "queued":
      return "Workflow run is queued and waiting to start";
    case "running":
      return "Workflow run is currently running";
    case "blocked":
      return "Workflow run is blocked — requires attention";
    case "failed":
      return "Workflow run has failed";
    case "completed":
      return "Workflow run completed successfully";
    case "unknown":
      return "Workflow execution state is unknown";
    default:
      return "Unknown workflow state";
  }
}

// ---------------------------------------------------------------------------
// Phase Status Labels
// ---------------------------------------------------------------------------

const PHASE_STATUS_LABELS: Record<PhaseLifecycleStatus, string> = {
  pending: "Pending",
  "in-progress": "In Progress",
  completed: "Completed",
  skipped: "Skipped",
  blocked: "Blocked",
  failed: "Failed",
  unknown: "Unknown",
};

/**
 * Get a human-readable label for a phase lifecycle status.
 */
export function formatPhaseStatus(status: PhaseLifecycleStatus): string {
  return PHASE_STATUS_LABELS[status] ?? "Unknown";
}

/**
 * Format a compact phase badge string such as "Phase 3: In Progress".
 */
export function formatPhaseBadge(
  phaseNumber: number | null,
  phaseTitle: string | null,
  phaseStatus: PhaseLifecycleStatus,
): string | null {
  if (phaseNumber === null) {
    return null;
  }

  const numberLabel = phaseTitle
    ? `Phase ${phaseNumber}: ${phaseTitle}`
    : `Phase ${phaseNumber}`;

  return `${numberLabel} — ${formatPhaseStatus(phaseStatus)}`;
}

// ---------------------------------------------------------------------------
// Quality Gate Labels
// ---------------------------------------------------------------------------

const QUALITY_GATE_LABELS: Record<QualityGateState, string> = {
  satisfied: "Gates Satisfied",
  waived: "Gates Waived",
  missing: "Gates Missing",
  not_applicable: "No Gates",
  unknown: "Gates Unknown",
};

const QUALITY_GATE_CSS_CLASS: Record<QualityGateState, string> = {
  satisfied: "gate-satisfied",
  waived: "gate-waived",
  missing: "gate-missing",
  not_applicable: "gate-none",
  unknown: "gate-unknown",
};

/**
 * Get a human-readable label for a quality-gate state.
 */
export function formatQualityGateLabel(state: QualityGateState): string {
  return QUALITY_GATE_LABELS[state] ?? "Gates Unknown";
}

/**
 * Get a CSS class name for a quality-gate state.
 */
export function formatQualityGateCssClass(state: QualityGateState): string {
  return QUALITY_GATE_CSS_CLASS[state] ?? "gate-unknown";
}

/**
 * Get an accessible description for a quality-gate state.
 */
export function formatQualityGateAriaLabel(
  state: QualityGateState,
  phaseNumber: number | null,
): string {
  const phase = phaseNumber !== null ? `Phase ${phaseNumber}` : "Active phase";

  switch (state) {
    case "satisfied":
      return `${phase} quality gates are satisfied`;
    case "waived":
      return `${phase} quality gates have been waived`;
    case "missing":
      return `${phase} has missing quality gates that need attention`;
    case "not_applicable":
      return `${phase} does not require quality gates`;
    case "unknown":
      return `${phase} quality gate state is unknown`;
    default:
      return `${phase} quality gates unknown`;
  }
}

// ---------------------------------------------------------------------------
// Deep-Dive Freshness Labels
// ---------------------------------------------------------------------------

const FRESHNESS_LABELS: Record<DeepDiveFreshness, string> = {
  current: "Deep-Dive Current",
  stale: "Deep-Dive Stale",
  not_recorded: "No Deep-Dive",
  metadata_unavailable: "Deep-Dive Unavailable",
};

const FRESHNESS_CSS_CLASS: Record<DeepDiveFreshness, string> = {
  current: "freshness-current",
  stale: "freshness-stale",
  not_recorded: "freshness-none",
  metadata_unavailable: "freshness-unavailable",
};

/**
 * Get a human-readable label for a Deep-Dive freshness state.
 */
export function formatDeepDiveFreshnessLabel(freshness: DeepDiveFreshness): string {
  return FRESHNESS_LABELS[freshness] ?? "Deep-Dive Unavailable";
}

/**
 * Get a CSS class name for a Deep-Dive freshness state.
 */
export function formatDeepDiveFreshnessCssClass(freshness: DeepDiveFreshness): string {
  return FRESHNESS_CSS_CLASS[freshness] ?? "freshness-unavailable";
}

/**
 * Get an accessible description for a Deep-Dive freshness state.
 */
export function formatDeepDiveFreshnessAriaLabel(freshness: DeepDiveFreshness): string {
  switch (freshness) {
    case "current":
      return "Deep-Dive analysis is current and up to date";
    case "stale":
      return "Deep-Dive analysis is stale — requirements may have changed";
    case "not_recorded":
      return "No Deep-Dive analysis has been recorded";
    case "metadata_unavailable":
      return "Deep-Dive freshness metadata is unavailable";
    default:
      return "Deep-Dive freshness status is unknown";
  }
}

// ---------------------------------------------------------------------------
// Command Label
// ---------------------------------------------------------------------------

/**
 * Format a workflow command label for display.
 * Returns a safe fallback when command is null.
 */
export function formatCommandLabel(command: string | null): string {
  if (!command) {
    return "—";
  }

  // Convert kebab-case to Title Case for display
  return command
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Card Status Stack
// ---------------------------------------------------------------------------

/**
 * Display chunk for a compact FEAT card status stack.
 */
export interface CardStatusStackDisplay {
  /** Human-readable execution state label. */
  readonly executionLabel: string;
  /** CSS class for execution state styling. */
  readonly executionCssClass: string;
  /** Compact phase badge, or null when no active phase. */
  readonly phaseBadge: string | null;
  /** Quality gate label, or null when not applicable. */
  readonly qualityGateLabel: string | null;
  /** Accessibility string for the entire card stack. */
  readonly ariaLabel: string;
}

/**
 * Build a card status stack display from a workflow-position summary.
 */
export function buildCardStatusStack(
  summary: WorkflowPositionSummary,
): CardStatusStackDisplay | null {
  // Hide when idle and no meaningful state
  if (
    summary.executionState === "idle" &&
    summary.phaseStatus === "pending"
  ) {
    return null;
  }

  const executionLabel = formatExecutionState(summary.executionState);
  const executionCssClass = formatExecutionStateCssClass(summary.executionState);
  const phaseBadge = summary.activePhaseNumber !== null
    ? formatPhaseBadge(summary.activePhaseNumber, summary.activePhaseTitle, summary.phaseStatus)
    : null;

  const qualityGateLabel =
    summary.qualityGateState !== "not_applicable" &&
    summary.qualityGateState !== "unknown"
      ? formatQualityGateLabel(summary.qualityGateState)
      : null;

  const parts = [executionLabel];
  if (phaseBadge) parts.push(phaseBadge);
  if (qualityGateLabel) parts.push(qualityGateLabel);

  const ariaLabel = `Workflow position: ${parts.join(", ")}`;

  return {
    executionLabel,
    executionCssClass,
    phaseBadge,
    qualityGateLabel,
    ariaLabel,
  };
}

// ---------------------------------------------------------------------------
// Detail Synopsis
// ---------------------------------------------------------------------------

/**
 * Display chunk for the FEAT detail synopsis header.
 */
export interface DetailSynopsisDisplay {
  /** Compact human-readable synopsis text. */
  readonly synopsis: string;
  /** Rows for the synopsis detail area. */
  readonly rows: DetailSynopsisRow[];
  /** Accessibility live-region label for the entire synopsis. */
  readonly ariaLabel: string;
}

/**
 * A single row in the detail synopsis.
 */
export interface DetailSynopsisRow {
  /** Label for the row (e.g., "Command", "State"). */
  readonly label: string;
  /** Value for the row. */
  readonly value: string;
  /** Optional CSS class for visual tone. */
  readonly cssClass?: string;
}

/**
 * Build a detail synopsis display from a workflow-position summary.
 */
export function buildDetailSynopsis(
  summary: WorkflowPositionSummary,
): DetailSynopsisDisplay {
  const executionLabel = formatExecutionState(summary.executionState);
  const executionCssClass = formatExecutionStateCssClass(summary.executionState);

  const rows: DetailSynopsisRow[] = [
    {
      label: "Command",
      value: formatCommandLabel(summary.commandLabel),
    },
    {
      label: "State",
      value: executionLabel,
      cssClass: executionCssClass,
    },
  ];

  if (summary.activePhaseNumber !== null) {
    rows.push({
      label: "Phase",
      value: formatPhaseBadge(summary.activePhaseNumber, summary.activePhaseTitle, summary.phaseStatus) ?? "—",
    });
  }

  rows.push({
    label: "Quality Gate",
    value: formatQualityGateLabel(summary.qualityGateState),
    cssClass: formatQualityGateCssClass(summary.qualityGateState),
  });

  rows.push({
    label: "Deep-Dive",
    value: formatDeepDiveFreshnessLabel(summary.deepDiveFreshness),
    cssClass: formatDeepDiveFreshnessCssClass(summary.deepDiveFreshness),
  });

  const ariaLabel = `Workflow position synopsis: ${summary.synopsis}. ${rows.map((r) => `${r.label}: ${r.value}`).join(". ")}`;

  return {
    synopsis: summary.synopsis,
    rows,
    ariaLabel,
  };
}
