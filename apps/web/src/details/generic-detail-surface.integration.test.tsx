// @vitest-environment jsdom

import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { WorkItemCard, WorkItemSourceIssue } from "@hepha/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DetailBladeProps } from "./detail-blade.js";
import { DetailBlade } from "./detail-blade-router.js";

const specification = readFileSync(
  resolve(import.meta.dirname, "generic-detail-surface.feature"),
  "utf8",
);

vi.mock("./work-item-detail-blade.js", () => ({
  WorkItemDetailBlade: ({ item, panelContents }: { item: WorkItemCard; panelContents: React.ReactNode }) => (
    <section data-testid="work-item-blade">
      {item.title}
      {panelContents}
      <div>latest specification</div>
    </section>
  ),
}));
vi.mock("./source-issue-detail-blade.js", () => ({
  SourceIssueDetailBlade: ({ issue }: { issue: WorkItemSourceIssue }) => (
    <section data-testid="source-issue-blade">{issue.message}</section>
  ),
}));
vi.mock("./project-blade.js", () => ({
  ProjectBlade: ({ selectedProject }: { selectedProject: { name: string } | null }) => (
    <section data-testid="project-blade">{selectedProject?.name ?? "new project"}</section>
  ),
}));
vi.mock("../workflow/workflow-interaction-panel.js", () => ({
  WorkflowInteractionPanel: () => <div>workflow panel</div>,
}));
vi.mock("./feature-delivery-panel.js", () => ({
  FeatureDeliveryPanel: () => <div>delivery panel</div>,
}));
vi.mock("./relation-panel.js", () => ({
  RelationPanel: () => <div>relationship panel</div>,
}));
vi.mock("./link-epic-panel.js", () => ({
  LinkEpicPanel: () => <div>linking panel</div>,
}));
vi.mock("./design-artifacts-panel.js", () => ({
  DesignArtifactsPanel: () => <div>design documents panel</div>,
}));
vi.mock("./epic-refinement-panel.js", () => ({
  EpicRefinementPanel: () => <div>refinement panel</div>,
}));
vi.mock("../manual-tests/manual-test-verification-panel.js", () => ({
  ManualTestVerificationPanel: () => <div>manual test panel</div>,
}));

afterEach(cleanup);

const item = {
  documentUpdatedAt: null,
  epicRefinements: [],
  epicState: null,
  externalId: "ITEM",
  featureWorkflow: null,
  id: "item",
  kind: "feature",
  linkedEpicIds: [],
  linkedEpics: [],
  linkedFeatureIds: [],
  linkedFeatures: [],
  stateFolder: "03_IN_PROGRESS",
  title: "Selected work item",
} as unknown as WorkItemCard;

function createProps(overrides: Partial<DetailBladeProps> = {}): DetailBladeProps {
  return {
    form: { memoryBankPath: "", name: "", rootPath: "" },
    isAddingProject: false,
    isCreating: false,
    isDetailExpanded: false,
    mode: "project",
    onClose: vi.fn(),
    onAddFeatureFindingDetail: vi.fn(),
    onAcceptHumanReviewFindings: vi.fn(),
    onCancelFeatureWorkflow: vi.fn(),
    onCompleteEpic: vi.fn(),
    onCompleteFeature: vi.fn(),
    onCreateMissingFeatures: vi.fn(),
    onCreateUiRequirements: vi.fn(),
    onEvaluateFeatureUiRequirement: vi.fn(),
    onContinueImplementing: vi.fn(),
    onCreateProject: vi.fn(),
    onFormChange: vi.fn(),
    documentDetail: null,
    documentDetailLoading: false,
    onRefreshDocument: vi.fn(),
    onToggleDetailExpanded: vi.fn(),
    onRecordHumanReview: vi.fn(),
    onResolveFeatureFinding: vi.fn(),
    onRefineFeature: vi.fn(),
    onSelectItem: vi.fn(),
    onStartImplementing: vi.fn(),
    onStartDeepDive: vi.fn(),
    onOpenDeepDiveRecovery: vi.fn(),
    onLinkFeatureToEpic: vi.fn(),
    isLinkingEpic: false,
    linkEpicResult: null,
    linkEpicError: null,
    onSubmitEpicRefinement: vi.fn(),
    onSubmitFeatureFinding: vi.fn(),
    pendingDeepDiveAction: null,
    previewPlan: null,
    onApplyMissingFeatures: vi.fn(),
    onCancelPreview: vi.fn(),
    isPreviewLoading: false,
    selectedItem: null,
    workItems: [],
    selectedProject: null,
    selectedSourceIssue: null,
    onGenerateManualTestPack: vi.fn(),
    onReviewManualTestPack: vi.fn(),
    onRecordManualTestResult: vi.fn(),
    onFetchManualTestStatus: vi.fn(),
    ...overrides,
  };
}

describe("generic detail surface Gherkin integration", () => {
  it("specifies four product-blind routing behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("routes a selected work item to the work item blade", () => {
    render(<DetailBlade {...createProps({ mode: "detail", selectedItem: item })} />);
    expect(screen.getByTestId("work-item-blade").textContent).toContain("Selected work item");
  });

  it("routes a selected source issue to the diagnostic blade", () => {
    const issue = { id: "issue", message: "Source needs attention" } as WorkItemSourceIssue;
    render(<DetailBlade {...createProps({ mode: "source-issue", selectedSourceIssue: issue })} />);
    expect(screen.getByTestId("source-issue-blade").textContent).toBe("Source needs attention");
  });

  it("routes project context to the project blade", () => {
    const selectedProject = { id: "project", name: "Current project" } as DetailBladeProps["selectedProject"];
    render(<DetailBlade {...createProps({ selectedProject })} />);
    expect(screen.getByTestId("project-blade").textContent).toBe("Current project");
  });

  it("composes supporting panels for a feature detail", () => {
    const selectedProject = { id: "project", name: "Current project" } as DetailBladeProps["selectedProject"];
    render(<DetailBlade {...createProps({ mode: "detail", selectedItem: item, selectedProject })} />);
    expect(screen.getByText("workflow panel")).toBeDefined();
    expect(screen.getByText("delivery panel")).toBeDefined();
    expect(screen.getByText("relationship panel")).toBeDefined();
    expect(screen.getByText("linking panel")).toBeDefined();
  });

  it("places generated design access between EPIC linking and the latest specification", () => {
    const selectedProject = { id: "project", name: "Current project" } as DetailBladeProps["selectedProject"];
    const designedItem = {
      ...item,
      featureWorkflow: { hasDesignArtifacts: true },
    } as WorkItemCard;
    const { container } = render(
      <DetailBlade {...createProps({ mode: "detail", selectedItem: designedItem, selectedProject })} />,
    );
    const text = container.textContent ?? "";

    expect(text.indexOf("linking panel")).toBeLessThan(text.indexOf("design documents panel"));
    expect(text.indexOf("design documents panel")).toBeLessThan(text.indexOf("latest specification"));
  });
});
