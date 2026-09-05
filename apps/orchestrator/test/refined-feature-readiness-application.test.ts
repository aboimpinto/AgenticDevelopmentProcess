import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  RefinedFeatureReadinessApplication,
  resolveArchitectureDebtPrerequisiteStates,
} from "../src/application/features/refined-feature-readiness-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

function harness() {
  const dependencies = {
    clockNow: vi.fn(() => "2026-07-21T00:00:00.000Z"),
    confirmReadinessSource: vi.fn(async () => undefined),
    databasePath: vi.fn(() => null),
    scanProject: vi.fn(async () => []),
    stewardId: vi.fn(() => undefined),
  };
  return { application: new RefinedFeatureReadinessApplication(dependencies), dependencies };
}

describe("refined feature readiness application", () => {
  it("derives canonical prerequisite state and rejects ambiguous feature identities", () => {
    const completed = { externalId: "ITEM-A", kind: "feature", stateFolder: "04_COMPLETED" } as WorkItemCard;
    const submitted = { externalId: "ITEM-B", kind: "feature", stateFolder: "01_SUBMITTED" } as WorkItemCard;
    expect(resolveArchitectureDebtPrerequisiteStates([completed, submitted])).toEqual([
      { featureId: "item-a", state: "COMPLETED" },
      { featureId: "item-b", state: "SUBMITTED" },
    ]);
    expect(() => resolveArchitectureDebtPrerequisiteStates([completed, { ...completed }])).toThrow("ambiguous");
  });

  it("fails closed when structured architecture-debt storage is unavailable", async () => {
    const current = harness();
    await expect(current.application.assertArchitectureDebtReady(
      { externalId: "ITEM-ANY", kind: "feature" } as WorkItemCard,
      { id: "project" } as StoredProject,
    )).rejects.toThrow("requires SQLite storage");
  });

  it("records the exact refined source only after the debt gate authorizes it", async () => {
    const current = harness();
    vi.spyOn(current.application, "assertArchitectureDebtReady").mockResolvedValue();
    const feature = {
      documentPath: "/feature/FeatureDescription.md",
      documentUpdatedAt: "now",
      externalId: "ITEM-ANY",
      kind: "feature",
      specMarkdown: "# Refined scope",
    } as WorkItemCard;
    const previousFeature = { featureWorkflow: { uiRequirementDecision: "no_ui" } } as WorkItemCard;
    await current.application.confirm({ cardKey: "feature:item-any", feature, previousFeature, project: { id: "project" } as StoredProject });
    expect(current.application.assertArchitectureDebtReady).toHaveBeenCalledBefore(current.dependencies.confirmReadinessSource);
    expect(current.dependencies.confirmReadinessSource).toHaveBeenCalledWith(expect.objectContaining({
      cardKey: "feature:item-any", projectId: "project", sourceDocumentUpdatedAt: "now",
      sourceDocumentHash: expect.any(String), uiRequirementSourceHash: expect.any(String),
    }));
  });
});
