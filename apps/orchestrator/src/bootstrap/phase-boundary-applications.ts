import type { CardMetadataStore } from "@hepha/db";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { FeatureWorkflowRunCoordinator } from "../application/features/feature-workflow-run-coordinator.js";
import { FeatureWorkflowTargetResolver } from "../application/features/feature-workflow-target-resolver.js";
import { assertFeatureBranches } from "../feature-git-branch.js";
import { attemptPhaseGitCheckpoint, isPhaseGitCheckpointSatisfied } from "../phase-git-checkpoint.js";
import { assessPhaseExitCheckpoint } from "../phase-exit-checkpoint.js";
import {
  assertPhaseTemplateDispatchAllowed,
  isPhaseTemplateInvalidError,
} from "../phase-template-dispatch-gate.js";
import {
  normalizePhaseTemplateMachineFields,
  preparePhaseTemplateRepair,
  verifyPhaseTemplateRepair,
} from "../phase-template-repair-command.js";
import { runFeatureFinalVerification } from "../final-verification-adapter.js";
import { openAuthoritativeReviewStore } from "../authoritative-review-integration.js";
import { selectOrderedPhaseExit } from "../ordered-phase-task-policy.js";
import {
  contractUsesOrderedTaskWorkflow,
  orderPhasesByExecutionContract,
  phaseRequiresGitCheckpoint,
  phaseUsesOrderedTaskExecutors,
} from "../phase-execution-contract.js";
import { yieldToWorkflowControlPlane } from "../workflow-cancellation.js";
import { buildDeclaredVerificationRepairPrompt } from "../workflows/prompts/declared-verification-repair-prompt.js";
import { selectPhaseExecutionQueue } from "../workflows/phases/phase-execution-queue-policy.js";
import { PhaseTemplateDispatchApplication } from "../workflows/phases/phase-template-dispatch-application.js";
import { DeclaredVerificationTaskApplication } from "../workflows/phases/declared-verification-task-application.js";
import { PhaseExitApplication } from "../workflows/phases/phase-exit-application.js";
import { PhaseGitCheckpointApplication } from "../workflows/phases/phase-git-checkpoint-application.js";
import { PhaseExitLifecycleApplication } from "../workflows/phases/phase-exit-lifecycle-application.js";
import { AutonomousPhaseQueueApplication } from "../workflows/phases/autonomous-phase-queue-application.js";
import { PhaseFailureRecordingApplication } from "../workflows/phases/phase-failure-recording-application.js";
import { ImplementationCompletionApplication } from "../workflows/phases/implementation-completion-application.js";
import { getNextUnresolvedPhaseContractTask } from "../workflows/phases/phase-contract-task-projection.js";
import {
  getFirstMissingPhaseQualityGate,
  getMissingPhaseQualityGates,
  getPhaseQualityGates,
} from "../workflows/phases/phase-quality-evidence-policy.js";
import {
  areAllImplementationPhasesResolved,
  getHumanReviewFindingsPhase,
  getNumberedPhases,
  isImplementationPhaseResolved,
} from "../workflows/phases/phase-lifecycle-policy.js";
import {
  extractWorkflowFailurePhaseNumber,
  isCodeReviewBlockedFailure,
  isFixerResponseRepairCapFailure,
  isReviewContractPredecessorRequiredFailure,
} from "../workflows/recovery/implementation-failure-classifier.js";
import { PhaseCompletionEvidenceReader } from "../workflows/phases/phase-completion-evidence-reader.js";
import { PhaseStatusDocumentRepository } from "../workflows/phases/phase-status-document-repository.js";
import type { createPhaseFoundationApplications } from "./phase-foundation-applications.js";

type PhaseFoundation = ReturnType<typeof createPhaseFoundationApplications>;
type DeclaredVerificationDependencies = ConstructorParameters<typeof DeclaredVerificationTaskApplication>[0];

export interface PhaseBoundaryApplicationsDependencies {
  completionEvidence: PhaseCompletionEvidenceReader;
  foundation: Pick<PhaseFoundation,
    | "featurePlanningArtifactPolicy"
    | "phaseCheckpointProjectionRepository"
    | "phaseCompletionAuthorizationApplication"
    | "phaseExecutionContractApplication"
    | "phaseTaskExecutionApplication"
    | "recordImplementationPhaseProgress"
  >;
  metadataStore: CardMetadataStore;
  runCoordinator: FeatureWorkflowRunCoordinator;
  runWorker: DeclaredVerificationDependencies["runRepairWorker"];
  statusDocuments: PhaseStatusDocumentRepository;
  targets: FeatureWorkflowTargetResolver;
}

