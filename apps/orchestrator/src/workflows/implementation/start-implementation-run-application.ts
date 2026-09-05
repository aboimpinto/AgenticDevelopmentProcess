import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import type { HephaFeatureWorkflowRunner } from "../../feature-workflow-spec.js";
import type { StartImplementationRunInput } from "../../application/features/start-implementation-application.js";
import type { ImplementationRecoveryOutcome } from "./continue-implementation-run-application.js";
import type { AutonomousContinuationOutcome } from "./autonomous-continuation-scheduler.js";
import type { ImplementationWorkflowInput } from "./implementation-workflow-input.js";

export interface ImplementationBranchPreparationResult {
  branchName: string | null;
  message: string;
}

/** Coordinates one Start Implementation branch, transition, and worker lifecycle. */
export class StartImplementationRunApplication {
  constructor(private readonly dependencies: {
    assertRunActive(runId: string): void;
    attemptRecovery(input: { errorMessage: string; feature: WorkItemCard; input: ImplementationWorkflowInput }): Promise<ImplementationRecoveryOutcome>;
    captureDurableProgress(feature: WorkItemCard): string;
    clearCancellation(runId: string): void;
    completeTransition(input: StartImplementationRunInput, branch: ImplementationBranchPreparationResult, moved: boolean, startedAt: string): Promise<void>;
    createFailureBrief(input: StartImplementationRunInput, feature: WorkItemCard, errorMessage: string): string;
    createRunner(input: StartImplementationRunInput, getFeature: () => WorkItemCard): HephaFeatureWorkflowRunner;
    findCurrentFeature(input: StartImplementationRunInput, fallback: WorkItemCard): Promise<WorkItemCard>;
    isBlockedFailure(errorMessage: string): boolean;
    isCancelled(error: unknown): boolean;
    metadataEnabled(): boolean;
    metadataStore: Pick<CardMetadataStore, "recordFeatureWorkflowCompletion" | "recordFeatureWorkflowRun">;
    moveToInProgress(input: StartImplementationRunInput): Promise<{ feature: WorkItemCard; moved: boolean }>;
    notifyChanged(projectId: string, eventType: string, externalId: string): void;
    now(): string;
    postProcess(input: StartImplementationRunInput, feature: WorkItemCard, branch: ImplementationBranchPreparationResult): Promise<WorkItemCard>;
    prepareBranches(input: StartImplementationRunInput): Promise<ImplementationBranchPreparationResult> | ImplementationBranchPreparationResult;
    recordPrerequisite(input: StartImplementationRunInput, startedAt: string): void;
    rollback(input: StartImplementationRunInput, feature: WorkItemCard): Promise<void>;
    runImplementation(input: StartImplementationRunInput, feature: WorkItemCard, branch: ImplementationBranchPreparationResult): Promise<string>;
    scheduleContinuation(
      input: StartImplementationRunInput,
      feature: WorkItemCard,
      branch: ImplementationBranchPreparationResult,
      durableFingerprintBeforeRun: string,
    ): Promise<AutonomousContinuationOutcome>;
    summarizeOutput(output: string, fallback: string): string;
    syncLinkedEpic(input: StartImplementationRunInput, feature: WorkItemCard): Promise<void>;
  }) {}

