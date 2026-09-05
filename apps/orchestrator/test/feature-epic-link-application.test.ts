import { describe, expect, it, vi } from "vitest";
import { FeatureEpicLinkApplication } from "../src/application/features/feature-epic-link-application.js";

const project = { id: "project", memoryBankPath: "/project/MemoryBank" } as never;
const feature = {
  externalId: "WORK-31",
  kind: "feature",
  linkedEpicIds: ["GROUP-8"],
  linkedFeatureIds: [],
} as never;
const epic = {
  externalId: "GROUP-8",
  kind: "epic",
  linkedEpicIds: [],
  linkedFeatureIds: ["WORK-31"],
  title: "Arbitrary group",
} as never;

describe("FeatureEpicLinkApplication", () => {
  it("returns scanner-verified relationship projections after mutation", async () => {
    const syncEpic = vi.fn();
    const application = new FeatureEpicLinkApplication({
      link: () => ({
        blockers: [],
        changedFiles: ["feature.md", "epic.md"],
        newParentEpicIds: ["GROUP-8"],
        previousParentEpicIds: [],
        success: true,
        summary: "Linked arbitrary work.",
        warnings: [],
      }),
      scan: async () => [feature, epic],
      syncEpic,
    });

    const result = await application.execute(project, "WORK-31", {
      operation: "link",
      targetEpicCardId: "GROUP-8",
    });

    expect(result).toMatchObject({
      affectedEpicIds: ["GROUP-8"],
      affectedFeatIds: ["WORK-31"],
      scannerVerification: {
        linkedEpicIds: ["GROUP-8"],
        linkedFeatureIds: ["GROUP-8"],
        matched: true,
      },
      warnings: [],
    });
    expect(syncEpic).toHaveBeenCalledWith(epic, [feature, epic]);
  });

  it("reports progress-sync and scanner mismatch warnings without hiding mutation evidence", async () => {
    const application = new FeatureEpicLinkApplication({
      link: () => ({
        blockers: [],
        changedFiles: ["feature.md"],
        newParentEpicIds: ["GROUP-9"],
        previousParentEpicIds: ["GROUP-8"],
        success: true,
        summary: "Relinked arbitrary work.",
        warnings: ["mutation warning"],
      }),
      scan: async () => [feature, epic],
      syncEpic: () => { throw new Error("sync unavailable"); },
    });

    const result = await application.execute(project, "WORK-31", {
      operation: "relink",
      targetEpicCardId: "GROUP-9",
    });

    expect(result.affectedEpicIds).toEqual(["GROUP-8", "GROUP-9"]);
    expect(result.epicUpdates["GROUP-8"]?.warnings).toEqual(["Progress sync failed: sync unavailable"]);
    expect(result.scannerVerification.matched).toBe(false);
    expect(result.warnings).toEqual([
      "mutation warning",
      "Scanner relationship check: expected EPIC IDs GROUP-9, found GROUP-8",
    ]);
  });
});
