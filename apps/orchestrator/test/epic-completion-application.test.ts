import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { EpicCompletionApplication, getEpicCompletionBlockers } from "../src/application/epics/epic-completion-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const project = { id: "project", rootPath: "/root" } as StoredProject;
const epic = { id: "epic", externalId: "GROUP", kind: "epic", linkedFeatureIds: ["WORK"], documentPath: "/root/epic.md" } as WorkItemCard;
const completed = { id: "feature", externalId: "WORK", kind: "feature", stateFolder: "04_COMPLETED", stateLabel: "Completed" } as WorkItemCard;

function harness(initial: WorkItemCard[] = [epic, completed], refreshed: WorkItemCard[] = [{ ...epic, epicState: "completed" } as WorkItemCard, completed], changed = true) {
  let scans = 0;
  const dependencies = {
    findProject: vi.fn(() => project), normalizePath: vi.fn(() => "epic.md"), notifyChanged: vi.fn(),
    scanProject: vi.fn(async () => scans++ === 0 ? initial : refreshed), syncState: vi.fn(() => changed),
    toProjectSummary: vi.fn(() => ({ id: "project" } as never)),
  };
  return { application: new EpicCompletionApplication(dependencies), dependencies };
}

describe("EPIC completion application", () => {
  it("synchronizes and verifies completion before reporting success", async () => {
    const target = harness();
    const result = await target.application.complete({ projectId: "project", cardId: "epic" });
    expect(target.dependencies.syncState).toHaveBeenCalledWith(epic, [epic, completed]);
    expect(target.dependencies.notifyChanged).toHaveBeenCalledWith("project", "epic.completed", "GROUP");
    expect(result.filesChanged).toEqual(["epic.md"]);
    expect(result.summary).toMatch(/marked Completed/);
  });

  it("is idempotent and does not notify when synchronization made no change", async () => {
    const existing = { ...epic, epicState: "completed" } as WorkItemCard;
    const target = harness([existing, completed], [existing, completed], false);
    const result = await target.application.complete({ projectId: "project", cardId: "epic" });
    expect(target.dependencies.notifyChanged).not.toHaveBeenCalled();
    expect(result.summary).toMatch(/already Completed/);
  });

  it("rejects project/card and post-synchronization verification failures", async () => {
    const missingProject = harness();
    missingProject.dependencies.findProject.mockReturnValue(null);
    await expect(missingProject.application.complete({ projectId: "x", cardId: "x" })).rejects.toThrow("Project not found.");
    await expect(harness([]).application.complete({ projectId: "project", cardId: "x" })).rejects.toThrow("EPIC work item not found.");
    await expect(harness([epic, completed], [epic, completed]).application.complete({ projectId: "project", cardId: "epic" })).rejects.toThrow(/could not verify/);
  });

  it("reports missing, ambiguous, and incomplete linked work deterministically", () => {
    expect(getEpicCompletionBlockers({ ...epic, linkedFeatureIds: [] } as WorkItemCard, [])).toEqual(["No linked FEATs were detected."]);
    const ambiguousA = { ...completed, stateFolder: "03_IN_PROGRESS" } as WorkItemCard;
    expect(getEpicCompletionBlockers({ ...epic, linkedFeatureIds: ["MISSING", "WORK"] } as WorkItemCard, [ambiguousA, completed])).toEqual([
      "Missing linked FEATs: MISSING.", "Ambiguous linked FEAT states: WORK (03_IN_PROGRESS, 04_COMPLETED).",
    ]);
    expect(getEpicCompletionBlockers(epic, [ambiguousA])).toEqual(["Incomplete linked FEATs: WORK is Completed."]);
  });
});
