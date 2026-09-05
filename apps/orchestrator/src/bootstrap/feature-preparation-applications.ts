import type { CardMetadataStore } from "@hepha/db";
import { randomUUID } from "node:crypto";
import type { FeatureWorkflowContextCollector } from "../application/context/feature-workflow-context-collector.js";
import { RefinementDeepDiveHandoffApplication } from "../application/deep-dive/refinement-deep-dive-handoff-application.js";
import { DesignArtifactPolicy } from "../application/features/design-artifact-policy.js";
import { DesignFeatureExecutionApplication } from "../application/features/design-feature-execution-application.js";
import { FeatureFindingApplication } from "../application/features/feature-finding-application.js";
import { FeatureFindingExecutionApplication } from "../application/features/feature-finding-execution-application.js";
import { FeaturePreparationApplication } from "../application/features/feature-preparation-application.js";
import {
  HumanReviewFindingDocumentRepository,
  humanReviewFindingsPhaseTitle,
} from "../application/features/human-review-finding-document-repository.js";
import { createRecoveredFeatureWorkflowOutcome } from "../application/features/feature-workflow-recovery-policy.js";
import type { FeatureWorkflowRunCoordinator } from "../application/features/feature-workflow-run-coordinator.js";
import type { FeatureWorkflowTargetResolver } from "../application/features/feature-workflow-target-resolver.js";
import { RefinedFeatureReadinessApplication } from "../application/features/refined-feature-readiness-application.js";
import { RefineFeatureExecutionApplication } from "../application/features/refine-feature-execution-application.js";
import { parseRefineFeatureWorkerResult } from "../application/features/refine-feature-worker-result.js";
import { createWorkItemCardKey } from "../application/work-items/work-item-card-key-policy.js";
import type { WorkItemQueryApplication } from "../application/work-items/work-item-query-application.js";
import { toProjectSummary } from "../projects/project-summary.js";
import type { RoutingActionResolver } from "../agent-routing/routing-action-resolver.js";
import { validateRefinePromotionArtifacts } from "../refine-artifact-validator.js";
import type { ImplementationWorkerApplication } from "../workflows/phases/implementation-worker-application.js";
import { areAllImplementationPhasesResolved } from "../workflows/phases/phase-lifecycle-policy.js";
import type { PhaseExecutionContractApplication } from "../workflows/phases/phase-execution-contract-application.js";
import {
  lessonsLearnedExecutionConstraintsRule,
  windowsShellHygieneRule,
} from "../workflows/phases/phase-worker-prompt-policies.js";
import { buildFeatureFindingPrompt } from "../workflows/prompts/feature-finding-prompt.js";
import {
  buildDesignFeaturePrompt,
  buildRefineFeaturePrompt,
  buildUiRequirementPrompt,
  classifyNoUiMaintenanceFeature,
  createUiRequirementSourceHash,
  parseUiRequirementDecision,
} from "../workflows/prompts/feature-entry-prompts.js";
import type { WorkflowFailureBriefPresenter } from "../workflows/recovery/workflow-failure-brief-presenter.js";
import type { WorkflowTransitionReceiptPolicy } from "../workflows/receipts/workflow-transition-receipt-policy.js";
import { summarizeWorkflowOutput } from "../workflows/workflow-output-summary.js";
import { hashText } from "../workflow-receipt.js";
import { getFinalCheckpointCoverageProfileIssue } from "../final-checkpoint-coverage-profile-policy.js";
import { loadVerificationProfile, resolveProfilePath } from "../final-verification-profile-loader.js";

type PreparationDependencies = ConstructorParameters<typeof FeaturePreparationApplication>[0];
type OneShotPrompt = (prompt: string, plan: import("@hepha/shared").HandoffPlanV1) => Promise<string>;
type CompletionStarter = ConstructorParameters<typeof FeatureFindingApplication>[0]["startCompletion"];

