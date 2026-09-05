import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { FeaturePreparationApplication } from "../src/application/features/feature-preparation-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const project = { id: "project" } as StoredProject;
const base = {
  id: "card", externalId: "WORK", kind: "feature", stateFolder: "01_SUBMITTED",
  featureWorkflow: { activeRun: null, hasDesignArtifacts: false, hasRefinementArtifacts: false, uiRequirementDecision: "no_ui" },
} as WorkItemCard;

function harness(feature: WorkItemCard = base) {
  const metadataStore = {
    recordFeatureUiRequirement: vi.fn(async () => undefined),
    recordFeatureWorkflowRun: vi.fn(async () => undefined),
  } as unknown as CardMetadataStore;
  const dependencies = {
    createCardKey: () => "feature:WORK", createId: () => "id",
    evaluateUiDecision: vi.fn(async () => ({ decision: "requires_ui" as const, reason: "UI required" })),
    metadataStore, notifyChanged: vi.fn(), resolveWorkflow: vi.fn(async () => ({ feature, project })),
    scanProject: vi.fn(async () => [feature]), sourceHash: vi.fn(() => "hash"),
    startDesignWorker: vi.fn(async () => undefined), startRefineWorker: vi.fn(async () => undefined),
    toProjectSummary: vi.fn(() => ({ id: "project" } as never)),
  };
  return { application: new FeaturePreparationApplication(dependencies), dependencies, metadataStore };
}

describe("feature preparation application", () => {
  it("records UI classification against the current source", async () => {
    const target = harness();
    const result = await target.application.evaluateUi({ projectId: "project", cardId: "card" });
    expect(target.metadataStore.recordFeatureUiRequirement).toHaveBeenCalledWith({
      cardKey: "feature:WORK", decision: "requires_ui", projectId: "project", reason: "UI required", sourceDocumentHash: "hash",
    });
    expect(result.summary).toBe("UI required");
  });

  it("starts design only after a UI-required decision and before artifacts exist", async () => {
    const feature = { ...base, featureWorkflow: { ...base.featureWorkflow!, uiRequirementDecision: "requires_ui" } } as WorkItemCard;
    const target = harness(feature);
    await target.application.startDesign({ projectId: "project", cardId: "card" });
    expect(target.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ command: "design-feature", status: "running" }));
    expect(target.dependencies.startDesignWorker).toHaveBeenCalledWith(expect.objectContaining({ runId: "workflow-id" }));
    await expect(harness(base).application.startDesign({ projectId: "project", cardId: "card" })).rejects.toThrow(/requiring UI work/);
    await expect(harness({ ...feature, featureWorkflow: { ...feature.featureWorkflow!, hasDesignArtifacts: true } } as WorkItemCard).application.startDesign({ projectId: "project", cardId: "card" })).rejects.toThrow(/already exist/);
  });

  it("applies generic refinement eligibility before dispatch", async () => {
    const target = harness();
    await target.application.startRefine({ projectId: "project", cardId: "card" });
    expect(target.dependencies.startRefineWorker).toHaveBeenCalledOnce();
    await expect(harness({ ...base, stateFolder: "04_COMPLETED" } as WorkItemCard).application.startRefine({ projectId: "project", cardId: "card" })).rejects.toThrow(/submitted or ready/);
    await expect(harness({ ...base, featureWorkflow: { ...base.featureWorkflow!, uiRequirementDecision: "unknown" } } as WorkItemCard).application.startRefine({ projectId: "project", cardId: "card" })).rejects.toThrow(/classify whether/);
  });

  it("rejects a concurrent preparation workflow", async () => {
    const running = { ...base, featureWorkflow: { ...base.featureWorkflow!, activeRun: { command: "refine-feature", runId: "run", status: "running" } } } as WorkItemCard;
    await expect(harness(running).application.startRefine({ projectId: "project", cardId: "card" })).rejects.toThrow(/already has a running/);
  });

  it("requires the pending refinement Deep-Dive to complete before another refinement round", async () => {
    const blocked = {
      ...base,
      featureWorkflow: {
        ...base.featureWorkflow!,
        lastRun: { command: "refine-feature", runId: "run", status: "blocked" },
      },
    } as WorkItemCard;
    const target = harness(blocked);
    await expect(target.application.startRefine({ projectId: "project", cardId: "card" }))
      .rejects.toThrow(/pending FEAT Deep-Dive/);
    expect(target.dependencies.startRefineWorker).not.toHaveBeenCalled();
  });
});
