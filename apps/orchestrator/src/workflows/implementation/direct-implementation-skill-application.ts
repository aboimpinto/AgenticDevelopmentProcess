import type { WorkItemCard } from "@hepha/shared";
import type { FeatureWorkflowTargetResolver } from "../../application/features/feature-workflow-target-resolver.js";
import type { ImplementationWorkerApplication } from "../phases/implementation-worker-application.js";
import type { ImplementationWorkflowInput } from "./implementation-workflow-input.js";

export interface DirectImplementationSkillDependencies {
  buildPrompt(input: ImplementationWorkflowInput, feature: WorkItemCard): string;
  resolveModel(input: ImplementationWorkflowInput): import("@hepha/shared").HandoffPlanV1;
  targets: Pick<FeatureWorkflowTargetResolver, "findCurrentFeature">;
  worker: Pick<ImplementationWorkerApplication, "execute">;
}

/** Runs an explicitly orchestrated feature-level launcher outside the numbered phase worker. Direct-host skills never enter this application. */
export class DirectImplementationSkillApplication {
  constructor(private readonly dependencies: DirectImplementationSkillDependencies) {}

  async execute(input: ImplementationWorkflowInput, step: string): Promise<string> {
    const feature = await this.dependencies.targets.findCurrentFeature(
      input.project,
      input.feature.externalId,
      input.feature,
    );
    const agentRole = input.command === "start-implementing" ? "start-feature" : "continue-implementation";

    return await this.dependencies.worker.execute({
      agentAction: input.agentAction,
      agentName: "Implementation Agent",
      agentRole,
      cardKey: input.cardKey,
      feature,
      plan: this.dependencies.resolveModel(input),
      phaseNumber: null,
      phaseTitle: null,
      project: input.project,
      prompt: this.dependencies.buildPrompt(input, feature),
      runId: input.runId,
      step,
    });
  }
}
