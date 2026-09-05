// @vitest-environment jsdom

/**
 * Phase 5 — SourceIssueDetailBlade Component Tests
 *
 * Tests for the SourceIssueDetailBlade component that displays an invalid
 * EPIC source issue with message, path, copy action, and summary grid.
 *
 * @see FEAT-055 Phase 5 — source-issue-detail-blade module
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { SourceIssueDetailBlade } from "./source-issue-detail-blade.js";
import type { WorkItemSourceIssue, ProjectSummary } from "@hepha/shared";

afterEach(() => {
  cleanup();
});

describe("SourceIssueDetailBlade", () => {
  const defaultIssue: WorkItemSourceIssue = {
    folderName: "invalid-epic",
    folderPath: "MemoryBank/01_SUBMITTED/invalid-epic",
    id: "source-1",
    kind: "invalid-source",
    message: "The EPIC source file does not contain valid YAML frontmatter.",
    reason: "parse-error",
    severity: "invalid",
    sourcePath:
      "/workspace/example-project/MemoryBank/01_SUBMITTED/invalid-epic/epic.md",
    sourceRelativePath:
      "MemoryBank/01_SUBMITTED/invalid-epic/epic.md",
    sourceType: "epic",
  };

  it("renders the invalid source title", () => {
    render(
      <SourceIssueDetailBlade
        issue={defaultIssue}
        onClose={vi.fn()}
        project={null}
      />,
    );
    expect(screen.getByText("Invalid EPIC source")).toBeDefined();
  });

  it("renders the issue message", () => {
    render(
      <SourceIssueDetailBlade
        issue={defaultIssue}
        onClose={vi.fn()}
        project={null}
      />,
    );
    expect(
      screen.getByText(
        "The EPIC source file does not contain valid YAML frontmatter.",
      ),
    ).toBeDefined();
  });

  it("renders the copy path button", () => {
    render(
      <SourceIssueDetailBlade
        issue={defaultIssue}
        onClose={vi.fn()}
        project={null}
      />,
    );
    const button = screen.getByLabelText("Copy invalid source path");
    expect(button).toBeDefined();
    expect(button.textContent).toContain("Copy path");
  });

  it("disables copy button when sourcePath is null", () => {
    const issueWithoutPath: WorkItemSourceIssue = {
      ...defaultIssue,
      sourcePath: null,
    };
    render(
      <SourceIssueDetailBlade
        issue={issueWithoutPath}
        onClose={vi.fn()}
        project={null}
      />,
    );
    const button = screen.getByLabelText("Source path unavailable");
    expect(button).toBeDefined();
    expect(button.getAttribute("disabled")).not.toBeNull();
  });

  it("renders the summary grid with folder, reason, severity, source", () => {
    render(
      <SourceIssueDetailBlade
        issue={defaultIssue}
        onClose={vi.fn()}
        project={null}
      />,
    );
    expect(screen.getByText("invalid-epic")).toBeDefined();
    expect(screen.getByText("parse-error")).toBeDefined();
    expect(screen.getByText("invalid")).toBeDefined();
    expect(
      screen.getByText(
        "MemoryBank/01_SUBMITTED/invalid-epic/epic.md",
      ),
    ).toBeDefined();
  });

  it("renders the close button", () => {
    render(
      <SourceIssueDetailBlade
        issue={defaultIssue}
        onClose={vi.fn()}
        project={null}
      />,
    );
    expect(
      screen.getByLabelText("Close invalid source detail"),
    ).toBeDefined();
  });

  it("shows source path unavailable when no source path", () => {
    const issue: WorkItemSourceIssue = {
      ...defaultIssue,
      sourcePath: null,
      sourceRelativePath: null,
    };
    render(
      <SourceIssueDetailBlade
        issue={issue}
        onClose={vi.fn()}
        project={null}
      />,
    );
    const matches = screen.getAllByText("Source path unavailable");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
