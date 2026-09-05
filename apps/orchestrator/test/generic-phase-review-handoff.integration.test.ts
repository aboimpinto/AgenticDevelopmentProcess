import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseReviewHandoffApplication } from "../src/workflows/phases/phase-review-handoff-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-review-handoff.feature", import.meta.url));

describe("generic phase review handoff Gherkin integration", () => {
  it("hands off the first supplied eligible item without using its title as policy", async () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const project = { id: "project" } as StoredProject;
    const item = { number: 41, status: "READY", title: "Random Research Name" } as PhaseSummary & { number: number };
    const later = { number: 3, status: "READY", title: "Unrelated Delivery Name" } as PhaseSummary & { number: number };
    const feature = { externalId: "WORK", phases: [later, item] } as WorkItemCard;
    const refreshed = { ...feature, title: "refreshed" } as WorkItemCard;
    const markAwaitingReview = vi.fn();
    const application = new PhaseReviewHandoffApplication({
      findLatestReviewResult: () => null,
      getMissingGates: () => ["code_review"],
      isAwaitingReview: () => false,
      isReadyForReview: () => true,
      isReviewRequired: () => true,
      markAwaitingReview,
      orderPhases: () => [item, later],
      refreshFeature: async () => refreshed,
    });
    expect(await application.handoff(project, feature)).toBe(refreshed);
    expect(markAwaitingReview).toHaveBeenCalledOnce();
    expect(markAwaitingReview).toHaveBeenCalledWith(feature, item);
  });
});
