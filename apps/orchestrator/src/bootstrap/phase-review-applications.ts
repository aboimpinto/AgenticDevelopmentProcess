import type { CardMetadataStore } from "@hepha/db";
import { randomUUID } from "node:crypto";
import { detectProjectStack } from "../projects/project-summary.js";
import { FeatureWorkflowTargetResolver } from "../application/features/feature-workflow-target-resolver.js";
import { FocusedGitCommitAdapter } from "../infrastructure/git/focused-git-commit-adapter.js";
import { PhaseStatusDocumentRepository } from "../workflows/phases/phase-status-document-repository.js";
import { CodeReviewFailureContextRepository } from "../workflows/reviews/code-review-failure-context-repository.js";
import { CodeReviewReportWriter } from "../workflows/reviews/code-review-report-writer.js";
import { PreviousCodeReviewFollowUpPresenter } from "../workflows/reviews/previous-code-review-follow-up-presenter.js";
import { PhaseReviewContractRepairApplication } from "../workflows/reviews/phase-review-contract-repair-application.js";
import { PhaseReviewPublicationApplication } from "../workflows/reviews/phase-review-publication-application.js";
import { PhaseReviewExecutionApplication } from "../workflows/reviews/phase-review-execution-application.js";
import { PhaseReviewLifecycleApplication } from "../workflows/reviews/phase-review-lifecycle-application.js";
import { PhaseReviewDispatchApplication } from "../workflows/reviews/phase-review-dispatch-application.js";
import { PhaseReviewStateApplication } from "../workflows/reviews/phase-review-state-application.js";
import { PhaseReviewGateHandoffApplication } from "../workflows/reviews/phase-review-gate-handoff-application.js";
import { PhaseReviewRequirementApplication } from "../workflows/reviews/phase-review-requirement-application.js";
import { PhaseExecutionPlanningApplication } from "../workflows/phases/phase-execution-planning-application.js";
import { getNextUnresolvedPhaseContractTask, isPhaseContractReadyForIndependentReview } from "../workflows/phases/phase-contract-task-projection.js";
import { getMissingPhaseQualityGates, getObservedPhaseChangedFiles } from "../workflows/phases/phase-quality-evidence-policy.js";
import { getNumberedPhases, isImplementationPhaseResolved, isPhaseAwaitingReview } from "../workflows/phases/phase-lifecycle-policy.js";
import { phaseUsesOrderedTaskExecutors } from "../phase-execution-contract.js";
import { planPhaseReviewResume } from "../workflows/phases/phase-review-resume-planner.js";
import { planPhaseReviewRequirement } from "../workflows/phases/phase-review-requirement-planner.js";
import { planPhaseWorkerDispatch } from "../workflows/phases/phase-worker-dispatch-planner.js";
import { selectDeveloperAgentForStack } from "../workflows/phases/developer-agent-selection-policy.js";
import { planPhaseReviewInvocation } from "../workflows/reviews/phase-review-invocation-planner.js";
import { deriveReviewContractFeatureId, enforceSafetyKernelReviewOutput } from "../workflows/reviews/review-output-enforcement.js";
import { extractCodeReviewFindings } from "../workflows/reviews/code-review-finding-parser.js";
import { ingestAndRenderAuthoritativeReview, readAuthoritativeReviewRerunLineageContext, readCurrentAuthoritativeReviewEvidence } from "../authoritative-review-integration.js";
import { persistReviewFindings } from "../continue-implementation-finding-adapter.js";
import { summarizeWorkflowOutput } from "../workflows/workflow-output-summary.js";
import {
  cargoTimeoutSafetyRule,
  cargoValidationLadderRule,
  serializedBuildCommandsSkillRule,
  sharedCodeQualityAssumptionsRule,
  validationEvidenceAccountingRule,
} from "../workflows/phases/phase-worker-prompt-policies.js";
import type { createPhaseFoundationApplications } from "./phase-foundation-applications.js";
import type { createPhaseEntryApplications } from "./phase-entry-applications.js";

