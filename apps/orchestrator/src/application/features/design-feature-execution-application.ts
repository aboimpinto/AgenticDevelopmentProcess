import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type { WorkflowFailureBriefPresenter } from "../../workflows/recovery/workflow-failure-brief-presenter.js";
import type { ImplementationWorkerApplication } from "../../workflows/phases/implementation-worker-application.js";
import type { DesignArtifactPolicy } from "./design-artifact-policy.js";
import type { FeatureWorkflowRunCoordinator } from "./feature-workflow-run-coordinator.js";
import type { FeatureWorkflowTargetResolver } from "./feature-workflow-target-resolver.js";

export interface DesignFeatureExecutionDependencies {
  artifactPolicy: Pick<DesignArtifactPolicy, "assertComplete">;
  buildPrompt(project: StoredProject, feature: WorkItemCard): string;
  failureBriefPresenter: Pick<WorkflowFailureBriefPresenter, "create">;
  metadataStore: Pick<CardMetadataStore, "recordFeatureWorkflowCompletion" | "recordFeatureWorkflowRun">;
  notifyChanged(projectId: string, eventType: string, externalId: string): void;
  requireModel(configuredModel: string | undefined, label: string): import("@hepha/shared").HandoffPlanV1;
  summarizeOutput(output: string, fallback: string): string;
  targets: Pick<FeatureWorkflowTargetResolver, "findCurrentFeature">;
  worker: Pick<ImplementationWorkerApplication, "execute">;
  workflowCoordinator: Pick<FeatureWorkflowRunCoordinator, "createFeatureRunner">;
}

export interface DesignFeatureExecutionInput {
  cardKey: string;
  feature: WorkItemCard;
  project: StoredProject;
  runId: string;
}

/** Owns the detached Design Feature workflow through terminal completion or durable failure. */
export class DesignFeatureExecutionApplication {
  constructor(private readonly dependencies: DesignFeatureExecutionDependencies) {}

  async execute({ cardKey, feature, project, runId }: DesignFeatureExecutionInput): Promise<void> {
    try {
      let currentFeature = feature;
      let output = "";
      const workflow = this.dependencies.workflowCoordinator.createFeatureRunner({
        cardKey,
        command: "design-feature",
        getFeature: () => currentFeature,
        project,
        runId,
      });

      currentFeature = await workflow.runNode(
        "collect-context",
        { variables: { featureId: feature.externalId } },
        () => this.dependencies.targets.findCurrentFeature(project, feature.externalId, currentFeature),
      );
      output = await workflow.runNode(
        "generate-design-artifacts",
        { variables: { featureId: feature.externalId } },
        (node, rendered) => {
          if (node.kind !== "prompt") throw new Error("AGENT_ACTION_MISSING");
          return this.dependencies.worker.execute({
            agentAction: node.agentAction,
            agentName: "Design Feature Agent",
            agentRole: "design-feature",
            cardKey,
            feature: currentFeature,
            plan: this.dependencies.requireModel(undefined, "design-feature generate-design-artifacts node"),
            phaseNumber: null,
            phaseTitle: "Design Feature",
            node,
            project,
            prompt: this.dependencies.buildPrompt(project, currentFeature),
            runId,
            step: rendered.status,
          });
        },
      );

      currentFeature = await this.dependencies.targets.findCurrentFeature(project, feature.externalId, currentFeature);
      this.dependencies.artifactPolicy.assertComplete(currentFeature);
      await this.dependencies.metadataStore.recordFeatureWorkflowCompletion({
        cardKey,
        command: "design-feature",
        projectId: project.id,
        runId,
        summary: this.dependencies.summarizeOutput(output, `Created UI requirements for ${feature.externalId}.`),
      });
      this.dependencies.notifyChanged(project.id, "workflow.completed", feature.externalId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown design-feature error.";
      await this.dependencies.metadataStore.recordFeatureWorkflowRun({
        cardKey,
        command: "design-feature",
        error: errorMessage,
        projectId: project.id,
        runId,
        status: "failed",
        summary: this.dependencies.failureBriefPresenter.create({ command: "design-feature", feature, rawError: errorMessage, runId }),
      }).catch(() => undefined);
      this.dependencies.notifyChanged(project.id, "workflow.failed", feature.externalId);
    }
  }
}
