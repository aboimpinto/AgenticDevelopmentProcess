import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

type NumberedPhase = PhaseSummary & { number: number };

export interface PhaseProgressInput {
  agent: string;
  cardKey: string;
  command: FeatureWorkflowCommand;
  currentStep: string;
  error?: string;
  feature: WorkItemCard;
  model: string;
  phase: NumberedPhase;
  project: StoredProject;
  reportPath?: string;
  runId: string;
  status: "pending" | "planning" | "implementing" | "code_review" | "checkpoint" | "verifying" | "completed" | "blocked" | "failed";
  summary: string;
}

/** Persists one phase transition and then projects it to workflow-level progress. */
export class PhaseProgressRecorder {
  constructor(private readonly dependencies: {
    appendAudit: (input: {
      agent: string; event: "phase_progress"; model: string; phaseNumber: number;
      phaseTitle: string; project: StoredProject; runId: string; status: string;
      workflowCommand: FeatureWorkflowCommand;
    }) => void;
    assertRunActive: (runId: string) => void;
    recordPhaseRun: (input: {
      agent: string; cardKey: string; currentStep: string; error: string | null; model: string;
      phaseNumber: number; phaseTitle: string; projectId: string; reportPath: string | null;
      status: PhaseProgressInput["status"]; summary: string; workflowRunId: string;
    }) => Promise<void>;
    recordWorkflowProgress: (input: {
      cardKey: string; command: FeatureWorkflowCommand; currentStep: string; feature: WorkItemCard;
      project: StoredProject; runId: string; summary: string;
    }) => Promise<void>;
  }) {}

  async record(input: PhaseProgressInput): Promise<void> {
    this.dependencies.assertRunActive(input.runId);
    this.dependencies.appendAudit({
      agent: input.agent, event: "phase_progress", model: input.model, phaseNumber: input.phase.number,
      phaseTitle: input.phase.title, project: input.project, runId: input.runId, status: input.status,
      workflowCommand: input.command,
    });
    await this.dependencies.recordPhaseRun({
      agent: input.agent, cardKey: input.cardKey, currentStep: input.currentStep,
      error: input.error ?? null, model: input.model, phaseNumber: input.phase.number,
      phaseTitle: input.phase.title, projectId: input.project.id, reportPath: input.reportPath ?? null,
      status: input.status, summary: input.summary, workflowRunId: input.runId,
    });
    await this.dependencies.recordWorkflowProgress({
      cardKey: input.cardKey, command: input.command, currentStep: input.currentStep,
      feature: input.feature, project: input.project, runId: input.runId, summary: input.summary,
    });
  }
}
