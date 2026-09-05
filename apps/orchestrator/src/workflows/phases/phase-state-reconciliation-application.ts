import type { ImplementationTaskRunRecord, StoredImplementationTaskRun } from "@hepha/db";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { resolve } from "node:path";
import type { StoredProject } from "../../projects/stored-project.js";
import {
  type ReconcilePhaseStateOnDiskInput,
  type ReconcilePhaseStateOnDiskResult,
} from "../../phase-state-reconciliation-adapter.js";
import type { PhaseStateReconciliationDecision } from "../../phase-state-reconciliation-policy.js";
import type { PhaseTaskLedgerItem } from "./phase-task-ledger.js";

type NumberedPhase = PhaseSummary & { number: number };

export interface PhaseStateReconciliationRun {
  readonly cardKey: string;
  readonly project: StoredProject;
  readonly runId: string;
}

export interface PhaseStateReconciliationStore {
  listImplementationTaskRuns(projectId: string, cardKey: string, phaseNumber: number): Promise<StoredImplementationTaskRun[]>;
  recordImplementationTaskRun(record: ImplementationTaskRunRecord): Promise<void>;
}

/** Coordinates deterministic disk/store reconciliation until it converges. */
export class PhaseStateReconciliationApplication {
  constructor(private readonly dependencies: {
    isReviewRequired: (project: StoredProject, feature: WorkItemCard, phase: NumberedPhase) => boolean;
    orderPhases: (feature: WorkItemCard) => readonly NumberedPhase[];
    readTasks: (phase: NumberedPhase) => readonly PhaseTaskLedgerItem[];
    reconcileOnDisk: (input: ReconcilePhaseStateOnDiskInput) => Promise<ReconcilePhaseStateOnDiskResult>;
    refreshFeature: (project: StoredProject, externalId: string, fallback: WorkItemCard) => Promise<WorkItemCard>;
    store: PhaseStateReconciliationStore;
  }) {}

  async reconcile(input: PhaseStateReconciliationRun, feature: WorkItemCard): Promise<{
    feature: WorkItemCard;
    allTerminal: boolean;
    decision: PhaseStateReconciliationDecision;
  }> {
    let currentFeature = feature;
    for (let attempt = 0; attempt <= this.dependencies.orderPhases(currentFeature).length; attempt += 1) {
      const phases = this.dependencies.orderPhases(currentFeature);
      const result = await this.dependencies.reconcileOnDisk({
        featureTasksPath: resolve(currentFeature.folderPath, "FeatureTasks.md"),
        phases: phases.map((phase) => ({
          autonomousCodeReviewRequired: this.dependencies.isReviewRequired(input.project, currentFeature, phase),
          documentPath: phase.documentPath,
          number: phase.number,
          title: phase.title,
        })),
        readTasks: (descriptor) => this.dependencies.readTasks(phases.find((phase) => phase.number === descriptor.number)!)
          .map((task) => ({ checked: task.checked, id: task.id, index: task.taskIndex, lineNumber: task.lineNumber, section: task.section, text: task.text })),
        store: {
          listTaskRuns: async (phaseNumber) => (await this.dependencies.store
            .listImplementationTaskRuns(input.project.id, input.cardKey, phaseNumber))
            .map(({ completedAt, startedAt, status, taskId }) => ({ completedAt, startedAt, status, taskId })),
          resetTaskRun: ({ phase, task }) => this.recordTask(input, phase, task, {
            completedAt: null,
            currentStep: "Reset by deterministic reconciliation because the durable phase task remains unchecked.",
            error: null,
            startedAt: null,
            status: "NOT_STARTED",
            summary: "Stale task-run mirror reset from durable phase task ledger.",
          }),
          recordCompletedTask: ({ completedAt, phase, task }) => this.recordTask(input, phase, task, {
            completedAt,
            currentStep: "Completed by deterministic phase-state reconciliation.",
            error: null,
            startedAt: completedAt,
            status: "COMPLETED",
            summary: "Checked in phase document; reconciliation evidence.",
          }),
        },
      });

      if (result.decision.kind === "blocked") {
        throw new Error(`Phase-state reconciliation blocked: ${result.decision.reason}`);
      }
      if (!result.changed) {
        return { feature: currentFeature, allTerminal: result.decision.kind === "all_terminal", decision: result.decision };
      }
      currentFeature = await this.dependencies.refreshFeature(input.project, currentFeature.externalId, currentFeature);
    }
    throw new Error("Phase-state reconciliation did not converge after scanning every numbered phase.");
  }

  private recordTask(
    input: PhaseStateReconciliationRun,
    phase: { number: number; title: string },
    task: { id: string; index: number; lineNumber: number; section: string; text: string },
    state: Pick<ImplementationTaskRunRecord, "completedAt" | "currentStep" | "error" | "startedAt" | "status" | "summary">,
  ): Promise<void> {
    return this.dependencies.store.recordImplementationTaskRun({
      cardKey: input.cardKey,
      ...state,
      phaseNumber: phase.number,
      phaseTitle: phase.title,
      projectId: input.project.id,
      section: task.section,
      sourceLine: task.lineNumber,
      taskId: task.id,
      taskIndex: task.index,
      taskTitle: task.text,
      workflowRunId: input.runId,
    });
  }
}
