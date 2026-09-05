import type { CardMetadataStore } from "@hepha/db";
import type { FeatureHumanReviewInput, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { FeatureHumanReviewApplication } from "../src/application/features/feature-human-review-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const project = { id: "project" } as StoredProject;
const feature = { id: "card", externalId: "WORK", kind: "feature" } as WorkItemCard;

function harness(options: { resolved?: boolean; completion?: boolean } = {}) {
  const metadataStore = { recordFeatureHumanReview: vi.fn(async () => undefined) } as unknown as CardMetadataStore;
  const dependencies = {
    allPhasesResolved: vi.fn(() => options.resolved ?? true),
    createCardKey: () => "feature:WORK",
    metadataStore,
    notifyChanged: vi.fn(),
    resolveImplementation: vi.fn(async () => ({ feature, project })),
    scanProject: vi.fn(async () => [feature]),
    startCompletion: vi.fn(async () => options.completion ?? false),
    toProjectSummary: vi.fn(() => ({ id: "project" } as never)),
  };
  return { application: new FeatureHumanReviewApplication(dependencies), dependencies, metadataStore };
}

describe("feature human-review application", () => {
  it("records code-review evidence and offers the feature to completion", async () => {
    const target = harness({ completion: true });
    const result = await target.application.record({ projectId: "project", cardId: "card", check: "user-code-review" });
    expect(target.metadataStore.recordFeatureHumanReview).toHaveBeenCalledWith({
      cardKey: "feature:WORK", check: "user-code-review", projectId: "project",
    });
    expect(target.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.human-review", "WORK");
    expect(target.dependencies.startCompletion).toHaveBeenCalledWith(project, feature);
    expect(result.summary).toMatch(/finalization started/);
  });

  it("records manual-test evidence without claiming completion when not ready", async () => {
    const target = harness();
    const result = await target.application.record({ projectId: "project", cardId: "card", check: "manual-tests" });
    expect(result.summary).toBe("Manual tests recorded for WORK.");
  });

  it("rejects unresolved phases and unknown runtime input", async () => {
    const unresolved = harness({ resolved: false });
    await expect(unresolved.application.record({ projectId: "project", cardId: "card", check: "user-code-review" })).rejects.toThrow(/every numbered phase/);
    expect(unresolved.metadataStore.recordFeatureHumanReview).not.toHaveBeenCalled();
    await expect(harness().application.record({ projectId: "project", cardId: "card", check: "unexpected" } as FeatureHumanReviewInput)).rejects.toThrow("Unknown human review action.");
  });
});
