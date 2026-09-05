// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, renderHook } from "@testing-library/react";
import type { BatchPreviewPlan, ProjectSummary, WorkItemCard } from "@hepha/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../api/http-client.js", () => ({
  apiPost: transport.post,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : "Unknown failure",
}));

import { formatMissingFeaturesNotice, isRecoverableMissingFeaturesPreviewError } from "../missing-feature-preview.js";
import { useMissingFeaturePreview, type MissingFeaturePreviewOptions } from "./use-missing-feature-preview.js";

const specification = readFileSync(resolve(import.meta.dirname, "generic-missing-feature-preview.feature"), "utf8");
const item = { id: "parent" } as WorkItemCard;
const project = { id: "project" } as ProjectSummary;
const items = [{ id: "child" }] as WorkItemCard[];
const plan = {
  applyAllowed: true,
  epicDocumentHash: "document-hash",
  planHash: "plan-hash",
} as BatchPreviewPlan;

function options(overrides: Partial<MissingFeaturePreviewOptions> = {}): MissingFeaturePreviewOptions {
  return {
    onError: vi.fn(),
    onItems: vi.fn(),
    onNotice: vi.fn(),
    onPendingAction: vi.fn(),
    onProject: vi.fn(),
    projectId: "project",
    ...overrides,
  };
}

beforeEach(() => transport.post.mockReset());

describe("generic missing-feature preview Gherkin integration", () => {
  it("specifies four product-blind preview behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("previews current-parent candidates and reconciles visible items", async () => {
    transport.post.mockResolvedValue({ items, plan });
    const callbacks = options();
    const { result } = renderHook(() => useMissingFeaturePreview(callbacks));
    await act(async () => result.current.preview(item));
    expect(transport.post).toHaveBeenCalledWith("/api/missing-features/preview", {
      cardId: "parent",
      projectId: "project",
    });
    expect(callbacks.onItems).toHaveBeenCalledWith(items);
    expect(result.current.plan).toBe(plan);
    expect(result.current.isLoading).toBe(false);
  });

  it("applies the exact preview evidence and formats the returned outcome", async () => {
    transport.post
      .mockResolvedValueOnce({ items, plan })
      .mockResolvedValueOnce({
        blockedFeatureIds: ["blocked"],
        createdFeatureIds: ["created"],
        discoveredFeatureCount: 2,
        epicUpdates: [{ section: "Children", updated: true }],
        existingFeatureIds: ["existing"],
        items,
        project,
        recoveredFeatureIds: ["recovered"],
        warnings: ["warning"],
      });
    const callbacks = options();
    const { result } = renderHook(() => useMissingFeaturePreview(callbacks));
    await act(async () => result.current.preview(item));
    await act(async () => result.current.apply(plan));
    expect(transport.post).toHaveBeenLastCalledWith("/api/missing-features", {
      cardId: "parent",
      planHash: "plan-hash",
      previewPlan: plan,
      projectId: "project",
      sourceDocumentHash: "document-hash",
    });
    expect(callbacks.onProject).toHaveBeenCalledWith(project);
    expect(callbacks.onPendingAction).toHaveBeenLastCalledWith(null);
    expect(callbacks.onNotice).toHaveBeenLastCalledWith(
      "Created 1 FEAT(s): created. Already existed (skipped): 1 FEAT(s). Partially recovered: recovered. Blocked: blocked. EPIC updated: Children. 1 warning(s).",
    );
    expect(result.current.plan).toBeNull();
  });

  it("classifies stale evidence and clears a rejected preview", async () => {
    expect(isRecoverableMissingFeaturesPreviewError("Preview plan is stale")).toBe(true);
    expect(isRecoverableMissingFeaturesPreviewError("Permission denied")).toBe(false);
    transport.post.mockResolvedValueOnce({ items, plan }).mockRejectedValueOnce(new Error("Epic document has changed since preview"));
    const callbacks = options();
    const { result } = renderHook(() => useMissingFeaturePreview(callbacks));
    await act(async () => result.current.preview(item));
    await act(async () => result.current.apply(plan));
    expect(callbacks.onError).toHaveBeenLastCalledWith("Epic document has changed since preview");
    expect(result.current.plan).toBeNull();
  });

  it("cancels locally, formats empty outcomes, and refuses dispatch without a project", async () => {
    expect(formatMissingFeaturesNotice({ createdFeatureIds: [], discoveredFeatureCount: 0 } as never)).toBe(
      "Hepha did not find unnamed FEATs to create from this EPIC.",
    );
    const callbacks = options({ projectId: null });
    const { result } = renderHook(() => useMissingFeaturePreview(callbacks));
    await act(async () => result.current.preview(item));
    act(() => result.current.cancel());
    expect(transport.post).not.toHaveBeenCalled();
    expect(callbacks.onNotice).toHaveBeenLastCalledWith("Preview cancelled. No files were created.");
  });
});
