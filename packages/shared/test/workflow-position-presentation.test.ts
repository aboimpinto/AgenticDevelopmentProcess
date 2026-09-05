/**
 * FEAT-035: Workflow Position Presentation Contract Tests
 *
 * Verifies that display formatters produce correct labels, CSS classes,
 * accessibility attributes, and safe fallbacks for all states.
 */
import { describe, expect, it } from "vitest";
import type { WorkflowPositionSummary } from "../src/workflow-position.js";
import {
  formatExecutionState,
  formatExecutionStateCssClass,
  formatExecutionStateAriaLabel,
  formatPhaseStatus,
  formatPhaseBadge,
  formatQualityGateLabel,
  formatQualityGateCssClass,
  formatQualityGateAriaLabel,
  formatDeepDiveFreshnessLabel,
  formatDeepDiveFreshnessCssClass,
  formatDeepDiveFreshnessAriaLabel,
  formatCommandLabel,
  buildCardStatusStack,
  buildDetailSynopsis,
} from "../src/workflow-position-presentation.js";

// ---------------------------------------------------------------------------
// formatExecutionState
// ---------------------------------------------------------------------------

describe("formatExecutionState", () => {
  it('returns "Idle" for idle state', () => {
    expect(formatExecutionState("idle")).toBe("Idle");
  });

  it('returns "Running" for running state', () => {
    expect(formatExecutionState("running")).toBe("Running");
  });

  it('returns "Blocked" for blocked state', () => {
    expect(formatExecutionState("blocked")).toBe("Blocked");
  });

  it('returns "Failed" for failed state', () => {
    expect(formatExecutionState("failed")).toBe("Failed");
  });

  it('returns "Completed" for completed state', () => {
    expect(formatExecutionState("completed")).toBe("Completed");
  });

  it('returns "Unknown" for unknown state', () => {
    expect(formatExecutionState("unknown")).toBe("Unknown");
  });
});

// ---------------------------------------------------------------------------
// formatExecutionStateCssClass
// ---------------------------------------------------------------------------

describe("formatExecutionStateCssClass", () => {
  it('returns "state-idle" for idle', () => {
    expect(formatExecutionStateCssClass("idle")).toBe("state-idle");
  });

  it('returns "state-running" for running', () => {
    expect(formatExecutionStateCssClass("running")).toBe("state-running");
  });
});

// ---------------------------------------------------------------------------
// formatExecutionStateAriaLabel
// ---------------------------------------------------------------------------

describe("formatExecutionStateAriaLabel", () => {
  it("returns descriptive aria labels for each state", () => {
    expect(formatExecutionStateAriaLabel("idle")).toContain("idle");
    expect(formatExecutionStateAriaLabel("running")).toContain("running");
    expect(formatExecutionStateAriaLabel("blocked")).toContain("blocked");
    expect(formatExecutionStateAriaLabel("failed")).toContain("failed");
    expect(formatExecutionStateAriaLabel("completed")).toContain("completed");
  });
});

// ---------------------------------------------------------------------------
// formatPhaseStatus
// ---------------------------------------------------------------------------

describe("formatPhaseStatus", () => {
  it('returns "Pending" for pending', () => {
    expect(formatPhaseStatus("pending")).toBe("Pending");
  });

  it('returns "In Progress" for in-progress', () => {
    expect(formatPhaseStatus("in-progress")).toBe("In Progress");
  });

  it('returns "Completed" for completed', () => {
    expect(formatPhaseStatus("completed")).toBe("Completed");
  });
});

// ---------------------------------------------------------------------------
// formatPhaseBadge
// ---------------------------------------------------------------------------

describe("formatPhaseBadge", () => {
  it("returns null when phaseNumber is null", () => {
    expect(formatPhaseBadge(null, null, "pending")).toBeNull();
  });

  it("formats a badge with title", () => {
    expect(formatPhaseBadge(3, "Business Logic", "in-progress")).toBe(
      "Phase 3: Business Logic — In Progress",
    );
  });

  it("formats a badge without title", () => {
    expect(formatPhaseBadge(1, null, "completed")).toBe(
      "Phase 1 — Completed",
    );
  });
});

// ---------------------------------------------------------------------------
// formatQualityGateLabel
// ---------------------------------------------------------------------------

