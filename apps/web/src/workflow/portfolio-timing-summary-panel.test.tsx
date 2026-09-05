import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortfolioTimingAnalytics } from "@hepha/shared";

import { PortfolioTimingSummaryPanel } from "./portfolio-timing-summary-panel.js";

describe("PortfolioTimingSummaryPanel", () => {
  it("shows aggregate prediction quality and estimated human-development gain", () => {
    const analytics: PortfolioTimingAnalytics = {
      featureCount: 3,
      comparableFeatureCount: 2,
      totalHumanEstimate: { minimumMs: 72_000_000, maximumMs: 108_000_000, midpointMs: 90_000_000 },
      totalAiEstimate: { minimumMs: 36_000_000, maximumMs: 54_000_000, midpointMs: 45_000_000 },
      totalActualAiDurationMs: 28_800_000,
      estimatedHumanTimeSavedMinimumMs: 43_200_000,
      estimatedHumanTimeSavedMaximumMs: 79_200_000,
      estimatedHumanTimeSavedMidpointMs: 61_200_000,
      humanAccelerationMidpoint: 3.125,
      medianActualToAiEstimateRatio: 0.64,
      meanAbsoluteAiPredictionErrorPercent: 36,
    };

    render(<PortfolioTimingSummaryPanel analytics={analytics} title="EPIC delivery timing" />);

    expect(screen.getByText("EPIC delivery timing")).toBeDefined();
    expect(screen.getByText("2/3")).toBeDefined();
    expect(screen.getByText("17h 0m 0s")).toBeDefined();
    expect(screen.getByText("3.1×")).toBeDefined();
    expect(screen.getByText("Estimated human delivery gain")).toBeDefined();
    expect(screen.queryByText("Mean AI prediction error")).toBeNull();
  });
});
