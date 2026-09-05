import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { EpicRefinementApplication } from "../src/application/epics/epic-refinement-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

function harness() {
  const root = mkdtempSync(join(tmpdir(), "hepha-epic-refine-app-"));
  const folderPath = join(root, "parent-any");
  const documentPath = join(folderPath, "EpicDescription.md");
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(documentPath, "# EPIC-999: Current\n", "utf8");
  const project = { createdAt: "before", id: "project", memoryBankPath: root, name: "Project", rootPath: root, updatedAt: "before" } as StoredProject;
  const epic = { documentPath, epicRefinements: [], externalId: "EPIC-999", folderPath, id: "card", kind: "epic", title: "Current" } as WorkItemCard;
  const refreshed = { ...epic, title: "Refined" } as WorkItemCard;
  let scans = 0;
  const dependencies = {
    chooseModel: () => "authoring-model",
    clock: () => "completed-time",
    createId: () => "run-any",
    findProject: () => project,
    notifyChanged: vi.fn(),
    runPrompt: vi.fn(async () => JSON.stringify({ changedSections: ["Scope"], markdown: "# EPIC-999: Refined\n", summary: "Clarified scope." })),
    scanProject: vi.fn(async () => (++scans === 1 ? [epic] : [refreshed])),
  };
  return { application: new EpicRefinementApplication(dependencies), dependencies, documentPath };
}

describe("EPIC refinement application", () => {
  it("rejects blank requests before model work", async () => {
    const current = harness();
    await expect(current.application.submit({ cardId: "card", projectId: "project", request: "  " })).rejects.toThrow("request is required");
    expect(current.dependencies.runPrompt).not.toHaveBeenCalled();
  });

  it("writes a valid identity-preserving refinement, history, and notification", async () => {
    const current = harness();
    const result = await current.application.submit({ cardId: "card", projectId: "project", request: "Clarify scope" });
    expect(readFileSync(current.documentPath, "utf8")).toContain("EPIC-999: Refined");
    expect(result.refinement).toEqual(expect.objectContaining({ id: "epic-refinement-run-any", summary: "Clarified scope." }));
    expect(result.filesChanged).toHaveLength(2);
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "epic.refined", "EPIC-999");
  });
});