type PhaseFoundation = ReturnType<typeof createPhaseFoundationApplications>;
type PhaseEntry = ReturnType<typeof createPhaseEntryApplications>;
type ReviewExecutionDependencies = ConstructorParameters<typeof PhaseReviewExecutionApplication>[0];

export interface PhaseReviewApplicationsDependencies {
  buildReviewContext: ReviewExecutionDependencies["buildContext"];
  failureContexts: CodeReviewFailureContextRepository;
  focusedGit: FocusedGitCommitAdapter;
  foundation: Pick<PhaseFoundation,
    | "phaseCodeClassificationPolicy"
    | "phaseExecutionContractApplication"
    | "phaseTaskExecutionApplication"
    | "recordImplementationPhaseProgress"
  >;
  phaseEntry: Pick<PhaseEntry, "phaseStateReconciliationApplication">;
  metadataStore: CardMetadataStore;
  previousReviewPresenter: PreviousCodeReviewFollowUpPresenter;
  reportWriter: CodeReviewReportWriter;
  runWorker: (input: import("../workflows/phases/implementation-worker-application.js").ImplementationWorkerInput) => Promise<string>;
  runNestedWorker: ReviewExecutionDependencies["runNestedWorker"];
  statusDocuments: PhaseStatusDocumentRepository;
  targets: FeatureWorkflowTargetResolver;
}

