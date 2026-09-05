import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BatchPreviewPlan, FeatureWorkflowSummary, WorkItemCard } from "@hepha/shared";
import type { WorkflowApiAdapter } from "./workflow-api.js";
import { WorkflowInteractionPanel } from "./workflow-interaction-panel.js";

function makeItem(workflowOverrides: Partial<FeatureWorkflowSummary> = {}): WorkItemCard {
  const workflow: FeatureWorkflowSummary = {
    activeRun: null,
    canAcceptHumanReviewFindings: false,
    canContinueImplementing: false,
    canCreateUiRequirements: false,
    canGenerateManualTestPack: false,
    canRecordManualTestFail: false,
    canRecordManualTestPass: false,
    canRecordManualTests: false,
    canRecordUserCodeReview: false,
    canRefineFeature: false,
    canReviewManualTestPack: false,
    canStartImplementing: false,
    canSubmitFinding: false,
    defaultImplementationModel: null,
    designCompletedAt: null,
    findings: [],
    hasDesignArtifacts: false,
    hasRefinementArtifacts: true,
    implementationCompleted: true,
    implementationPhases: [],
    implementationTasks: [],
    lastRun: null,
    manualTestPackStatus: null,
    manualTestsCompletedAt: null,
    readiness: {
      ready: false,
      reasons: [{ code: "deep_dive_stale", message: "Run a current Deep-Dive.", blocking: true }],
    },
    refineCompletedAt: null,
    uiRequirementCheckedAt: null,
    uiRequirementDecision: "unknown",
    uiRequirementReason: null,
    userCodeReviewCompletedAt: null,
    workflowMessage: "Deep-Dive is stale.",
    workflowPosition: null,
    ...workflowOverrides,
  }; 

  return {
    id: "card-057",
    externalId: "FEAT-057",
    kind: "feature",
    title: "Quality gates",
    stateFolder: "03_IN_PROGRESS",
    stateLabel: "In Progress",
    folderName: "FEAT-057-quality-gates",
    folderPath: "/features/FEAT-057",
    documentPath: "/features/FEAT-057/FeatureDescription.md",
    documentRelativePath: "FeatureDescription.md",
    documentUpdatedAt: null,
    epicState: null,
    epicRefinements: [],
    featureWorkflow: workflow,
    implementationEvidence: null,
    linkedEpicIds: [],
    linkedEpics: [],
    linkedFeatureIds: [],
    linkedFeatures: [],
    missingFeatureIds: [],
    phases: [],
    specMarkdown: "# FEAT-057",
    summary: "Quality gates",
    validation: {
      blocksFeatureExtraction: false,
      changedSinceHephaDeepDive: true,
      deepDiveMessage: "Stale",
      deepDiveStatus: "stale",
      lastHephaDeepDiveAt: null,
      needsValidationCount: 0,
    },
  };
}

function makeEpicItem(): WorkItemCard {
  return {
    ...makeItem(),
    id: "epic-011",
    externalId: "EPIC-011",
    kind: "epic",
    title: "Model Catalog And Hierarchical Action Routing",
    stateFolder: "00_EPICS",
    stateLabel: "Epics",
    folderName: "EPIC-011-model-catalog",
    folderPath: "/features/EPIC-011",
    documentPath: "/features/EPIC-011/EpicDescription.md",
    documentRelativePath: "EpicDescription.md",
    epicState: "not-started",
    featureWorkflow: null,
    validation: {
      blocksFeatureExtraction: true,
      changedSinceHephaDeepDive: false,
      deepDiveMessage: "No Hepha Deep-Dive has been recorded for EPIC-011.",
      deepDiveStatus: "not_recorded",
      lastHephaDeepDiveAt: null,
      needsValidationCount: 0,
    },
  };
}

afterEach(cleanup);

