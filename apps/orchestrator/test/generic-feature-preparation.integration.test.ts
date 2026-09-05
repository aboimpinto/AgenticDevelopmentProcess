import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { FeaturePreparationApplication } from "../src/application/features/feature-preparation-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const featurePath = fileURLToPath(new URL("./generic-feature-preparation.feature", import.meta.url));

describe("generic feature preparation Gherkin integration", () => {
  it("persists refinement before dispatch", async () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const order: string[] = [];
    const project = { id: "project" } as StoredProject;
    const feature = { id: "card", externalId: "WORK", kind: "feature", stateFolder: "01_SUBMITTED", featureWorkflow: { uiRequirementDecision: "no_ui" } } as WorkItemCard;
    const store = { recordFeatureWorkflowRun: vi.fn(async () => { order.push("persist"); }) } as unknown as CardMetadataStore;
    const application = new FeaturePreparationApplication({
      createCardKey: () => "feature:WORK", createId: () => "id",
      evaluateUiDecision: async () => ({ decision: "no_ui", reason: "No UI" }), metadataStore: store,
      notifyChanged: () => { order.push("notify"); }, resolveWorkflow: async () => ({ feature, project }),
      scanProject: async () => [feature], sourceHash: () => "hash",
      startDesignWorker: async () => undefined, startRefineWorker: async () => { order.push("dispatch"); },
      toProjectSummary: () => ({ id: "project" } as never),
    });
    await application.startRefine({ projectId: "project", cardId: "card" });
    expect(order).toEqual(["persist", "dispatch", "notify"]);
  });
});
