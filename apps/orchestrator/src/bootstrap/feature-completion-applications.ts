import type { CardMetadataStore } from "@hepha/db";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { FeatureCompletionApplication } from "../application/features/feature-completion-application.js";
import { FeatureCompletionReadinessPolicy } from "../application/features/feature-completion-readiness-policy.js";
import { CompleteFeatureExecutionApplication } from "../application/features/complete-feature-execution-application.js";
import { FeatureHumanReviewApplication } from "../application/features/feature-human-review-application.js";
import { getFeatureLessonsLearnedPath } from "../application/features/feature-lessons-learned-path-policy.js";
import { FeatureWorkflowCancellationApplication } from "../application/features/feature-workflow-cancellation-application.js";
import { formatFeatureWorkflowCommand } from "../application/features/feature-workflow-message-policy.js";
import { FeatureWorkflowTargetResolver } from "../application/features/feature-workflow-target-resolver.js";
import { FeatureWorkflowContextCollector } from "../application/context/feature-workflow-context-collector.js";
import { EpicStateSynchronizationApplication } from "../application/epics/epic-state-synchronization-application.js";
import { createWorkItemCardKey } from "../application/work-items/work-item-card-key-policy.js";
import { WorkItemQueryApplication } from "../application/work-items/work-item-query-application.js";
import { parseDeliverySection } from "../delivery-policy.js";
import {
  formatFeatureEstimationRetrospectiveSafely,
  toHistoricalTimingCandidate,
} from "../estimation-calibration.js";
import { detectCurrentProjectBranch } from "../feature-git-branch.js";
import { normalizeRelativeProjectPath } from "../application/projects/relative-project-path-policy.js";
import { toProjectSummary } from "../projects/project-summary.js";
import type { DetachedCompletionWorkerApplication } from "../workflows/phases/detached-completion-worker-application.js";
import { countMissingPhaseQualityGates } from "../workflows/phases/phase-quality-evidence-policy.js";
import { areAllImplementationPhasesResolved } from "../workflows/phases/phase-lifecycle-policy.js";
import {
  cargoTimeoutSafetyRule,
  cargoValidationLadderRule,
  epicAcceptanceTestsFileName,
  lessonsLearnedExecutionConstraintsRule,
  serializedBuildCommandsSkillRule,
  validationEvidenceAccountingRule,
  windowsShellHygieneRule,
} from "../workflows/phases/phase-worker-prompt-policies.js";
import { buildCompleteFeaturePrompt } from "../workflows/prompts/complete-feature-prompt.js";
import { formatProjectSkillTarget } from "../workflows/prompts/feature-entry-prompts.js";
import type { WorkflowFailureBriefPresenter } from "../workflows/recovery/workflow-failure-brief-presenter.js";
import type { RoutingActionResolver } from "../agent-routing/routing-action-resolver.js";
import { WorkflowTransitionReceiptPolicy } from "../workflows/receipts/workflow-transition-receipt-policy.js";
import type { FeatureWorkflowRunCoordinator } from "../application/features/feature-workflow-run-coordinator.js";

type CancellationDependencies = ConstructorParameters<typeof FeatureWorkflowCancellationApplication>[0];

export interface FeatureCompletionApplicationsDependencies {
  cancelPiProcesses: CancellationDependencies["cancelPiProcesses"];
  contextCollector: FeatureWorkflowContextCollector;
  epicState: EpicStateSynchronizationApplication;
  failureBriefPresenter: Pick<WorkflowFailureBriefPresenter, "create">;
  finalizer: Pick<DetachedCompletionWorkerApplication, "launch">;
  metadataStore: CardMetadataStore;
  routeResolver: RoutingActionResolver;
  notifyChanged: CancellationDependencies["notifyChanged"];
  requestCancellation: CancellationDependencies["requestCancellation"];
  runCoordinator: FeatureWorkflowRunCoordinator;
  targets: FeatureWorkflowTargetResolver;
  workItems: WorkItemQueryApplication;
}

