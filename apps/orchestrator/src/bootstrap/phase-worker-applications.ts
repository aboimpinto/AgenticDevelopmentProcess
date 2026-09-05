import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createAuthoritativeReviewSuccessorArtifactId } from "../review-artifact-identity.js";
import {
  assertReviewRemediationSuccessorHandoffBindings,
  bindVerificationReceiptResponseReference,
  parseReviewRemediationSuccessorHandoff,
  resolveReviewRemediationSuccessorIdentityLease,
  type ReviewRemediationSuccessorBindingExpectation,
} from "../review-remediation-successor-handoff.js";
import { projectReviewRemediationLifecycle, type ReviewRemediationFindingIdentity } from "../review-remediation-lifecycle-policy.js";
import { assessReviewRemediationContract } from "../code-review-remediation-contract.js";
import { planConstrainedFixerResponseRepair } from "../review-remediation-repair-plan.js";
import {
  ingestAndRenderAuthoritativeReviewSuccessor,
  readAuthoritativeReviewRerunLineageContext,
} from "../authoritative-review-integration.js";
import { buildFixerResponseRepairPrompt } from "../workflows/prompts/fixer-response-repair-prompt.js";
import { buildPhaseImplementationPrompt } from "../workflows/prompts/phase-implementation-prompt.js";
import {
  codeReviewFindingLedgerRule,
  epicAcceptanceTestsFileName,
  featurePlanningArtifactFileName,
  lessonsLearnedExecutionConstraintsRule,
  phaseTaskLedgerRule,
  cargoTimeoutSafetyRule,
  cargoValidationLadderRule,
  serializedBuildCommandsSkillRule,
  sharedCodeQualityAssumptionsRule,
  validationEvidenceAccountingRule,
  windowsShellHygieneRule,
} from "../workflows/phases/phase-worker-prompt-policies.js";
import { getNextUnresolvedPhaseContractTask } from "../workflows/phases/phase-contract-task-projection.js";
import { getObservedPhaseChangedFiles } from "../workflows/phases/phase-quality-evidence-policy.js";
import { getNumberedPhases } from "../workflows/phases/phase-lifecycle-policy.js";
import { phaseUsesOrderedTaskExecutors } from "../phase-execution-contract.js";
import { planPhaseReviewRequirement } from "../workflows/phases/phase-review-requirement-planner.js";
import { yieldToWorkflowControlPlane } from "../workflow-cancellation.js";
import { summarizeWorkflowOutput } from "../workflows/workflow-output-summary.js";
import { deriveReviewContractFeatureId } from "../workflows/reviews/review-output-enforcement.js";
import {
  PhaseRemediationSuccessorApplication,
  type AuthoritativePhaseRemediationSuccessorHandoff,
} from "../workflows/reviews/phase-remediation-successor-application.js";
import { PhaseRemediationSuccessorPublicationApplication } from "../workflows/reviews/phase-remediation-successor-publication-application.js";
import { FixerResponseRepairApplication } from "../workflows/reviews/fixer-response-repair-application.js";
import { PhasePostWorkerReviewApplication } from "../workflows/reviews/phase-post-worker-review-application.js";
import { PhasePreReviewRoutingApplication } from "../workflows/reviews/phase-pre-review-routing-application.js";
import { PhaseWorkerExecutionApplication } from "../workflows/phases/phase-worker-execution-application.js";
import { PhaseWorkerResultApplication } from "../workflows/phases/phase-worker-result-application.js";
import { CodeReviewFailureContextRepository } from "../workflows/reviews/code-review-failure-context-repository.js";
import { PhaseCompletionEvidenceReader } from "../workflows/phases/phase-completion-evidence-reader.js";
import { PhaseStatusDocumentRepository } from "../workflows/phases/phase-status-document-repository.js";
import { FeatureWorkflowTargetResolver } from "../application/features/feature-workflow-target-resolver.js";
import type { createPhaseFoundationApplications } from "./phase-foundation-applications.js";
import type { createPhaseEntryApplications } from "./phase-entry-applications.js";
import type { createPhaseReviewApplications } from "./phase-review-applications.js";

