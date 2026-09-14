import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("WorkflowInteractionPanel", () => {
  it("locks an already-open finding form and workflow mutations during server-owned refresh, then restores them", () => {
    const item = makeItem({ canSubmitFinding: true, canRecordUserCodeReview: true, canAcceptHumanReviewFindings: true, readiness: { ready: true, reasons: [] } });
    const submit = vi.fn();
    const props = { projectId: "example", onSubmitFinding: submit };
    const view = render(<WorkflowInteractionPanel {...props} item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit Finding" }));
    fireEvent.change(screen.getByPlaceholderText("Describe the observed problem, expected outcome, and evidence."), { target: { value: "Saved draft" } });
    const running = { ...item, completionRecovery: { ready: false, assessedAt: "now", blockers: [{ id: "recovery-running", action: "external" as const, message: "Running", actionLabel: "Wait" }] } };
    view.rerender(<WorkflowInteractionPanel {...props} item={running} />);
    expect(screen.getByRole("button", { name: "Refreshing Readiness" })).toHaveProperty("disabled", true);
    for (const button of screen.getAllByRole("button", { name: /Submit Finding|User Code Review|Accept Findings|Complete Feature/i })) expect(button).toHaveProperty("disabled", true);
    fireEvent.submit(screen.getByPlaceholderText("Describe the observed problem, expected outcome, and evidence.").closest("form")!);
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty("disabled", false);
    view.rerender(<WorkflowInteractionPanel {...props} item={item} />);
    expect(screen.getByRole("button", { name: "Refresh Completion Readiness" })).toHaveProperty("disabled", false);
    expect(screen.getByPlaceholderText("Describe the observed problem, expected outcome, and evidence.")).toHaveProperty("value", "Saved draft");
  });
  it("keeps the repair action directly in the owning phase without a duplicate readiness shortcut", async () => {
    const item = makeItem({ canRecordUserCodeReview: true });
    item.phases = [{ number: 12, title: "Verification", status: "COMPLETED", updatedAt: "now" }] as WorkItemCard["phases"];
    item.completionRecovery = { ready: false, assessedAt: "now", blockers: [{ id: "phase-recovery-12", phaseNumber: 12, action: "phase",
      message: "1 quality gap", actionLabel: "Fix Phase 12 quality gaps" }], phaseGaps: [{ id: "phase-12-acceptance_coverage", phaseNumber: 12,
      phaseTitle: "Verification", kind: "acceptance_coverage", title: "Acceptance coverage", details: ["AC-01 lacks an execution report"], sourceIds: ["AC-01"], instruction: "Inspect existing evidence first." }] };
    const submit = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [item], summary: "Repair started" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkflowInteractionPanel item={item} projectId="project-1" onSubmitFinding={submit} />);
    expect(screen.queryByRole("button", { name: "Fix Phase 12 quality gaps" })).toBeNull();
    const repair = screen.getByRole("button", { name: "Verify / repair phase quality gaps" });
    expect(repair.closest("details")).toBeNull();
    fireEvent.click(repair);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/phase-quality/resolve", expect.objectContaining({ method: "POST" })));
    expect(JSON.parse(fetchMock.mock.calls.find(([url]) => url === "/api/phase-quality/resolve")![1].body)).toMatchObject({ gate: "completion_recovery", phaseNumber: 12, action: "repair" });
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Complete Feature" })).toHaveProperty("disabled", true);
  });

  it("refreshes authoritative readiness without granting human acceptance", async () => {
    const item = makeItem();
    const fresh = makeItem({ readiness: { ready: true, reasons: [] }, canRecordUserCodeReview: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [fresh] }) });
    vi.stubGlobal("fetch", fetchMock);
    const onItemsUpdated = vi.fn();
    const { rerender } = render(<WorkflowInteractionPanel item={item} projectId="project-1" onItemsUpdated={onItemsUpdated} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh Completion Readiness" }));
    await waitFor(() => expect(onItemsUpdated).toHaveBeenCalledWith([fresh]));
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/completion-readiness", expect.objectContaining({ method: "POST", body: JSON.stringify({ cardId: item.id, reassess: true, verifyExisting: true }) }));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("complete-feature"))).toHaveLength(0);
    rerender(<WorkflowInteractionPanel item={fresh} projectId="project-1" onItemsUpdated={onItemsUpdated} />);
    expect(screen.getByText("User code review is pending.")).toBeTruthy();
    expect(screen.getByText("Manual tests are pending.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Complete Feature" })).toHaveProperty("disabled", true);
  });

  it("shows refresh failures without discarding the existing blockers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Scanner unavailable")));
    render(<WorkflowInteractionPanel item={makeItem()} projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh Completion Readiness" }));
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Complete Feature readiness" })).getByRole("alert").textContent).toContain("Scanner unavailable"));
    expect(screen.getByRole("button", { name: "Complete Feature" })).toHaveProperty("disabled", true);
  });

  it("offers Design after a completed Deep-Dive even when submitted readiness has no recovery reasons", async () => {
    const item = { ...makeItem({ canCreateUiRequirements: true, canRefineFeature: false,
      hasRefinementArtifacts: false, implementationCompleted: false, uiRequirementDecision: "requires_ui",
      readiness: { ready: true, reasons: [] },
      lastRun: { command: "deep-dive-feature", status: "completed" } as FeatureWorkflowSummary["lastRun"],
    }), stateFolder: "01_SUBMITTED" } as WorkItemCard;
    const executeAction = vi.fn().mockResolvedValue({ kind: "success", message: "Design started", snapshot: null });
    render(<WorkflowInteractionPanel item={item} projectId="project-1" onStartDeepDive={vi.fn()} api={{ executeAction } as unknown as WorkflowApiAdapter} />);
    const design = screen.getByRole("button", { name: "Design Feature" });
    expect(design).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Refine Feature" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Start FEAT Deep-Dive" })).toBeDefined();
    fireEvent.click(design);
    await waitFor(() => expect(executeAction).toHaveBeenCalledWith(expect.objectContaining({ actionId: "create-ui-requirements" }), expect.anything()));
  });

  it("renders Design only once when readiness also supplies a missing-design recovery reason", () => {
    const item = makeItem({ canCreateUiRequirements: true, uiRequirementDecision: "requires_ui",
      readiness: { ready: false, reasons: [{ code: "missing_design_artifacts", blocking: true, message: "Design required" }] },
    });
    item.stateFolder = "01_SUBMITTED";
    render(<WorkflowInteractionPanel item={item} projectId="project-1" />);
    expect(screen.getAllByRole("button", { name: "Design Feature" })).toHaveLength(1);
  });
  it("can reopen the existing interview overlay without submitting different focus", () => {
    const onStartDeepDive = vi.fn();
    const item = makeItem({ activeRun: { status: "running", command: "deep-dive-feature" } as FeatureWorkflowSummary["activeRun"] });
    render(<WorkflowInteractionPanel item={item} projectId="project-1" onStartDeepDive={onStartDeepDive} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue FEAT Deep-Dive" }));
    expect(onStartDeepDive).toHaveBeenCalledWith(item);
    expect(screen.getByLabelText("Deep-Dive focus (optional)")).toHaveProperty("disabled", true);
  });
  it("offers voluntary Deep-Dive with user focus when a feature has no validation markers", () => {
    const onStartDeepDive = vi.fn();
    const item = makeItem({ readiness: { ready: true, reasons: [] }, uiRequirementDecision: "no_ui" });
    render(<WorkflowInteractionPanel item={item} projectId="project-1" onStartDeepDive={onStartDeepDive} />);
    fireEvent.change(screen.getByLabelText("Deep-Dive focus (optional)"), { target: { value: "Explore keyboard navigation and responsive layouts" } });
    fireEvent.click(screen.getByRole("button", { name: "Start FEAT Deep-Dive" }));
    expect(onStartDeepDive).toHaveBeenCalledWith(item, "Explore keyboard navigation and responsive layouts");
  });

  it("keeps voluntary Deep-Dive visible but disabled while implementation runs", () => {
    const item = makeItem({ activeRun: { status: "running", command: "continue-implementing" } as FeatureWorkflowSummary["activeRun"] });
    render(<WorkflowInteractionPanel item={item} projectId="project-1" onStartDeepDive={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Start FEAT Deep-Dive" })).toHaveProperty("disabled", true);
  });

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
    item.stateFolder = "01_SUBMITTED";

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
