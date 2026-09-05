import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type { ImplementationWorkerInput } from "./implementation-worker-application.js";

type NumberedPhase = PhaseSummary & { number: number };

/** Runs the declared human-review-findings phase and validates its durable handoff state. */
export class HumanReviewFindingsPhaseApplication {
  constructor(private readonly dependencies: {
    buildContext: (project: StoredProject, feature: WorkItemCard, items: WorkItemCard[], phase: NumberedPhase, previousFailureBrief?: string) => string;
    buildPrompt: (project: StoredProject, feature: WorkItemCard, context: string, input: { branchName: string; phase: NumberedPhase }) => string;
    findHumanReviewPhase: (feature: WorkItemCard) => PhaseSummary | null | undefined;
    formatPhase: (phase: PhaseSummary) => string;
    isAwaitingUser: (phase: PhaseSummary) => boolean;
    isResolved: (phase: PhaseSummary) => boolean;
    recordProgress: (input: {
      cardKey: string; command: FeatureWorkflowCommand; currentStep: string; feature: WorkItemCard;
      project: StoredProject; runId: string; summary: string;
    }) => Promise<void>;
    refreshFeature: (project: StoredProject, externalId: string, fallback: WorkItemCard) => Promise<WorkItemCard>;
    runWorker: (input: ImplementationWorkerInput) => Promise<string>;
    scanProject: (project: StoredProject) => Promise<WorkItemCard[]>;
    summarizeEvidence: (phase: PhaseSummary) => { message: string; ok: boolean };
    summarizeOutput: (output: string, fallback: string) => string;
  }) {}

  async execute(input: {
    branchName: string; cardKey: string; command: FeatureWorkflowCommand; feature: WorkItemCard;
    plan: import("@hepha/shared").HandoffPlanV1; phase: NumberedPhase; previousFailureBrief?: string; project: StoredProject; runId: string;
  }): Promise<string> {
    const feature = await this.dependencies.refreshFeature(input.project, input.feature.externalId, input.feature);
    const currentStep = `Running ${this.dependencies.formatPhase(input.phase)}`;
    await this.dependencies.recordProgress({
      cardKey: input.cardKey, command: input.command, currentStep, feature, project: input.project,
      runId: input.runId, summary: "Resolving human review findings.",
    });
    const items = await this.dependencies.scanProject(input.project);
    const context = this.dependencies.buildContext(input.project, feature, items, input.phase, input.previousFailureBrief);
    const output = await this.dependencies.runWorker({
      agentAction: "resolve-review-findings",
      agentName: "Human Review Findings Agent", agentRole: "human-review-findings", cardKey: input.cardKey,
      feature, plan: input.plan, phaseNumber: input.phase.number, phaseTitle: input.phase.title,
      project: input.project, prompt: this.dependencies.buildPrompt(input.project, feature, context, {
        branchName: input.branchName, phase: input.phase,
      }), runId: input.runId, step: currentStep,
    });

    const currentFeature = await this.dependencies.refreshFeature(input.project, input.feature.externalId, feature);
    const currentPhase = this.dependencies.findHumanReviewPhase(currentFeature) ?? input.phase;
    const evidence = this.dependencies.summarizeEvidence(currentPhase);
    if (!this.dependencies.isAwaitingUser(currentPhase) && !this.dependencies.isResolved(currentPhase)) {
      const path = currentPhase.documentRelativePath || currentPhase.fileName;
      throw new Error(
        `${this.dependencies.formatPhase(currentPhase)} did not move to AWAITING_USER_ACCEPTANCE or COMPLETED. Update ${path} with the finding result and checkpoint status.`,
      );
    }
    if (!evidence.ok) throw new Error(evidence.message);
    return `Human review findings phase: ${this.dependencies.summarizeOutput(output, "Finding phase worker completed.")}`;
  }
}
