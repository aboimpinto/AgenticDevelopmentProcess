import type { FeatureWorkflowRunRecord } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { HephaFeatureWorkflowProgressRecorder } from "../src/feature-workflow-spec.js";
import { FeatureWorkflowRunCoordinator } from "../src/application/features/feature-workflow-run-coordinator.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const project = { id: "project-any" } as StoredProject;
const feature = (externalId: string) => ({ externalId } as WorkItemCard);

function createHarness() {
  const order: string[] = [];
  const records: FeatureWorkflowRunRecord[] = [];
  let recorder: HephaFeatureWorkflowProgressRecorder | null = null;
  const coordinator = new FeatureWorkflowRunCoordinator({
    assertRunActive: (runId) => order.push(`assert:${runId}`),
    createRunner: (input) => {
      recorder = input.recorder;
      order.push(`runner:${input.workspaceRoot}:${input.completedNodeIds?.join(",") ?? ""}`);
      return { runNode: vi.fn() };
    },
    metadataStore: {
      recordFeatureWorkflowRun: async (record) => {
        order.push("persist");
        records.push(record);
      },
    },
    notifyProjectChanged: (projectId, eventType, externalId) =>
      order.push(`notify:${projectId}:${eventType}:${externalId}`),
    workspaceRoot: "/workspace",
  });
  return { coordinator, getRecorder: () => recorder, order, records };
}

describe("feature workflow run coordinator", () => {
  it("asserts cancellation state before persisting and notifying progress", async () => {
    const harness = createHarness();
    await harness.coordinator.recordFeatureProgress({
      cardKey: "feature:any",
      command: "continue-implementing",
      currentNodeId: "execute",
      currentStep: "Working",
      feature: feature("FEAT-ANY"),
      project,
      runId: "workflow-any",
      summary: "Current work",
    });

    expect(harness.order).toEqual([
      "assert:workflow-any",
      "persist",
      "notify:project-any:workflow.progress:FEAT-ANY",
    ]);
    expect(harness.records).toEqual([expect.objectContaining({
      currentNodeId: "execute",
      currentStep: "Working",
      status: "running",
      summary: "Current work",
    })]);
  });

  it("builds a card runner that records rendered node progress", async () => {
    const harness = createHarness();
    harness.coordinator.createCardRunner({
      cardKey: "epic:any",
      command: "deep-dive-epic",
      completedNodeIds: ["prepare"],
      externalId: "EPIC-ANY",
      project,
      runId: "workflow-card",
    });
    await harness.getRecorder()?.(
      { id: "questions" } as Parameters<HephaFeatureWorkflowProgressRecorder>[0],
      { status: "Generating", summary: "Generating questions" },
    );

    expect(harness.order).toContain("runner:/workspace:prepare");
    expect(harness.records[0]).toEqual(expect.objectContaining({
      cardKey: "epic:any",
      command: "deep-dive-epic",
      currentNodeId: "questions",
    }));
  });

  it("reads feature identity when each node is recorded", async () => {
    const harness = createHarness();
    let currentFeature = feature("FEAT-FIRST");
    harness.coordinator.createFeatureRunner({
      cardKey: "feature:any",
      command: "start-implementing",
      getFeature: () => currentFeature,
      project,
      runId: "workflow-feature",
    });
    currentFeature = feature("FEAT-REFRESHED");
    await harness.getRecorder()?.(
      { id: "implement" } as Parameters<HephaFeatureWorkflowProgressRecorder>[0],
      { status: "Running", summary: "Implementing" },
    );

    expect(harness.order.at(-1)).toBe("notify:project-any:workflow.progress:FEAT-REFRESHED");
  });
});
