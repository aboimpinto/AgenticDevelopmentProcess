import type { WorkItemCard } from "@hepha/shared";
import type { ImplementationWorkerApplication } from "../phases/implementation-worker-application.js";
import type { FeatureWorkflowRunCoordinator } from "../../application/features/feature-workflow-run-coordinator.js";
import type { FeatureWorkflowTargetResolver } from "../../application/features/feature-workflow-target-resolver.js";
import type { ImplementationWorkflowInput } from "./implementation-workflow-input.js";

export interface StartFeaturePostProcessDependencies {
  assertTimingComplete(feature: WorkItemCard): void;
  buildContext(input: ImplementationWorkflowInput, feature: WorkItemCard, workItems: WorkItemCard[]): string;
  buildPrompt(input: ImplementationWorkflowInput, feature: WorkItemCard, context: string, workItems: WorkItemCard[]): string;
  notifyChanged(projectId: string, eventType: string, externalId: string): void;
  scanProject(input: ImplementationWorkflowInput): Promise<WorkItemCard[]>;
  targets: Pick<FeatureWorkflowTargetResolver, "findCurrentFeature">;
  worker: Pick<ImplementationWorkerApplication, "execute">;
  workflowCoordinator: Pick<FeatureWorkflowRunCoordinator, "recordFeatureProgress">;
}

/** Adds routing and calibrated effort estimates after Start Feature transition. */
export class StartFeaturePostProcessApplication {
  constructor(private readonly dependencies: StartFeaturePostProcessDependencies) {}

  async execute(input: ImplementationWorkflowInput, plan: import("@hepha/shared").HandoffPlanV1): Promise<WorkItemCard> {
    const feature = await this.dependencies.targets.findCurrentFeature(
      input.project, input.feature.externalId, input.feature,
    );
    const workItems = await this.dependencies.scanProject(input);
    const context = this.dependencies.buildContext(input, feature, workItems);
    const currentStep = "Post-processing phase routing and estimates";
    await this.dependencies.workflowCoordinator.recordFeatureProgress({
      cardKey: input.cardKey, command: input.command, currentStep, feature,
      project: input.project, runId: input.runId,
      summary: "Adding phase routing recommendations and effort estimates.",
    });
    await this.dependencies.worker.execute({
      agentAction: "start-feature",
      agentName: "Implementation Routing Agent", agentRole: "start-feature-postprocess",
      cardKey: input.cardKey, feature, plan, phaseNumber: null,
      phaseTitle: "Start Feature Post-Process", project: input.project,
      prompt: this.dependencies.buildPrompt(input, feature, context, workItems),
      runId: input.runId, step: currentStep,
    });
    const postProcessedFeature = await this.dependencies.targets.findCurrentFeature(
      input.project, input.feature.externalId, feature,
    );
    this.dependencies.assertTimingComplete(postProcessedFeature);
    this.dependencies.notifyChanged(input.project.id, "workflow.postprocess", feature.externalId);
    return postProcessedFeature;
  }
}
