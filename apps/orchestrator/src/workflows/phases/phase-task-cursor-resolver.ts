import type { StoredImplementationTaskRun } from "@hepha/db";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import { readPhaseTaskLedgerItems, syncPhaseTaskStateSection } from "./phase-task-document-repository.js";
import { isPhaseTaskResolved } from "./phase-task-execution-application.js";
import type { PhaseTaskLedgerItem } from "./phase-task-ledger.js";

type NumberedPhase = PhaseSummary & { number: number };

export interface PhaseTaskCursor {
  currentStep: string;
  summary: string;
}

export class PhaseTaskCursorResolver {
  constructor(private readonly dependencies: {
    findFirstMissingQualityGate: (feature: WorkItemCard) => { gates: string[]; phaseNumber: number | null } | null | undefined;
    findHumanReviewPhase: (feature: WorkItemCard) => NumberedPhase | undefined;
    isAwaitingCodeReviewRerun: (phase: PhaseSummary) => boolean;
    isPhaseResolved: (phase: PhaseSummary) => boolean;
    isPlanningArtifactMissing: (feature: WorkItemCard, phase: NumberedPhase) => boolean;
    listTaskRuns: (projectId: string, cardKey: string, phaseNumber: number) => Promise<StoredImplementationTaskRun[]>;
    orderPhases: (feature: WorkItemCard) => readonly NumberedPhase[];
    planningArtifactFileName: string;
    reconcileCheckedTasks: (
      input: { cardKey: string; phase: NumberedPhase; project: StoredProject; runId: string },
      items: PhaseTaskLedgerItem[],
    ) => Promise<void>;
  }) {}

  async resolve(input: {
    cardKey: string;
    feature: WorkItemCard;
    forcedRecoveryPhaseNumber?: number | null;
    project: StoredProject;
    runId: string;
  }): Promise<PhaseTaskCursor> {
    const forcedRecoveryPhaseNumber = input.forcedRecoveryPhaseNumber ?? null;
    const remaining = this.dependencies.orderPhases(input.feature).filter((phase) =>
      !this.dependencies.isPhaseResolved(phase)
      || phase.number === forcedRecoveryPhaseNumber
      || this.dependencies.isPlanningArtifactMissing(input.feature, phase));

    for (const phase of remaining) {
      if (this.dependencies.isPhaseResolved(phase) && phase.number !== forcedRecoveryPhaseNumber) continue;
      const phaseRef = `Phase ${phase.number}`;
      if (this.dependencies.isAwaitingCodeReviewRerun(phase)) {
        return { currentStep: `${phaseRef}: rerunning review after fixes`, summary: `${phase.title || phaseRef} is awaiting a review rerun.` };
      }
      if (this.dependencies.isPlanningArtifactMissing(input.feature, phase)) {
        return {
          currentStep: `${phaseRef}: repairing missing planning artifact`,
          summary: `${phase.title || phaseRef} must create or repair ${this.dependencies.planningArtifactFileName}.`,
        };
      }
      const items = readPhaseTaskLedgerItems(phase);
      if (items.length === 0) {
        return {
          currentStep: `${phaseRef}: ${phase.title || "phase work"}`,
          summary: "No phase task ledger exists yet; the worker must add one before substantive work.",
        };
      }
      await this.dependencies.reconcileCheckedTasks({ cardKey: input.cardKey, phase, project: input.project, runId: input.runId }, items);
      const taskRuns = await this.dependencies.listTaskRuns(input.project.id, input.cardKey, phase.number);
      const bootstrappedFromMarkdown = taskRuns.length === 0;
      const taskRunById = new Map(taskRuns.map((run) => [run.taskId, run]));
      syncPhaseTaskStateSection(phase, items, taskRuns);
      const nextTask = items.find((item) => taskRunById.get(item.id)?.status === "IN_PROGRESS")
        ?? items.find((item) => !isPhaseTaskResolved(item, taskRunById.get(item.id)));
      if (nextTask) {
        return {
          currentStep: `${phaseRef} task ${nextTask.taskIndex + 1}/${items.length}`,
          summary: `${nextTask.section}: ${nextTask.text}${bootstrappedFromMarkdown ? " (selected from existing phase Markdown checkboxes)" : ""}`,
        };
      }
      return {
        currentStep: `${phaseRef}: checkpoint/review/finalization`,
        summary: "All ledger tasks are resolved; continuing with missing evidence, checkpoint, review, or finalization gates.",
      };
    }

    const humanReviewPhase = this.dependencies.findHumanReviewPhase(input.feature);
    if (humanReviewPhase && !this.dependencies.isPhaseResolved(humanReviewPhase)) {
      return {
        currentStep: `Human review findings ${formatPhaseReference(humanReviewPhase)}`,
        summary: "Implementation phases are resolved; human review findings remain.",
      };
    }
    const missingQualityGate = this.dependencies.findFirstMissingQualityGate(input.feature);
    if (missingQualityGate) {
      return {
        currentStep: `Phase ${missingQualityGate.phaseNumber}: resolving missing quality gates`,
        summary: `Missing quality gates: ${missingQualityGate.gates.join(", ")}. Continue Implementation should add evidence or an explicit justified waiver before completion.`,
      };
    }
    return {
      currentStep: "Final full build and test verification",
      summary: "All numbered phase tasks appear resolved; continuing at final verification or completion gates.",
    };
  }
}

function formatPhaseReference(phase: PhaseSummary): string {
  return phase.number === null ? phase.title : `Phase ${phase.number}`;
}
