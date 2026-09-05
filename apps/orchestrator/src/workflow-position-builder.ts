/**
 * FEAT-035: Workflow Position Builder — Pure Read-Model Projection
 *
 * Builds a WorkflowPositionSummary from existing durable run timeline
 * state, phase lifecycle events, phase documents, card metadata, and
 * FeatureTasks.md planning rows.
 *
 * All functions are deterministic and side-effect free:
 * - No filesystem access
 * - No database writes
 * - No process spawning
 * - No mutable module state
 * - No implicit clock reads
 */

import type {
  WorkflowExecutionState,
  PhaseLifecycleStatus,
  QualityGateState,
  DeepDiveFreshness,
  EvidenceSource,
  WorkflowPositionEvidence,
  WorkflowPositionSummary,
  FeatureWorkflowRunSummary,
  FeatureWorkflowSummary,
  ImplementationPhaseRunSummary,
  FeatureImplementationEvidenceSummary,
  PhaseSummary,
  WorkItemValidationSummary,
} from "@hepha/shared";
import { resolvePhaseStatus } from "./phase-precedence-helpers.js";
import type { PhaseLifecycleEventInput } from "./phase-precedence-helpers.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * All inputs required to build a WorkflowPositionSummary.
 */
export interface BuildWorkflowPositionInput {
  /** Active workflow run, if any. */
  readonly activeRun: FeatureWorkflowRunSummary | null;
  /** Last completed/failed/blocked workflow run, if any. */
  readonly lastRun: FeatureWorkflowRunSummary | null;
  /** Scanned phase summaries from the scanner. */
  readonly phases: readonly PhaseSummary[];
  /** Implementation phase run records. */
  readonly implementationPhases: readonly ImplementationPhaseRunSummary[];
  /** Implementation evidence summary, if any. */
  readonly implementationEvidence: FeatureImplementationEvidenceSummary | null;
  /** Work item validation summary. */
  readonly validation: WorkItemValidationSummary;
  /** Durable phase lifecycle events (optional). */
  readonly phaseLifecycleEvents?: readonly PhaseLifecycleEventInput[];
}

// ---------------------------------------------------------------------------
// Execution State Derivation
// ---------------------------------------------------------------------------