/** Composes template/verification entry helpers and every phase-exit boundary. */
export function createPhaseBoundaryApplications(dependencies: PhaseBoundaryApplicationsDependencies) {
  const {
    featurePlanningArtifactPolicy,
    phaseCheckpointProjectionRepository,
    phaseCompletionAuthorizationApplication,
    phaseExecutionContractApplication,
    phaseTaskExecutionApplication,
    recordImplementationPhaseProgress,
  } = dependencies.foundation;
  const refreshFeature = (project: Parameters<FeatureWorkflowTargetResolver["findCurrentFeature"]>[0], externalId: string, fallback: Parameters<FeatureWorkflowTargetResolver["findCurrentFeature"]>[2]) =>
    dependencies.targets.findCurrentFeature(project, externalId, fallback);
  const resolvePhase = (feature: Parameters<typeof getNumberedPhases>[0], phaseNumber: number, fallback: ReturnType<typeof getNumberedPhases>[number]) =>
    getNumberedPhases(feature).find((candidate) => candidate.number === phaseNumber) ?? fallback;

  const phaseTemplateDispatchApplication = new PhaseTemplateDispatchApplication({
    assertDispatchAllowed: assertPhaseTemplateDispatchAllowed,
    normalize: normalizePhaseTemplateMachineFields,
    prepareRepair: preparePhaseTemplateRepair,
    recordProgress: recordImplementationPhaseProgress,
    refreshFeature,
    runWorker: dependencies.runWorker,
    verifyRepair: verifyPhaseTemplateRepair,
  });
  const declaredVerificationTaskApplication = new DeclaredVerificationTaskApplication({
    buildRepairPrompt: buildDeclaredVerificationRepairPrompt,
    completeTask: (input) => phaseTaskExecutionApplication.complete(input),
    persistProjection: (phase, verification, reviewArtifactHash) =>
      phaseCheckpointProjectionRepository.persist(phase, verification, reviewArtifactHash),
    recordProgress: recordImplementationPhaseProgress,
    runRepairWorker: dependencies.runWorker,
    runVerification: (input) => runFeatureFinalVerification(input, dependencies.metadataStore),
    yieldControl: yieldToWorkflowControlPlane,
  });
  const phaseExitApplication = new PhaseExitApplication({
    assessCheckpoint: assessPhaseExitCheckpoint,
    getQualityGates: getPhaseQualityGates,
    hasCheckedTaskLedger: (phase) => dependencies.statusDocuments.hasCheckedTaskLedger(phase),
    hasCompletionEvidence: (phase) => dependencies.completionEvidence.has(phase),
    markCompletedAfterReview: (feature, phase, projectId, scope) =>
      phaseCompletionAuthorizationApplication.completeAfterReview(feature, phase, projectId, scope),
    markCompletedFromTasks: (feature, phase) =>
      phaseCompletionAuthorizationApplication.completeFromTasks(feature, phase),
    openReviewStore: openAuthoritativeReviewStore,
    recordProgress: recordImplementationPhaseProgress,
    refreshFeature,
    selectOrderedExit: selectOrderedPhaseExit,
  });
  const phaseGitCheckpointApplication = new PhaseGitCheckpointApplication({
    attempt: attemptPhaseGitCheckpoint,
    recordProgress: recordImplementationPhaseProgress,
  });
  const phaseExitLifecycleApplication = new PhaseExitLifecycleApplication({
    authorize: (input) => phaseExitApplication.authorize(input),
    completeRecoveredReviewTask: (input) => phaseTaskExecutionApplication.completeNextCodeReview(input),
    executeGitCheckpoint: (input) => phaseGitCheckpointApplication.execute(input),
    hasUnresolvedContractTask: (phase, contract) => getNextUnresolvedPhaseContractTask(phase, contract) !== null,
    isGitCheckpointRequired: phaseRequiresGitCheckpoint,
    isOrderedTaskWorkflow: phaseUsesOrderedTaskExecutors,
    recordProgress: recordImplementationPhaseProgress,
    refreshFeature,
    resolvePhase,
  });
  const autonomousPhaseQueueApplication = new AutonomousPhaseQueueApplication({
    assertBranches: assertFeatureBranches,
    contractUsesOrderedTasks: contractUsesOrderedTaskWorkflow,
    extractFailurePhaseNumber: extractWorkflowFailurePhaseNumber,
    firstMissingQualityGatePhaseNumber: (feature) => getFirstMissingPhaseQualityGate(feature)?.phaseNumber ?? null,
    getContractPhase: (feature, phase) => phaseExecutionContractApplication.get(feature, phase),
    getHumanReviewPhase: (feature) => getHumanReviewFindingsPhase(feature) ?? null,
    getMissingQualityGates: getMissingPhaseQualityGates,
    getNumberedPhases,
    isGitCheckpointSatisfied: isPhaseGitCheckpointSatisfied,
    isPlanningArtifactMissing: (feature, phase) => featurePlanningArtifactPolicy.isMissing(feature, phase),
    isResolved: isImplementationPhaseResolved,
    loadContract: (feature) => existsSync(resolve(feature.folderPath, "PhaseExecutionContract.json"))
      ? phaseExecutionContractApplication.require(feature)
      : null,
    orderPhases: orderPhasesByExecutionContract,
    requiresGitCheckpoint: phaseRequiresGitCheckpoint,
    selectQueue: selectPhaseExecutionQueue,
  });
  const phaseFailureRecordingApplication = new PhaseFailureRecordingApplication({
    isTemplateInvalid: isPhaseTemplateInvalidError,
    recordProgress: recordImplementationPhaseProgress,
    recordTaskFailure: (input) => phaseTaskExecutionApplication.recordFailure(input),
    shouldRecord: (errorMessage) => !isCodeReviewBlockedFailure(errorMessage)
      && !isFixerResponseRepairCapFailure(errorMessage)
      && !isReviewContractPredecessorRequiredFailure(errorMessage),
  });
  const implementationCompletionApplication = new ImplementationCompletionApplication({
    allPhasesResolved: areAllImplementationPhasesResolved,
    recordProgress: (input) => dependencies.runCoordinator.recordFeatureProgress(input),
    refreshFeature,
    runFinalVerification: (input) => runFeatureFinalVerification(input, dependencies.metadataStore),
  });

  return {
    autonomousPhaseQueueApplication,
    declaredVerificationTaskApplication,
    implementationCompletionApplication,
    phaseExitLifecycleApplication,
    phaseFailureRecordingApplication,
    phaseTemplateDispatchApplication,
  };
}
