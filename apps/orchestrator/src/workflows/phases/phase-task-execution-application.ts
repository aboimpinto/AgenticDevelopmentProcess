import type {
  ImplementationTaskRunRecord,
  StoredImplementationTaskRun,
} from "@hepha/db";
import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import {
  readPhaseContractTaskId,
  type PhaseExecutionContractPhase,
} from "../../phase-execution-contract.js";
import {
  markImplementationPhaseInProgress,
  readPhaseTaskLedgerItems,
  setPhaseTaskCheckbox,
  syncPhaseTaskStateSection,
} from "./phase-task-document-repository.js";
import type { PhaseTaskLedgerItem } from "./phase-task-ledger.js";
import { getNextUnresolvedPhaseContractTask } from "./phase-contract-task-projection.js";

export interface PhaseTaskRunStore {
  listImplementationTaskRuns(projectId: string, cardKey: string, phaseNumber: number): Promise<StoredImplementationTaskRun[]>;
  recordImplementationTaskRun(record: ImplementationTaskRunRecord): Promise<void>;
}

export interface PhaseTaskWorkflowProgress {
  cardKey: string;
  command: FeatureWorkflowCommand;
  currentStep: string;
  feature: WorkItemCard;
  project: StoredProject;
  runId: string;
  summary: string;
}

export class PhaseTaskExecutionApplication {
  constructor(private readonly dependencies: {
    recordWorkflowProgress: (input: PhaseTaskWorkflowProgress) => Promise<void>;
    store: PhaseTaskRunStore;
  }) {}

  async begin(input: {
    cardKey: string;
    command: FeatureWorkflowCommand;
    feature: WorkItemCard;
    phase: PhaseSummary & { number: number };
    project: StoredProject;
    runId: string;
  }): Promise<PhaseTaskLedgerItem | null> {
    const items = readPhaseTaskLedgerItems(input.phase);
    if (items.length === 0) return null;
    await this.reconcile(input, items);
    const taskRuns = await this.listRuns(input);
    const runByTaskId = createTaskRunById(taskRuns);
    const selected = items.find((item) => runByTaskId.get(item.id)?.status === "IN_PROGRESS")
      ?? items.find((item) => !isPhaseTaskResolved(item, runByTaskId.get(item.id)));
    if (!selected) {
      syncPhaseTaskStateSection(input.phase, items, taskRuns);
      return null;
    }

    markImplementationPhaseInProgress(input.feature, input.phase);
    await this.dependencies.store.recordImplementationTaskRun(toTaskRunRecord(input, selected, {
      currentStep: `Running task ${selected.taskIndex + 1}: ${selected.text}`,
      error: null,
      status: "IN_PROGRESS",
      summary: selected.text,
    }));
    const updatedTaskRuns = await this.listRuns(input);
    syncPhaseTaskStateSection(input.phase, readPhaseTaskLedgerItems(input.phase), updatedTaskRuns);
    await this.dependencies.recordWorkflowProgress({
      cardKey: input.cardKey,
      command: input.command,
      currentStep: `Phase ${input.phase.number} task ${selected.taskIndex + 1}/${items.length}`,
      feature: input.feature,
      project: input.project,
      runId: input.runId,
      summary: selected.text,
    });
    return selected;
  }

  async complete(input: {
    activeTask: PhaseTaskLedgerItem | null;
    cardKey: string;
    phase: PhaseSummary & { number: number };
    project: StoredProject;
    runId: string;
    summary: string;
  }): Promise<void> {
    if (!input.activeTask) return;
    const task = readPhaseTaskLedgerItems(input.phase).find((item) => item.id === input.activeTask?.id) ?? input.activeTask;
    await this.dependencies.store.recordImplementationTaskRun(toTaskRunRecord(input, task, {
      currentStep: `Completed task ${task.taskIndex + 1}: ${task.text}`,
      error: null,
      status: "COMPLETED",
      summary: input.summary,
    }));
    setPhaseTaskCheckbox(input.phase, task, true);
    const updatedTaskRuns = await this.listRuns(input);
    await this.reconcile(input, readPhaseTaskLedgerItems(input.phase), updatedTaskRuns);
    syncPhaseTaskStateSection(input.phase, readPhaseTaskLedgerItems(input.phase), updatedTaskRuns);
  }

  async completeNextCodeReview(input: {
    cardKey: string;
    contract: PhaseExecutionContractPhase;
    phase: PhaseSummary & { number: number };
    project: StoredProject;
    runId: string;
    summary: string;
  }): Promise<boolean> {
    const next = getNextUnresolvedPhaseContractTask(input.phase, input.contract);
    if (next?.kind !== "code_review") return false;
    const ledgerTask = readPhaseTaskLedgerItems(input.phase).find((item) => readPhaseContractTaskId(item.text) === next.id);
    if (!ledgerTask) throw new Error(`Declared code-review task '${next.id}' is missing from the phase ledger.`);
    await this.complete({ ...input, activeTask: ledgerTask });
    return true;
  }

