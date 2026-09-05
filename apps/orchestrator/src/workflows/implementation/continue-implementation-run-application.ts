import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import type { HephaFeatureWorkflowRunner } from "../../feature-workflow-spec.js";
import type {
  AutonomousContinuationInput,
  AutonomousContinuationOutcome,
} from "./autonomous-continuation-scheduler.js";
import type { ImplementationWorkflowInput } from "./implementation-workflow-input.js";

export interface ImplementationRecoveryOutcome {
  errorMessage: string;
  failureBrief: string | null;
  output: string;
  recovered: boolean;
}

interface ReconciliationResult { allTerminal: boolean; feature: WorkItemCard }
interface TaskResolution { currentStep: string; summary: string }
/** Coordinates one durable Continue Implementation run around the implementation worker boundary. */
export class ContinueImplementationRunApplication {
  constructor(private readonly dependencies: {
    assertRunActive(runId: string): void;
    attemptRecovery(input: { errorMessage: string; feature: WorkItemCard; input: ImplementationWorkflowInput }): Promise<ImplementationRecoveryOutcome>;
    captureDurableProgress(feature: WorkItemCard): string;
    classifyBlocked(errorMessage: string): boolean;
    clearCancellation(runId: string): void;
    createFailureBrief(input: { command: ImplementationWorkflowInput["command"]; currentStep: string | null; feature: WorkItemCard; rawError: string; runId: string }): string;
    createRunner(input: ImplementationWorkflowInput, getFeature: () => WorkItemCard): HephaFeatureWorkflowRunner;
    findCurrentFeature(input: ImplementationWorkflowInput, fallback: WorkItemCard): Promise<WorkItemCard>;
    metadataStore: Pick<CardMetadataStore, "recordFeatureWorkflowCompletion" | "recordFeatureWorkflowRun">;
    notifyChanged(projectId: string, eventType: string, externalId: string): void;
    reconcile(input: ImplementationWorkflowInput, feature: WorkItemCard): Promise<ReconciliationResult>;
    reconcileRecordedGherkin(input: ImplementationWorkflowInput, feature: WorkItemCard): Promise<WorkItemCard>;
    recoverPersistedWorkerEvidence(input: ImplementationWorkflowInput, feature: WorkItemCard): Promise<WorkItemCard>;
    resolveTask(input: ImplementationWorkflowInput, feature: WorkItemCard): Promise<TaskResolution>;
    reviewHandoff(input: ImplementationWorkflowInput, feature: WorkItemCard): Promise<WorkItemCard>;
    runAutonomous(input: ImplementationWorkflowInput): Promise<string>;
    runInteractive(input: ImplementationWorkflowInput): Promise<string>;
    scheduleContinuation(input: AutonomousContinuationInput): Promise<AutonomousContinuationOutcome>;
    summarizeOutput(output: string, fallback: string): string;
    isCancelled(error: unknown): boolean;
    recordProgress(input: ImplementationWorkflowInput, feature: WorkItemCard, resolution: TaskResolution): Promise<void>;
  }) {}