type PhaseFoundation = ReturnType<typeof createPhaseFoundationApplications>;
type PhaseEntry = ReturnType<typeof createPhaseEntryApplications>;
type PhaseReview = ReturnType<typeof createPhaseReviewApplications>;
type WorkerExecutionDependencies = ConstructorParameters<typeof PhaseWorkerExecutionApplication<
  ReviewRemediationSuccessorBindingExpectation,
  AuthoritativePhaseRemediationSuccessorHandoff,
  ReviewRemediationFindingIdentity
>>[0];

export interface PhaseWorkerApplicationsDependencies {
  buildContext: WorkerExecutionDependencies["buildContext"];
  completionEvidence: PhaseCompletionEvidenceReader;
  failureContexts: CodeReviewFailureContextRepository;
  formatModelLabel: (model: Parameters<WorkerExecutionDependencies["buildPrompt"]>[0]["assignedModel"]) => string;
  foundation: Pick<PhaseFoundation,
    | "phaseGateEvidenceApplication"
    | "phaseSameRunRepairApplication"
    | "recordImplementationPhaseProgress"
  >;
  maximumRepairAttempts: number;
  phaseEntry: Pick<PhaseEntry, "phaseWorkerContinuationApplication" | "protectedPhaseWorkerApplication">;
  phaseReview: Pick<PhaseReview, "phaseReviewGateHandoffApplication">;
  runWorker: WorkerExecutionDependencies["runWorker"];
  runtimeDatabasePath?: string;
  statusDocuments: PhaseStatusDocumentRepository;
  targets: FeatureWorkflowTargetResolver;
}

