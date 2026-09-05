import type { CardMetadataStore } from "@hepha/db";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { FeatureWorkflowRunCoordinator } from "../application/features/feature-workflow-run-coordinator.js";
import { FeatureWorkflowTargetResolver } from "../application/features/feature-workflow-target-resolver.js";
import { readDocumentSnippet } from "../application/context/feature-workflow-context-collector.js";
import { deriveReviewContractFeatureId } from "../workflows/reviews/review-output-enforcement.js";
import { formatPhaseReference, getHumanReviewFindingsPhase, getNumberedPhases, isImplementationPhaseRecoveryComplete, isImplementationPhaseResolved } from "../workflows/phases/phase-lifecycle-policy.js";
import { getFirstMissingPhaseQualityGate, getMissingPhaseQualityGates } from "../workflows/phases/phase-quality-evidence-policy.js";
import { appendPhaseExecutionAudit } from "../workflows/phases/phase-execution-audit.js";
import { PhaseProgressRecorder, type PhaseProgressInput } from "../workflows/phases/phase-progress-recorder.js";
import { PhaseTaskExecutionApplication } from "../workflows/phases/phase-task-execution-application.js";
import { PhaseExecutionContractApplication } from "../workflows/phases/phase-execution-contract-application.js";
import { PhaseCheckpointProjectionRepository } from "../workflows/phases/phase-checkpoint-projection-repository.js";
import { PhaseExecutionOrderPolicy } from "../workflows/phases/phase-execution-order-policy.js";
import { PhaseCompletionAuthorizationApplication } from "../workflows/phases/phase-completion-authorization-application.js";
import { FeaturePlanningArtifactPolicy } from "../workflows/phases/feature-planning-artifact-policy.js";
import { PhaseCodeClassificationPolicy } from "../workflows/phases/phase-code-classification-policy.js";
import { PhaseTaskCursorResolver } from "../workflows/phases/phase-task-cursor-resolver.js";
import { PhaseGateRecoveryApplication } from "../workflows/phases/phase-gate-recovery-application.js";
import { PhaseGateEvidenceApplication } from "../workflows/phases/phase-gate-evidence-application.js";
import { PhaseSameRunRepairApplication } from "../workflows/phases/phase-same-run-repair-application.js";
import { PhasePostWorkerValidationApplication } from "../workflows/phases/phase-post-worker-validation-application.js";
import { PhaseWorkerTaskSettlementApplication } from "../workflows/phases/phase-worker-task-settlement-application.js";
import { PhaseStatusDocumentRepository } from "../workflows/phases/phase-status-document-repository.js";
import { PhaseWorkerSessionEvidenceReader } from "../workflows/phases/phase-worker-session-evidence-reader.js";
import { featurePlanningArtifactFileName } from "../workflows/phases/phase-worker-prompt-policies.js";
import { isPhaseGitCheckpointSatisfied } from "../phase-git-checkpoint.js";
import { loadPhaseExecutionContract, orderPhasesByExecutionContract, toOrderedPhaseTasks } from "../phase-execution-contract.js";
import { applyPhaseGateEvidenceHandoff, assertPhaseGateEvidencePassed, parsePhaseGateEvidenceHandoff } from "../phase-gate-evidence-handoff.js";
import { evaluatePhaseRepairLoop } from "../phase-worker-result-policy.js";
import { assertPhaseTemplateDispatchAllowed } from "../phase-template-dispatch-gate.js";
import { selectOrderedTaskTransition } from "../ordered-phase-task-policy.js";
import { summarizeWorkflowOutput } from "../workflows/workflow-output-summary.js";

export interface PhaseFoundationDependencies {
  assertRunActive: (runId: string) => void;
  metadataStore: CardMetadataStore;
  runCoordinator: FeatureWorkflowRunCoordinator;
  sessionEvidence: PhaseWorkerSessionEvidenceReader;
  statusDocuments: PhaseStatusDocumentRepository;
  targets: FeatureWorkflowTargetResolver;
}

