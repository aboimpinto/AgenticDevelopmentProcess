import type { WorkItemCard } from "@hepha/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { FeatureCompletionApplication } from "../src/application/features/feature-completion-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const featurePath = fileURLToPath(new URL("./generic-feature-completion.feature", import.meta.url));

describe("generic feature completion Gherkin integration", () => {
  it("runs transition validation before the production finalizer", async () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const order: string[] = [];
    const project = { id: "project" } as StoredProject;
    const feature = { id: "card", externalId: "WORK", kind: "feature" } as WorkItemCard;
    const application = new FeatureCompletionApplication({
      assertTransitionAllowed: () => { order.push("receipt"); },
      countMissingQualityGates: () => 0,
      findCurrentFeature: async () => feature,
      formatCommand: (command) => command,
      resolveImplementation: async () => ({ feature, project }),
      scanProject: async () => [feature],
      shouldStart: () => true,
      startFinalization: async () => { order.push("finalizer"); return true; },
      toProjectSummary: () => ({ id: "project" } as never),
    });
    const result = await application.start({ projectId: "project", cardId: "card" });
    expect(order).toEqual(["receipt", "finalizer"]);
    expect(result.summary).toMatch(/finalization started/);
  });
});