/** Composes phase worker execution, remediation successors, and post-worker review routing. */
export function createPhaseWorkerApplications(dependencies: PhaseWorkerApplicationsDependencies) {
  const { phaseGateEvidenceApplication, phaseSameRunRepairApplication, recordImplementationPhaseProgress } = dependencies.foundation;
  const phaseRemediationSuccessorApplication = new PhaseRemediationSuccessorApplication({
    canonicalFeatureId: deriveReviewContractFeatureId,
    createArtifactId: (phaseNumber, kind, runId) => createAuthoritativeReviewSuccessorArtifactId(
      phaseNumber, kind, runId, randomUUID(),
    ),
    projectLifecycle: projectReviewRemediationLifecycle,
    readLineage: readAuthoritativeReviewRerunLineageContext,
    resolveIdentityLease: resolveReviewRemediationSuccessorIdentityLease,
  });
  const phaseRemediationSuccessorPublicationApplication = new PhaseRemediationSuccessorPublicationApplication({
    assertBindings: assertReviewRemediationSuccessorHandoffBindings,
    bindReceipt: bindVerificationReceiptResponseReference,
    ingest: ingestAndRenderAuthoritativeReviewSuccessor,
    now: () => new Date().toISOString(),
    parse: parseReviewRemediationSuccessorHandoff,
  });
  const phaseWorkerExecutionApplication = new PhaseWorkerExecutionApplication<
    ReviewRemediationSuccessorBindingExpectation,
    AuthoritativePhaseRemediationSuccessorHandoff,
    ReviewRemediationFindingIdentity
  >({
    buildContext: dependencies.buildContext,
    buildPrompt: ({
      activeTask, assignedAgent, assignedModel, branchName, context, developerAgent, feature,
      isCodePhase, phase, phaseContract, phaseStatus, project, remediationSuccessorHandoff,
    }) => buildPhaseImplementationPrompt(project, feature, context, {
      activeTask,
      assignedAgent,
      assignedModelLabel: dependencies.formatModelLabel(assignedModel),
      branchName,
      developerAgentName: developerAgent,
      isCodePhase,
      phase,
      phaseContract,
      phaseStatus,
      remediationSuccessorHandoff,
    }, {
      codeReviewFindingLedgerRule,
      epicAcceptanceTestsFileName,
      featurePlanningArtifactFileName,
      phaseTaskLedgerRule,
      safetyRules: {
        cargoTimeoutSafety: cargoTimeoutSafetyRule,
        cargoValidationLadder: cargoValidationLadderRule,
        lessonsLearnedExecutionConstraints: lessonsLearnedExecutionConstraintsRule,
        serializedBuildCommandsSkill: serializedBuildCommandsSkillRule,
        sharedCodeQualityAssumptions: sharedCodeQualityAssumptionsRule,
        validationEvidenceAccounting: validationEvidenceAccountingRule,
        windowsShellHygiene: windowsShellHygieneRule,
      },
    }),
    executeProtected: (input) => dependencies.phaseEntry.protectedPhaseWorkerApplication.execute(input),
    prepareSuccessor: (input) => phaseRemediationSuccessorApplication.prepare({
      ...input,
      configuredDatabasePath: dependencies.runtimeDatabasePath,
    }),
    runWorker: dependencies.runWorker,
  });
  const phaseWorkerResultApplication = new PhaseWorkerResultApplication<AuthoritativePhaseRemediationSuccessorHandoff>({
    applyGateEvidence: (input) => phaseGateEvidenceApplication.apply(input),
    prepareRepair: (input) => phaseSameRunRepairApplication.prepare(input),
    publishSuccessor: (input) => phaseRemediationSuccessorPublicationApplication.publish(input),
  });
  const fixerResponseRepairApplication = new FixerResponseRepairApplication({
    assess: assessReviewRemediationContract,
    buildPrompt: buildFixerResponseRepairPrompt,
    exists: existsSync,
    markAwaitingRerun: (feature, phase) => dependencies.statusDocuments.markAwaitingReviewRerun(feature.folderPath, phase),
    maximumRepairAttempts: dependencies.maximumRepairAttempts,
    plan: planConstrainedFixerResponseRepair,
    read: (path) => readFileSync(path, "utf8"),
    recordProgress: recordImplementationPhaseProgress,
    refreshFeature: (project, externalId, fallback) => dependencies.targets.findCurrentFeature(project, externalId, fallback),
    resolvePhase: (feature, phaseNumber, fallback) => getNumberedPhases(feature)
      .find((candidate) => candidate.number === phaseNumber) ?? fallback,
    runWorker: dependencies.runWorker,
    summarize: summarizeWorkflowOutput,
    yieldControl: yieldToWorkflowControlPlane,
  });
  const phasePostWorkerReviewApplication = new PhasePostWorkerReviewApplication({
    exists: existsSync,
    findLatestReportPath: (feature, phaseNumber) =>
      dependencies.failureContexts.findLatest(feature.folderPath, phaseNumber)?.path ?? null,
    getChangedFiles: getObservedPhaseChangedFiles,
    getNextTask: getNextUnresolvedPhaseContractTask,
    isOrderedTaskWorkflow: phaseUsesOrderedTaskExecutors,
    planReviewRequirement: planPhaseReviewRequirement,
    repairFixerResponse: (input) => fixerResponseRepairApplication.repair(input),
  });
  const phasePreReviewRoutingApplication = new PhasePreReviewRoutingApplication({
    hasCompletionEvidence: (phase) => dependencies.completionEvidence.has(phase),
    prepareReviewHandoff: (input) => dependencies.phaseReview.phaseReviewGateHandoffApplication.prepare(input),
    reconcileContinuation: (input) => dependencies.phaseEntry.phaseWorkerContinuationApplication.reconcile(input),
  });

  return {
    phasePostWorkerReviewApplication,
    phasePreReviewRoutingApplication,
    phaseWorkerExecutionApplication,
    phaseWorkerResultApplication,
  };
}
