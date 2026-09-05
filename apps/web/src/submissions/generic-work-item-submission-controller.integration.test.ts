// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FormEvent } from "react";
import { act, renderHook } from "@testing-library/react";
import type { ProjectSummary, WorkItemCard } from "@hepha/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../api/http-client.js", () => ({
  apiPost: transport.post,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : "Unknown failure",
}));

import { useEpicSubmission, type EpicSubmissionOptions } from "./use-epic-submission.js";
import { useFeatureSubmission, type FeatureSubmissionOptions } from "./use-feature-submission.js";

const specification = readFileSync(
  resolve(import.meta.dirname, "generic-work-item-submission-controller.feature"),
  "utf8",
);
const project = { id: "project" } as ProjectSummary;
const items = [{ id: "returned" }] as WorkItemCard[];
const event = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent<HTMLFormElement>;

function callbacks() {
  return {
    onError: vi.fn(),
    onItems: vi.fn(),
    onNotice: vi.fn(),
    onPendingAction: vi.fn(),
    onProject: vi.fn(),
    onSelectItem: vi.fn(),
    onShowDetail: vi.fn(),
  };
}

function epicOptions(overrides: Partial<EpicSubmissionOptions> = {}): EpicSubmissionOptions {
  const common = callbacks();
  return {
    ...common,
    onRefinementPending: vi.fn(),
    onSubmissionPending: common.onPendingAction,
    projectId: "project",
    ...overrides,
  };
}

function featureOptions(overrides: Partial<FeatureSubmissionOptions> = {}): FeatureSubmissionOptions {
  return { ...callbacks(), projectId: "project", ...overrides };
}

beforeEach(() => {
  transport.post.mockReset();
});

describe("generic work-item submission controller Gherkin integration", () => {
  it("specifies four product-blind submission behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("submits parent form state and reconciles the returned aggregate", async () => {
    transport.post.mockResolvedValue({ epic: { id: "parent" }, items, project, summary: "Parent submitted" });
    const options = epicOptions();
    const { result } = renderHook(() => useEpicSubmission(options));
    act(() => {
      result.current.open();
      result.current.setForm((current) => ({ ...current, title: "Parent title" }));
    });
    await act(async () => result.current.submit(event()));

    expect(transport.post).toHaveBeenCalledWith("/api/submit-epic", expect.objectContaining({
      projectId: "project",
      title: "Parent title",
    }));
    expect(options.onProject).toHaveBeenCalledWith(project);
    expect(options.onItems).toHaveBeenCalledWith(items);
    expect(options.onSelectItem).toHaveBeenCalledWith("parent");
    expect(options.onShowDetail).toHaveBeenCalledOnce();
    expect(result.current.isOpen).toBe(false);
    expect(result.current.form.title).toBe("");
  });

  it("submits child form state and closes an open form with Escape", async () => {
    transport.post.mockResolvedValue({ feature: { id: "child" }, items, project, summary: "Child submitted" });
    const options = featureOptions();
    const { result } = renderHook(() => useFeatureSubmission(options));
    act(() => {
      result.current.open();
      result.current.setForm((current) => ({ ...current, title: "Child title" }));
    });
    await act(async () => result.current.submit(event()));
    expect(transport.post).toHaveBeenCalledWith("/api/submit-feature", expect.objectContaining({
      projectId: "project",
      title: "Child title",
    }));
    expect(options.onSelectItem).toHaveBeenCalledWith("child");
    expect(options.onPendingAction).toHaveBeenNthCalledWith(1, "submit-feat");
    expect(options.onPendingAction).toHaveBeenLastCalledWith(null);

    act(() => result.current.open());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(result.current.isOpen).toBe(false);
  });

  it("submits parent refinement with the durable evidence chain", async () => {
    transport.post.mockResolvedValue({ epic: { id: "parent" }, items, project, summary: "Parent refined" });
    const options = epicOptions();
    const { result } = renderHook(() => useEpicSubmission(options));
    await act(async () => result.current.refine({ id: "item" } as WorkItemCard, "Clarify scope"));
    expect(transport.post).toHaveBeenCalledWith("/api/epic-refinements", {
      cardId: "item",
      projectId: "project",
      request: "Clarify scope",
    });
    expect(options.onRefinementPending).toHaveBeenNthCalledWith(1, "epic-refinement-item");
    expect(options.onRefinementPending).toHaveBeenLastCalledWith(null);
    expect(options.onNotice).toHaveBeenLastCalledWith("Parent refined");
  });

  it("reports failures, clears pending state, and refuses dispatch without a project", async () => {
    transport.post.mockRejectedValueOnce(new Error("Submission unavailable"));
    const options = featureOptions();
    const { result } = renderHook(() => useFeatureSubmission(options));
    await act(async () => result.current.submit(event()));
    expect(options.onError).toHaveBeenCalledWith("Submission unavailable");
    expect(options.onPendingAction).toHaveBeenLastCalledWith(null);

    const absent = featureOptions({ projectId: null });
    const noProject = renderHook(() => useFeatureSubmission(absent));
    await act(async () => noProject.result.current.submit(event()));
    expect(transport.post).toHaveBeenCalledTimes(1);
    act(() => noProject.result.current.close());
    expect(noProject.result.current.isOpen).toBe(false);
  });
});
