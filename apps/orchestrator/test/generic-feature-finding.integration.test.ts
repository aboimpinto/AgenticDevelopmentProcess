import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { FeatureFindingApplication } from "../src/application/features/feature-finding-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const featurePath = fileURLToPath(new URL("./generic-feature-finding.feature", import.meta.url));

describe("generic feature finding Gherkin integration", () => {
  it("persists and documents a finding before dispatch", async () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const order: string[] = [];
    const project = { id: "project" } as StoredProject;
    const feature = { id: "card", externalId: "WORK", kind: "feature" } as WorkItemCard;
    const store = {
      enabled: true,
      createFeatureFinding: vi.fn(async () => { order.push("store"); return {} as never; }),
      recordFeatureFindingAgentRun: vi.fn(async () => { order.push("run"); }),
    } as unknown as CardMetadataStore;
    const application = new FeatureFindingApplication({
      acceptPhase: vi.fn(), allPhasesResolved: () => true,
      appendDetail: vi.fn(), appendFinding: () => { order.push("document"); },
      createCardKey: () => "feature:WORK", createId: () => "id",
      ensureFindingPhase: () => ({ fileName: "review.md", number: 1, path: "/review.md" }),
      ensureTaskChecklists: vi.fn(), executeFinding: async () => { order.push("dispatch"); },
      findFindingPhase: () => null, isPhaseAwaitingUser: () => false, markFindingSolved: vi.fn(),
      metadataStore: store, notifyChanged: vi.fn(), resolveImplementation: async () => ({ feature, project }),
      scanProject: async () => [feature], startCompletion: async () => false,
      toProjectSummary: () => ({ id: "project" } as never),
    });
    await application.submit({ projectId: "project", cardId: "card", content: "Detailed finding" });
    expect(order).toEqual(["store", "document", "run", "dispatch"]);
  });
});
