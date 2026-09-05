import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { PhaseGitCheckpointAttempt } from "../../phase-git-checkpoint.js";
import type { StoredProject } from "../../projects/stored-project.js";

type NumberedPhase = PhaseSummary & { number: number };

export type PhaseGitCheckpointApplicationResult =
  | Readonly<{ kind: "completed"; summary: string }>
  | Readonly<{ kind: "checkpoint_pending"; summary: string }>;

/** Runs the optional post-exit git boundary without converting git failures into phase failures. */
export class PhaseGitCheckpointApplication {
  constructor(private readonly dependencies: {
    attempt: (input: {
      branchName: string;
      featureId: string;
      memoryBankPath: string;
      phaseDocumentPath: string;
      phaseNumber: number;
      phaseTitle: string;
      projectRoot: string;
    }) => PhaseGitCheckpointAttempt;
    recordProgress: (input: {
      agent: string; cardKey: string; command: FeatureWorkflowCommand; currentStep: string;
      feature: WorkItemCard; model: string; phase: NumberedPhase; project: StoredProject;
      runId: string; status: "checkpoint"; summary: string;
    }) => Promise<void>;
  }) {}

  async execute(input: {
    branchName: string;
    cardKey: string;
    command: FeatureWorkflowCommand;
    feature: WorkItemCard;
    phase: NumberedPhase;
    project: StoredProject;
    runId: string;
  }): Promise<PhaseGitCheckpointApplicationResult> {
    const phaseRef = `Phase ${input.phase.number}`;
    let attempt: PhaseGitCheckpointAttempt;
    try {
      attempt = this.dependencies.attempt({
        branchName: input.branchName,
        featureId: input.feature.externalId,
        memoryBankPath: input.project.memoryBankPath,
        phaseDocumentPath: input.phase.documentPath,
        phaseNumber: input.phase.number,
        phaseTitle: input.phase.title,
        projectRoot: input.project.rootPath,
      });
    } catch (error) {
      attempt = { kind: "checkpoint_pending", reason: error instanceof Error ? error.message : String(error) };
    }
    if (attempt.kind === "completed") {
      return { kind: "completed", summary: `${phaseRef}: ${attempt.result.summary}` };
    }

    const summary = `${phaseRef} implementation and gates are complete; git checkpoint remains pending. ${attempt.reason}`;
    await this.dependencies.recordProgress({
      agent: "Hepha phase git checkpoint", cardKey: input.cardKey, command: input.command,
      currentStep: `${phaseRef} git checkpoint pending`, feature: input.feature, model: "orchestrator",
      phase: input.phase, project: input.project, runId: input.runId, status: "checkpoint", summary,
    });
    return { kind: "checkpoint_pending", summary };
  }
}