describe("WorkflowInteractionPanel", () => {
  it("renders a completed FEAT as read-only even when its Deep-Dive metadata is stale", () => {
    const onStartDeepDive = vi.fn();
    const item: WorkItemCard = {
      ...makeItem({
        implementationCompleted: true,
        manualTestsCompletedAt: "2026-07-20T17:29:38.396Z",
        userCodeReviewCompletedAt: "2026-07-20T17:07:03.371Z",
      }),
      stateFolder: "04_COMPLETED",
      stateLabel: "Completed",
    };

    render(
      <WorkflowInteractionPanel
        api={{ executeAction: vi.fn() } as unknown as WorkflowApiAdapter}
        item={item}
        onStartDeepDive={onStartDeepDive}
        projectId="project-1"
      />,
    );

    expect(screen.getByText("Completed", { exact: true })).toBeDefined();
    expect(screen.queryByText("Deep-Dive Required", { exact: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start FEAT Deep-Dive" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Refine Feature" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Complete Feature" })).toBeNull();
  });

  it("shows aggregate delivery timing for a completed EPIC without reopening extraction", () => {
    const relatedFeature: WorkItemCard = {
      ...makeItem({
        implementationAgentRuns: [{
          agentName: "Implementation Agent",
          agentRole: "implementation",
          completedAt: "2026-01-01T04:00:00.000Z",
          currentStep: null,
          error: null,
          id: "agent-run",
          model: "model",
          phaseNumber: 1,
          phaseTitle: "Delivery",
          reportPath: null,
          startedAt: "2026-01-01T00:00:00.000Z",
          status: "completed",
          summary: null,
          updatedAt: "2026-01-01T04:00:00.000Z",
          workflowRunId: "workflow-run",
        }],
      }),
      stateFolder: "04_COMPLETED",
      stateLabel: "Completed",
      phases: [{
        defaultImplementationModel: null,
        documentPath: "/features/FEATURE-X/Phases/phase.md",
        documentRelativePath: "Phases/phase.md",
        estimatedAiTime: "5h",
        estimatedHumanTime: "10h",
        fileName: "phase.md",
        number: 1,
        predictedModel: null,
        predictedModelSource: "workflow_policy",
        recommendedAgent: null,
        recommendedModel: null,
        status: "COMPLETED",
        title: "Delivery",
        updatedAt: "2026-01-01T04:00:00.000Z",
      }],
    };
    const epic = { ...makeEpicItem(), epicState: "completed" as const };

    render(
      <WorkflowInteractionPanel
        item={epic}
        projectId="project-1"
        relatedFeatures={[relatedFeature]}
      />,
    );

    expect(screen.getByText("EPIC delivery timing")).toBeDefined();
    expect(screen.getByText("4h 0m 0s")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Preview FEATs" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start EPIC Deep-Dive" })).toBeNull();
  });

  it("previews and applies FEAT extraction after an EPIC Deep-Dive is current", () => {
    const onPreviewFeatures = vi.fn();
    const onApplyFeaturePreview = vi.fn();
    const item: WorkItemCard = {
      ...makeEpicItem(),
      validation: {
        blocksFeatureExtraction: false,
        changedSinceHephaDeepDive: false,
        deepDiveMessage: "The source document matches the last Hepha deep-dive record.",
        deepDiveStatus: "current",
        lastHephaDeepDiveAt: "2026-07-12T08:00:00.000Z",
        needsValidationCount: 0,
      },
    };
    const previewPlan: BatchPreviewPlan = {
      applyAllowed: true,
      discoveredCandidates: [],
      epicDocumentHash: "epic-hash",
      epicId: "EPIC-011",
      epicUpdates: [],
      explicitCandidates: [{
        backlinkText: "EPIC-011",
        dependencyIds: [],
        fromExplicitLink: true,
        parentEpic: "EPIC-011",
        plannedDocumentPath: "MemoryBank/Features/01_SUBMITTED/FEAT-058-example/FeatureDescription.md",
        plannedFeatureId: "FEAT-058",
        plannedFolderName: "FEAT-058-example",
        priority: "P1",
        sourceOrder: 1,
        summary: "Example feature",
        title: "Example feature",
      }],
      planHash: "plan-hash",
      previewGeneratedAt: "2026-07-12T08:00:00.000Z",
      warnings: [],
    };

    const { rerender } = render(
      <WorkflowInteractionPanel
        item={item}
        onPreviewFeatures={onPreviewFeatures}
        projectId="project-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview FEATs" }));
    expect(onPreviewFeatures).toHaveBeenCalledWith(item);

    rerender(
      <WorkflowInteractionPanel
        item={item}
        onApplyFeaturePreview={onApplyFeaturePreview}
        previewPlan={previewPlan}
        projectId="project-1"
      />,
    );

    expect(screen.getByText("FEAT-058")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Create FEATs (1)" }));
    expect(onApplyFeaturePreview).toHaveBeenCalledWith(previewPlan);
  });

  it("starts an EPIC Deep-Dive through the session callback when the card requires one", () => {
    const onStartDeepDive = vi.fn();
    const api = { executeAction: vi.fn() } as unknown as WorkflowApiAdapter;
    const item = {
      ...makeEpicItem(),
      validation: {
        ...makeEpicItem().validation,
        needsValidationCount: 1,
      },
    };

    render(
      <WorkflowInteractionPanel
        api={api}
        item={item}
        onStartDeepDive={onStartDeepDive}
        projectId="project-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start EPIC Deep-Dive" }));

    expect(onStartDeepDive).toHaveBeenCalledWith(expect.objectContaining({ externalId: "EPIC-011" }));
    expect(api.executeAction).not.toHaveBeenCalled();
  });

  it("shows Refine Feature after a current no-UI Deep-Dive authorizes refinement", () => {
    const item = makeItem({
      canRefineFeature: true,
      readiness: { ready: true, reasons: [] },
      uiRequirementDecision: "no_ui",
      uiRequirementReason: "No UI requirements are needed. The FEAT can be refined.",
    });

    render(<WorkflowInteractionPanel api={{ executeAction: vi.fn() } as unknown as WorkflowApiAdapter} item={item} projectId="project-1" />);

    expect(screen.getByText("Feature Preparation", { exact: true })).toBeDefined();
    expect(screen.getByRole("button", { name: "Refine Feature" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Design Feature" })).toBeNull();
  });

  it("does not expose a generic Deep-Dive recovery button for an in-progress FEAT", () => {
    render(
      <WorkflowInteractionPanel
        api={{ executeAction: vi.fn() } as unknown as WorkflowApiAdapter}
        item={makeItem()}
        onStartDeepDive={vi.fn()}
        projectId="project-1"
      />,
    );

    expect(screen.queryByRole("button", { name: "Start Deep-Dive" })).toBeNull();
  });

  it("shows autonomous implementation selected by default for Start and allows next-phase-only mode", async () => {
    const item = makeItem({
      canStartImplementing: true,
      implementationCompleted: false,
      readiness: { ready: true, reasons: [] },
    });
    const executeAction = vi.fn().mockResolvedValue({
      kind: "success",
      message: "Started.",
      snapshot: null,
    });

    render(
      <WorkflowInteractionPanel
        api={{ executeAction } as unknown as WorkflowApiAdapter}
        item={item}
        projectId="project-1"
      />,
    );

    const toggle = screen.getByRole("checkbox", { name: "Autonomous implementation" });
    expect(toggle).toHaveProperty("checked", true);
    expect(screen.getByText("Unchecked: implement and accept only the next phase.")).toBeDefined();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Start Implementing" }));

    await waitFor(() => {
      expect(executeAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId: "start-implementing",
          autonomous: false,
        }),
        expect.anything(),
      );
    });
  });

  it("separates current Continue readiness from Complete Feature blockers", () => {
    const item = makeItem({
      canContinueImplementing: true,
      implementationCompleted: false,
      readiness: {
        ready: false,
        reasons: [{
          blocking: true,
          code: "invalid_refine_artifacts",
          message: "A future phase is missing completion evidence.",
        }],
      },
    });

    render(
      <WorkflowInteractionPanel
        api={{ executeAction: vi.fn() } as unknown as WorkflowApiAdapter}
        item={item}
        projectId="project-1"
      />,
    );

    expect(screen.getByText("Current workflow")).toBeDefined();
    expect(screen.getByText("Ready to continue")).toBeDefined();
    expect(screen.getByText("Complete Feature readiness")).toBeDefined();
    expect(screen.getByText("Implementation is not yet completed.")).toBeDefined();
    expect(screen.queryByText("A future phase is missing completion evidence.")).toBeNull();
    expect(screen.getByRole("button", { name: "Continue Implementing" })).toBeDefined();
  });

  it("shows manual continuation after a failed implementation even when preparation is stale", () => {
    const item = makeItem({
      canContinueImplementing: true,
      hasContinuationArtifacts: true,
      hasRefinementArtifacts: false,
      implementationCompleted: false,
      lastRun: {
        command: "continue-implementing",
        completedAt: "2026-07-23T13:13:21.742Z",
        currentNodeId: null,
        currentStep: null,
        error: "Automatic recovery stopped.",
        runId: "failed-run",
        startedAt: "2026-07-23T13:00:00.000Z",
        status: "failed",
        summary: "Durable failure brief.",
        workflowProgress: null,
      },
      readiness: {
        ready: true,
        reasons: [{
          blocking: false,
          code: "deep_dive_stale",
          message: "Preparation is stale; continuation owns recovery.",
        }],
      },
    });

    render(
      <WorkflowInteractionPanel
        api={{ executeAction: vi.fn() } as unknown as WorkflowApiAdapter}
        item={item}
        projectId="project-1"
      />,
    );

    expect(screen.getByRole("button", { name: "Continue Implementing" })).toBeDefined();
  });

  it("records user code review through the dedicated human-review API action", async () => {
    const item = makeItem({ canRecordUserCodeReview: true, readiness: { ready: true, reasons: [] } });
    const api = {
      executeAction: vi.fn(),
      recordHumanReview: vi.fn().mockResolvedValue({ items: [item], summary: "Code review recorded." }),
    } as unknown as WorkflowApiAdapter;

    render(<WorkflowInteractionPanel api={api} item={item} projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: "User Code Review" }));

    await vi.waitFor(() => {
      expect(api.recordHumanReview).toHaveBeenCalledWith("project-1", item.id, "user-code-review");
    });
    expect(api.executeAction).not.toHaveBeenCalled();
  });

  it("opens a finding form and submits its content through the supplied finding action", () => {
    const onSubmitFinding = vi.fn();
    const api = { executeAction: vi.fn() } as unknown as WorkflowApiAdapter;
    const item = makeItem({ canSubmitFinding: true, readiness: { ready: true, reasons: [] } });

    render(
      <WorkflowInteractionPanel
        api={api}
        item={item}
        onSubmitFinding={onSubmitFinding}
        projectId="project-1"
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Submit Finding" })[0]!);
    fireEvent.change(screen.getByRole("textbox", { name: "Finding" }), { target: { value: "The button route is broken." } });
    fireEvent.click(screen.getAllByRole("button", { name: "Submit Finding" })[1]!);

    expect(onSubmitFinding).toHaveBeenCalledWith(item, "The button route is broken.");
    expect(api.executeAction).not.toHaveBeenCalled();
  });
});
