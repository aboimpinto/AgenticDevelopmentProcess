import type { CardMetadataStore } from "@hepha/db";
import { existsSync, readFileSync } from "node:fs";
import { FeatureWorkflowRunCoordinator } from "../application/features/feature-workflow-run-coordinator.js";
import { FeatureWorkflowTargetResolver } from "../application/features/feature-workflow-target-resolver.js";
import { CodeReviewFailureContextRepository } from "../workflows/reviews/code-review-failure-context-repository.js";
import { PhaseCompletionEvidenceReader, extractPhaseBlockerSummary } from "../workflows/phases/phase-completion-evidence-reader.js";
import { PhaseStatusDocumentRepository } from "../workflows/phases/phase-status-document-repository.js";
import { PhaseEntryPreparationApplication } from "../workflows/phases/phase-entry-preparation-application.js";
import { PhaseWorkerEntryApplication } from "../workflows/phases/phase-worker-entry-application.js";
import { PhaseReviewHandoffApplication } from "../workflows/phases/phase-review-handoff-application.js";
import { PhaseStateReconciliationApplication } from "../workflows/phases/phase-state-reconciliation-application.js";
import { PhaseWorkerContinuationApplication } from "../workflows/phases/phase-worker-continuation-application.js";
import { ProtectedPhaseWorkerApplication } from "../workflows/phases/protected-phase-worker-application.js";
import { WorkflowMachineStateRepository } from "../workflows/recovery/workflow-machine-state-repository.js";
import { getActivePhaseContractTask, isPhaseContractReadyForIndependentReview } from "../workflows/phases/phase-contract-task-projection.js";
import { getMissingPhaseQualityGates, getObservedPhaseChangedFiles } from "../workflows/phases/phase-quality-evidence-policy.js";
import { getNumberedPhases, isImplementationPhaseResolved, isPhaseAwaitingReview, normalizeImplementationPhaseStatus } from "../workflows/phases/phase-lifecycle-policy.js";
import { readPhaseTaskLedgerItems } from "../workflows/phases/phase-task-document-repository.js";
import { isPhaseGitCheckpointSatisfied } from "../phase-git-checkpoint.js";
import { phaseRequiresCodeReview, phaseRequiresGitCheckpoint } from "../phase-execution-contract.js";
import { requiresAutonomousCodeReview } from "../autonomous-code-review-policy.js";
import { reconcilePhaseStateOnDisk } from "../phase-state-reconciliation-adapter.js";
import { captureTestCoverageSnapshot, enforceTestCoveragePreservation } from "../test-coverage-preservation-adapter.js";
import type { createPhaseFoundationApplications } from "./phase-foundation-applications.js";

type PhaseFoundation = ReturnType<typeof createPhaseFoundationApplications>;
type EntryDependencies = ConstructorParameters<typeof PhaseEntryPreparationApplication>[0];
type WorkerEntryDependencies = ConstructorParameters<typeof PhaseWorkerEntryApplication>[0];

export interface PhaseEntryApplicationsDependencies {
  absoluteSafetyCap: number;
  completionEvidence: PhaseCompletionEvidenceReader;
  failureContexts: CodeReviewFailureContextRepository;
  foundation: Pick<PhaseFoundation,
    | "featurePlanningArtifactPolicy"
    | "phaseExecutionContractApplication"
    | "phaseExecutionOrderPolicy"
    | "phaseTaskExecutionApplication"
    | "recordImplementationPhaseProgress"
  >;
  metadataStore: CardMetadataStore;
  prepareTemplate: EntryDependencies["prepareTemplate"];
  runCoordinator: FeatureWorkflowRunCoordinator;
  runDeclaredVerification: WorkerEntryDependencies["executeVerification"];
  statusDocuments: PhaseStatusDocumentRepository;
  targets: FeatureWorkflowTargetResolver;
  workflowMachineState: WorkflowMachineStateRepository;
}

