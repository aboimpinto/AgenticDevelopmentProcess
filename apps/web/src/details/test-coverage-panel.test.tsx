// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TestCoveragePanel } from "./test-coverage-panel.js";

afterEach(cleanup);

describe("TestCoveragePanel", () => {
  it("separates actionable FEAT coverage from contextual overall coverage", () => {
    render(<TestCoveragePanel coverage={{
      feature: { assessment: "needs_improvement", comment: "FEAT changed-line coverage should increase toward the 80% reference.", coveredLines: 7, executableLines: 10, percent: 70 },
      overall: { assessment: "perfect", comment: "Overall project coverage is perfect.", coveredLines: 200, executableLines: 200, percent: 100 },
      measuredAt: "2026-07-23T10:00:00.000Z",
      minimumPercent: 80,
      targetPercent: 95,
    }} />);
    expect(screen.getByText("FEAT changed code")).toBeDefined();
    expect(screen.getByText("Overall project")).toBeDefined();
    expect(screen.getByText("70%")).toBeDefined();
    expect(screen.getByText("100%")).toBeDefined();
    expect(screen.getByText(/never asks this FEAT to repair unrelated code/)).toBeDefined();
    expect(screen.getByText(/percentages do not block phase or FEAT completion/)).toBeDefined();
  });

  it("stays absent until a coverage receipt exists", () => {
    const { container } = render(<TestCoveragePanel coverage={null} />);
    expect(container.textContent).toBe("");
  });
});