  async skip(input: {
    cardKey: string;
    phase: PhaseSummary & { number: number };
    project: StoredProject;
    runId: string;
    taskId: string;
    summary: string;
  }): Promise<void> {
    const task = readPhaseTaskLedgerItems(input.phase).find((item) => readPhaseContractTaskId(item.text) === input.taskId);
    if (!task) throw new Error(`Declared task '${input.taskId}' is missing from the phase ledger.`);
    await this.skipTask(input, task);
  }

  async skipActive(input: {
    activeTask: PhaseTaskLedgerItem;
    cardKey: string;
    phase: PhaseSummary & { number: number };
    project: StoredProject;
    runId: string;
    summary: string;
  }): Promise<void> {
    const task = readPhaseTaskLedgerItems(input.phase).find((item) => item.id === input.activeTask.id) ?? input.activeTask;
    await this.skipTask(input, task);
  }

  private async skipTask(
    input: { cardKey: string; phase: PhaseSummary & { number: number }; project: StoredProject; runId: string; summary: string },
    task: PhaseTaskLedgerItem,
  ): Promise<void> {
    await this.dependencies.store.recordImplementationTaskRun(toTaskRunRecord(input, task, {
      currentStep: `Skipped task ${task.taskIndex + 1}: ${task.text}`,
      error: null,
      status: "SKIPPED",
      summary: input.summary,
    }));
    setPhaseTaskCheckbox(input.phase, task, true);
    syncPhaseTaskStateSection(input.phase, readPhaseTaskLedgerItems(input.phase), await this.listRuns(input));
  }

  async recordFailure(input: {
    activeTask: PhaseTaskLedgerItem | null;
    cardKey: string;
    error: string;
    phase: PhaseSummary & { number: number };
    project: StoredProject;
    runId: string;
  }): Promise<void> {
    if (!input.activeTask) return;
    await this.dependencies.store.recordImplementationTaskRun(toTaskRunRecord(input, input.activeTask, {
      currentStep: `Task still in progress after failure: ${input.activeTask.text}`,
      error: input.error,
      status: "IN_PROGRESS",
      summary: input.activeTask.text,
    }));
    syncPhaseTaskStateSection(input.phase, readPhaseTaskLedgerItems(input.phase), await this.listRuns(input));
  }

  async reconcile(
    input: { cardKey: string; phase: PhaseSummary & { number: number }; project: StoredProject; runId: string },
    items: PhaseTaskLedgerItem[],
    knownTaskRuns?: StoredImplementationTaskRun[],
  ): Promise<void> {
    const taskRuns = knownTaskRuns ?? await this.listRuns(input);
    const runByTaskId = createTaskRunById(taskRuns);
    for (const item of items) {
      const existing = runByTaskId.get(item.id);
      if (!item.checked || existing?.status === "COMPLETED" || existing?.status === "SKIPPED") continue;
      await this.dependencies.store.recordImplementationTaskRun({
        ...toTaskRunRecord(input, item, {
          currentStep: "Reconciled from checked phase Markdown task.",
          error: null,
          status: "COMPLETED",
          summary: item.text,
        }),
        completedAt: existing?.completedAt ?? undefined,
        startedAt: existing?.startedAt ?? null,
      });
    }
  }

  private listRuns(input: { cardKey: string; phase: { number: number }; project: StoredProject }) {
    return this.dependencies.store.listImplementationTaskRuns(input.project.id, input.cardKey, input.phase.number);
  }
}

export function isPhaseTaskResolved(item: PhaseTaskLedgerItem, taskRun: StoredImplementationTaskRun | undefined): boolean {
  return item.checked || taskRun?.status === "COMPLETED" || taskRun?.status === "SKIPPED";
}

function createTaskRunById(taskRuns: StoredImplementationTaskRun[]) {
  return new Map(taskRuns.map((taskRun) => [taskRun.taskId, taskRun]));
}

function toTaskRunRecord(
  input: { cardKey: string; phase: PhaseSummary & { number: number }; project: StoredProject; runId: string },
  task: PhaseTaskLedgerItem,
  state: Pick<ImplementationTaskRunRecord, "currentStep" | "error" | "status" | "summary">,
): ImplementationTaskRunRecord {
  return {
    cardKey: input.cardKey,
    ...state,
    phaseNumber: input.phase.number,
    phaseTitle: input.phase.title,
    projectId: input.project.id,
    section: task.section,
    sourceLine: task.lineNumber,
    taskId: task.id,
    taskIndex: task.taskIndex,
    taskTitle: task.text,
    workflowRunId: input.runId,
  };
}