/** Composes phase entry, reconciliation, handoff, continuation, and worker protection. */
export function createPhaseEntryApplications(dependencies: PhaseEntryApplicationsDependencies) {
  const {
    featurePlanningArtifactPolicy,
    phaseExecutionContractApplication,
    phaseExecutionOrderPolicy,
    phaseTaskExecutionApplication,
    recordImplementationPhaseProgress,
  } = dependencies.foundation;

  const resolvePhase = (feature: Parameters<typeof getNumberedPhases>[0], phaseNumber: number, fallback: ReturnType<typeof getNumberedPhases>[number]) =>
    getNumberedPhases(feature).find((candidate) => candidate.number === phaseNumber) ?? fallback;
  const isReviewRequired = (...[project, feature, phase]: Parameters<ConstructorParameters<typeof PhaseReviewHandoffApplication>[0]["isReviewRequired"]>) => {
    const contract = phaseExecutionContractApplication.get(feature, phase);
    const changedFiles = getObservedPhaseChangedFiles(project, feature, phase.number);
    return contract
      ? phaseRequiresCodeReview(contract, changedFiles.length > 0)
      : requiresAutonomousCodeReview({ changedFiles });
  };

  const phaseEntryPreparationApplication = new PhaseEntryPreparationApplication({
    getContract: (feature, phase) => phaseExecutionContractApplication.get(feature, phase),
    getMissingGates: getMissingPhaseQualityGates,
    isGitCheckpointSatisfied: isPhaseGitCheckpointSatisfied,
    isPlanningArtifactMissing: (feature, phase) => featurePlanningArtifactPolicy.isMissing(feature, phase),
    isResolved: isImplementationPhaseResolved,
    normalizeStatus: normalizeImplementationPhaseStatus,
    prepareTemplate: dependencies.prepareTemplate,
    refreshFeature: (project, externalId, fallback) => dependencies.targets.findCurrentFeature(project, externalId, fallback),
    requiresGitCheckpoint: phaseRequiresGitCheckpoint,
    resolvePhase,
  });
  const phaseWorkerEntryApplication = new PhaseWorkerEntryApplication({
    beginTask: (input) => phaseTaskExecutionApplication.begin(input),
    executeVerification: dependencies.runDeclaredVerification,
    getActiveContractTask: getActivePhaseContractTask,
    recordProgress: recordImplementationPhaseProgress,
  });
  const phaseReviewHandoffApplication = new PhaseReviewHandoffApplication({
    findLatestReviewResult: (feature, phase) => dependencies.failureContexts.findLatest(feature.folderPath, phase.number)?.result ?? null,
    getMissingGates: getMissingPhaseQualityGates,
    isAwaitingReview: isPhaseAwaitingReview,
    isReadyForReview: (feature, phase) => isPhaseContractReadyForIndependentReview(
      phase,
      phaseExecutionContractApplication.get(feature, phase),
      (phase) => dependencies.statusDocuments.hasCheckedTaskLedger(phase),
    ),
    isReviewRequired,
    markAwaitingReview: (feature, phase) => dependencies.statusDocuments.markAwaitingReview(feature.folderPath, phase),
    orderPhases: (feature) => phaseExecutionOrderPolicy.order(feature),
    refreshFeature: (project, externalId, fallback) => dependencies.targets.findCurrentFeature(project, externalId, fallback),
  });
  const phaseStateReconciliationApplication = new PhaseStateReconciliationApplication({
    isReviewRequired,
    orderPhases: (feature) => phaseExecutionOrderPolicy.order(feature),
    readTasks: readPhaseTaskLedgerItems,
    reconcileOnDisk: reconcilePhaseStateOnDisk,
    refreshFeature: (project, externalId, fallback) => dependencies.targets.findCurrentFeature(project, externalId, fallback),
    store: dependencies.metadataStore,
  });
  const phaseWorkerContinuationApplication = new PhaseWorkerContinuationApplication({
    absoluteSafetyCap: dependencies.absoluteSafetyCap,
    readBlocker: (phase) => existsSync(phase.documentPath)
      ? extractPhaseBlockerSummary(readFileSync(phase.documentPath, "utf8"))
      : null,
    readTasks: readPhaseTaskLedgerItems,
    reconcile: (input, feature) => phaseStateReconciliationApplication.reconcile(input, feature),
    recordProgress: recordImplementationPhaseProgress,
    resolvePhase,
    summarizeEvidence: (phase) => dependencies.completionEvidence.summarize(phase),
  });
  const protectedPhaseWorkerApplication = new ProtectedPhaseWorkerApplication({
    captureCoverage: captureTestCoverageSnapshot,
    captureMachineState: (feature, phase) => dependencies.workflowMachineState.capturePhaseWorker(feature, phase),
    enforceCoverage: enforceTestCoveragePreservation,
    recordWorkflowProgress: (input) => dependencies.runCoordinator.recordFeatureProgress(input),
    restoreMachineState: (snapshot) => dependencies.workflowMachineState.restorePhaseWorker(snapshot),
  });

  return {
    phaseEntryPreparationApplication,
    phaseReviewHandoffApplication,
    phaseStateReconciliationApplication,
    phaseWorkerContinuationApplication,
    phaseWorkerEntryApplication,
    protectedPhaseWorkerApplication,
  };
}
