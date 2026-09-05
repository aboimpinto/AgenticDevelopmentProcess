import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkItemCard } from "@hepha/shared";
import { ValidationBadges } from "./board-validation.js";

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
  it("does not label an active implementation blocked by completion-only quality evidence", () => {
    render(<ValidationBadges item={makeItem(false)} />);

    expect(screen.queryByText(/quality gap/i)).toBeNull();
  });

  it("shows missing quality evidence after implementation phases are complete", () => {
    render(<ValidationBadges item={makeItem(true)} />);

    expect(screen.getByText("1 quality gap")).toBeDefined();
  });
});
