// @vitest-environment jsdom

/**
 * Phase 5 — WorkItemDetailBlade Integration Tests
 *
 * Tests for the WorkItemDetailBlade component skeleton — verifies the
 * module resolves, renders structure, and accepts panelContents slot.
 * Full rendering integration tests require FEAT-056 panel components.
 *
 * @see FEAT-055 Phase 5 — work-item-detail-blade module
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { WorkItemDetailBlade } from "./work-item-detail-blade.js";
import type {
  ProjectSummary,
  WorkItemCard,
  WorkItemDocumentDetail,
  MemoryBankStateFolder,
  CardKind,
  DocumentReadStatus,
} from "@hepha/shared";

afterEach(() => {
  cleanup();
});

function makeItem(
  overrides: Partial<WorkItemCard> = {},
): WorkItemCard {
  return {
    documentPath: "MemoryBank/03_IN_PROGRESS/test-feat/feat.md",
    documentRelativePath: "03_IN_PROGRESS/test-feat/feat.md",
    documentUpdatedAt: "2024-01-01T00:00:00Z",
    epicRefinements: [],
    epicState: null,
    externalId: "FEAT-TEST",
    folderName: "test-feat",
    folderPath: "MemoryBank/03_IN_PROGRESS/test-feat",
    id: "feat-test-1",
    implementationEvidence: null,
    kind: "feature" as CardKind,
    linkedEpicIds: [],
    linkedEpics: [],
    linkedFeatureIds: [],
    linkedFeatures: [],
    missingFeatureIds: [],
    phases: [],
    specMarkdown: "# Test Feature\n\nDescription.",
    stateFolder: "03_IN_PROGRESS" as MemoryBankStateFolder,
    stateLabel: "In Progress",
    summary: "Test feature summary",
    title: "Test Feature",
    featureWorkflow: null,
    validation: {
      blocksFeatureExtraction: false,
      changedSinceHephaDeepDive: false,
      deepDiveMessage: "",
      deepDiveStatus: "not_recorded",
      lastHephaDeepDiveAt: null,
      needsValidationCount: 0,
    },
    ...overrides,
  };
}

function makeDoc(
  overrides: Partial<WorkItemDocumentDetail> = {},
): WorkItemDocumentDetail {
  return {
    cardId: "feat-test-1",
    content: "# Test Feature\n\nDescription.",
    documentPath: "MemoryBank/03_IN_PROGRESS/test-feat/feat.md",
    documentRelativePath: "03_IN_PROGRESS/test-feat/feat.md",
    documentUpdatedAt: "2024-01-01T00:00:00Z",
    externalId: "FEAT-TEST",
    folderName: "test-feat",
    kind: "feature" as CardKind,
    readError: null,
    readStatus: "ok" as DocumentReadStatus,
    stateFolder: "03_IN_PROGRESS" as MemoryBankStateFolder,
    stateLabel: "In Progress",
    testCoverage: null,
    title: "Test Feature",
    ...overrides,
  };
}

describe("WorkItemDetailBlade", () => {
  const defaultItem = makeItem();
  const defaultDoc = makeDoc();

  it("module resolves and exports the component", async () => {
    const module = await import("./work-item-detail-blade.js");
    expect(module.WorkItemDetailBlade).toBeDefined();
  });

  it("renders the work item title in heading", () => {
    render(
      <WorkItemDetailBlade
        item={defaultItem}
        isExpanded={false}
        documentDetail={defaultDoc}
        documentDetailLoading={false}
        onClose={vi.fn()}
        onToggleExpanded={vi.fn()}
        onRefreshDocument={vi.fn()}
        onSelectItem={vi.fn()}
        project={null}
        panelContents={null}
      />,
    );
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Test Feature");
  });

  it("renders the external ID", () => {
    render(
      <WorkItemDetailBlade
        item={defaultItem}
        isExpanded={false}
        documentDetail={defaultDoc}
        documentDetailLoading={false}
        onClose={vi.fn()}
        onToggleExpanded={vi.fn()}
        onRefreshDocument={vi.fn()}
        onSelectItem={vi.fn()}
        project={null}
        panelContents={null}
      />,
    );
    expect(screen.getByText("FEAT-TEST")).toBeDefined();
  });

  it("renders state chip", () => {
    render(
      <WorkItemDetailBlade
        item={defaultItem}
        isExpanded={false}
        documentDetail={defaultDoc}
        documentDetailLoading={false}
        onClose={vi.fn()}
        onToggleExpanded={vi.fn()}
        onRefreshDocument={vi.fn()}
        onSelectItem={vi.fn()}
        project={null}
        panelContents={null}
      />,
    );
    expect(screen.getByText("In Progress")).toBeDefined();
  });

  it("renders MemoryBank State summary section", () => {
    render(
      <WorkItemDetailBlade
        item={defaultItem}
        isExpanded={false}
        documentDetail={defaultDoc}
        documentDetailLoading={false}
        onClose={vi.fn()}
        onToggleExpanded={vi.fn()}
        onRefreshDocument={vi.fn()}
        onSelectItem={vi.fn()}
        project={null}
        panelContents={null}
      />,
    );
    expect(screen.getByText("MemoryBank State")).toBeDefined();
    expect(screen.getByText("03_IN_PROGRESS")).toBeDefined();
    const typeMatches = screen.getAllByText("FEATURE");
    expect(typeMatches.length).toBe(2); // header strong + summary tile
  });

  it("renders panelContents when provided", () => {
    const panelContents = <div data-testid="panel-content">Panel content</div>;
    render(
      <WorkItemDetailBlade
        item={defaultItem}
        isExpanded={false}
        documentDetail={defaultDoc}
        documentDetailLoading={false}
        onClose={vi.fn()}
        onToggleExpanded={vi.fn()}
        onRefreshDocument={vi.fn()}
        onSelectItem={vi.fn()}
        project={null}
        panelContents={panelContents}
      />,
    );
    expect(screen.getByTestId("panel-content")).toBeDefined();
    expect(screen.getByText("Panel content")).toBeDefined();
  });

  it("renders the latest FEAT and overall coverage receipt in feature details", () => {
    render(
      <WorkItemDetailBlade
        item={defaultItem}
        isExpanded={false}
        documentDetail={makeDoc({
          testCoverage: {
            feature: { assessment: "ok", comment: "FEAT changed-line coverage is OK.", coveredLines: 8, executableLines: 10, percent: 80 },
            overall: { assessment: "excellent", comment: "Overall project coverage achieved the target.", coveredLines: 96, executableLines: 100, percent: 96 },
            measuredAt: "2026-07-23T10:00:00.000Z",
            minimumPercent: 80,
            targetPercent: 95,
          },
        })}
        documentDetailLoading={false}
        onClose={vi.fn()}
        onToggleExpanded={vi.fn()}
        onRefreshDocument={vi.fn()}
        onSelectItem={vi.fn()}
        project={null}
        panelContents={null}
      />,
    );
    expect(screen.getByText("Test Coverage")).toBeDefined();
    expect(screen.getByText("FEAT changed code")).toBeDefined();
    expect(screen.getByText("Overall project")).toBeDefined();
  });

  it("renders expanded mode with overlay backdrop", () => {
    const { container } = render(
      <WorkItemDetailBlade
        item={defaultItem}
        isExpanded={true}
        documentDetail={defaultDoc}
        documentDetailLoading={false}
        onClose={vi.fn()}
        onToggleExpanded={vi.fn()}
        onRefreshDocument={vi.fn()}
        onSelectItem={vi.fn()}
        project={null}
        panelContents={null}
      />,
    );
    const backdrop = container.querySelector(".detail-overlay-backdrop");
    expect(backdrop).toBeDefined();
  });
});
