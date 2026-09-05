// @vitest-environment jsdom

import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { WorkItemDocumentDetail } from "@hepha/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "../api/http-client.js";
import { DesignArtifactsPanel } from "./design-artifacts-panel.js";

const specification = readFileSync(
  resolve(import.meta.dirname, "generic-design-artifact-access.feature"),
  "utf8",
);

vi.mock("../api/http-client.js", () => ({
  apiGet: vi.fn(),
  getErrorMessage: (failure: unknown) => failure instanceof Error ? failure.message : String(failure),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const detail = {
  cardId: "card",
  content: "# Selected design\n\nThe generated document body.",
  documentPath: "/workspace/MemoryBank/Features/design-summary.md",
  documentRelativePath: "MemoryBank/Features/design-summary.md",
  documentUpdatedAt: "2026-07-22T12:00:00.000Z",
  externalId: "ITEM",
  folderName: "item",
  kind: "feature",
  readError: null,
  readStatus: "ok",
  stateFolder: "01_SUBMITTED",
  stateLabel: "Submitted",
  title: "Selected design",
} as WorkItemDocumentDetail;

describe("generic generated design document access Gherkin integration", () => {
  it("specifies product-blind access, preview, download, and dismissal behavior", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("presents the three generated documents as links without inline content", () => {
    render(<DesignArtifactsPanel cardId="card" projectId="project" />);

    const panel = screen.getByRole("region", { name: "Design specifications" });
    expect(within(panel).getAllByRole("button")).toHaveLength(3);
    expect(within(panel).getByRole("button", { name: /UX research report/i })).toBeDefined();
    expect(within(panel).getByRole("button", { name: /Wireframes design/i })).toBeDefined();
    expect(within(panel).getByRole("button", { name: /Design summary/i })).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("The generated document body.")).toBeNull();
  });

  it("loads a selected document into a full-screen reader with its PDF download", async () => {
    vi.mocked(apiGet).mockResolvedValue(detail);
    render(<DesignArtifactsPanel cardId="card:id" projectId="project id" />);

    fireEvent.click(screen.getByRole("button", { name: /Design summary/i }));

    const dialog = await screen.findByRole("dialog", { name: "Design summary" });
    expect(dialog.closest(".design-artifact-overlay")).not.toBeNull();
    expect(await within(dialog).findByText("The generated document body.")).toBeDefined();
    expect(apiGet).toHaveBeenCalledWith(
      "/api/projects/project%20id/work-items/card%3Aid/design-artifacts/design-summary.md",
    );
    expect(within(dialog).getByRole("link", { name: /Download PDF/i }).getAttribute("href")).toBe(
      "/api/projects/project%20id/work-items/card%3Aid/design-artifacts/design-summary.md/pdf",
    );
  });

  it("dismisses the reader while leaving the document links available", async () => {
    vi.mocked(apiGet).mockResolvedValue(detail);
    render(<DesignArtifactsPanel cardId="card" projectId="project" />);

    fireEvent.click(screen.getByRole("button", { name: /UX research report/i }));
    expect(await screen.findByRole("dialog")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Close design specification" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /UX research report/i })).toBeDefined();
  });
});
