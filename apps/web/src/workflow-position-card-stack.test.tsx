import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkItemCard } from "@hepha/shared";
import { WorkflowPositionCardStack } from "./workflow-position-card-stack.js";

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

describe("WorkflowPositionCardStack readiness activity", () => {
  it("shows server-owned compaction and its completion without clearing the readiness lock", () => {
    const item = { ...makeItem(true), completionRecovery: { assessedAt: "now", ready: false, blockers: [
      { id: "recovery-running", action: "external" as const, actionLabel: "Wait", message: "Running" },
    ], contextCompaction: { state: "running" as const, level: "strong" as const, beforeTokens: 90_000, updatedAt: "now" } } };
    const view = render(<WorkflowPositionCardStack item={item} />);
    expect(screen.getByText("Compacting context")).toBeDefined();
    view.rerender(<WorkflowPositionCardStack item={{ ...item, completionRecovery: { ...item.completionRecovery,
      contextCompaction: { ...item.completionRecovery.contextCompaction, state: "completed", afterTokens: 30_000 } } }} />);
    expect(screen.getByText("Context compacted — refreshing readiness")).toBeDefined();
    expect(view.container.querySelector(".spin-icon")).not.toBeNull();
  });

  it.each(["04_COMPLETED", "05_CANCELLED"])("does not show stale readiness activity for terminal features: %s", stateFolder => {
    const item = { ...makeItem(true), stateFolder, completionRecovery: { ready: false, assessedAt: "old", blockers: [
      { id: "recovery-running", action: "external", actionLabel: "Wait", message: "Old activity" },
    ] } } as WorkItemCard;
    render(<WorkflowPositionCardStack item={item} />);
    expect(screen.queryByText("Refreshing readiness")).toBeNull();
  });
});
