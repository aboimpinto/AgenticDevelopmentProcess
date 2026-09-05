import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseTaskLedgerItem } from "./phase-task-ledger.js";

type NumberedPhase = PhaseSummary & { number: number };

export interface PhaseFailureContext {
  agent: string;
  currentStep: string;
  model: string;
  phase: NumberedPhase;
  summary: string;
}

/** Best-effort publication of a phase failure without changing the original thrown error. */
export class PhaseFailureRecordingApplication {
  constructor(private readonly dependencies: {
    isTemplateInvalid: (error: unknown) => boolean;
    recordProgress: (input: {
      agent: string; cardKey: string; command: FeatureWorkflowCommand; currentStep: string; error: string;
      feature: WorkItemCard; model: string; phase: NumberedPhase; project: StoredProject; runId: string;
      status: "blocked" | "failed"; summary: string;
    }) => Promise<void>;
    recordTaskFailure: (input: {
      activeTask: PhaseTaskLedgerItem | null; cardKey: string; error: string; phase: NumberedPhase;
      project: StoredProject; runId: string;
    }) => Promise<void>;
    shouldRecord: (errorMessage: string) => boolean;
  }) {}

  async record(input: {
    activePhase: NumberedPhase | null;
    activeTask: PhaseTaskLedgerItem | null;
    cardKey: string;
    command: FeatureWorkflowCommand;
    error: unknown;
    failureContext: PhaseFailureContext | null;
    fallbackModel: string;
    feature: WorkItemCard;
    project: StoredProject;
    runId: string;
  }): Promise<void> {
    const errorMessage = input.error instanceof Error ? input.error.message : String(input.error);
    if (!input.activePhase || !this.dependencies.shouldRecord(errorMessage)) return;

    const templateInvalid = this.dependencies.isTemplateInvalid(input.error);
    const awaitingUserDecision = errorMessage.includes("WORKFLOW_AWAITING_USER_DECISION");
    const blocked = templateInvalid || awaitingUserDecision;
    const context = input.failureContext ?? {
      agent: "Implementation Agent",
      currentStep: `Phase ${input.activePhase.number} failed`,
      model: input.fallbackModel,
      phase: input.activePhase,
      summary: `Phase ${input.activePhase.number} failed.`,
    };
    await this.dependencies.recordProgress({
      agent: context.agent, cardKey: input.cardKey, command: input.command,
      currentStep: templateInvalid
        ? `Phase ${input.activePhase.number} blocked: phase template validation`
        : awaitingUserDecision
          ? `Phase ${input.activePhase.number} paused: awaiting user decision after no durable progress`
          : context.currentStep,
      error: errorMessage, feature: input.feature, model: context.model, phase: context.phase,
      project: input.project, runId: input.runId, status: blocked ? "blocked" : "failed",
      summary: blocked ? errorMessage : context.summary,
    }).catch(() => undefined);

    if (!blocked) {
      await this.dependencies.recordTaskFailure({
        activeTask: input.activeTask, cardKey: input.cardKey, error: errorMessage,
        phase: context.phase, project: input.project, runId: input.runId,
      }).catch(() => undefined);
    }
  }
}