  async execute(input: StartImplementationRunInput): Promise<void> {
    let inProgressFeature = input.feature;
    let branch: ImplementationBranchPreparationResult = {
      branchName: null,
      message: "Branch creation was not attempted.",
    };
    let movedToInProgress = false;
    let implementationLoopStarted = false;
    const startedAt = this.dependencies.now();
    if (this.dependencies.metadataEnabled()) this.dependencies.recordPrerequisite(input, startedAt);
    const workflow = this.dependencies.createRunner(input, () => inProgressFeature);

    try {
      branch = await workflow.runNode(
        "create-branch",
        { variables: { branchName: input.branchName, featureId: input.feature.externalId } },
        () => this.dependencies.prepareBranches(input),
      );
      if (branch.branchName !== input.branchName) throw new Error(branch.message);

      await workflow.runNode(
        "move-in-progress",
        { summary: branch.message, variables: { branchName: input.branchName, featureId: input.feature.externalId } },
        async () => {
          const moved = await this.dependencies.moveToInProgress(input);
          movedToInProgress = moved.moved;
          inProgressFeature = moved.feature;
        },
      );
      await workflow.runNode(
        "sync-linked-epic-state",
        { variables: { featureId: input.feature.externalId } },
        () => this.dependencies.syncLinkedEpic(input, inProgressFeature),
      );

      if (input.transitionOnly) {
        await this.dependencies.completeTransition(input, branch, movedToInProgress, startedAt);
        return;
      }

      inProgressFeature = await workflow.runNode(
        "post-process",
        {
          variables: {
            branchMessage: branch.message,
            branchName: branch.branchName ?? input.branchName,
            featureId: input.feature.externalId,
          },
        },
        () => this.dependencies.postProcess(input, inProgressFeature, branch),
      );
      const contextFeature = await this.dependencies.findCurrentFeature(input, inProgressFeature);
      const durableFingerprintBeforeRun = this.dependencies.captureDurableProgress(contextFeature);
      implementationLoopStarted = true;
      const output = await workflow.runNode(
        "implementation-loop",
        {
          variables: {
            branchMessage: branch.message,
            branchName: branch.branchName ?? input.branchName,
            featureId: input.feature.externalId,
            implementationLoopStep: input.autonomous
              ? "Starting autonomous implementation loop"
              : "Preparing implementation handoff",
          },
        },
        () => this.dependencies.runImplementation(input, contextFeature, branch),
      );
      this.dependencies.assertRunActive(input.runId);
      await this.dependencies.metadataStore.recordFeatureWorkflowCompletion({
        cardKey: input.cardKey,
        command: "start-implementing",
        projectId: input.project.id,
        runId: input.runId,
        summary: this.dependencies.summarizeOutput(output, `Started implementation for ${input.feature.externalId}.`),
      });
      const currentFeature = await this.dependencies.findCurrentFeature(input, contextFeature);
      const continuationOutcome = await this.dependencies.scheduleContinuation(
        input,
        currentFeature,
        branch,
        durableFingerprintBeforeRun,
      );
      if (continuationOutcome === "not_scheduled") {
        this.dependencies.notifyChanged(input.project.id, "workflow.completed", input.feature.externalId);
      }
    } catch (error) {
      await this.handleFailure(input, inProgressFeature, branch, movedToInProgress, implementationLoopStarted, error);
    }
  }

  private async handleFailure(
    input: StartImplementationRunInput,
    inProgressFeature: WorkItemCard,
    branch: ImplementationBranchPreparationResult,
    movedToInProgress: boolean,
    implementationLoopStarted: boolean,
    error: unknown,
  ): Promise<void> {
    if (this.dependencies.isCancelled(error)) {
      this.dependencies.clearCancellation(input.runId);
      this.dependencies.notifyChanged(input.project.id, "workflow.cancelled", input.feature.externalId);
      return;
    }
    if (movedToInProgress && !implementationLoopStarted) {
      await this.dependencies.rollback(input, inProgressFeature).catch(() => undefined);
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown implementation start error.";
    let failureFeature = input.feature;
    let recovery: ImplementationRecoveryOutcome | null = null;
    try {
      failureFeature = await this.dependencies.findCurrentFeature(input, inProgressFeature);
    } catch {
      failureFeature = input.feature;
    }
    if (implementationLoopStarted) {
      try {
        recovery = await this.dependencies.attemptRecovery({
          errorMessage,
          feature: failureFeature,
          input: {
            ...input,
            agentAction: "start-feature",
            branchMessage: branch.message,
            branchName: branch.branchName ?? input.branchName,
            command: "start-implementing",
            feature: failureFeature,
            recoveryAttempt: 0,
          },
        });
      } catch (recoveryError) {
        const message = recoveryError instanceof Error ? recoveryError.message : "Unknown workflow recovery error.";
        recovery = { errorMessage: `${errorMessage}\n\nWorkflow recovery failed: ${message}`, failureBrief: null, output: "", recovered: false };
      }
      if (recovery.recovered) {
        await this.dependencies.metadataStore.recordFeatureWorkflowCompletion({
          cardKey: input.cardKey,
          command: "start-implementing",
          projectId: input.project.id,
          runId: input.runId,
          summary: this.dependencies.summarizeOutput(
            recovery.output,
            `Recovered and started implementation for ${input.feature.externalId}.`,
          ),
        });
        this.dependencies.notifyChanged(input.project.id, "workflow.completed", input.feature.externalId);
        return;
      }
    }
    const finalError = recovery?.errorMessage ?? errorMessage;
    const blocked = this.dependencies.isBlockedFailure(finalError);
    await this.dependencies.metadataStore.recordFeatureWorkflowRun({
      cardKey: input.cardKey,
      command: "start-implementing",
      error: finalError,
      projectId: input.project.id,
      runId: input.runId,
      status: blocked ? "blocked" : "failed",
      summary: recovery?.failureBrief ?? this.dependencies.createFailureBrief(input, failureFeature, finalError),
    }).catch(() => undefined);
    this.dependencies.notifyChanged(input.project.id, blocked ? "workflow.blocked" : "workflow.failed", input.feature.externalId);
  }
}
