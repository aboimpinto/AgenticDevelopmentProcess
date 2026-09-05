// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { WorkItemDocumentDetail } from "@hepha/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DesignArtifactPreview } from "./design-artifact-preview.js";

const base = {
  artifact: "design-summary.md" as const,
  detail: null,
  error: null,
  isLoading: false,
  label: "Design summary",
  onClose: vi.fn(),
  pdfUrl: "/design-summary.pdf",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DesignArtifactPreview", () => {
  it("presents the full-screen reader actions and closes by button or Escape", () => {
    render(<DesignArtifactPreview {...base} />);

    expect(screen.getByRole("dialog", { name: "Design summary" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Download PDF/i }).getAttribute("href")).toBe("/design-summary.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Close design specification" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(base.onClose).toHaveBeenCalledTimes(2);
  });

  it("renders loading, failure, unavailable, and successful document states", () => {
    const rendered = render(<DesignArtifactPreview {...base} isLoading />);
    expect(screen.getByText("Loading design specification...")).toBeTruthy();

    rendered.rerender(<DesignArtifactPreview {...base} error="Safe read failure" />);
    expect(screen.getByText("Safe read failure")).toBeTruthy();

    rendered.rerender(<DesignArtifactPreview {...base} />);
    expect(screen.getByText("The selected design specification is unavailable.")).toBeTruthy();

    const detail = {
      content: "# Generated design\n\nReadable body.",
      readStatus: "ok",
    } as WorkItemDocumentDetail;
    rendered.rerender(<DesignArtifactPreview {...base} detail={detail} />);
    expect(screen.getByRole("heading", { name: "Generated design" })).toBeTruthy();
    expect(screen.getByText("Readable body.")).toBeTruthy();
  });
});
