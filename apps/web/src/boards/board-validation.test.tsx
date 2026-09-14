import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkItemCard } from "@hepha/shared";
import { ValidationBadges } from "./board-validation.js";
import { WorkflowPositionCardStack } from "../workflow-position-card-stack.js";

afterEach(cleanup);

function makeItem(implementationCompleted: boolean): WorkItemCard {
  return {
    externalId: "FEAT-X",
    featureWorkflow: {
      activeRun: null,
      findings: [],
      implementationCompleted,
      lastRun: null,
      manualTestsCompletedAt: null,
      userCodeReviewCompletedAt: null,
      workflowMessage: null,
      workflowPosition: { executionState: "idle", phaseStatus: "completed", activePhaseNumber: null, qualityGateState: "not_applicable" },
    },
    implementationEvidence: {
      phaseQualityGates: [{
        gates: [{ gate: "Tests", justification: null, status: "missing" }],
        phaseNumber: 0,
        phaseStatus: "COMPLETED",
      }],
    },
    kind: "feature",
    phases: [],
    stateFolder: "03_IN_PROGRESS",
    validation: { needsValidationCount: 0 },
  } as unknown as WorkItemCard;
}

describe("ValidationBadges operation scope", () => {
  it("shows confirmation-only coverage as review, not a red repair gap, and clears it when ready", () => {
    const item = { ...makeItem(true), implementationEvidence: { changedFiles: [], codeReviews: [], phaseQualityGates: [] }, completionRecovery: {
      assessedAt: "now", ready: false, blockers: [{ id: "phase-recovery-23", action: "phase", phaseNumber: 23, actionLabel: "Review Phase 23 coverage", message: "Coverage review" }],
      phaseGaps: [{ id: "confirmation", kind: "coverage_confirmation", phaseNumber: 23, phaseTitle: "Verification", title: "Review", sourceIds: ["AC-01"], details: [], instruction: "Review" }],
    } } as WorkItemCard;
    const view = render(<ValidationBadges item={item} />);
    expect(screen.getByText("Coverage review pending")).toBeDefined();
    expect(screen.queryByText(/quality gap|Completion blocked/i)).toBeNull();
    expect(screen.getByTitle(/No test repair is required/).className).not.toContain("blocked");
    view.rerender(<ValidationBadges item={{ ...item, completionRecovery: { assessedAt: "later", ready: true, blockers: [], phaseGaps: [] } }} />);
    expect(screen.queryByText("Coverage review pending")).toBeNull();
  });
  it("shows a spinning readiness activity instead of idle or completion blocked, then clears it on settlement", () => {
    const item = { ...makeItem(true), completionRecovery: { assessedAt: "now", ready: false, blockers: [
      { id: "recovery-running", action: "external" as const, actionLabel: "Wait", message: "Completion readiness recovery is running." },
    ] } };
    const view = render(<><ValidationBadges item={item} /><WorkflowPositionCardStack item={item} /></>);
    expect(screen.getByText("Refreshing readiness")).toBeDefined();
    expect(view.container.querySelector(".spin-icon")).not.toBeNull();
    expect(screen.queryByText("Completion blocked")).toBeNull();
    expect(screen.queryByText(/^idle$/i)).toBeNull();
    const finished = { ...item, completionRecovery: { assessedAt: "later", ready: false, blockers: [
      { id: "assessment-incomplete", action: "external" as const, actionLabel: "Retry", message: "Assessment failed" },
    ] } };
    view.rerender(<><ValidationBadges item={finished} /><WorkflowPositionCardStack item={finished} /></>);
    expect(screen.queryByText("Refreshing readiness")).toBeNull();
    expect(screen.getByText(/^idle$/i)).toBeDefined();
  });

  it("does not label an active implementation blocked by completion-only quality evidence", () => {
    render(<ValidationBadges item={makeItem(false)} />);

    expect(screen.queryByText(/quality gap/i)).toBeNull();
  });

  it("shows missing quality evidence after implementation phases are complete", () => {
    render(<ValidationBadges item={makeItem(true)} />);

    expect(screen.getByText("1 quality gap")).toBeDefined();
  });
});
