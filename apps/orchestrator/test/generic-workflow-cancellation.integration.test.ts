import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { FeatureWorkflowCancellationApplication } from "../src/application/features/feature-workflow-cancellation-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const featurePath = fileURLToPath(new URL("./generic-workflow-cancellation.feature", import.meta.url));

describe("generic workflow cancellation Gherkin integration", () => {
  it("binds cancellation to the production application", async () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const order: string[] = [];
    const states: Array<{ phaseNumber: number; status: string }> = [];
    const item = {
      id: "card", externalId: "WORK", kind: "feature",
      featureWorkflow: {
        activeRun: { command: "continue-implementing", runId: "run", status: "running" },
        implementationPhases: [
          { phaseNumber: 1, phaseTitle: "Running", status: "implementing" },
          { phaseNumber: 2, phaseTitle: "Pending", status: "pending" },
          { phaseNumber: 3, phaseTitle: "Done", status: "completed" },
        ],
      },
    } as WorkItemCard;
    const project = { id: "project" } as StoredProject;
    const store = {
      findOpenDeepDiveSession: vi.fn(async () => null),
      recordImplementationPhaseRun: vi.fn(async (record: { phaseNumber: number; status: string }) => {
        states.push({ phaseNumber: record.phaseNumber, status: record.status });
      }),
      recordFeatureWorkflowRun: vi.fn(async () => { order.push("persisted"); }),
      updateDeepDiveSession: vi.fn(),
    } as unknown as CardMetadataStore;
    const application = new FeatureWorkflowCancellationApplication({
      cancelPiProcesses: () => { order.push("process"); return 0; },
      createCardKey: () => "feature:WORK",
      formatCommand: () => "Continue Implementing",
      metadataStore: store,
      notifyChanged: vi.fn(),
      requestCancellation: () => { order.push("requested"); },
      resolveTarget: async () => ({ item, project }),
      scanProject: async () => [item],
      syncLinkedEpic: async () => undefined,
      toProjectSummary: () => ({ id: "project" } as never),
    });
    await application.cancel({ projectId: "project", cardId: "card" });
    expect(order).toEqual(["requested", "process", "persisted"]);
    expect(states).toEqual([{ phaseNumber: 1, status: "failed" }, { phaseNumber: 2, status: "pending" }]);
  });
});
