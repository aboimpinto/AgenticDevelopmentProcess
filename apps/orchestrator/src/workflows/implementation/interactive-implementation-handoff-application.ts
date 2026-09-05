import type { WorkItemCard } from "@hepha/shared";
import type { FeatureWorkflowRunCoordinator } from "../../application/features/feature-workflow-run-coordinator.js";
import type { FeatureWorkflowTargetResolver } from "../../application/features/feature-workflow-target-resolver.js";
import type { ImplementationWorkerApplication } from "../phases/implementation-worker-application.js";
import type { ImplementationWorkflowInput } from "./implementation-workflow-input.js";

export interface InteractiveImplementationHandoffDependencies {
  buildContext(input: ImplementationWorkflowInput, feature: WorkItemCard, workItems: WorkItemCard[]): string;
  buildPrompt(input: ImplementationWorkflowInput, feature: WorkItemCard, context: string): string;
  resolveImplementationModel(input: ImplementationWorkflowInput): import("@hepha/shared").HandoffPlanV1;
  scanProject(input: ImplementationWorkflowInput): Promise<WorkItemCard[]>;
  targets: Pick<FeatureWorkflowTargetResolver, "findCurrentFeature">;
  worker: Pick<ImplementationWorkerApplication, "execute">;
  workflowCoordinator: Pick<FeatureWorkflowRunCoordinator, "recordFeatureProgress">;
}

/** Prepares and executes the explicitly non-autonomous implementation handoff. */
export class InteractiveImplementationHandoffApplication {
  constructor(private readonly dependencies: InteractiveImplementationHandoffDependencies) {}

  async execute(input: ImplementationWorkflowInput): Promise<string> {
    const workItems = await this.dependencies.scanProject(input);
    const feature = await this.dependencies.targets.findCurrentFeature(
      input.project,
      input.feature.externalId,
      input.feature,
    );
    const context = this.dependencies.buildContext(input, feature, workItems);
    const currentStep = input.command === "continue-implementing"
      ? "Preparing implementation continuation"
      : "Preparing implementation handoff";

    await this.dependencies.workflowCoordinator.recordFeatureProgress({
      cardKey: input.cardKey,
      command: input.command,
      currentStep,
      feature,
      project: input.project,
      runId: input.runId,
      summary: input.branchMessage,
    });

    return await this.dependencies.worker.execute({
      agentAction: input.agentAction,
      agentName: "Implementation Agent",
      agentRole: "implementation-handoff",
      cardKey: input.cardKey,
      feature,
      plan: this.dependencies.resolveImplementationModel(input),
      phaseNumber: null,
      phaseTitle: null,
      project: input.project,
      prompt: this.dependencies.buildPrompt(input, feature, context),
      runId: input.runId,
      step: currentStep,
    });
  }
}
