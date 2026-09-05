import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { ManualTestVerificationApplication } from "../src/application/manual-tests/manual-test-verification-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const project = { id: "project", rootPath: "/project" } as StoredProject;
const epic = { externalId: "EPIC-X", kind: "epic", documentPath: "/epic.md" } as WorkItemCard;
const feature = {
  id: "card", kind: "feature", externalId: "WORK-X", title: "Work", folderPath: "/project/work",
  documentPath: "/feature.md", linkedEpicIds: ["EPIC-X"], stateFolder: "03_IN_PROGRESS",
} as WorkItemCard;

function fixture(overrides: {
  project?: StoredProject | null;
  resolved?: boolean;
  stateFolder?: WorkItemCard["stateFolder"];
  generateApplicability?: "applicable" | "not_applicable" | "incomplete";
} = {}) {
  const metadataStore = { recordFeatureHumanReview: vi.fn(async () => undefined) } as unknown as CardMetadataStore;
  const operations = {
    generatePack: vi.fn(async () => ({
      success: true, packId: "pack", version: "v1", state: "current" as const,
      message: "generated", errors: [], applicability: overrides.generateApplicability ?? "applicable",
      manualTestCount: 1, invalidManualTestCount: 0, isReady: true,
    })),
    queryPackStatus: vi.fn(async () => ({ state: "current" as const, currentPackId: "pack", currentVersion: "v1", hasMarkdown: true, hasPdf: true, isStale: false, isReviewed: true, currentReviewId: "review", failedCount: 0, passedCount: 2, hasResults: true, message: "current" })),
    recordAllPasses: vi.fn(async () => ({ success: true, resultId: "result", findingId: null, message: "passed", errors: [] })),
    recordPackReview: vi.fn(async () => ({ success: true, reviewId: "review", message: "reviewed", errors: [] })),
    recordTestResult: vi.fn(async () => ({ success: true, resultId: "result", findingId: "finding", message: "failed", errors: [] })),
  };
  const maybeStartCompletion = vi.fn(async () => true);
  const notifyChanged = vi.fn();
  const selectedFeature = { ...feature, stateFolder: overrides.stateFolder ?? feature.stateFolder } as WorkItemCard;
  const scanProject = vi.fn(async () => [selectedFeature, epic]);
  const application = new ManualTestVerificationApplication({
    allPhasesResolved: () => overrides.resolved ?? true,
    createCardKey: (kind, externalId) => `${kind}:${externalId}`,
    findProject: () => overrides.project === undefined ? project : overrides.project,
    maybeStartCompletion,
    metadataStore,
    notifyChanged,
    operations: operations as never,
    scanProject,
  });
  return { application, feature: selectedFeature, maybeStartCompletion, metadataStore, notifyChanged, operations, scanProject };
}

describe("manual-test verification application", () => {
  it("returns typed target errors without invoking pack operations", async () => {
    const missing = fixture({ project: null });
    await expect(missing.application.generate({ projectId: "missing", cardId: "card" })).resolves.toEqual(expect.objectContaining({ success: false, message: "Project not found." }));
    expect(missing.operations.generatePack).not.toHaveBeenCalled();
  });

  it("requires resolved implementation phases before pack generation", async () => {
    const target = fixture({ resolved: false });
    const result = await target.application.generate({ projectId: "project", cardId: "card" });
    expect(result).toEqual(expect.objectContaining({ success: false, errors: ["Not all implementation phases are resolved."] }));
    expect(target.operations.generatePack).not.toHaveBeenCalled();
  });

  it("generates from feature and linked EPIC sources and emits a change", async () => {
    const target = fixture();
    const result = await target.application.generate({ projectId: "project", cardId: "card" });
    expect(result).toEqual(expect.objectContaining({ success: true, packId: "pack", state: "current" }));
    expect(target.operations.generatePack).toHaveBeenCalledWith(expect.objectContaining({
      sourceOptions: expect.objectContaining({ featDescriptionPath: "/feature.md", epicDescriptionPath: "/epic.md" }),
    }));
    expect(target.notifyChanged).toHaveBeenCalledWith("project", "manual-test-pack.generated", "WORK-X");
  });

  it("generates derived pack documents inside a completed feature folder", async () => {
    const target = fixture({ stateFolder: "04_COMPLETED" });
    const result = await target.application.generate({ projectId: "project", cardId: "card" });

    expect(result).toEqual(expect.objectContaining({ success: true, packId: "pack", state: "current" }));
    expect(target.operations.generatePack).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ featFolderPath: "/project/work" }),
    }));
  });

  it("records the manual gate as satisfied when delivery is legitimately not applicable", async () => {
    const target = fixture({ generateApplicability: "not_applicable" });

    await expect(target.application.generate({ projectId: "project", cardId: "card" }))
      .resolves.toEqual(expect.objectContaining({ success: true }));

    expect(target.metadataStore.recordFeatureHumanReview).toHaveBeenCalledWith({
      cardKey: "feature:WORK-X",
      check: "manual-tests",
      projectId: "project",
    });
  });

  it("validates review and failing-result identities before adapter calls", async () => {
    const target = fixture();
    await expect(target.application.review({ projectId: "project", cardId: "card" })).resolves.toEqual(expect.objectContaining({ success: false, message: "packId is required." }));
    await expect(target.application.recordResult({ projectId: "project", cardId: "card", packId: "pack", reviewId: "review" }, "fail")).resolves.toEqual(expect.objectContaining({ success: false }));
    expect(target.operations.recordPackReview).not.toHaveBeenCalled();
    expect(target.operations.recordTestResult).not.toHaveBeenCalled();
  });

  it("records an all-pass review and starts completion from refreshed state", async () => {
    const target = fixture();
    const result = await target.application.recordResult({ projectId: "project", cardId: "card", packId: "pack", reviewId: "review" }, "pass");
    expect(target.operations.recordAllPasses).toHaveBeenCalledOnce();
    expect(target.metadataStore.recordFeatureHumanReview).toHaveBeenCalledWith({ cardKey: "feature:WORK-X", check: "manual-tests", projectId: "project" });
    expect(target.scanProject).toHaveBeenCalledTimes(2);
    expect(target.maybeStartCompletion).toHaveBeenCalledWith(project, target.feature);
    expect(result.message).toContain("Complete Feature finalization started.");
  });

  it("records an all-pass review for a completed feature without starting completion again", async () => {
    const target = fixture({ stateFolder: "04_COMPLETED" });
    const result = await target.application.recordResult({
      projectId: "project",
      cardId: "card",
      packId: "pack",
      reviewId: "review",
    }, "pass");

    expect(target.operations.recordAllPasses).toHaveBeenCalledOnce();
    expect(target.metadataStore.recordFeatureHumanReview).toHaveBeenCalledWith({
      cardKey: "feature:WORK-X",
      check: "manual-tests",
      projectId: "project",
    });
    expect(target.maybeStartCompletion).not.toHaveBeenCalled();
    expect(result.message).toBe("passed");
  });

  it("maps current status and contains operation failures", async () => {
    const target = fixture();
    await expect(target.application.status({ projectId: "project", cardId: "card" })).resolves.toEqual(expect.objectContaining({ success: true, status: expect.objectContaining({ state: "current", passedCount: 2 }) }));
    target.operations.queryPackStatus.mockRejectedValueOnce(new Error("database busy"));
    await expect(target.application.status({ projectId: "project", cardId: "card" })).resolves.toEqual(expect.objectContaining({ success: false, summary: "Status query failed: database busy" }));
  });
});
