import { randomUUID } from "node:crypto";
import type { CardMetadataStore } from "@hepha/db";
import type { FeatDeliveryPolicy } from "@hepha/shared";
import { FeatureStateFolderTransition } from "../application/features/feature-state-folder-transition.js";
import { FeatureWorkflowRunCoordinator } from "../application/features/feature-workflow-run-coordinator.js";
import { FeatureWorkflowTargetResolver } from "../application/features/feature-workflow-target-resolver.js";
import { StartTransitionStateRecorder } from "../application/features/start-transition-state-recorder.js";
import { EpicStateSynchronizationApplication } from "../application/epics/epic-state-synchronization-application.js";
import { WorkItemQueryApplication } from "../application/work-items/work-item-query-application.js";
import { prepareFeatureBranches } from "../feature-git-branch.js";
import { createBranchPreparationMetadata, planBranchWorktree } from "../start-transition-helpers.js";
import {
  clearWorkflowCancellation,
  isWorkflowCancelledError,
  throwIfWorkflowCancelled,
} from "../workflow-cancellation.js";
import { RoutingActionResolver } from "../agent-routing/routing-action-resolver.js";
import { AutonomousContinuationScheduler } from "../workflows/implementation/autonomous-continuation-scheduler.js";
import { AutonomousImplementationWorkflowApplication } from "../workflows/implementation/autonomous-implementation-workflow-application.js";
import { ContinueImplementationRunApplication } from "../workflows/implementation/continue-implementation-run-application.js";
import { capturePhaseDurableProgressFingerprint } from "../workflows/implementation/phase-durable-progress-fingerprint.js";
import { InteractiveImplementationHandoffApplication } from "../workflows/implementation/interactive-implementation-handoff-application.js";
import { StartFeaturePostProcessApplication } from "../workflows/implementation/start-feature-post-process-application.js";
import { StartImplementationRunApplication } from "../workflows/implementation/start-implementation-run-application.js";
import { PhaseGateRecoveryApplication } from "../workflows/phases/phase-gate-recovery-application.js";
import { areAllImplementationPhasesResolved } from "../workflows/phases/phase-lifecycle-policy.js";
import { PhaseReviewHandoffApplication } from "../workflows/phases/phase-review-handoff-application.js";
import { PhaseStateReconciliationApplication } from "../workflows/phases/phase-state-reconciliation-application.js";
import { PhaseTaskCursorResolver } from "../workflows/phases/phase-task-cursor-resolver.js";
import {
  isAuthoritativeV1ReviewFailure,
  isFixerResponseRepairCapFailure,
  isReviewContractPredecessorRequiredFailure,
} from "../workflows/recovery/implementation-failure-classifier.js";
import { ImplementationAutoRecoveryApplication } from "../workflows/recovery/implementation-auto-recovery-application.js";
import { WorkflowFailureBriefPresenter } from "../workflows/recovery/workflow-failure-brief-presenter.js";
import { summarizeWorkflowOutput } from "../workflows/workflow-output-summary.js";

export interface ImplementationRunApplicationsDependencies {
  autoRecovery: Pick<ImplementationAutoRecoveryApplication, "attempt">;
  autonomousWorkflow: Pick<AutonomousImplementationWorkflowApplication, "execute">;
  epicState: Pick<EpicStateSynchronizationApplication, "syncLinkedForFeature">;
  failureBriefPresenter: Pick<WorkflowFailureBriefPresenter, "create">;
  featureState: FeatureStateFolderTransition;
  inProgressStateLabel: string;
  interactiveHandoff: Pick<InteractiveImplementationHandoffApplication, "execute">;
  metadataStore: CardMetadataStore;
  routeResolver: Pick<RoutingActionResolver, "resolvePlan">;
  notifyChanged(projectId: string, eventType: string, externalId: string): void;
  phaseGateRecovery: Pick<PhaseGateRecoveryApplication, "reconcileRecordedGherkin" | "recoverPersistedWorkerEvidence">;
  phaseReviewHandoff: Pick<PhaseReviewHandoffApplication, "handoff">;
  phaseStateReconciliation: Pick<PhaseStateReconciliationApplication, "reconcile">;
  phaseTaskCursor: Pick<PhaseTaskCursorResolver, "resolve">;
  runCoordinator: Pick<FeatureWorkflowRunCoordinator, "createFeatureRunner" | "recordFeatureProgress">;
  startFeaturePostProcess: Pick<StartFeaturePostProcessApplication, "execute">;
  startTransitionState: Pick<StartTransitionStateRecorder, "record">;
  targets: Pick<FeatureWorkflowTargetResolver, "findCurrentFeature">;
  workItems: Pick<WorkItemQueryApplication, "scan">;
}