export interface FeaturePreparationApplicationsDependencies {
  completeFeature: CompletionStarter;
  contextCollector: FeatureWorkflowContextCollector;
  designArtifactPolicy: DesignArtifactPolicy;
  failureBriefPresenter: Pick<WorkflowFailureBriefPresenter, "create">;
  metadataStore: CardMetadataStore;
  routeResolver: RoutingActionResolver;
  notifyChanged: PreparationDependencies["notifyChanged"];
  phaseContract: PhaseExecutionContractApplication;
  refineFeatureMaxRuntimeMs: number | null;
  refineFeatureStallTimeoutMs: number;
  runCoordinator: FeatureWorkflowRunCoordinator;
  runOneShotPiPrompt: OneShotPrompt;
  stewardId: string | undefined;
  targets: FeatureWorkflowTargetResolver;
  transitionReceiptPolicy: WorkflowTransitionReceiptPolicy;
  workItems: WorkItemQueryApplication;
  worker: ImplementationWorkerApplication;
}

/** Composes design/refinement preparation and user-finding remediation around shared workflow ports. */
export function createFeaturePreparationApplications(dependencies: FeaturePreparationApplicationsDependencies) {
  const scanProject = (project: Parameters<WorkItemQueryApplication["scan"]>[0]) => dependencies.workItems.scan(project);
  const designFeatureExecutionApplication = new DesignFeatureExecutionApplication({
    artifactPolicy: dependencies.designArtifactPolicy,
    buildPrompt: buildDesignFeaturePrompt,
    failureBriefPresenter: dependencies.failureBriefPresenter,
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
    requireModel: (_configuredModel, _label) => dependencies.routeResolver.resolvePlan("design-feature"),
    summarizeOutput: summarizeWorkflowOutput,
    targets: dependencies.targets,
    worker: dependencies.worker,
    workflowCoordinator: dependencies.runCoordinator,
  });
  const refinedFeatureReadinessApplication = new RefinedFeatureReadinessApplication({
    clockNow: () => new Date().toISOString(),
    confirmReadinessSource: (input) => dependencies.metadataStore.confirmFeatureReadinessSource(input),
    databasePath: () => dependencies.metadataStore.databasePath,
    scanProject,
    stewardId: () => dependencies.stewardId,
  });
  const refinementDeepDiveHandoffApplication = new RefinementDeepDiveHandoffApplication({
    clock: () => new Date().toISOString(),
    createId: randomUUID,
    hashText,
    store: dependencies.metadataStore,
  });
  const refineFeatureExecutionApplication = new RefineFeatureExecutionApplication({
    buildPrompt: buildRefineFeaturePrompt,
    confirmReadiness: (input) => refinedFeatureReadinessApplication.confirm(input),
    createDeepDiveHandoff: (input) => refinementDeepDiveHandoffApplication.create(input),
    createRecoveredSummary: ({ errorMessage, feature }) => createRecoveredFeatureWorkflowOutcome({
      command: "refine-feature",
      errorMessage,
      item: feature,
    }).summary,
    createTransitionContext: (project, feature) => dependencies.transitionReceiptPolicy.createContext(project, feature),
    failureBriefPresenter: dependencies.failureBriefPresenter,
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
    parseWorkerResult: parseRefineFeatureWorkerResult,
    phaseContract: dependencies.phaseContract,
    requireFinalCheckpointCoverage: (projectRoot, contract) => {
      if (!contract.phases.some((phase) => phase.role === "final_checkpoint")) return;
      const issue = getFinalCheckpointCoverageProfileIssue(
        contract,
        loadVerificationProfile(resolveProfilePath(projectRoot)),
      );
      if (issue) throw new Error(`Refinement coverage capability failed validation: ${issue}`);
    },
    requireModel: (_configuredModel, _label) => dependencies.routeResolver.resolvePlan("refine-feature"),
    maxRuntimeMs: dependencies.refineFeatureMaxRuntimeMs,
    stallTimeoutMs: dependencies.refineFeatureStallTimeoutMs,
    summarizeOutput: summarizeWorkflowOutput,
    targets: dependencies.targets,
    validateArtifacts: validateRefinePromotionArtifacts,
    validateTransitionReceipt: (input) => dependencies.transitionReceiptPolicy.validate(input),
    worker: dependencies.worker,
    workflowCoordinator: dependencies.runCoordinator,
  });
  const humanReviewFindingDocuments = new HumanReviewFindingDocumentRepository();
  const featureFindingExecutionApplication = new FeatureFindingExecutionApplication({
    appendAgentResult: (feature, findingId, output, status) =>
      humanReviewFindingDocuments.appendAgentResult(feature, findingId, output, status),
    buildPrompt: (project, feature, context, finding, phase) => buildFeatureFindingPrompt(
      project,
      feature,
      context,
      finding,
      phase,
      { lessonsLearnedExecutionConstraintsRule, windowsShellHygieneRule },
    ),
    chooseModel: () => dependencies.routeResolver.resolvePlan("resolve-review-findings"),
    clock: () => new Date().toISOString(),
    collectContext: (project, feature, workItems, phase) => dependencies.contextCollector.collect(project, feature, workItems, {
      includeUiLanguageDocuments: false,
      lessonContext: {
        agentRole: "human-review-finding",
        phase: { number: phase.number, title: humanReviewFindingsPhaseTitle },
      },
    }),
    createId: randomUUID,
    ensurePhase: (feature) => humanReviewFindingDocuments.ensurePhase(feature),
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
    reportDocumentFailure: (featureExternalId, error) => console.error(
      `Failed to record finding failure in phase file for ${featureExternalId}:`,
      error instanceof Error ? error.message : error,
    ),
    scanProject,
    summarizeOutput: summarizeWorkflowOutput,
    worker: dependencies.worker,
  });
  const featureFindingApplication = new FeatureFindingApplication({
    acceptPhase: (feature, phase) => humanReviewFindingDocuments.acceptPhase(feature, phase),
    allPhasesResolved: areAllImplementationPhasesResolved,
    appendDetail: (phase, detail) => humanReviewFindingDocuments.appendDetail(phase, detail),
    appendFinding: (phase, finding) => humanReviewFindingDocuments.appendFinding(phase, finding),
    createCardKey: createWorkItemCardKey,
    createId: randomUUID,
    ensureFindingPhase: (_project, feature) => humanReviewFindingDocuments.ensurePhase(feature),
    ensureTaskChecklists: (phase) => humanReviewFindingDocuments.ensureTaskChecklists(phase),
    executeFinding: (input) => featureFindingExecutionApplication.execute(input),
    findFindingPhase: (feature) => humanReviewFindingDocuments.findPhase(feature),
    isPhaseAwaitingUser: (phase) => humanReviewFindingDocuments.isAwaitingUser(phase),
    markFindingSolved: (_project, feature, findingId) => humanReviewFindingDocuments.markSolved(feature, findingId),
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
    resolveImplementation: (input) => dependencies.targets.resolveImplementation(input),
    scanProject,
    startCompletion: dependencies.completeFeature,
    toProjectSummary,
  });
  const featurePreparationApplication = new FeaturePreparationApplication({
    createCardKey: createWorkItemCardKey,
    createId: randomUUID,
    evaluateUiDecision: async (feature) => classifyNoUiMaintenanceFeature(feature) ?? parseUiRequirementDecision(
      await dependencies.runOneShotPiPrompt(buildUiRequirementPrompt(feature), dependencies.routeResolver.resolvePlan("ui-requirement-evaluation")),
    ),
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
    resolveWorkflow: (input) => dependencies.targets.resolveWorkflow(input),
    scanProject,
    sourceHash: (feature) => createUiRequirementSourceHash(hashText(feature.specMarkdown)),
    startDesignWorker: (input) => designFeatureExecutionApplication.execute(input),
    startRefineWorker: (input) => refineFeatureExecutionApplication.execute(input),
    toProjectSummary,
  });

  return { featureFindingApplication, featurePreparationApplication, refinedFeatureReadinessApplication };
}
