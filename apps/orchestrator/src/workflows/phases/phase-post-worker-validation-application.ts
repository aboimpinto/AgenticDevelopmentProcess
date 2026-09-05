import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseProgressInput } from "./phase-progress-recorder.js";

type NumberedPhase = PhaseSummary & { number: number };

export type PhasePostWorkerValidationResult =
  | { kind: "continue" }
  | { kind: "recovery_complete"; summary: string };

/** Validates durable worker output before review, continuation, or phase exit. */
export class PhasePostWorkerValidationApplication {
  constructor(private readonly dependencies: {
    assertPlanningArtifact: (feature: WorkItemCard) => void;
    assertTemplate: (featureFolderPath: string, phaseNumber: number) => void;
    isRecoveryComplete: (phase: NumberedPhase) => boolean;
    recordProgress: (input: PhaseProgressInput) => Promise<void>;
  }) {}

  async validate(input: {
    agent: string;
    cardKey: string;
    command: FeatureWorkflowCommand;
    feature: WorkItemCard;
    model: string;
    phase: NumberedPhase;
    phaseRef: string;
    planningArtifactRequired: boolean;
    project: StoredProject;
    runId: string;
  }): Promise<PhasePostWorkerValidationResult> {
    this.dependencies.assertTemplate(input.feature.folderPath, input.phase.number);

    if (input.planningArtifactRequired) {
      try {
        this.dependencies.assertPlanningArtifact(input.feature);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.dependencies.recordProgress({
          agent: input.agent,
          cardKey: input.cardKey,
          command: input.command,
          currentStep: `${input.phaseRef} blocked: missing planning artifact`,
          error: errorMessage,
          feature: input.feature,
          model: input.model,
          phase: input.phase,
          project: input.project,
          runId: input.runId,
          status: "blocked",
          summary: errorMessage,
        });
        throw new Error(`${input.phaseRef} worker returned without the required planning artifact. ${errorMessage}`);
      }
    }

    if (!this.dependencies.isRecoveryComplete(input.phase)) return { kind: "continue" };

    const summary = `${input.phaseRef} recovery gate completed. Continue Implementing can resume normal phase work.`;
    await this.dependencies.recordProgress({
      agent: input.agent,
      cardKey: input.cardKey,
      command: input.command,
      currentStep: `${input.phaseRef} recovery gate completed`,
      feature: input.feature,
      model: input.model,
      phase: input.phase,
      project: input.project,
      runId: input.runId,
      status: "completed",
      summary,
    });
    return { kind: "recovery_complete", summary };
  }
}
