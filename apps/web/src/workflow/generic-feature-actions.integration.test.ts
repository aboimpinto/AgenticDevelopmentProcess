import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FeatureWorkflowActionResponse, ProjectSummary, WorkItemCard } from "@hepha/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../api/http-client.js", () => ({
  apiPost: transport.post,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : "Unknown failure",
}));

import { useFeatureActions, type FeatureActionControllerOptions } from "./use-feature-actions.js";

const specification = readFileSync(resolve(import.meta.dirname, "generic-feature-actions.feature"), "utf8");
const item = { externalId: "ITEM", id: "item" } as WorkItemCard;
const project = { id: "project" } as ProjectSummary;
const returnedItem = { externalId: "ITEM", id: "returned-item" } as WorkItemCard;

function options(overrides: Partial<FeatureActionControllerOptions> = {}): FeatureActionControllerOptions {
  return {
    onError: vi.fn(),
    onItems: vi.fn(),
    onNotice: vi.fn(),
    onPendingAction: vi.fn(),
    onProject: vi.fn(),
    onSelectItem: vi.fn(),
    projectId: "project",
    ...overrides,
  };
}

beforeEach(() => {
  transport.post.mockReset();
  transport.post.mockResolvedValue({
    filesChanged: [],
    filesCreated: [],
    items: [returnedItem],
    project,
    summary: "Action completed",
  } satisfies FeatureWorkflowActionResponse);
});

describe("generic feature-action Gherkin integration", () => {
  it("specifies four product-blind action behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it.each([
    ["evaluateFeatureUiRequirement", [item], "/api/feature-ui-requirement", {}],
    ["createUiRequirements", [item], "/api/design-feature", {}],
    ["refineFeature", [item], "/api/refine-feature", {}],
    ["startImplementing", [item, true], "/api/start-implementing", { autonomous: true }],
    ["continueImplementing", [item, false], "/api/continue-implementing", { autonomous: false }],
    ["completeFeature", [item], "/api/complete-feature", {}],
    ["completeEpic", [item], "/api/complete-epic", {}],
    ["cancelFeatureWorkflow", [item], "/api/cancel-feature-workflow", {}],
    ["recordHumanReview", [item, "code-review-complete"], "/api/feature-human-review", { check: "code-review-complete" }],
    ["submitFeatureFinding", [item, "finding"], "/api/feature-findings", { content: "finding" }],
    ["addFeatureFindingDetail", [item, "finding", "detail"], "/api/feature-findings/detail", { content: "detail", findingId: "finding" }],
    ["resolveFeatureFinding", [item, "finding"], "/api/feature-findings/resolve", { findingId: "finding" }],
    ["acceptHumanReviewFindings", [item], "/api/feature-findings/accept-phase", {}],
  ] as const)("maps %s to its exact command", async (name, args, endpoint, extraBody) => {
    const controller = useFeatureActions(options());
    await (controller[name] as (...values: readonly unknown[]) => Promise<void>)(...args);
    expect(transport.post).toHaveBeenCalledWith(endpoint, {
      cardId: "item",
      projectId: "project",
      ...extraBody,
    });
  });

  it("reconciles returned state and command-specific selection", async () => {
    const callbacks = options();
    const controller = useFeatureActions(callbacks);
    await controller.startImplementing(item, true);
    expect(callbacks.onProject).toHaveBeenCalledWith(project);
    expect(callbacks.onItems).toHaveBeenCalledWith([returnedItem]);
    expect(callbacks.onSelectItem).toHaveBeenCalledWith("returned-item");
    expect(callbacks.onNotice).toHaveBeenLastCalledWith("Action completed");
    expect(callbacks.onError).toHaveBeenLastCalledWith(null);
  });

  it("keeps evaluation selection and clears unmatched refinement selection", async () => {
    const callbacks = options();
    const controller = useFeatureActions(callbacks);
    await controller.evaluateFeatureUiRequirement(item);
    expect(callbacks.onSelectItem).not.toHaveBeenCalled();
    expect(callbacks.onNotice).toHaveBeenCalledTimes(1);

    transport.post.mockResolvedValueOnce({ filesChanged: [], filesCreated: [], items: [], project, summary: "Refined" });
    await controller.refineFeature(item);
    expect(callbacks.onSelectItem).toHaveBeenLastCalledWith(null);
  });

  it("reports failure and always clears pending state", async () => {
    transport.post.mockRejectedValueOnce(new Error("Command unavailable"));
    const callbacks = options();
    await useFeatureActions(callbacks).completeFeature(item);
    expect(callbacks.onError).toHaveBeenCalledWith("Command unavailable");
    expect(callbacks.onPendingAction).toHaveBeenLastCalledWith(null);
  });

  it("does not dispatch without a current project", async () => {
    await useFeatureActions(options({ projectId: null })).completeFeature(item);
    expect(transport.post).not.toHaveBeenCalled();
  });
});