  async execute(input: ImplementationWorkflowInput): Promise<void> {
    let feature = input.feature;
    const workflow = this.dependencies.createRunner(input, () => feature);

    try {
      feature = await workflow.runNode(
        "refresh-current-feature",
        { variables: { featureId: input.feature.externalId } },
        () => this.dependencies.findCurrentFeature(input, input.feature),
      );
      feature = await this.dependencies.recoverPersistedWorkerEvidence(input, feature);
      feature = await this.dependencies.reconcileRecordedGherkin(input, feature);
      feature = await this.dependencies.reviewHandoff(input, feature);

      const durableFingerprintBeforeRun = this.dependencies.captureDurableProgress(feature);
      const preRunReconciliation = await this.dependencies.reconcile(input, feature);
      feature = preRunReconciliation.feature;
      if (this.isTerminal(preRunReconciliation)) {
        await this.completeTerminal(input, "All numbered phases and declared tasks were reconciled as complete from durable evidence. Manual Code Review and Manual Tests are now required before Complete Feature.");
        return;
      }

      const taskResolution = await workflow.runNode(
        "resolve-next-task",
        { variables: { featureId: input.feature.externalId } },
        () => this.dependencies.resolveTask(input, feature),
      );
      await this.dependencies.recordProgress(input, feature, taskResolution);
      const output = await workflow.runNode(
        "implementation-loop",
        {
          variables: {
            branchMessage: input.branchMessage,
            branchName: input.branchName,
            featureId: input.feature.externalId,
            implementationLoopStep: taskResolution.currentStep,
          },
        },
        () => input.autonomous
          ? this.dependencies.runAutonomous({ ...input, feature })
          : this.dependencies.runInteractive({ ...input, feature }),
      );

      this.dependencies.assertRunActive(input.runId);
      feature = await this.dependencies.findCurrentFeature(input, feature);
      feature = await this.dependencies.reviewHandoff(input, feature);
      const postWorkerReconciliation = await this.dependencies.reconcile(input, feature);
      feature = postWorkerReconciliation.feature;
      if (this.isTerminal(postWorkerReconciliation)) {
        await this.completeTerminal(input, "All numbered phases and declared tasks were reconciled as complete from durable evidence after the worker returned. Manual Code Review and Manual Tests are now required before Complete Feature.");
        return;
      }

      await this.dependencies.recordProgress(
        input,
        feature,
        await this.dependencies.resolveTask(input, feature),
      );
      await this.dependencies.metadataStore.recordFeatureWorkflowCompletion({
        cardKey: input.cardKey,
        command: input.command,
        projectId: input.project.id,
        runId: input.runId,
        summary: this.dependencies.summarizeOutput(output, `Continued implementation for ${input.feature.externalId}.`),
      });
      const continuationOutcome = await this.dependencies.scheduleContinuation({
        autonomous: input.autonomous,
        branchMessage: input.branchMessage,
        branchName: input.branchName,
        cardKey: input.cardKey,
        command: input.command,
        durableFingerprintBeforeRun,
        feature,
        previousFailureBrief: null,
        project: input.project,
        runId: input.runId,
      });
      if (continuationOutcome === "not_scheduled") {
        this.dependencies.notifyChanged(input.project.id, "workflow.completed", input.feature.externalId);
      }
    } catch (error) {
      await this.handleFailure(input, feature, error);
    }
  }

  private isTerminal(result: ReconciliationResult): boolean {
    return result.allTerminal;
  }

  private async completeTerminal(input: ImplementationWorkflowInput, summary: string): Promise<void> {
    await this.dependencies.metadataStore.recordFeatureWorkflowCompletion({
      cardKey: input.cardKey,
      command: input.command,
      projectId: input.project.id,
      runId: input.runId,
      summary,
    });
    this.dependencies.notifyChanged(input.project.id, "workflow.completed", input.feature.externalId);
  }

  private async handleFailure(input: ImplementationWorkflowInput, feature: WorkItemCard, error: unknown): Promise<void> {
    if (this.dependencies.isCancelled(error)) {
      this.dependencies.clearCancellation(input.runId);
      this.dependencies.notifyChanged(input.project.id, "workflow.cancelled", input.feature.externalId);
      return;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown implementation continuation error.";


    let recovery: ImplementationRecoveryOutcome;
    try {
      recovery = await this.dependencies.attemptRecovery({ errorMessage, feature, input });
    } catch (recoveryError) {
      const recoveryErrorMessage = recoveryError instanceof Error
        ? recoveryError.message
        : "Unknown workflow recovery error.";
      recovery = {
        errorMessage: `${errorMessage}\n\nWorkflow recovery failed: ${recoveryErrorMessage}`,
        failureBrief: null,
        output: "",
        recovered: false,
      };
    }

    if (recovery.recovered) {
      await this.dependencies.metadataStore.recordFeatureWorkflowCompletion({
        cardKey: input.cardKey,
        command: input.command,
        projectId: input.project.id,
        runId: input.runId,
        summary: this.dependencies.summarizeOutput(
          recovery.output,
          `Recovered and continued implementation for ${input.feature.externalId}.`,
        ),
      });
      this.dependencies.notifyChanged(input.project.id, "workflow.completed", input.feature.externalId);
      return;
    }

    const blocked = this.dependencies.classifyBlocked(recovery.errorMessage);
    await this.dependencies.metadataStore.recordFeatureWorkflowRun({
      cardKey: input.cardKey,
      command: input.command,
      error: recovery.errorMessage,
      projectId: input.project.id,
      runId: input.runId,
      status: blocked ? "blocked" : "failed",
      summary: recovery.failureBrief ?? this.dependencies.createFailureBrief({
        command: input.command,
        currentStep: feature.featureWorkflow?.lastRun?.currentStep ?? null,
        feature: input.feature,
        rawError: recovery.errorMessage,
        runId: input.runId,
      }),
    }).catch(() => undefined);
    this.dependencies.notifyChanged(input.project.id, blocked ? "workflow.blocked" : "workflow.failed", input.feature.externalId);
  }
}
