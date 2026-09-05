import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { FeatureHumanReviewApplication } from "../src/application/features/feature-human-review-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const featurePath = fileURLToPath(new URL("./generic-feature-human-review.feature", import.meta.url));

describe("generic feature human-review Gherkin integration", () => {
  it("persists evidence before completion evaluation", async () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const order: string[] = [];
    const project = { id: "project" } as StoredProject;
    const feature = { id: "card", externalId: "WORK", kind: "feature" } as WorkItemCard;
    const store = {
      recordFeatureHumanReview: vi.fn(async () => { order.push("evidence"); }),
    } as unknown as CardMetadataStore;
    const application = new FeatureHumanReviewApplication({
      allPhasesResolved: () => true,
      createCardKey: () => "feature:WORK",
      metadataStore: store,
      notifyChanged: vi.fn(),
      resolveImplementation: async () => ({ feature, project }),
      scanProject: async () => [feature],
      startCompletion: async () => { order.push("completion"); return true; },
      toProjectSummary: () => ({ id: "project" } as never),
    });
    await application.record({ projectId: "project", cardId: "card", check: "user-code-review" });
    expect(order).toEqual(["evidence", "completion"]);
  });
});