export function deriveExecutionState(
  activeRun: FeatureWorkflowRunSummary | null,
): WorkflowExecutionState {
  if (!activeRun) {
    return "idle";
  }

  switch (activeRun.status) {
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    case "cancelled":
      return "completed";
    default:
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Command Label Derivation
// ---------------------------------------------------------------------------

export function deriveCommandLabel(
  activeRun: FeatureWorkflowRunSummary | null,
  lastRun: FeatureWorkflowRunSummary | null,
): string | null {
  // Active run command takes precedence
  if (activeRun) {
    return activeRun.command;
  }

  // Fall back to the most recent meaningful run
  if (lastRun) {
    return lastRun.command;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Active Phase Derivation
// ---------------------------------------------------------------------------

export interface ActivePhaseResult {
  number: number | null;
  title: string | null;
  status: PhaseLifecycleStatus;
}

export function deriveActivePhase(
  activeRun: FeatureWorkflowRunSummary | null,
  implementationPhases: readonly ImplementationPhaseRunSummary[],
  phases: readonly PhaseSummary[],
  phaseLifecycleEvents: readonly PhaseLifecycleEventInput[],
): ActivePhaseResult {
  // Priority 1: Active run's currentNodeId or step may indicate the phase
  if (activeRun) {
    const currentNodePhase = tryParsePhaseFromNodeId(activeRun.currentNodeId);
    if (currentNodePhase !== null) {
      const title = findPhaseTitle(currentNodePhase, phases);
      const status = resolvePhaseStatus({
        phaseNumber: currentNodePhase,
        durableEvents: phaseLifecycleEvents,
        phaseDocumentStatus: findPhaseDocumentStatus(currentNodePhase, phases),
        implementationPhaseStatus: findImplementationPhaseStatus(currentNodePhase, implementationPhases),
        cardMetadataStatus: null,
        featureTasksStatus: null,
      });
      return { number: currentNodePhase, title, status };
    }
  }

  // Priority 2: Last in-progress implementation phase
  const inProgressPhase = findLastNonCompletedPhase(implementationPhases);
  if (inProgressPhase !== null) {
    const title = findPhaseTitle(inProgressPhase, phases);
    const status = resolvePhaseStatus({
      phaseNumber: inProgressPhase,
      durableEvents: phaseLifecycleEvents,
      phaseDocumentStatus: findPhaseDocumentStatus(inProgressPhase, phases),
      implementationPhaseStatus: findImplementationPhaseStatus(inProgressPhase, implementationPhases),
      cardMetadataStatus: null,
      featureTasksStatus: null,
    });
    return { number: inProgressPhase, title, status };
  }

  // Priority 3: Check if all phases are completed
  if (implementationPhases.length > 0) {
    const allCompleted = implementationPhases.every(
      (p) => p.status === "completed",
    );
    if (allCompleted) {
      return { number: null, title: null, status: "completed" };
    }
  }

  // Priority 4: Scan phases for the lowest non-completed phase
  const lowestPending = findLowestPendingPhase(phases);
  if (lowestPending !== null) {
    const title = findPhaseTitle(lowestPending, phases);
    const status = resolvePhaseStatus({
      phaseNumber: lowestPending,
      durableEvents: phaseLifecycleEvents,
      phaseDocumentStatus: findPhaseDocumentStatus(lowestPending, phases),
      implementationPhaseStatus: findImplementationPhaseStatus(lowestPending, implementationPhases),
      cardMetadataStatus: null,
      featureTasksStatus: null,
    });
    return { number: lowestPending, title, status };
  }

  return { number: null, title: null, status: "unknown" };
}

function tryParsePhaseFromNodeId(nodeId: string | null): number | null {
  if (!nodeId) {
    return null;
  }

  // Common patterns: "phase-3", "phase_3", "3", "Phase 3"
  const match = nodeId.match(/(?:phase[-_]?)?(\d+)/i);
  if (match) {
    const parsed = parseInt(match[1], 10);
    return isNaN(parsed) ? null : parsed;
  }

  return null;
}

function findPhaseTitle(
  phaseNumber: number,
  phases: readonly PhaseSummary[],
): string | null {
  const phase = phases.find((p) => p.number === phaseNumber);
  return phase?.title ?? null;
}

function findPhaseDocumentStatus(
  phaseNumber: number,
  phases: readonly PhaseSummary[],
): string | null {
  const phase = phases.find((p) => p.number === phaseNumber);
  return phase?.status ?? null;
}

function findImplementationPhaseStatus(
  phaseNumber: number,
  implementationPhases: readonly ImplementationPhaseRunSummary[],
): string | null {
  const implPhase = implementationPhases.find((p) => p.phaseNumber === phaseNumber);
  return implPhase?.status ?? null;
}

function findLastNonCompletedPhase(
  implementationPhases: readonly ImplementationPhaseRunSummary[],
): number | null {
  // Sort by phaseNumber descending to find the latest non-completed
  const sorted = [...implementationPhases]
    .filter((p) => p.status !== "completed")
    .sort((a, b) => b.phaseNumber - a.phaseNumber);

  return sorted[0]?.phaseNumber ?? null;
}

function findLowestPendingPhase(
  phases: readonly PhaseSummary[],
): number | null {
  const sorted = [...phases]
    .filter((p) => {
      const status = p.status.toUpperCase();
      return (
        status !== "COMPLETED" &&
        status !== "SKIPPED" &&
        p.number !== null
      );
    })
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

  return sorted[0]?.number ?? null;
}

// ---------------------------------------------------------------------------
// Quality Gate Derivation
// ---------------------------------------------------------------------------

export function deriveQualityGateState(
  implementationEvidence: FeatureImplementationEvidenceSummary | null,
  activePhaseNumber: number | null,
): QualityGateState {
  if (!implementationEvidence || activePhaseNumber === null) {
    return "not_applicable";
  }

  const phaseQuality = implementationEvidence.phaseQualityGates.find(
    (q) => q.phaseNumber === activePhaseNumber,
  );

  if (!phaseQuality) {
    return "missing";
  }

  const gates = phaseQuality.gates;

  if (gates.length === 0) {
    return "not_applicable";
  }

  const allSatisfied = gates.every(
    (g) =>
      g.status === "satisfied" || g.status === "not_applicable",
  );

  if (allSatisfied) {
    return "satisfied";
  }

  const allWaived = gates.every(
    (g) =>
      g.status === "waived" || g.status === "not_applicable",
  );

  if (allWaived) {
    return "waived";
  }

  const anyMissing = gates.some((g) => g.status === "missing");
  if (anyMissing) {
    return "missing";
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Deep-Dive Freshness Derivation
// ---------------------------------------------------------------------------

export function deriveDeepDiveFreshness(
  validation: WorkItemValidationSummary,
): DeepDiveFreshness {
  switch (validation.deepDiveStatus) {
    case "current":
      return "current";
    case "stale":
      return "stale";
    case "not_recorded":
      return "not_recorded";
    case "metadata_unavailable":
      return "metadata_unavailable";
    default:
      return "metadata_unavailable";
  }
}

// ---------------------------------------------------------------------------
// Synopsis Builder
// ---------------------------------------------------------------------------

export function buildSynopsis(
  commandLabel: string | null,
  executionState: WorkflowExecutionState,
  activePhaseNumber: number | null,
  activePhaseTitle: string | null,
  phaseStatus: PhaseLifecycleStatus,
  qualityGateState: QualityGateState,
): string {
  // All phases completed — regardless of execution state, show this
  // when phaseStatus is completed and no active phase remains.
  if (phaseStatus === "completed" && activePhaseNumber === null) {
    return "All phases completed";
  }

  // If no activity or unknown state (no active run), return a clear fallback
  if (
    executionState === "idle" ||
    executionState === "unknown"
  ) {
    if (phaseStatus === "pending" || phaseStatus === "unknown") {
      return "No workflow activity recorded";
    }
  }

  // State labels
  const stateLabels: Record<WorkflowExecutionState, string> = {
    idle: "idle",
    queued: "queued",
    running: "running",
    blocked: "blocked",
    failed: "failed",
    completed: "completed",
    unknown: "unknown",
  };

  const stateLabel = stateLabels[executionState];

  // Build phase portion
  let phasePortion = "";
  if (activePhaseNumber !== null && activePhaseTitle !== null) {
    phasePortion = `Phase ${activePhaseNumber}: ${activePhaseTitle}`;
  } else if (activePhaseNumber !== null) {
    phasePortion = `Phase ${activePhaseNumber}`;
  }

  // Build the synopsis
  if (phasePortion && stateLabel) {
    let result = `${phasePortion} — ${stateLabel}`;

    // Quality gate
    if (
      qualityGateState === "missing" &&
      (executionState === "blocked" || executionState === "failed")
    ) {
      result += ` (quality gate: ${qualityGateState})`;
    }

    return result;
  }

  if (stateLabel) {
    return `Workflow ${stateLabel}`;
  }

  return "Workflow position unavailable";
}

// ---------------------------------------------------------------------------
// Evidence Collector
// ---------------------------------------------------------------------------

export function collectEvidence(
  activeRun: FeatureWorkflowRunSummary | null,
  phases: readonly PhaseSummary[],
  validation: WorkItemValidationSummary,
): WorkflowPositionEvidence[] {
  const evidence: WorkflowPositionEvidence[] = [];

  if (activeRun) {
    evidence.push({
      field: "executionState",
      source: "durable_event",
      value: activeRun.status,
      detail: "activeRun.status from FeatureWorkflowSummary",
    });

    evidence.push({
      field: "commandLabel",
      source: "durable_event",
      value: activeRun.command,
      detail: "activeRun.command from FeatureWorkflowSummary",
    });
  }

  if (phases.length > 0) {
    evidence.push({
      field: "phaseStatus",
      source: "phase_document",
      value: phases[0]?.status ?? null,
      detail: `Phase document status from ${phases.length} scanned phases`,
    });
  }

  evidence.push({
    field: "deepDiveFreshness",
    source: "card_metadata",
    value: validation.deepDiveStatus,
    detail: "validation.deepDiveStatus from WorkItemValidationSummary",
  });

  return evidence;
}

// ---------------------------------------------------------------------------
// Main Builder
// ---------------------------------------------------------------------------

/**
 * Build a WorkflowPositionSummary from the available inputs.
 *
 * This is the main entry point for FEAT-035's workflow-position projection.
 * It uses the documented precedence and produces a deterministic summary
 * regardless of which inputs are available.
 */
export function buildWorkflowPosition(
  input: BuildWorkflowPositionInput,
): WorkflowPositionSummary {
  const { activeRun, lastRun, phases, implementationPhases, implementationEvidence, validation, phaseLifecycleEvents = [] } = input;

  // Derive each field independently (no conflation)
  const commandLabel = deriveCommandLabel(activeRun, lastRun);
  const executionState = deriveExecutionState(activeRun);
  const { number: activePhaseNumber, title: activePhaseTitle, status: phaseStatus } =
    deriveActivePhase(activeRun, implementationPhases, phases, phaseLifecycleEvents);
  const qualityGateState = deriveQualityGateState(implementationEvidence, activePhaseNumber);
  const deepDiveFreshness = deriveDeepDiveFreshness(validation);
  const synopsis = buildSynopsis(
    commandLabel,
    executionState,
    activePhaseNumber,
    activePhaseTitle,
    phaseStatus,
    qualityGateState,
  );
  const evidence = collectEvidence(activeRun, phases, validation);

  return {
    commandLabel,
    executionState,
    activePhaseNumber,
    activePhaseTitle,
    phaseStatus,
    qualityGateState,
    deepDiveFreshness,
    synopsis,
    evidence,
  };
}
