import type { CardMetadataStore, StoredDeepDiveSession } from "@hepha/db";
import type { FeatureWorkflowCommand, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { FeatureWorkflowCancellationApplication } from "../src/application/features/feature-workflow-cancellation-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const project = { id: "project", name: "Project" } as StoredProject;

function runningItem(kind: WorkItemCard["kind"] = "feature", command: FeatureWorkflowCommand = "continue-implementing") {
  return {
    id: "card",
    externalId: kind === "feature" ? "WORK" : "GROUP",
    kind,
    featureWorkflow: {
      activeRun: { command, runId: "run", status: "running" },
      implementationPhases: [
        { phaseNumber: 1, phaseTitle: "First", status: "implementing", agent: null, model: null, reportPath: null },
        { phaseNumber: 2, phaseTitle: "Second", status: "pending", agent: "Agent", model: "model", reportPath: null },
        { phaseNumber: 3, phaseTitle: "Third", status: "completed", agent: null, model: null, reportPath: null },
      ],
    },
  } as WorkItemCard;
}

function harness(item = runningItem(), options: { killed?: number; session?: StoredDeepDiveSession | null } = {}) {
  const metadataStore = {
    findOpenDeepDiveSession: vi.fn(async () => options.session ?? null),
    recordFeatureWorkflowRun: vi.fn(async () => undefined),
    recordImplementationPhaseRun: vi.fn(async () => undefined),
    updateDeepDiveSession: vi.fn(async (session: StoredDeepDiveSession) => session),
  } as unknown as CardMetadataStore;
  const dependencies = {
    cancelPiProcesses: vi.fn(() => options.killed ?? 0),
    clock: () => "2026-07-21T00:00:00.000Z",
    createCardKey: (kind: string, externalId: string) => `${kind}:${externalId}`,
    formatCommand: (command: FeatureWorkflowCommand) => command,
    metadataStore,
    notifyChanged: vi.fn(),
    requestCancellation: vi.fn(),
    resolveTarget: vi.fn(async () => ({ item, project })),
    scanProject: vi.fn(async () => [item]),
    syncLinkedEpic: vi.fn(async () => undefined),
    toProjectSummary: vi.fn(() => ({ id: project.id, name: project.name } as never)),
  };
  return { application: new FeatureWorkflowCancellationApplication(dependencies), dependencies, metadataStore };
}

describe("feature workflow cancellation application", () => {
  it("interrupts locally before durable cancellation and preserves pending phases", async () => {
    const target = harness(runningItem(), { killed: 2 });
    const result = await target.application.cancel({ projectId: "project", cardId: "card" });
    expect(target.dependencies.requestCancellation).toHaveBeenCalledWith("run");
    expect(target.dependencies.cancelPiProcesses).toHaveBeenCalledWith("run");
    expect(target.metadataStore.recordImplementationPhaseRun).toHaveBeenCalledTimes(2);
    expect(target.metadataStore.recordImplementationPhaseRun).toHaveBeenNthCalledWith(1, expect.objectContaining({ phaseNumber: 1, status: "failed" }));
    expect(target.metadataStore.recordImplementationPhaseRun).toHaveBeenNthCalledWith(2, expect.objectContaining({ phaseNumber: 2, status: "pending" }));
    expect(target.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ runId: "run", status: "cancelled" }));
    expect(target.dependencies.syncLinkedEpic).toHaveBeenCalledOnce();
    expect(target.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.cancelled", "WORK");
    expect(result.summary).toBe("continue-implementing cancelled for WORK.");
  });

  it("closes the matching open deep-dive session but not an unrelated session", async () => {
    const session = { id: "run", status: "running" } as StoredDeepDiveSession;
    const target = harness(runningItem("epic", "deep-dive-epic"), { session });
    await target.application.cancel({ projectId: "project", cardId: "card" });
    expect(target.metadataStore.updateDeepDiveSession).toHaveBeenCalledWith(expect.objectContaining({
      agentConnectionStatus: "lost",
      completedAt: "2026-07-21T00:00:00.000Z",
      status: "failed",
    }));
    expect(target.dependencies.syncLinkedEpic).not.toHaveBeenCalled();
  });

  it("rejects absent and non-running workflows without interrupting a process", async () => {
    const absent = harness({ ...runningItem(), featureWorkflow: null } as WorkItemCard);
    await expect(absent.application.cancel({ projectId: "project", cardId: "card" })).rejects.toThrow(/does not have a running workflow/);
    expect(absent.dependencies.requestCancellation).not.toHaveBeenCalled();

    const completed = runningItem();
    completed.featureWorkflow!.activeRun!.status = "completed";
    const terminal = harness(completed);
    await expect(terminal.application.cancel({ projectId: "project", cardId: "card" })).rejects.toThrow(/cannot be cancelled/);
    expect(terminal.dependencies.requestCancellation).not.toHaveBeenCalled();
  });
});
