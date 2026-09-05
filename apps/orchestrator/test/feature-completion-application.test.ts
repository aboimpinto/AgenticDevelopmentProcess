import type { FeatureWorkflowCommand, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { FeatureCompletionApplication } from "../src/application/features/feature-completion-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const project = { id: "project" } as StoredProject;
const ready = { id: "card", externalId: "WORK", kind: "feature", featureWorkflow: { activeRun: null } } as WorkItemCard;

function harness(feature: WorkItemCard = ready, options: { eligible?: boolean; missing?: number; started?: boolean } = {}) {
  const dependencies = {
    assertTransitionAllowed: vi.fn(),
    countMissingQualityGates: vi.fn(() => options.missing ?? 0),
    findCurrentFeature: vi.fn(async () => feature),
    formatCommand: (command: FeatureWorkflowCommand) => command,
    resolveImplementation: vi.fn(async () => ({ feature, project })),
    scanProject: vi.fn(async () => [feature]),
    shouldStart: vi.fn(() => options.eligible ?? true),
    startFinalization: vi.fn(async () => options.started ?? true),
    toProjectSummary: vi.fn(() => ({ id: project.id } as never)),
  };
  return { application: new FeatureCompletionApplication(dependencies), dependencies };
}

describe("feature completion application", () => {
  it("checks the transition receipt before starting finalization", async () => {
    const target = harness();
    const result = await target.application.start({ projectId: "project", cardId: "card" });
    expect(target.dependencies.assertTransitionAllowed).toHaveBeenCalledWith(project, ready);
    expect(target.dependencies.assertTransitionAllowed.mock.invocationCallOrder[0]).toBeLessThan(
      target.dependencies.startFinalization.mock.invocationCallOrder[0]!,
    );
    expect(result.summary).toBe("Complete Feature finalization started for WORK.");
  });

  it("returns idempotent success for an existing completion run", async () => {
    const feature = { ...ready, featureWorkflow: { activeRun: { command: "complete-feature", status: "running", runId: "run" } } } as WorkItemCard;
    const target = harness(feature);
    await expect(target.application.start({ projectId: "project", cardId: "card" })).resolves.toEqual(
      expect.objectContaining({ summary: "Complete Feature finalization is already running for WORK." }),
    );
    expect(target.dependencies.startFinalization).not.toHaveBeenCalled();
  });

  it("rejects conflicting runs, missing gates, incomplete readiness, and failed dispatch", async () => {
    const conflicting = { ...ready, featureWorkflow: { activeRun: { command: "continue-implementing", status: "running", runId: "run" } } } as WorkItemCard;
    await expect(harness(conflicting).application.start({ projectId: "project", cardId: "card" })).rejects.toThrow(/already running/);
    await expect(harness(ready, { eligible: false, missing: 2 }).application.start({ projectId: "project", cardId: "card" })).rejects.toThrow(/2 missing phase quality gates/);
    await expect(harness(ready, { eligible: false }).application.start({ projectId: "project", cardId: "card" })).rejects.toThrow(/available only after all phases/);
    await expect(harness(ready, { started: false }).application.start({ projectId: "project", cardId: "card" })).rejects.toThrow(/could not be started/);
  });
});
