import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { FeatureSubmissionApplication } from "../src/application/features/feature-submission-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

function harness(options: { parentExists?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "hepha-submit-feature-"));
  const project = { createdAt: "before", id: "project", memoryBankPath: root, name: "Project", rootPath: root, updatedAt: "before" } as StoredProject;
  const parent = { externalId: "PARENT-ANY", kind: "epic" } as WorkItemCard;
  const created = { externalId: "CHILD-ANY", kind: "feature", title: "Capability" } as WorkItemCard;
  let scans = 0;
  const dependencies = {
    findProject: () => project,
    idAllocator: { nextFeature: vi.fn(() => "CHILD-ANY") },
    notifyChanged: vi.fn(),
    scanProject: vi.fn(async () => {
      scans += 1;
      if (scans === 1 && options.parentExists) return [parent];
      return [created];
    }),
  };
  return { application: new FeatureSubmissionApplication(dependencies), dependencies, root };
}

describe("feature submission application", () => {
  it("validates required title and summary before allocating an identity", async () => {
    const current = harness();
    await expect(current.application.submit({ projectId: "project", summary: "scope", title: "  " })).rejects.toThrow("title is required");
    await expect(current.application.submit({ projectId: "project", summary: "  ", title: "Capability" })).rejects.toThrow("summary is required");
    expect(current.dependencies.idAllocator.nextFeature).not.toHaveBeenCalled();
  });

  it("requires an explicitly named parent to exist", async () => {
    const current = harness();
    await expect(current.application.submit({ parentEpicId: "PARENT-ANY", projectId: "project", summary: "scope", title: "Capability" }))
      .rejects.toThrow("Parent EPIC PARENT-ANY not found");
  });

  it("creates, reloads, and announces a submitted feature", async () => {
    const current = harness({ parentExists: true });
    const result = await current.application.submit({ parentEpicId: "PARENT-ANY", projectId: "project", summary: "Deliver scope", title: "Capability" });
    expect(result.feature.externalId).toBe("CHILD-ANY");
    expect(existsSync(result.filesCreated[0]!)).toBe(true);
    expect(readFileSync(result.filesCreated[0]!, "utf8")).toContain("Deliver scope");
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "feature.submitted", "CHILD-ANY");
  });
});