/** Composes the durable phase state, evidence, and task applications. */
export function createPhaseFoundationApplications(dependencies: PhaseFoundationDependencies) {
  const phaseProgressRecorder = new PhaseProgressRecorder({
    appendAudit: appendPhaseExecutionAudit,
    assertRunActive: dependencies.assertRunActive,
    recordPhaseRun: (input) => dependencies.metadataStore.recordImplementationPhaseRun(input),
    recordWorkflowProgress: (input) => dependencies.runCoordinator.recordFeatureProgress(input),
  });
  const recordImplementationPhaseProgress = (input: PhaseProgressInput) => phaseProgressRecorder.record(input);
  const phaseTaskExecutionApplication = new PhaseTaskExecutionApplication({
    recordWorkflowProgress: (input) => dependencies.runCoordinator.recordFeatureProgress(input),
    store: dependencies.metadataStore,
  });
  const phaseExecutionContractApplication = new PhaseExecutionContractApplication({
    getNumberedPhases,
    isGitCheckpointSatisfied: isPhaseGitCheckpointSatisfied,
  });
  const phaseCheckpointProjectionRepository = new PhaseCheckpointProjectionRepository();
  const phaseExecutionOrderPolicy = new PhaseExecutionOrderPolicy({
    getNumberedPhases,
    loadContract: loadPhaseExecutionContract,
    orderByContract: orderPhasesByExecutionContract,
  });
  const phaseCompletionAuthorizationApplication = new PhaseCompletionAuthorizationApplication({
    deriveFeatureId: deriveReviewContractFeatureId,
    formatPhase: formatPhaseReference,
    hasCheckedTaskLedger: (phase) => dependencies.statusDocuments.hasCheckedTaskLedger(phase),
    markCompleted: (featureFolderPath, phase) => dependencies.statusDocuments.markCompleted(featureFolderPath, phase),
  });
  const featurePlanningArtifactPolicy = new FeaturePlanningArtifactPolicy({
    artifactFileName: featurePlanningArtifactFileName,
    exists: existsSync,
    getContractPhase: (feature, phase) => phaseExecutionContractApplication.get(feature, phase),
    readSnippet: readDocumentSnippet,
  });
  const phaseCodeClassificationPolicy = new PhaseCodeClassificationPolicy({
    exists: existsSync,
    read: (path) => readFileSync(path, "utf8"),
  });
  const phaseTaskCursorResolver = new PhaseTaskCursorResolver({
    findFirstMissingQualityGate: getFirstMissingPhaseQualityGate,
    findHumanReviewPhase: getHumanReviewFindingsPhase,
    isAwaitingCodeReviewRerun: (phase) => dependencies.statusDocuments.isAwaitingReviewRerun(phase),
    isPhaseResolved: isImplementationPhaseResolved,
    isPlanningArtifactMissing: (feature, phase) => featurePlanningArtifactPolicy.isMissing(feature, phase),
    listTaskRuns: (projectId, cardKey, phaseNumber) => dependencies.metadataStore.listImplementationTaskRuns(projectId, cardKey, phaseNumber),
    orderPhases: (feature) => phaseExecutionOrderPolicy.order(feature),
    planningArtifactFileName: featurePlanningArtifactFileName,
    reconcileCheckedTasks: (input, items) => phaseTaskExecutionApplication.reconcile(input, items),
  });
  const phaseGateRecoveryApplication = new PhaseGateRecoveryApplication({
    findSessionEvidence: (feature, phase) => dependencies.sessionEvidence.find(feature, phase),
    getMissingGates: getMissingPhaseQualityGates,
    hasCheckedTaskLedger: (phase) => dependencies.statusDocuments.hasCheckedTaskLedger(phase),
    orderPhases: (feature) => phaseExecutionOrderPolicy.order(feature),
    refreshFeature: (project, externalId, fallback) => dependencies.targets.findCurrentFeature(project, externalId, fallback),
  });
  const phaseGateEvidenceApplication = new PhaseGateEvidenceApplication({
    apply: applyPhaseGateEvidenceHandoff,
    assertPassed: assertPhaseGateEvidencePassed,
    exists: existsSync,
    parse: parsePhaseGateEvidenceHandoff,
    read: (path) => readFileSync(path, "utf8"),
    write: (path, markdown) => writeFileSync(path, markdown, "utf8"),
  });
  const phaseSameRunRepairApplication = new PhaseSameRunRepairApplication({
    evaluate: evaluatePhaseRepairLoop,
    recordProgress: recordImplementationPhaseProgress,
    recordTaskFailure: (input) => phaseTaskExecutionApplication.recordFailure(input),
  });
  const phasePostWorkerValidationApplication = new PhasePostWorkerValidationApplication({
    assertPlanningArtifact: (feature) => featurePlanningArtifactPolicy.assertPresent(feature),
    assertTemplate: assertPhaseTemplateDispatchAllowed,
    isRecoveryComplete: isImplementationPhaseRecoveryComplete,
    recordProgress: recordImplementationPhaseProgress,
  });
  const phaseWorkerTaskSettlementApplication = new PhaseWorkerTaskSettlementApplication({
    completeTask: (input) => phaseTaskExecutionApplication.complete(input),
    refreshFeature: (project, externalId, fallback) => dependencies.targets.findCurrentFeature(project, externalId, fallback),
    skipTask: (input) => phaseTaskExecutionApplication.skipActive(input),
    resolvePhase: (feature, phaseNumber, fallback) => getNumberedPhases(feature)
      .find((candidate) => candidate.number === phaseNumber) ?? fallback,
    selectTransition: selectOrderedTaskTransition,
    summarize: summarizeWorkflowOutput,
    toOrderedTasks: toOrderedPhaseTasks,
  });

  return {
    featurePlanningArtifactPolicy,
    phaseCheckpointProjectionRepository,
    phaseCodeClassificationPolicy,
    phaseCompletionAuthorizationApplication,
    phaseExecutionContractApplication,
    phaseExecutionOrderPolicy,
    phaseGateEvidenceApplication,
    phaseGateRecoveryApplication,
    phasePostWorkerValidationApplication,
    phaseSameRunRepairApplication,
    phaseTaskCursorResolver,
    phaseTaskExecutionApplication,
    phaseWorkerTaskSettlementApplication,
    recordImplementationPhaseProgress,
  };
}