/** Composes independent review execution and the review-aware phase planner. */
export function createPhaseReviewApplications(dependencies: PhaseReviewApplicationsDependencies) {
  const {
    phaseCodeClassificationPolicy,
    phaseExecutionContractApplication,
    phaseTaskExecutionApplication,
    recordImplementationPhaseProgress,
  } = dependencies.foundation;
  const resolvePhase = (feature: Parameters<typeof getNumberedPhases>[0], phaseNumber: number, fallback: ReturnType<typeof getNumberedPhases>[number]) =>
    getNumberedPhases(feature).find((candidate) => candidate.number === phaseNumber) ?? fallback;

  const phaseReviewContractRepairApplication = new PhaseReviewContractRepairApplication({
    enforce: enforceSafetyKernelReviewOutput,
    recordProgress: recordImplementationPhaseProgress,
    runWorker: dependencies.runWorker,
  });
  const phaseReviewPublicationApplication = new PhaseReviewPublicationApplication({
    commitReport: (input) => dependencies.focusedGit.commitReviewReport(input),
    extractFindings: (reportMarkdown) => extractCodeReviewFindings(reportMarkdown).map((finding) => ({
      affectedArea: finding.location,
      findingSummary: finding.summary,
      findingText: finding.summary,
      severity: finding.severity ?? null,
    })),
    ingest: ingestAndRenderAuthoritativeReview,
    persistFindings: async ({ feature, findings, phase, project, reportPath, runId }) => {
      await persistReviewFindings(
        dependencies.metadataStore,
        project.id,
        feature.externalId,
        phase.number,
        phase.title,
        runId,
        reportPath,
        null,
        findings,
      );
    },
    recordApprovedEvidence: (phase, reportPath) => dependencies.statusDocuments.recordApprovedReviewEvidence(phase, reportPath),
    recordProgress: recordImplementationPhaseProgress,
    summarize: summarizeWorkflowOutput,
    writeReport: (feature, phase, markdown) => dependencies.reportWriter.write(feature, phase, markdown),
  });
  const phaseReviewExecutionApplication = new PhaseReviewExecutionApplication({
    buildContext: dependencies.buildReviewContext,
    canonicalFeatureId: deriveReviewContractFeatureId,
    policies: {
      cargoTimeoutSafetyRule,
      cargoValidationLadderRule,
      serializedBuildCommandsSkillRule,
      sharedCodeQualityAssumptionsRule,
      validationEvidenceAccountingRule,
    },
    readLineage: readAuthoritativeReviewRerunLineageContext,
    recordProgress: recordImplementationPhaseProgress,
    renderFollowUp: (featureFolderPath, phaseNumber, previousFailureBrief) =>
      dependencies.previousReviewPresenter.render(featureFolderPath, phaseNumber, previousFailureBrief),
    runNestedWorker: dependencies.runNestedWorker,
  });
  const phaseReviewLifecycleApplication = new PhaseReviewLifecycleApplication({
    executeReview: (input) => phaseReviewExecutionApplication.execute(input),
    publishReview: (input) => phaseReviewPublicationApplication.publish(input),
    recordProgress: recordImplementationPhaseProgress,
    repairReview: (input) => phaseReviewContractRepairApplication.repair(input),
  });
  const phaseReviewDispatchApplication = new PhaseReviewDispatchApplication({
    canonicalFeatureId: deriveReviewContractFeatureId,
    completeReviewTask: (input) => phaseTaskExecutionApplication.completeNextCodeReview(input),
    createInvocationId: randomUUID,
    executeReview: (input) => phaseReviewLifecycleApplication.execute(input),
    isOrderedTaskWorkflow: phaseUsesOrderedTaskExecutors,
    planInvocation: planPhaseReviewInvocation,
  });
  const phaseReviewStateApplication = new PhaseReviewStateApplication({
    deriveFeatureId: deriveReviewContractFeatureId,
    findLatestReport: (feature, phaseNumber) => dependencies.failureContexts.findLatest(feature.folderPath, phaseNumber),
    isAwaitingReview: isPhaseAwaitingReview,
    isAwaitingRerun: (phase) => dependencies.statusDocuments.isAwaitingReviewRerun(phase),
    isReadyForIndependentReview: (phase, contract) => isPhaseContractReadyForIndependentReview(
      phase,
      contract,
      (phase) => dependencies.statusDocuments.hasCheckedTaskLedger(phase),
    ),
    isOrderedTaskWorkflow: phaseUsesOrderedTaskExecutors,
    plan: planPhaseReviewResume,
    readCurrentEvidence: readCurrentAuthoritativeReviewEvidence,
    resolveFailureContext: (feature, rawError) => dependencies.failureContexts.resolve(feature, rawError),
  });
  const phaseReviewGateHandoffApplication = new PhaseReviewGateHandoffApplication({
    getMissingGates: getMissingPhaseQualityGates,
    hasCheckedTaskLedger: (phase) => dependencies.statusDocuments.hasCheckedTaskLedger(phase),
    isAwaitingReview: isPhaseAwaitingReview,
    isAwaitingRerun: (phase) => dependencies.statusDocuments.isAwaitingReviewRerun(phase),
    markAwaitingReview: (feature, phase) => dependencies.statusDocuments.markAwaitingReview(feature.folderPath, phase),
    refreshFeature: (project, externalId, fallback) => dependencies.targets.findCurrentFeature(project, externalId, fallback),
    resolvePhase,
  });
  const phaseReviewRequirementApplication = new PhaseReviewRequirementApplication({
    isAwaitingReview: isPhaseAwaitingReview,
    isOrderedTaskWorkflow: phaseUsesOrderedTaskExecutors,
    isResolved: isImplementationPhaseResolved,
    plan: planPhaseReviewRequirement,
    reconcile: (input, feature) => dependencies.phaseEntry.phaseStateReconciliationApplication.reconcile(input, feature),
    resolvePhase,
    skipTask: (input) => phaseTaskExecutionApplication.skip(input),
  });
  const phaseExecutionPlanningApplication = new PhaseExecutionPlanningApplication({
    getChangedFiles: getObservedPhaseChangedFiles,
    getContract: (feature, phase) => phaseExecutionContractApplication.get(feature, phase),
    getNextTask: getNextUnresolvedPhaseContractTask,
    isCodePhase: (phase, contract) => phaseCodeClassificationPolicy.hasCode(phase, contract),
    isOrderedTaskWorkflow: phaseUsesOrderedTaskExecutors,
    planWorker: planPhaseWorkerDispatch,
    prepareReviewRequirement: (input) => phaseReviewRequirementApplication.prepare(input),
    resolveReviewState: (input) => phaseReviewStateApplication.resolve(input),
    selectDeveloperAgent: (project) => selectDeveloperAgentForStack(detectProjectStack(project.rootPath)),
  });

  return {
    phaseExecutionPlanningApplication,
    phaseReviewDispatchApplication,
    phaseReviewGateHandoffApplication,
    phaseReviewStateApplication,
  };
}
