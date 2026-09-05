import type {
  StoredFeatureFinding,
  StoredImplementationAgentRun,
  StoredImplementationPhaseRun,
} from "@hepha/db";
import type { FeatureWorkflowSummary, PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { ImplementationRunSummaryProjector } from "../src/application/features/implementation-run-summary-projector.js";

function phaseRun(status: StoredImplementationPhaseRun["status"] = "running"): StoredImplementationPhaseRun {
  return {
    agent: "Implementation Agent",
    cardKey: "feature:WORK",
    completedAt: null,
    currentStep: "Working",
    error: status === "failed" || status === "blocked" ? "Old failure" : null,
    model: "model-any",
    phaseNumber: 73,
    phaseTitle: "Arbitrary phase",
    projectId: "project",
    reportPath: null,
    startedAt: "start",
    status,
    summary: "Existing summary",
    updatedAt: "old-update",
    workflowRunId: "run",
  };
}

function lastRun(status: "completed" | "failed" = "failed"): FeatureWorkflowSummary["lastRun"] {
  return {
    command: "continue-implementing",
    completedAt: status === "completed" ? "done" : null,
    currentNodeId: null,
    currentStep: null,
    error: status === "failed" ? "failed" : null,
    runId: "workflow",
    startedAt: "start",
    status,
    summary: null,
    workflowProgress: null,
  };
}

function phase(status: string): PhaseSummary {
  return {
    number: 73,
    status,
    title: "Arbitrary phase",
    updatedAt: "document-update",
  } as PhaseSummary;
}

function fixture() {
  const findLatestReviewReport = vi.fn(() => null as never);
  const summarizeOutput = vi.fn(() => "Review requires changes");
  return {
    findLatestReviewReport,
    projector: new ImplementationRunSummaryProjector({ findLatestReviewReport, summarizeOutput }),
    summarizeOutput,
  };
}

describe("implementation run summary projector", () => {
  it("reconciles a failed stored run when completed workflow and phase Markdown prove recovery", () => {
    const { projector } = fixture();
    const result = projector.mapPhase(
      phaseRun("failed"),
      { folderPath: "/work", phases: [phase("COMPLETED")] },
      lastRun("completed"),
    );

    expect(result).toEqual(expect.objectContaining({
      currentStep: "Phase 73 recovered after phase document update",
      error: null,
      status: "completed",
      updatedAt: "document-update",
    }));
    expect(result.summary).toContain("phase Markdown status is COMPLETED");
  });

  it("attaches the latest unresolved review only while the workflow remains unresolved", () => {
    const current = fixture();
    current.findLatestReviewReport.mockReturnValue({
      markdown: "# Review\n\nChanges are required.",
      path: "/work/code-reviews/latest.md",
      result: "NEEDS_CHANGES",
    });
    const feature = { folderPath: "/work", phases: [phase("IN_PROGRESS")] };

    expect(current.projector.mapPhase(phaseRun(), feature, lastRun("failed"))).toEqual(
      expect.objectContaining({ error: "Review requires changes", reportPath: "/work/code-reviews/latest.md" }),
    );
    current.findLatestReviewReport.mockClear();
    expect(current.projector.mapPhase(phaseRun(), feature, lastRun("completed"))).toEqual(
      expect.objectContaining({ error: null, reportPath: null }),
    );
    expect(current.findLatestReviewReport).not.toHaveBeenCalled();
  });

  it("derives the highest-priority active phase presentation", () => {
    const { projector } = fixture();
    const card = {
      phases: [
        { number: 2, status: "IN_PROGRESS", title: "Implementation" },
        { number: 9, status: "CODE_REVIEW_IN_PROGRESS", title: "Review" },
      ],
    } as WorkItemCard;
    expect(projector.deriveCurrentStep(card)).toBe("Code-Review Phase 9");
    expect(projector.deriveCurrentStep({ phases: [] } as unknown as WorkItemCard)).toBeNull();
  });

  it("projects agent and finding persistence records without storage-only identity fields", () => {
    const { projector } = fixture();
    const agent = {
      agentName: "Worker",
      agentRole: "implementation",
      cardKey: "feature:WORK",
      completedAt: null,
      currentStep: "Working",
      error: null,
      id: "agent-run",
      model: "model-any",
      phaseNumber: 73,
      phaseTitle: "Arbitrary phase",
      projectId: "project",
      reportPath: null,
      startedAt: "start",
      status: "running",
      summary: null,
      updatedAt: "update",
      workflowRunId: "workflow",
    } as StoredImplementationAgentRun;
    const finding = {
      cardKey: "feature:WORK",
      closedAt: null,
      createdAt: "created",
      currentStep: null,
      error: null,
      events: [],
      id: "finding",
      projectId: "project",
      runId: null,
      status: "open",
      summary: null,
      title: "Generic finding",
      updatedAt: "updated",
    } as StoredFeatureFinding;

    expect(projector.mapAgent(agent)).not.toHaveProperty("cardKey");
    expect(projector.mapFinding(finding)).not.toHaveProperty("projectId");
    expect(projector.mapFinding(finding)).toEqual(expect.objectContaining({ id: "finding", title: "Generic finding" }));
  });
});
