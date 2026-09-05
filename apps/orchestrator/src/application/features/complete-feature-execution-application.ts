import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type { DetachedCompletionWorkerApplication } from "../../workflows/phases/detached-completion-worker-application.js";
import type { WorkflowFailureBriefPresenter } from "../../workflows/recovery/workflow-failure-brief-presenter.js";
import type { WorkflowTransitionReceiptPolicy } from "../../workflows/receipts/workflow-transition-receipt-policy.js";
import type { FeatureCompletionReadinessPolicy } from "./feature-completion-readiness-policy.js";
import type { FeatureWorkflowRunCoordinator } from "./feature-workflow-run-coordinator.js";
import type { FeatureWorkflowTargetResolver } from "./feature-workflow-target-resolver.js";

export interface CompleteFeatureExecutionDependencies {
  buildPrompt(project: StoredProject, feature: WorkItemCard, context: string, runId: string): string;
  createCardKey(kind: WorkItemCard["kind"], externalId: string): string;
  createId(): string;
  failureBriefPresenter: Pick<WorkflowFailureBriefPresenter, "create">;
  finalizer: Pick<DetachedCompletionWorkerApplication, "launch">;
  metadataStore: Pick<CardMetadataStore, "recordFeatureWorkflowRun">;
  notifyChanged(projectId: string, eventType: string, externalId: string): void;
  readiness: Pick<FeatureCompletionReadinessPolicy, "canStart">;
  receiptPolicy: Pick<WorkflowTransitionReceiptPolicy, "createContext" | "validate">;
  requireModel(configuredModel: string | undefined, label: string): import("@hepha/shared").HandoffPlanV1;
  scanProject(project: StoredProject): Promise<WorkItemCard[]>;
  collectContext(project: StoredProject, feature: WorkItemCard, workItems: WorkItemCard[]): string;
  targets: Pick<FeatureWorkflowTargetResolver, "findCurrentFeature">;
  workflowCoordinator: Pick<FeatureWorkflowRunCoordinator, "createFeatureRunner">;
}

export interface CompleteFeatureExecutionInput {
  cardKey: string;
  feature: WorkItemCard;
  project: StoredProject;
  runId: string;
}

/** Starts and executes detached Complete Feature finalization without claiming premature completion. */
export class CompleteFeatureExecutionApplication {
  constructor(private readonly dependencies: CompleteFeatureExecutionDependencies) {}

  assertTransitionAllowed(project: StoredProject, feature: WorkItemCard): void {
    const { context, packRefs } = this.dependencies.receiptPolicy.createContext(project, feature);
    const error = this.dependencies.receiptPolicy.validate({
      cardKey: this.dependencies.createCardKey(feature.kind, feature.externalId),
      command: "complete-feature", context, contextPackRefs: packRefs,
      stage: "complete-feature", nextState: "04_COMPLETED", projectId: project.id,
      projectRoot: project.rootPath, status: "complete",
    });
    if (error) throw error;
  }

  async start(project: StoredProject, feature: WorkItemCard): Promise<boolean> {
    const currentFeature = await this.dependencies.targets.findCurrentFeature(project, feature.externalId, feature);
    if (!this.dependencies.readiness.canStart(currentFeature)) return false;

    const runId = `workflow-${this.dependencies.createId()}`;
    const cardKey = this.dependencies.createCardKey(currentFeature.kind, currentFeature.externalId);
    await this.dependencies.metadataStore.recordFeatureWorkflowRun({
      cardKey, command: "complete-feature", currentStep: "Starting complete-feature finalization",
      projectId: project.id, runId, status: "running", summary: `Completing ${currentFeature.externalId}.`,
    });
    void this.execute({ cardKey, feature: currentFeature, project, runId });
    this.dependencies.notifyChanged(project.id, "workflow.started", currentFeature.externalId);
    return true;
  }

  async execute({ cardKey, feature, project, runId }: CompleteFeatureExecutionInput): Promise<void> {
    try {
      let currentFeature = await this.dependencies.targets.findCurrentFeature(project, feature.externalId, feature);
      const workflow = this.dependencies.workflowCoordinator.createFeatureRunner({
        cardKey, command: "complete-feature", getFeature: () => currentFeature, project, runId,
      });
      const context = await workflow.runNode(
        "collect-context",
        { variables: { featureId: feature.externalId } },
        async () => {
          currentFeature = await this.dependencies.targets.findCurrentFeature(project, feature.externalId, currentFeature);
          return this.dependencies.collectContext(project, currentFeature, await this.dependencies.scanProject(project));
        },
      );
      await workflow.runNode(
        "finalize-feature",
        { variables: { featureId: feature.externalId } },
        (node, rendered) => this.dependencies.finalizer.launch({
          agentName: "Complete Feature Agent", agentRole: "complete-feature", cardKey,
          feature: currentFeature,
          plan: this.dependencies.requireModel(undefined, "complete-feature finalize-feature node"),
          phaseNumber: null, phaseTitle: "Complete Feature", project,
          prompt: this.dependencies.buildPrompt(project, currentFeature, context, runId),
          runId, step: rendered.status,
        }),
      );
      this.dependencies.notifyChanged(project.id, "workflow.detached", feature.externalId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown completion error.";
      await this.dependencies.metadataStore.recordFeatureWorkflowRun({
        cardKey, command: "complete-feature", error: errorMessage, projectId: project.id,
        runId, status: "failed",
        summary: this.dependencies.failureBriefPresenter.create({ command: "complete-feature", feature, rawError: errorMessage, runId }),
      }).catch(() => undefined);
      this.dependencies.notifyChanged(project.id, "workflow.failed", feature.externalId);
    }
  }
}
