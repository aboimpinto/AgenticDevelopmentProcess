import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BatchPreviewPlan, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { calculatePlanHash } from "../src/batch-preview/plan-builder.js";
import {
  MissingFeatureBatchApplication,
  validateApprovedPreviewPlan,
} from "../src/application/features/missing-feature-batch-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const markdown = `
## Features Breakdown

| Feature ID | Title | Status | Dependencies | Priority |
| --- | --- | --- | --- | --- |
| TBD | Generic child capability | SUBMITTED | None | P1 |
`;
const epic = {
  documentPath: null,
  externalId: "PARENT-ANY",
  id: "parent-card",
  kind: "epic",
  specMarkdown: markdown,
  title: "Generic parent",
  validation: { blocksFeatureExtraction: false },
} as WorkItemCard;

function harness(items: WorkItemCard[] = [epic]) {
  const root = mkdtempSync(join(tmpdir(), "hepha-batch-application-"));
  const project = {
    createdAt: "before",
    id: "project-any",
    memoryBankPath: root,
    name: "Generic project",
    rootPath: root,
    updatedAt: "before",
  } as StoredProject;
  const discover = { discover: vi.fn(async () => []) };
  const dependencies = {
    discover,
    documentWriter: { createFromEpicReference: vi.fn(() => true), createFromPlan: vi.fn(() => true) },
    findProject: () => project,
    idAllocator: { advanceFeaturePast: vi.fn() },
    scanProject: vi.fn(async () => items),
    synchronizeEpic: { syncEpic: vi.fn(() => false) },
  };
  return { application: new MissingFeatureBatchApplication(dependencies), dependencies };
}

describe("missing feature batch application", () => {
  it("builds deterministic explicit previews without invoking model discovery", async () => {
    const current = harness();
    const result = await current.application.preview({ cardId: epic.id, projectId: "project-any" });
    expect(result.plan.applyAllowed).toBe(true);
    expect(result.plan.discoveredCandidates[0]).toEqual(expect.objectContaining({ title: "Generic child capability" }));
    expect(current.dependencies.discover.discover).not.toHaveBeenCalled();
  });

  it("rejects extraction when the current EPIC validation state blocks it", async () => {
    const blocked = { ...epic, validation: { blocksFeatureExtraction: true } } as WorkItemCard;
    await expect(harness([blocked]).application.preview({ cardId: blocked.id, projectId: "project-any" }))
      .rejects.toThrow("current Hepha deep-dive");
  });

  it("rejects a preview whose source hash no longer matches the current document", () => {
    const plan: BatchPreviewPlan = {
      applyAllowed: true,
      discoveredCandidates: [],
      epicDocumentHash: "old-hash",
      epicId: epic.externalId,
      epicUpdates: [],
      explicitCandidates: [],
      planHash: calculatePlanHash("old-hash", [], [], []),
      previewGeneratedAt: "before",
      warnings: [],
    };
    expect(() => validateApprovedPreviewPlan({
      currentDocumentHash: "new-hash",
      epic,
      input: { cardId: epic.id, previewPlan: plan, projectId: "project-any" },
      plan,
    })).toThrow("EPIC document has changed since preview");
  });
});
