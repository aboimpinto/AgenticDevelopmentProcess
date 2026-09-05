import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowTimingSummaryPanel } from "./workflow-timing-summary-panel.js";

describe("WorkflowTimingSummaryPanel", () => {
  it("distinguishes completed agent runtime from the total including active work", () => {
    render(
      <WorkflowTimingSummaryPanel
        timing={{
          estimatedAiTime: null,
          estimatedHumanTime: null,
          actualDurationMs: 240_000,
          inProgressDurationMs: 480_000,
          aiEstimateAssessment: null,
          aiBoundaryDeltaMs: null,
          aiMidpointErrorPercent: null,
          estimatedHumanTimeSavedMidpointMs: null,
          humanAccelerationMidpoint: null,
        }}
      />,
    );

    expect(screen.getByText("Actual AI execution")).toBeDefined();
    expect(screen.getByText("4m 0s")).toBeDefined();
    expect(screen.getByText("AI execution including in-progress work")).toBeDefined();
    expect(screen.getByText("8m 0s")).toBeDefined();
  });

  it("does not display unbounded accumulated minutes", () => {
    render(
      <WorkflowTimingSummaryPanel
        timing={{
          estimatedAiTime: "12h–19h",
          estimatedHumanTime: "26h–35h",
          actualDurationMs: ((8 * 60 + 52) * 60 + 12) * 1000,
          inProgressDurationMs: null,
          aiEstimateAssessment: "under",
          aiBoundaryDeltaMs: -((3 * 60 + 7) * 60 + 48) * 1000,
          aiMidpointErrorPercent: -42.8,
          estimatedHumanTimeSavedMidpointMs: ((21 * 60 + 37) * 60 + 48) * 1000,
          humanAccelerationMidpoint: 3.44,
        }}
      />,
    );

    expect(screen.getByText("8h 52m 12s")).toBeDefined();
    expect(screen.queryByText("532m 12s")).toBeNull();
    expect(screen.getByText("21h 37m 48s")).toBeDefined();
    expect(screen.getByText("3.4×")).toBeDefined();
    expect(screen.queryByText("AI prediction variance")).toBeNull();
  });
});
