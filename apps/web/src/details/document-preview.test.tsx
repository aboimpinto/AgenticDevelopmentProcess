// @vitest-environment jsdom

/**
 * Phase 5 — DocumentPreview Component Tests
 *
 * Tests for the DocumentPreview component that renders the specification
 * document content with loading, missing, unreadable, and error states.
 *
 * @see FEAT-055 Phase 5 — document-preview module
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { DocumentPreview } from "./document-preview.js";
import type {
  WorkItemDocumentDetail,
  MemoryBankStateFolder,
  CardKind,
  DocumentReadStatus,
} from "@hepha/shared";

afterEach(() => {
  cleanup();
});

function makeDoc(overrides: Partial<WorkItemDocumentDetail>): WorkItemDocumentDetail {
  return {
    cardId: "feat-1",
    content: "",
    documentPath: "/path/doc.md",
    documentRelativePath: "doc.md",
    documentUpdatedAt: null,
    externalId: "FEAT-1",
    folderName: "test",
    kind: "feature" as CardKind,
    readError: null,
    readStatus: "ok" as DocumentReadStatus,
    stateFolder: "01_SUBMITTED" as MemoryBankStateFolder,
    stateLabel: "Submitted",
    title: "Test",
    ...overrides,
    testCoverage: overrides.testCoverage ?? null,
  };
}

describe("DocumentPreview", () => {
  it("renders loading state when loading without existing content", () => {
    render(
      <DocumentPreview
        detailMarkdown=""
        documentDetail={null}
        documentDetailLoading={true}
      />,
    );
    expect(screen.getByText("Loading document from disk...")).toBeDefined();
  });

  it("renders refreshing indicator when loading with existing content", () => {
    const doc = makeDoc({
      content: "# Existing",
      documentUpdatedAt: "2024-01-01T00:00:00Z",
    });
    render(
      <DocumentPreview
        detailMarkdown={doc.content}
        documentDetail={doc}
        documentDetailLoading={true}
      />,
    );
    expect(screen.getByText(/(refreshing...)/)).toBeDefined();
  });

  it("renders missing document state with readError", () => {
    const doc = makeDoc({
      readError: "File not found on disk.",
      readStatus: "missing" as DocumentReadStatus,
    });
    render(
      <DocumentPreview
        detailMarkdown=""
        documentDetail={doc}
        documentDetailLoading={false}
      />,
    );
    expect(screen.getByText("File not found on disk.")).toBeDefined();
  });

  it("renders default missing message when no readError", () => {
    const doc = makeDoc({
      readStatus: "missing" as DocumentReadStatus,
    });
    render(
      <DocumentPreview
        detailMarkdown=""
        documentDetail={doc}
        documentDetailLoading={false}
      />,
    );
    expect(
      screen.getByText("The selected work item document was not found on disk."),
    ).toBeDefined();
  });

  it("renders unreadable document state", () => {
    const doc = makeDoc({
      readError: "Permission denied.",
      readStatus: "unreadable" as DocumentReadStatus,
    });
    render(
      <DocumentPreview
        detailMarkdown=""
        documentDetail={doc}
        documentDetailLoading={false}
      />,
    );
    expect(
      screen.getByText(/Could not read the selected document/),
    ).toBeDefined();
    expect(screen.getByText(/Permission denied/)).toBeDefined();
  });

  it("renders markdown content for ok status", () => {
    const doc = makeDoc({
      content: "# Hello World\n\nThis is a test.",
      documentUpdatedAt: "2024-01-01T00:00:00Z",
    });
    render(
      <DocumentPreview
        detailMarkdown={doc.content}
        documentDetail={doc}
        documentDetailLoading={false}
      />,
    );
    expect(screen.getByText("Hello World")).toBeDefined();
    expect(screen.getByText("This is a test.")).toBeDefined();
  });

  it("keeps document paragraphs separate from the specification label and wraps tables", () => {
    const doc = makeDoc({
      content: [
        "A normal document paragraph with **important inline text**.",
        "",
        "| Route | Behaviour |",
        "| --- | --- |",
        "| Global Default | A deliberately long cell that must remain inside the scrollable table wrapper. |",
      ].join("\n"),
    });
    const { container } = render(
      <DocumentPreview
        detailMarkdown={doc.content}
        documentDetail={doc}
        documentDetailLoading={false}
      />,
    );

    expect(container.querySelector(".output-block > .output-block-title")?.textContent).toContain(
      "Latest Specification",
    );
    expect(container.querySelector(".markdown-document p")?.textContent).toContain(
      "normal document paragraph",
    );
    expect(container.querySelector(".markdown-table-scroll > table")).not.toBeNull();
  });

  it("shows error status badge for non-ok readStatus", () => {
    const doc = makeDoc({
      readStatus: "missing" as DocumentReadStatus,
    });
    render(
      <DocumentPreview
        detailMarkdown=""
        documentDetail={doc}
        documentDetailLoading={false}
      />,
    );
    expect(screen.getByText("(missing)")).toBeDefined();
  });

  it("renders Latest Specification header", () => {
    render(
      <DocumentPreview
        detailMarkdown=""
        documentDetail={null}
        documentDetailLoading={false}
      />,
    );
    expect(screen.getByText("Latest Specification")).toBeDefined();
  });

  it("shows error marker for unreadable documents", () => {
    const doc = makeDoc({
      readStatus: "unreadable" as DocumentReadStatus,
    });
    render(
      <DocumentPreview
        detailMarkdown=""
        documentDetail={doc}
        documentDetailLoading={false}
      />,
    );
    expect(screen.getByText("(unreadable)")).toBeDefined();
  });

  it("shows empty-inline for empty markdown", () => {
    const doc = makeDoc({});
    render(
      <DocumentPreview
        detailMarkdown=""
        documentDetail={doc}
        documentDetailLoading={false}
      />,
    );
    expect(
      screen.getByText("No Markdown document was found in this work item folder."),
    ).toBeDefined();
  });
});