/** Composes cancellation, completion readiness, detached finalization, and human-review completion. */
export function createFeatureCompletionApplications(dependencies: FeatureCompletionApplicationsDependencies) {
  const scanProject = (project: Parameters<WorkItemQueryApplication["scan"]>[0]) => dependencies.workItems.scan(project);
  const featureWorkflowCancellation = new FeatureWorkflowCancellationApplication({
    cancelPiProcesses: dependencies.cancelPiProcesses,
    createCardKey: createWorkItemCardKey,
    formatCommand: formatFeatureWorkflowCommand,
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
    requestCancellation: dependencies.requestCancellation,
    resolveTarget: (input) => dependencies.targets.resolveCancellation(input),
    scanProject,
    syncLinkedEpic: (project, feature) => dependencies.epicState.syncLinkedForFeature(project, feature),
    toProjectSummary,
  });
  const featureCompletionReadiness = new FeatureCompletionReadinessPolicy({
    readDeliveryMode: (feature) => {
      try {
        return parseDeliverySection(readFileSync(resolve(feature.folderPath, "FeatureDescription.md"), "utf8")).deliveryMode;
      } catch {
        return null;
      }
    },
  });
  const workflowTransitionReceiptPolicy = new WorkflowTransitionReceiptPolicy({
    normalizePath: normalizeRelativeProjectPath,
  });
  const completeFeatureExecutionApplication = new CompleteFeatureExecutionApplication({
    buildPrompt: (project, currentFeature, context, runId) => buildCompleteFeaturePrompt(
      project,
      currentFeature,
      context,
      {
        completedFolder: resolve(project.memoryBankPath, "Features", "04_COMPLETED", basename(currentFeature.folderPath)),
        currentBranch: detectCurrentProjectBranch(project.rootPath) ?? "unknown",
        epicAcceptanceTestsFileName,
        estimationRetrospective: formatFeatureEstimationRetrospectiveSafely(toHistoricalTimingCandidate(currentFeature)),
        lessonsLearnedTargetPath: getFeatureLessonsLearnedPath(project, currentFeature),
        projectSkillTarget: formatProjectSkillTarget(project, currentFeature, ""),
        runId,
      },
      {
        cargoTimeoutSafetyRule,
        cargoValidationLadderRule,
        lessonsLearnedExecutionConstraintsRule,
        serializedBuildCommandsSkillRule,
        validationEvidenceAccountingRule,
        windowsShellHygieneRule,
      },
    ),
    collectContext: (project, feature, workItems) => dependencies.contextCollector.collect(project, feature, workItems, {
      includeUiLanguageDocuments: true,
      lessonContext: { agentRole: "complete-feature" },
    }),
    createCardKey: createWorkItemCardKey,
    createId: randomUUID,
    failureBriefPresenter: dependencies.failureBriefPresenter,
    finalizer: dependencies.finalizer,
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
    readiness: featureCompletionReadiness,
    receiptPolicy: workflowTransitionReceiptPolicy,
    requireModel: (_configuredModel, _label) => dependencies.routeResolver.resolvePlan("complete-feature"),
    scanProject,
    targets: dependencies.targets,
    workflowCoordinator: dependencies.runCoordinator,
  });
  const featureCompletionApplication = new FeatureCompletionApplication({
    assertTransitionAllowed: (project, feature) => completeFeatureExecutionApplication.assertTransitionAllowed(project, feature),
    countMissingQualityGates: countMissingPhaseQualityGates,
    findCurrentFeature: (project, externalId, fallback) => dependencies.targets.findCurrentFeature(project, externalId, fallback),
    formatCommand: formatFeatureWorkflowCommand,
    resolveImplementation: (input) => dependencies.targets.resolveImplementation(input),
    scanProject,
    shouldStart: (feature) => featureCompletionReadiness.canStart(feature),
    startFinalization: (project, feature) => completeFeatureExecutionApplication.start(project, feature),
    toProjectSummary,
  });
  const featureHumanReviewApplication = new FeatureHumanReviewApplication({
    allPhasesResolved: areAllImplementationPhasesResolved,
    createCardKey: createWorkItemCardKey,
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
    resolveImplementation: (input) => dependencies.targets.resolveImplementation(input),
    scanProject,
    startCompletion: (project, feature) => completeFeatureExecutionApplication.start(project, feature),
    toProjectSummary,
  });

  return {
    completeFeatureExecutionApplication,
    featureCompletionApplication,
    featureHumanReviewApplication,
    featureWorkflowCancellation,
    workflowTransitionReceiptPolicy,
  };
}
