import type { CardMetadataStore } from "@hepha/db";
import { seedRefinedManualTestSkips } from "../workflows/recipes/compatibility-manual-test-deferral-application.js";
import { randomUUID } from "node:crypto";
import { ContinueImplementationApplication } from "../application/features/continue-implementation-application.js";
import { StartImplementationApplication } from "../application/features/start-implementation-application.js";
import { createWorkItemCardKey } from "../application/work-items/work-item-card-key-policy.js";
import type { WorkItemQueryApplication } from "../application/work-items/work-item-query-application.js";
import type { DeepDiveContinuationRecoveryApplication } from "../application/deep-dive/deep-dive-continuation-recovery-application.js";
import type { FeatureWorkflowTargetResolver } from "../application/features/feature-workflow-target-resolver.js";
import type { PreviousWorkflowFailureBriefResolver } from "../workflows/recovery/previous-workflow-failure-brief-resolver.js";
import type { SafeGitReader } from "../infrastructure/git/safe-git-reader.js";
import { toProjectSummary } from "../projects/project-summary.js";
import { validateRefineArtifacts } from "../refine-artifact-validator.js";
import {
  evaluateContinueImplementing,
  evaluateStartImplementing,
} from "../feat-readiness-evaluator.js";
import {
  classifyStartConflicts,
  classifyStartPrerequisites,
  deriveFeatureBranchName,
  resolveEffectiveDeliveryPolicy,
} from "../start-transition-helpers.js";
import { assertFeatureBranches } from "../feature-git-branch.js";
import {
  appendContextSnapshotToSummary,
  checkContextStaleness,
  formatStalenessFailures,
} from "../workflow-receipt.js";
import { clearWorkflowCancellation } from "../workflow-cancellation.js";
import {
  areAllImplementationPhasesResolved,
  getHumanReviewFindingsPhase,
  getNumberedPhases,
  hasUnresolvedHumanReviewFindingsPhase,
} from "../workflows/phases/phase-lifecycle-policy.js";
import { countMissingPhaseQualityGates } from "../workflows/phases/phase-quality-evidence-policy.js";
import type { PhaseExecutionContractApplication } from "../workflows/phases/phase-execution-contract-application.js";
import { extractWorkflowFailurePhaseNumber } from "../workflows/recovery/implementation-failure-classifier.js";
import type { WorkflowTransitionReceiptPolicy } from "../workflows/receipts/workflow-transition-receipt-policy.js";

type NotifyChanged = ConstructorParameters<typeof StartImplementationApplication>[0]["notifyChanged"];
type StartExecutor = ConstructorParameters<typeof StartImplementationApplication>[0]["execute"];
type ContinueExecutor = ConstructorParameters<typeof ContinueImplementationApplication>[0]["execute"];

export interface ImplementationCommandApplicationsDependencies {
  continueExecution: ContinueExecutor;
  deepDiveRecovery: DeepDiveContinuationRecoveryApplication;
  metadataStore: CardMetadataStore;
  notifyChanged: NotifyChanged;
  phaseContract: PhaseExecutionContractApplication;
  previousFailureResolver: PreviousWorkflowFailureBriefResolver;
  receiptPolicy: WorkflowTransitionReceiptPolicy;
  safeGitReader: SafeGitReader;
  startExecution: StartExecutor;
  targets: FeatureWorkflowTargetResolver;
  workItems: WorkItemQueryApplication;
}

/** Composes Start/Continue command admission, readiness, branch, receipt, and resume policies. */
export function createImplementationCommandApplications(dependencies: ImplementationCommandApplicationsDependencies) {
  const scanProject = (project: Parameters<WorkItemQueryApplication["scan"]>[0]) => dependencies.workItems.scan(project);
  const startImplementationApplication = new StartImplementationApplication({
    appendSnapshot: appendContextSnapshotToSummary,
    classifyConflicts: (hasActiveRun, activeCommand) => classifyStartConflicts(hasActiveRun, activeCommand, false),
    classifyPrerequisites: classifyStartPrerequisites,
    clearCancellation: clearWorkflowCancellation,
    createCardKey: createWorkItemCardKey,
    createId: randomUUID,
    deriveBranchName: deriveFeatureBranchName,
    evaluateReadiness: (feature) => evaluateStartImplementing(
      feature,
      feature.validation,
      dependencies.metadataStore.enabled,
      feature.featureWorkflow?.hasDesignArtifacts ?? false,
      feature.featureWorkflow?.uiRequirementDecision ?? "unknown",
    ),
    execute: dependencies.startExecution,
    findFailurePhase: extractWorkflowFailurePhaseNumber,
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
    readGit: (rootPath, args) => dependencies.safeGitReader.read(rootPath, args),
    receiptPolicy: dependencies.receiptPolicy,
    resolveDeliveryPolicy: () => resolveEffectiveDeliveryPolicy(null).policy,
    resolveImplementation: (input) => dependencies.targets.resolveImplementation(input),
    resolvePreviousFailure: (feature) => dependencies.previousFailureResolver.resolve(feature),
    scanProject,
    seedManualTestSkips: (input) => seedRefinedManualTestSkips({
      ...input,
      store: dependencies.metadataStore,
    }),
    toProjectSummary,
    validateRefinement: (folderPath, projectId, featureId) => validateRefineArtifacts(folderPath, { projectId, featureId }),
  });
  const continueImplementationApplication = new ContinueImplementationApplication({
    allPhasesResolved: areAllImplementationPhasesResolved,
    appendSnapshot: appendContextSnapshotToSummary,
    assertBranches: (project, branchName) => assertFeatureBranches({
      branchName, memoryBankPath: project.memoryBankPath, projectRoot: project.rootPath,
    }),
    clearCancellation: clearWorkflowCancellation,
    countGitCheckpoints: (project, feature, branchName) =>
      dependencies.phaseContract.countMissingGitCheckpoints(project, feature, branchName),
    countQualityGates: countMissingPhaseQualityGates,
    createCardKey: createWorkItemCardKey,
    createId: randomUUID,
    deriveBranchName: deriveFeatureBranchName,
    evaluateReadiness: (feature) => evaluateContinueImplementing(
      feature,
      feature.validation,
      dependencies.metadataStore.enabled,
      feature.featureWorkflow?.hasDesignArtifacts ?? false,
      feature.featureWorkflow?.uiRequirementDecision ?? "unknown",
    ),
    execute: dependencies.continueExecution,
    findCurrentFeature: (project, externalId, fallback) => dependencies.targets.findCurrentFeature(project, externalId, fallback),
    findFailurePhase: extractWorkflowFailurePhaseNumber,
    formatStaleness: formatStalenessFailures,
    hasHumanReviewPhase: (feature) => Boolean(getHumanReviewFindingsPhase(feature)),
    hasNumberedPhases: (feature) => getNumberedPhases(feature).length > 0,
    hasUnresolvedHumanReview: hasUnresolvedHumanReviewFindingsPhase,
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
    readStaleness: checkContextStaleness,
    receiptPolicy: dependencies.receiptPolicy,
    recoverDeepDive: (project, feature) => dependencies.deepDiveRecovery.recover(project, feature),
    resolveImplementation: (input) => dependencies.targets.resolveImplementation(input),
    resolvePreviousFailure: (feature) => dependencies.previousFailureResolver.resolve(feature),
    scanProject,
    toProjectSummary,
  });

  return { continueImplementationApplication, startImplementationApplication };
}
