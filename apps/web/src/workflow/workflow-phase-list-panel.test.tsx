/**
 * Tests for WorkflowPhaseListPanel.
 */

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { RouteIdentityV1, RuntimePhaseEvidenceSummaryV1 } from "@hepha/shared";
import { WorkflowPhaseListPanel, type RuntimeEvidenceListBinding } from "./workflow-phase-list-panel.js";
import type { PhaseRowDisplay } from "./workflow-presentation.js";

function makePhaseRow(overrides?: Partial<PhaseRowDisplay>): PhaseRowDisplay {
  return {
    number: 1,
    title: "Phase 1",
    status: "pending",
    statusLabel: "Pending",
    isCurrent: false,
    isCompleted: false,
    isBlocked: false,
    isActive: false,
    hasError: false,
    errorMessage: null,
    agent: null,
    model: null,
    modelSource: null,
    runtimeExecutions: [],
    estimatedHumanTime: null,
    estimatedAiTime: null,
    actualDurationMs: null,
    aiEstimateAssessment: null,
    aiBoundaryDeltaMs: null,
    estimatedHumanTimeSavedMidpointMs: null,
    humanAccelerationMidpoint: null,
    activityLabel: null,
    ...overrides,
  };
}

describe("WorkflowPhaseListPanel", () => {
  it("shows 'No phases defined' when phases array is empty", () => {
    render(<WorkflowPhaseListPanel phases={[]} />);
    expect(screen.getByText("No phases defined for this feature.")).toBeDefined();
  });

  it("renders phase rows with title and status", () => {
    const phases = [makePhaseRow({ number: 1, title: "Phase Alpha", statusLabel: "Completed" })];
    render(<WorkflowPhaseListPanel phases={phases} />);
    expect(screen.getByText("Phase 1 Phase Alpha")).toBeDefined();
    expect(screen.getByText("Completed")).toBeDefined();
  });

  it("visually distinguishes an in-progress phase with a spinner and active badge", () => {
    const { container } = render(<WorkflowPhaseListPanel phases={[
      makePhaseRow({
        isActive: true,
        isCurrent: true,
        number: 2,
        status: "IN_PROGRESS",
        statusLabel: "In Progress",
      }),
    ]} />);

    expect(container.querySelector(".phase-row-icon .spin-icon")).not.toBeNull();
    expect(container.querySelector(".phase-row-icon-active")).not.toBeNull();
    expect(screen.getByText("In Progress").classList.contains("phase-status-active")).toBe(true);
  });

  it("renders the model selected by the orchestrator command", () => {
    render(<WorkflowPhaseListPanel phases={[
      makePhaseRow({ agent: "Phase Worker", model: "deepseek-v4-flash", modelSource: "orchestrator_command" }),
    ]} />);

    expect(screen.getByText("Agent: Phase Worker · Orchestrator command model: deepseek-v4-flash")).toBeDefined();
  });

  it("renders phase estimates and completed actual execution time", () => {
    render(<WorkflowPhaseListPanel phases={[
      makePhaseRow({ actualDurationMs: 90_000, estimatedAiTime: "30m", estimatedHumanTime: "2h" }),
    ]} />);

    expect(screen.getByText("Human delivery estimate: 2h · Actual AI execution: 1m 30s · AI planning estimate: 30m")).toBeDefined();
  });

  it("renders phase-level variance, human gain, and acceleration", () => {
    render(<WorkflowPhaseListPanel phases={[
      makePhaseRow({
        actualDurationMs: 60 * 60 * 1000,
        estimatedAiTime: "2h",
        estimatedHumanTime: "4h",
        aiEstimateAssessment: "under",
        aiBoundaryDeltaMs: -60 * 60 * 1000,
        estimatedHumanTimeSavedMidpointMs: 3 * 60 * 60 * 1000,
        humanAccelerationMidpoint: 4,
      }),
    ]} />);

    expect(screen.getByText("Est. human delivery gain: 3h 0m 0s · 4.0× acceleration")).toBeDefined();
    expect(screen.queryByText(/AI variance/)).toBeNull();
  });

  it("shows phase count", () => {
    const phases = [
      makePhaseRow({ number: 1 }),
      makePhaseRow({ number: 2 }),
    ];
    render(<WorkflowPhaseListPanel phases={phases} />);
    expect(screen.getByText("2 phases")).toBeDefined();
  });

  it("binds runtime details by stable execution-contract identity", () => {
    const onLoadMore = vi.fn();
    const onRefresh = vi.fn();
    const onToggle = vi.fn();
    const summary = makeRuntimeSummary({ phaseExecutionContractId: "delivery-contract" });
    const runtimeEvidence: RuntimeEvidenceListBinding = {
      summaries: [makeRuntimeSummary({ phaseExecutionContractId: null, state: "not_recorded" }), summary],
      snapshots: {
        "delivery-contract": { executions: [], nextCursor: "next-cursor", loadedPageCount: 1 },
      },
      openPhaseIds: new Set(["delivery-contract"]),
      pendingPhaseIds: new Set(),
      isRefreshing: false,
      isStale: true,
      onToggle,
      onLoadMore,
      onRefresh,
    };

    render(<WorkflowPhaseListPanel
      phases={[makePhaseRow({ executionContractId: "delivery-contract", title: "Delivery" })]}
      runtimeEvidence={runtimeEvidence}
    />);

    expect(screen.getByText("1 execution · Orchestrated · connection-a / model-a · 1.0s · Completed")).toBeDefined();
    expect(screen.getByText("Last confirmed snapshot")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Load more runtime evidence" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide runtime evidence" }));
    expect(onLoadMore).toHaveBeenCalledWith("delivery-contract");
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledWith("delivery-contract");
  });

  it("keeps phase-attributed runtime evidence available without a native execution contract", () => {
    render(<WorkflowPhaseListPanel
      phases={[makePhaseRow({
        actualDurationMs: 60_000,
        executionContractId: null,
        number: 1,
        runtimeExecutions: [{
          id: "execution-1",
          workflowRunId: "workflow-1",
          agent: "DevCycle MCP Compatibility Agent",
          commandModel: "deepseek-v4-flash",
          startedAt: "2026-01-01T00:00:00Z",
          completedAt: "2026-01-01T00:01:00Z",
          durationMs: 60_000,
          status: "completed",
        }],
      })]}
      runtimeEvidence={{
        summaries: [makeRuntimeSummary({ phaseExecutionContractId: null, state: "not_recorded" })],
        snapshots: {},
        openPhaseIds: new Set(),
        pendingPhaseIds: new Set(),
        isRefreshing: false,
        isStale: false,
        onToggle: vi.fn(),
        onLoadMore: vi.fn(),
        onRefresh: vi.fn(),
      }}
    />);

    expect(screen.getByText("1 phase-attributed execution")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Show runtime evidence" }));
    expect(screen.getByText("Command model")).toBeDefined();
    expect(screen.getByText("deepseek-v4-flash")).toBeDefined();
    expect(screen.getByText("Measured duration")).toBeDefined();
    expect(screen.getByText("1m 0s")).toBeDefined();
    expect(screen.getByText("Workflow")).toBeDefined();
    expect(screen.getByText("workflow-1")).toBeDefined();
    expect(screen.queryByText("Legacy activity · Not recorded")).toBeNull();
  });

  it("shows number-matched legacy evidence without enabling unstable details", () => {
    const onToggle = vi.fn();
    render(<WorkflowPhaseListPanel
      phases={[makePhaseRow({ executionContractId: null, number: 1 })]}
      runtimeEvidence={{
        summaries: [makeRuntimeSummary({ phaseExecutionContractId: null, state: "not_recorded" })],
        snapshots: {},
        openPhaseIds: new Set(),
        pendingPhaseIds: new Set(),
        isRefreshing: false,
        isStale: false,
        onToggle,
        onLoadMore: vi.fn(),
        onRefresh: vi.fn(),
      }}
    />);

    expect(screen.getByText("Legacy activity · Not recorded")).toBeDefined();
    expect(screen.getByRole("button", { name: "Show runtime evidence" }).hasAttribute("disabled")).toBe(true);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

function makeRuntimeSummary(
  overrides: Partial<RuntimePhaseEvidenceSummaryV1> = {},
): RuntimePhaseEvidenceSummaryV1 {
  return {
    phaseExecutionContractId: "delivery-contract",
    phaseNumber: 1,
    phaseTitle: "Delivery",
    state: "completed",
    invocationCount: 1,
    executionModes: ["orchestrated"],
    directModelEvidence: [],
    actualRoutes: [{ connectionId: "connection-a", modelId: "model-a" } as RouteIdentityV1],
    aggregateDurationMs: 1_000,
    finalOutcome: "completed",
    failureCode: null,
    ...overrides,
  };
}
