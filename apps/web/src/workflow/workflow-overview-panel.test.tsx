/**
 * Tests for WorkflowOverviewPanel.
 */

import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WorkflowOverviewPanel } from "./workflow-overview-panel.js";
import type { OverviewDisplay } from "./workflow-presentation.js";

afterEach(cleanup);

describe("WorkflowOverviewPanel", () => {
  it("shows 'No workflow data' when readinessLabel is 'Not available'", () => {
    const overview: OverviewDisplay = {
      title: "Workflow",
      readinessLabel: "Not available",
      readinessIcon: "warning",
      hasActiveRun: false,
      activeRunCommand: null,
      activeRunStep: null,
      lastRunStatus: null,
      lastRunCommand: null,
      lastRunSummary: null,
      workflowMessage: null,
    };
    render(<WorkflowOverviewPanel overview={overview} />);
    expect(screen.getByText("No workflow data available for this item.")).toBeDefined();
  });

  it("labels readiness as the current workflow rather than feature completion", () => {
    const overview: OverviewDisplay = {
      title: "Workflow",
      readinessLabel: "Ready",
      readinessIcon: "success",
      hasActiveRun: false,
      activeRunCommand: null,
      activeRunStep: null,
      lastRunStatus: null,
      lastRunCommand: null,
      lastRunSummary: null,
      workflowMessage: "All good",
    };
    render(<WorkflowOverviewPanel overview={overview} />);
    expect(screen.getByText("Current workflow")).toBeDefined();
    expect(screen.queryByText("Workflow readiness")).toBeNull();
    expect(screen.getByText("Ready")).toBeDefined();
    expect(screen.getByText("All good")).toBeDefined();
  });

  it("shows transition and post-process progress for an active Start Feature run", () => {
    const overview: OverviewDisplay = {
      title: "Workflow",
      readinessLabel: "Running",
      readinessIcon: "success",
      hasActiveRun: true,
      activeRunCommand: "Start Implementation",
      activeRunStep: "Post-processing phase routing and estimates",
      lastRunStatus: null,
      lastRunCommand: null,
      lastRunSummary: null,
      workflowMessage: null,
      workflowSteps: [
        { id: "create-branch", label: "Create Branch", detail: "Creating branch", status: "completed" },
        { id: "post-process", label: "Post Process", detail: "Post-processing phase routing and estimates", status: "running" },
        { id: "implementation-loop", label: "Implementation Loop", detail: null, status: "pending" },
      ],
    };
    render(<WorkflowOverviewPanel overview={overview} />);

    expect(screen.getByLabelText("Start Feature workflow progress")).toBeDefined();
    expect(screen.getByText("Create Branch")).toBeDefined();
    expect(screen.getByText("Post Process")).toBeDefined();
    expect(screen.getByText("Implementation Loop")).toBeDefined();
    expect(screen.getByText("running", { exact: true })).toBeDefined();
  });

  it("shows active run status", () => {
    const overview: OverviewDisplay = {
      title: "Workflow",
      readinessLabel: "Running",
      readinessIcon: "success",
      hasActiveRun: true,
      activeRunCommand: "Start Implementation",
      activeRunStep: "Building types",
      lastRunStatus: null,
      lastRunCommand: null,
      lastRunSummary: null,
      workflowMessage: null,
    };
    render(<WorkflowOverviewPanel overview={overview} />);
    expect(screen.getByText("Start Implementation")).toBeDefined();
    expect(screen.getByText("Building types")).toBeDefined();
  });

  it("renders dense workflow failure details as labelled fields after decoding display whitespace", () => {
    const overview: OverviewDisplay = {
      title: "Workflow",
      readinessLabel: "Blocked",
      readinessIcon: "blocked",
      hasActiveRun: false,
      activeRunCommand: null,
      activeRunStep: null,
      lastRunStatus: null,
      lastRunCommand: null,
      lastRunSummary: null,
      workflowMessage: "A recovery note remains visible.\\nLast run: Continue implementation failed.\\nLatest report: C:/very/deep/reports/phase-4-code-review.md\\nCurrent finding: F1 required. Location: apps/web/src/workflow/workflow-overview-panel.tsx Finding: Details are dense. Required change: Render labelled fields. Decision requirement: Fix before retry.",
    };
    render(<WorkflowOverviewPanel overview={overview} />);

    const details = screen.getByLabelText("Workflow details");
    expect(details.querySelector("dl")).not.toBeNull();
    expect(screen.getByText("Last run")).toBeDefined();
    expect(screen.getByText("Latest report")).toBeDefined();
    expect(screen.getByText("Current finding")).toBeDefined();
    expect(screen.getByText("Location")).toBeDefined();
    expect(screen.getByText("Finding")).toBeDefined();
    expect(screen.getByText("Required change")).toBeDefined();
    expect(screen.getByText("Decision requirement")).toBeDefined();
    expect(screen.getByText("A recovery note remains visible.")).toBeDefined();
    expect(screen.getByText("C:/very/deep/reports/phase-4-code-review.md")).toBeDefined();
  });

  it("preserves unstructured workflow text and the previous workflow failure brief", () => {
    const overview: OverviewDisplay = {
      title: "Workflow",
      readinessLabel: "Blocked",
      readinessIcon: "blocked",
      hasActiveRun: false,
      activeRunCommand: null,
      activeRunStep: null,
      lastRunStatus: null,
      lastRunCommand: null,
      lastRunSummary: null,
      workflowMessage: "## Previous Workflow Failure Brief\\n- **Location**: apps/web/src/workflow/workflow-overview-panel.tsx\\n- **Required change**: Keep the brief readable.",
    };
    render(<WorkflowOverviewPanel overview={overview} />);

    expect(screen.getByLabelText("Workflow failure details")).toBeDefined();
    expect(screen.getByText("Implementation stopped")).toBeDefined();
    expect(screen.getByText("Location")).toBeDefined();
    expect(screen.getByText("Keep the brief readable.")).toBeDefined();
  });

  it("renders exact blocked readiness diagnostics", () => {
    const overview: OverviewDisplay = {
      title: "Workflow",
      readinessLabel: "Blocked",
      readinessIcon: "blocked",
      hasActiveRun: false,
      activeRunCommand: null,
      activeRunStep: null,
      lastRunStatus: null,
      lastRunCommand: null,
      lastRunSummary: null,
      workflowMessage: "Repair the phase contract before dispatch.",
      blockingReasons: [{
        blocking: true,
        code: "invalid_refine_artifacts",
        detail: "[CONTRACT_TASK_LEDGER_MISMATCH]",
        message: "Phase Task Ledger contains an uncontracted checkbox.",
      }],
    };
    render(<WorkflowOverviewPanel overview={overview} />);

    expect(screen.getByText("[CONTRACT_TASK_LEDGER_MISMATCH]", { exact: true })).toBeDefined();
    expect(screen.getByText("Phase Task Ledger contains an uncontracted checkbox.")).toBeDefined();
  });

  it("preserves real and escaped newlines in the last-run failure summary", () => {
    const overview: OverviewDisplay = {
      title: "Workflow",
      readinessLabel: "Ready",
      readinessIcon: "success",
      hasActiveRun: false,
      activeRunCommand: null,
      activeRunStep: null,
      lastRunStatus: "Failed",
      lastRunCommand: "Continue Implementation",
      lastRunSummary: "## Previous Workflow Failure Brief\\n\\n- Feature: FEAT-064\\n- Failed step: Implementing Phase 2\\n- Raw failure reason: Pi exited with code 143.",
      workflowMessage: null,
    };
    const { container } = render(<WorkflowOverviewPanel overview={overview} />);

    expect(container.querySelector(".workflow-last-run-summary")?.textContent).toBe(
      "## Previous Workflow Failure Brief\n\n- Feature: FEAT-064\n- Failed step: Implementing Phase 2\n- Raw failure reason: Pi exited with code 143.",
    );
  });
});
