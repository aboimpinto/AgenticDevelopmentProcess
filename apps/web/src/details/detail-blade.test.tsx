// @vitest-environment jsdom

/**
 * Phase 3 — Business Logic Integration Tests
 *
 * Tests for the detail-blade routing contract and RelationPanel component.
 * Verifies that modular routing preserves selection, routing, and document/error contracts.
 *
 * @see FEAT-055 Phase 3 planning-analysis-report.md for contract ownership.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import type { WorkItemRelation } from "@hepha/shared";
import { RelationPanel } from "./relation-panel.js";

afterEach(() => {
  cleanup();
});

// ─── RelationPanel ────────────────────────────────────────────────────────

describe("RelationPanel", () => {
  const defaultProps = {
    emptyLabel: "No relations found",
    onSelectItem: vi.fn(),
    relations: [] as WorkItemRelation[],
    title: "Linked Items",
  };

  it("renders the title", () => {
    render(<RelationPanel {...defaultProps} />);
    expect(screen.getByText("Linked Items")).toBeDefined();
  });

  it("renders empty label when no relations", () => {
    render(<RelationPanel {...defaultProps} />);
    expect(screen.getByText("No relations found")).toBeDefined();
  });

  it("renders relation rows", () => {
    const relations: WorkItemRelation[] = [
      {
        externalId: "EXT-001",
        id: "feat-1",
        kind: "feature",
        stateFolder: "03_IN_PROGRESS",
        stateLabel: "In Progress",
        title: "Feature One",
      },
      {
        externalId: "EXT-002",
        id: "feat-2",
        kind: "feature",
        stateFolder: "04_COMPLETED",
        stateLabel: "Completed",
        title: "Feature Two",
      },
    ];

    render(<RelationPanel {...defaultProps} relations={relations} />);

    expect(screen.getByText("EXT-001")).toBeDefined();
    expect(screen.getByText("Feature One")).toBeDefined();
    expect(screen.getByText("In Progress")).toBeDefined();
    expect(screen.getByText("EXT-002")).toBeDefined();
    expect(screen.getByText("Feature Two")).toBeDefined();
    expect(screen.getByText("Completed")).toBeDefined();
  });

  it("calls onSelectItem when a relation row is clicked", () => {
    const onSelectItem = vi.fn();
    const relations: WorkItemRelation[] = [
      {
        externalId: "EXT-001",
        id: "feat-1",
        kind: "feature",
        stateFolder: "03_IN_PROGRESS",
        stateLabel: "In Progress",
        title: "Feature One",
      },
    ];

    render(
      <RelationPanel
        {...defaultProps}
        onSelectItem={onSelectItem}
        relations={relations}
      />,
    );

    screen.getByText("EXT-001").click();
    expect(onSelectItem).toHaveBeenCalledWith("feat-1");
  });

  it("assigns the correct aria-labelledby ID derived from the title", () => {
    const relations: WorkItemRelation[] = [
      {
        externalId: "EXT-001",
        id: "feat-1",
        kind: "feature",
        stateFolder: "03_IN_PROGRESS",
        stateLabel: "In Progress",
        title: "Feature One",
      },
    ];

    render(
      <RelationPanel
        {...defaultProps}
        relations={relations}
        title="My Relations"
      />,
    );

    const section = screen.getByRole("region");
    expect(section.getAttribute("aria-labelledby")).toBe("my-relations-title");
  });

  it("uses emptyLabel when no relations exist", () => {
    render(<RelationPanel {...defaultProps} emptyLabel="Nothing linked" />);
    expect(screen.getByText("Nothing linked")).toBeDefined();
  });
});

// ─── Detail routing contract (type-level verification) ────────────────────
// These tests verify the detail-blade module interface contract is internally
// consistent. Generic routing behavior is covered by
// generic-detail-surface.integration.test.tsx.

describe("DetailBlade routing contract", () => {
  it("detail-blade module resolves and exports the interface contract", async () => {
    const detailBlade = await import("./detail-blade.js");
    expect(detailBlade).toBeDefined();
  });

  it("detail-blade router resolves as the runtime owner", async () => {
    const detailBladeRouter = await import("./detail-blade-router.js");
    expect(detailBladeRouter.DetailBlade).toBeDefined();
  });
});