describe("formatQualityGateLabel", () => {
  it('returns "Gates Satisfied" for satisfied', () => {
    expect(formatQualityGateLabel("satisfied")).toBe("Gates Satisfied");
  });

  it('returns "Gates Missing" for missing', () => {
    expect(formatQualityGateLabel("missing")).toBe("Gates Missing");
  });

  it('returns "No Gates" for not_applicable', () => {
    expect(formatQualityGateLabel("not_applicable")).toBe("No Gates");
  });
});

// ---------------------------------------------------------------------------
// formatQualityGateAriaLabel
// ---------------------------------------------------------------------------

describe("formatQualityGateAriaLabel", () => {
  it("includes phase number when provided", () => {
    const label = formatQualityGateAriaLabel("satisfied", 3);
    expect(label).toContain("Phase 3");
    expect(label).toContain("satisfied");
  });

  it("falls back to Active phase when number is null", () => {
    const label = formatQualityGateAriaLabel("missing", null);
    expect(label).toContain("Active phase");
    expect(label).toContain("missing");
  });
});

// ---------------------------------------------------------------------------
// formatDeepDiveFreshnessLabel
// ---------------------------------------------------------------------------

describe("formatDeepDiveFreshnessLabel", () => {
  it('returns "Deep-Dive Current" for current', () => {
    expect(formatDeepDiveFreshnessLabel("current")).toBe("Deep-Dive Current");
  });

  it('returns "Deep-Dive Stale" for stale', () => {
    expect(formatDeepDiveFreshnessLabel("stale")).toBe("Deep-Dive Stale");
  });
});

// ---------------------------------------------------------------------------
// formatCommandLabel
// ---------------------------------------------------------------------------

describe("formatCommandLabel", () => {
  it("returns em-dash for null", () => {
    expect(formatCommandLabel(null)).toBe("—");
  });

  it("converts kebab-case to Title Case", () => {
    expect(formatCommandLabel("continue-implementing")).toBe("Continue Implementing");
  });

  it("handles single-word commands", () => {
    expect(formatCommandLabel("complete-feature")).toBe("Complete Feature");
  });
});

// ---------------------------------------------------------------------------
// buildCardStatusStack
// ---------------------------------------------------------------------------

describe("buildCardStatusStack", () => {
  const idleSummary: WorkflowPositionSummary = {
    commandLabel: null,
    executionState: "idle",
    activePhaseNumber: null,
    activePhaseTitle: null,
    phaseStatus: "pending",
    qualityGateState: "not_applicable",
    deepDiveFreshness: "not_recorded",
    synopsis: "No workflow activity recorded",
    evidence: [],
  };

  const runningSummary: WorkflowPositionSummary = {
    commandLabel: "continue-implementing",
    executionState: "running",
    activePhaseNumber: 3,
    activePhaseTitle: "Business Logic",
    phaseStatus: "in-progress",
    qualityGateState: "missing",
    deepDiveFreshness: "current",
    synopsis: "Phase 3: Business Logic — running",
    evidence: [],
  };

  const blockedSummary: WorkflowPositionSummary = {
    commandLabel: "continue-implementing",
    executionState: "blocked",
    activePhaseNumber: 5,
    activePhaseTitle: "User Interface",
    phaseStatus: "blocked",
    qualityGateState: "missing",
    deepDiveFreshness: "current",
    synopsis: "Phase 5: User Interface — blocked (quality gate: missing)",
    evidence: [],
  };

  const completedSummary: WorkflowPositionSummary = {
    commandLabel: "complete-feature",
    executionState: "completed",
    activePhaseNumber: null,
    activePhaseTitle: null,
    phaseStatus: "completed",
    qualityGateState: "satisfied",
    deepDiveFreshness: "current",
    synopsis: "All phases completed",
    evidence: [],
  };

  it("returns null for idle + pending state (no meaningful display)", () => {
    expect(buildCardStatusStack(idleSummary)).toBeNull();
  });

  it("builds a running card stack", () => {
    const stack = buildCardStatusStack(runningSummary);
    expect(stack).not.toBeNull();
    expect(stack!.executionLabel).toBe("Running");
    expect(stack!.executionCssClass).toBe("state-running");
    expect(stack!.phaseBadge).toBe("Phase 3: Business Logic — In Progress");
    expect(stack!.qualityGateLabel).toBe("Gates Missing");
    expect(stack!.ariaLabel).toContain("Running");
    expect(stack!.ariaLabel).toContain("Gates Missing");
  });

  it("builds a blocked card stack", () => {
    const stack = buildCardStatusStack(blockedSummary);
    expect(stack).not.toBeNull();
    expect(stack!.executionLabel).toBe("Blocked");
    expect(stack!.phaseBadge).toContain("User Interface");
    expect(stack!.qualityGateLabel).toBe("Gates Missing");
  });

  it("builds a completed card stack", () => {
    const stack = buildCardStatusStack(completedSummary);
    expect(stack).not.toBeNull();
    expect(stack!.executionLabel).toBe("Completed");
    expect(stack!.phaseBadge).toBeNull(); // no active phase
    expect(stack!.qualityGateLabel).toBe("Gates Satisfied");
  });

  it("builds idle stack with non-pending phase status", () => {
    const idleCompletedSummary: WorkflowPositionSummary = {
      ...idleSummary,
      phaseStatus: "completed",
    };
    const stack = buildCardStatusStack(idleCompletedSummary);
    expect(stack).not.toBeNull();
    expect(stack!.executionLabel).toBe("Idle");
  });

  it("hides quality gate when not_applicable", () => {
    const stack = buildCardStatusStack(idleSummary);
    expect(stack).toBeNull(); // idle + pending = null
  });
});