export function createImplementationRunApplications(dependencies: ImplementationRunApplicationsDependencies) {
  let autonomousContinuationScheduler: AutonomousContinuationScheduler;

  const startImplementationRunApplication = new StartImplementationRunApplication({
    assertRunActive: throwIfWorkflowCancelled,
    attemptRecovery: (input) => dependencies.autoRecovery.attempt(input),
    captureDurableProgress: (feature) => capturePhaseDurableProgressFingerprint(feature.folderPath),
    clearCancellation: clearWorkflowCancellation,
    completeTransition: async (input, branch, moved, startedAt) => {
      const completedAt = new Date().toISOString();
      const metadata = createBranchPreparationMetadata(
        planBranchWorktree(
          input.deliveryPolicy as FeatDeliveryPolicy,
          branch.branchName ?? input.branchName,
          input.repoRoot,
          input.baseBranch,
          false,
        ),
        input.repoRoot,
        input.startCommit,
        moved ? "created" : "skipped_direct_merge",
        null,
        branch.branchName,
      );
      await dependencies.metadataStore.recordFeatureWorkflowCompletion({
        cardKey: input.cardKey,
        command: "start-implementing",
        projectId: input.project.id,
        runId: input.runId,
        summary: `Start transition completed: ${input.deliveryPolicy} on ${input.baseBranch}. ${metadata.message}`,
      });
      if (dependencies.metadataStore.enabled) {
        await dependencies.metadataStore.recordStartTransition({
          cardKey: input.cardKey,
          projectId: input.project.id,
          runId: input.runId,
          deliveryPolicy: input.deliveryPolicy,
          baseBranch: input.baseBranch,
          implementationBranch: branch.branchName,
          worktreePath: null,
          repoRoot: input.repoRoot,
          startCommit: input.startCommit,
          transitionStatus: "transition_completed",
          transitionStep: "record_completion",
          failureReason: null,
          rolledBack: false,
          startedAt,
          completedAt,
        }).catch((error: unknown) => console.error(
          `Start-transition completion state recording failed for ${input.feature.externalId}.`,
          error instanceof Error ? error.message : error,
        ));
      }
      dependencies.notifyChanged(input.project.id, "workflow.completed", input.feature.externalId);
    },
    createFailureBrief: (input, feature, errorMessage) => dependencies.failureBriefPresenter.create({
      command: "start-implementing",
      currentStep: feature.featureWorkflow?.lastRun?.currentStep ?? null,
      feature,
      rawError: errorMessage,
      runId: input.runId,
    }),
    createRunner: (input, getFeature) => dependencies.runCoordinator.createFeatureRunner({
      cardKey: input.cardKey,
      command: "start-implementing",
      getFeature,
      project: input.project,
      runId: input.runId,
    }),
    findCurrentFeature: (input, fallback) =>
      dependencies.targets.findCurrentFeature(input.project, input.feature.externalId, fallback),
    isBlockedFailure: isReviewContractPredecessorRequiredFailure,
    isCancelled: isWorkflowCancelledError,
    metadataEnabled: () => dependencies.metadataStore.enabled,
    metadataStore: dependencies.metadataStore,
    moveToInProgress: async (input) => {
      const movedPath = dependencies.featureState.moveToInProgress(input.project, input.feature);
      let movedFeature = input.feature;
      if (movedPath) {
        const items = await dependencies.workItems.scan(input.project);
        movedFeature = items.find((candidate) =>
          candidate.kind === "feature" && candidate.externalId === input.feature.externalId
        ) ?? {
          ...input.feature,
          folderPath: movedPath,
          stateFolder: "03_IN_PROGRESS",
          stateLabel: dependencies.inProgressStateLabel,
        };
      }
      dependencies.notifyChanged(input.project.id, "workflow.moved", input.feature.externalId);
      return { feature: movedFeature, moved: Boolean(movedPath) };
    },
    notifyChanged: dependencies.notifyChanged,
    now: () => new Date().toISOString(),
    postProcess: (input, feature, branch) => dependencies.startFeaturePostProcess.execute({
      agentAction: "start-feature",
      autonomous: input.autonomous,
      branchMessage: branch.message,
      branchName: branch.branchName ?? input.branchName,
      cardKey: input.cardKey,
      command: "start-implementing",
      feature,
      forcedRecoveryPhaseNumber: input.forcedRecoveryPhaseNumber,
      previousFailureBrief: input.previousFailureBrief,
      project: input.project,
      recoveryAttempt: 0,
      runId: input.runId,
    }, dependencies.routeResolver.resolvePlan("start-feature")),
    prepareBranches: (input) => prepareFeatureBranches({
      branchName: input.branchName,
      memoryBankPath: input.project.memoryBankPath,
      projectRoot: input.project.rootPath,
    }),
    recordPrerequisite: (input, startedAt) => {
      void dependencies.startTransitionState.record({
        cardKey: input.cardKey,
        projectId: input.project.id,
        runId: input.runId,
        deliveryPolicy: input.deliveryPolicy,
        baseBranch: input.baseBranch,
        repoRoot: input.repoRoot,
        startCommit: input.startCommit,
        startedAt,
      });
    },
    rollback: async (input, feature) => {
      try {
        const current = await dependencies.targets.findCurrentFeature(
          input.project,
          input.feature.externalId,
          feature,
        );
        dependencies.featureState.moveBackToReady(input.project, current);
        await dependencies.epicState.syncLinkedForFeature(input.project, current);
        dependencies.notifyChanged(input.project.id, "workflow.rolled-back", input.feature.externalId);
      } catch (error) {
        console.error(
          `Failed to roll back ${input.feature.externalId} to Ready To Develop after start failure:`,
          error instanceof Error ? error.message : error,
        );
        throw error;
      }
    },
    runImplementation: (input, feature, branch) => dependencies.autonomousWorkflow.execute({
      agentAction: "start-feature",
      autonomous: input.autonomous,
      branchMessage: branch.message,
      branchName: branch.branchName ?? input.branchName,
      cardKey: input.cardKey,
      command: "start-implementing",
      feature,
      forcedRecoveryPhaseNumber: input.forcedRecoveryPhaseNumber,
      previousFailureBrief: input.previousFailureBrief,
      project: input.project,
      recoveryAttempt: 0,
      runId: input.runId,
    }),
    scheduleContinuation: (input, feature, branch, durableFingerprintBeforeRun) => autonomousContinuationScheduler.schedule({
      autonomous: input.autonomous,
      branchMessage: branch.message,
      branchName: branch.branchName ?? input.branchName,
      cardKey: input.cardKey,
      command: "start-implementing",
      durableFingerprintBeforeRun,
      feature,
      previousFailureBrief: null,
      project: input.project,
      runId: input.runId,
    }),
    summarizeOutput: summarizeWorkflowOutput,
    syncLinkedEpic: (input, feature) => dependencies.epicState.syncLinkedForFeature(input.project, feature),
  });

  const continueImplementationRunApplication = new ContinueImplementationRunApplication({
    assertRunActive: throwIfWorkflowCancelled,
    attemptRecovery: (input) => dependencies.autoRecovery.attempt(input),
    captureDurableProgress: (feature) => capturePhaseDurableProgressFingerprint(feature.folderPath),
    classifyBlocked: (errorMessage) =>
      errorMessage.includes("WORKFLOW_AWAITING_USER_DECISION")
      || isReviewContractPredecessorRequiredFailure(errorMessage)
      || isFixerResponseRepairCapFailure(errorMessage)
      || isAuthoritativeV1ReviewFailure(errorMessage),
    clearCancellation: clearWorkflowCancellation,
    createFailureBrief: (input) => dependencies.failureBriefPresenter.create(input),
    createRunner: (input, getFeature) => dependencies.runCoordinator.createFeatureRunner({
      cardKey: input.cardKey,
      command: input.command,
      getFeature,
      project: input.project,
      runId: input.runId,
    }),
    findCurrentFeature: (input, fallback) =>
      dependencies.targets.findCurrentFeature(input.project, input.feature.externalId, fallback),
    isCancelled: isWorkflowCancelledError,
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
    reconcile: (input, feature) => dependencies.phaseStateReconciliation.reconcile(input, feature),
    reconcileRecordedGherkin: (input, feature) =>
      dependencies.phaseGateRecovery.reconcileRecordedGherkin(input.project, feature),
    recoverPersistedWorkerEvidence: (input, feature) =>
      dependencies.phaseGateRecovery.recoverPersistedWorkerEvidence(input.project, feature),
    recordProgress: (input, feature, resolution) => dependencies.runCoordinator.recordFeatureProgress({
      cardKey: input.cardKey,
      command: input.command,
      currentStep: resolution.currentStep,
      feature,
      project: input.project,
      runId: input.runId,
      summary: resolution.summary,
    }),
    resolveTask: (input, feature) => dependencies.phaseTaskCursor.resolve({
      cardKey: input.cardKey,
      feature,
      forcedRecoveryPhaseNumber: input.forcedRecoveryPhaseNumber,
      project: input.project,
      runId: input.runId,
    }),
    reviewHandoff: (input, feature) => dependencies.phaseReviewHandoff.handoff(input.project, feature),
    runAutonomous: (input) => dependencies.autonomousWorkflow.execute(input),
    runInteractive: (input) => dependencies.interactiveHandoff.execute(input),
    scheduleContinuation: (input) => autonomousContinuationScheduler.schedule(input),
    summarizeOutput: summarizeWorkflowOutput,
  });

  autonomousContinuationScheduler = new AutonomousContinuationScheduler({
    captureDurableProgress: (feature) => capturePhaseDurableProgressFingerprint(feature.folderPath),
    createId: randomUUID,
    execute: (input) => continueImplementationRunApplication.execute({ ...input, agentAction: "continue-implementing" }),
    hasRemainingWork: (feature) => !areAllImplementationPhasesResolved(feature),
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
  });

  return {
    autonomousContinuationScheduler,
    continueImplementationRunApplication,
    startImplementationRunApplication,
  };
}
