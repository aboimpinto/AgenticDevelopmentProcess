import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import { FeatureWorkflowTargetResolver } from "../src/application/features/feature-workflow-target-resolver.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const project = { id: "project" } as StoredProject;
const valid = {
  id: "card", externalId: "WORK", kind: "feature", documentPath: "/doc.md", specMarkdown: "content",
  validation: { deepDiveStatus: "current", needsValidationCount: 0 },
} as WorkItemCard;

function resolver(items: WorkItemCard[], foundProject: StoredProject | null = project) {
  return new FeatureWorkflowTargetResolver({ findProject: () => foundProject, scanProject: async () => items });
}

describe("feature workflow target resolver", () => {
  it("resolves workflow and implementation targets with their distinct validation policies", async () => {
    await expect(resolver([valid]).resolveWorkflow({ projectId: "project", cardId: "card" })).resolves.toEqual(expect.objectContaining({ feature: valid, project }));
    const changedWithoutMarkers = {
      ...valid,
      validation: { ...valid.validation, changedSinceHephaDeepDive: true, deepDiveStatus: "stale" },
    } as WorkItemCard;
    await expect(resolver([changedWithoutMarkers]).resolveWorkflow({ projectId: "project", cardId: "card" }))
      .resolves.toEqual(expect.objectContaining({ feature: changedWithoutMarkers }));
    await expect(resolver([changedWithoutMarkers]).resolveImplementation({ projectId: "project", cardId: "card" }))
      .resolves.toEqual(expect.objectContaining({ feature: changedWithoutMarkers }));
  });

  it("rejects project, feature, document, and validation-marker failures", async () => {
    await expect(resolver([], null).resolveImplementation({ projectId: "x", cardId: "x" })).rejects.toThrow("Project not found.");
    await expect(resolver([]).resolveImplementation({ projectId: "project", cardId: "x" })).rejects.toThrow("FEAT work item not found.");
    await expect(resolver([{ ...valid, documentPath: null } as WorkItemCard]).resolveImplementation({ projectId: "project", cardId: "card" })).rejects.toThrow(/readable source/);
    await expect(resolver([{ ...valid, validation: { ...valid.validation, needsValidationCount: 1 } } as WorkItemCard]).resolveImplementation({ projectId: "project", cardId: "card" })).rejects.toThrow(/validation markers/);
  });

  it("resolves cancellation for any work-item kind", async () => {
    const epic = { id: "epic", externalId: "EPIC", kind: "epic" } as WorkItemCard;
    await expect(resolver([epic]).resolveCancellation({ projectId: "project", cardId: "epic" })).resolves.toEqual({ item: epic, project });
    await expect(resolver([]).resolveCancellation({ projectId: "project", cardId: "missing" })).rejects.toThrow("Work item not found.");
  });

  it("refreshes by identity and preserves the supplied fallback when absent", async () => {
    const refreshed = { ...valid, title: "Refreshed" } as WorkItemCard;
    await expect(resolver([refreshed]).findCurrentFeature(project, "WORK", valid)).resolves.toBe(refreshed);
    await expect(resolver([]).findCurrentFeature(project, "WORK", valid)).resolves.toBe(valid);
  });
});