// ---------------------------------------------------------------------------
// buildDetailSynopsis
// ---------------------------------------------------------------------------

describe("buildDetailSynopsis", () => {
  const runningSummary: WorkflowPositionSummary = {
    commandLabel: "continue-implementing",
    executionState: "running",
    activePhaseNumber: 3,
    activePhaseTitle: "Business Logic",
    phaseStatus: "in-progress",
    qualityGateState: "missing",
    deepDiveFreshness: "current",
    synopsis: "Phase 3: Business Logic — running",
    evidence: [],
  };

  const idleSummary: WorkflowPositionSummary = {
    commandLabel: null,
    executionState: "idle",
    activePhaseNumber: null,
    activePhaseTitle: null,
    phaseStatus: "pending",
    qualityGateState: "not_applicable",
    deepDiveFreshness: "not_recorded",
    synopsis: "No workflow activity recorded",
    evidence: [],
  };

  it("builds a synopsis for running state", () => {
    const synopsis = buildDetailSynopsis(runningSummary);
    expect(synopsis.synopsis).toBe("Phase 3: Business Logic — running");
    expect(synopsis.rows).toHaveLength(5); // Command, State, Phase, Quality Gate, Deep-Dive
    expect(synopsis.ariaLabel).toContain("Continue Implementing");
    expect(synopsis.ariaLabel).toContain("Running");
  });

  it("builds a synopsis for idle state", () => {
    const synopsis = buildDetailSynopsis(idleSummary);
    expect(synopsis.synopsis).toBe("No workflow activity recorded");
    expect(synopsis.rows).toHaveLength(4); // Command, State, Quality Gate, Deep-Dive (no Phase)
    expect(synopsis.ariaLabel).toContain("Idle");
  });

  it("includes command label row", () => {
    const synopsis = buildDetailSynopsis(runningSummary);
    const commandRow = synopsis.rows.find((r) => r.label === "Command");
    expect(commandRow).toBeDefined();
    expect(commandRow!.value).toBe("Continue Implementing");
  });

  it("includes state row with CSS class", () => {
    const synopsis = buildDetailSynopsis(runningSummary);
    const stateRow = synopsis.rows.find((r) => r.label === "State");
    expect(stateRow).toBeDefined();
    expect(stateRow!.cssClass).toBe("state-running");
  });

  it("includes phase row only when phase number is set", () => {
    const synopsis = buildDetailSynopsis(runningSummary);
    const phaseRow = synopsis.rows.find((r) => r.label === "Phase");
    expect(phaseRow).toBeDefined();
    expect(phaseRow!.value).toContain("Phase 3");
  });

  it("omits phase row when phase number is null", () => {
    const synopsis = buildDetailSynopsis(idleSummary);
    const phaseRow = synopsis.rows.find((r) => r.label === "Phase");
    expect(phaseRow).toBeUndefined();
  });

  it("includes Deep-Dive row", () => {
    const synopsis = buildDetailSynopsis(idleSummary);
    const ddRow = synopsis.rows.find((r) => r.label === "Deep-Dive");
    expect(ddRow).toBeDefined();
    expect(ddRow!.value).toBe("No Deep-Dive");
  });
});
