// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ProjectSummary } from "@hepha/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubmitEpicOverlay, initialSubmitEpicForm } from "./epic-submission-overlay.js";
import { SubmitFeatOverlay, initialSubmitFeatForm } from "./feature-submission-overlay.js";

const specification = readFileSync(resolve(import.meta.dirname, "generic-work-item-submission.feature"), "utf8");
const project = { id: "project", name: "Project" } as ProjectSummary;

afterEach(cleanup);

describe("generic work-item submission Gherkin integration", () => {
  it("specifies four identity-blind form behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("switches the production EPIC overlay to idea input", () => {
    render(
      <SubmitEpicOverlay
        form={initialSubmitEpicForm}
        isSubmitting={false}
        onClose={vi.fn()}
        onFormChange={vi.fn()}
        onSubmit={vi.fn()}
        project={project}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Submit EPIC" })).toBeDefined();
    expect(screen.getByText("Structured fields")).toBeDefined();
  });

  it("renders the production FEAT overlay and delegates cancellation", () => {
    const onClose = vi.fn();
    render(
      <SubmitFeatOverlay
        form={initialSubmitFeatForm}
        isSubmitting={false}
        onClose={onClose}
        onFormChange={vi.fn()}
        onSubmit={vi.fn()}
        project={project}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
