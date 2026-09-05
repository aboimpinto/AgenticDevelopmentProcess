import type { ProjectLessonsLearnedContextReader } from "../application/context/project-lessons-learned-context-reader.js";
import { formatFeatureWorkflowCommand } from "../application/features/feature-workflow-message-policy.js";
import type { FeatureWorkflowRunCoordinator } from "../application/features/feature-workflow-run-coordinator.js";
import type { FeatureWorkflowTargetResolver } from "../application/features/feature-workflow-target-resolver.js";
import type { WorkflowConsoleSummaryPresenter } from "../application/workflow-console/workflow-console-summary-presenter.js";
import type { CodeReviewFailureContextRepository } from "../workflows/reviews/code-review-failure-context-repository.js";
import { formatMissingPiCliError, renderPiInvocation, resolvePiInvocation } from "../runtime/pi/pi-invocation-resolver.js";
import type { RoutingActionResolver } from "../agent-routing/routing-action-resolver.js";
import type { ImplementationWorkerApplication } from "../workflows/phases/implementation-worker-application.js";
import type { PhaseProgressInput } from "../workflows/phases/phase-progress-recorder.js";
import { getNumberedPhases } from "../workflows/phases/phase-lifecycle-policy.js";
import { lessonsLearnedExecutionConstraintsRule } from "../workflows/phases/phase-worker-prompt-policies.js";
import { buildWorkflowRecoveryPrompt, parseWorkflowRecoveryResult } from "../workflows/prompts/workflow-recovery-prompt.js";
import {
  extractWorkflowFailurePhaseNumber,
  isAuthoritativeV1ReviewFailure,
  isCodeReviewBlockedFailure,
  isFixerResponseRepairCapFailure,
  isProviderPromptRefusalFailure,
  isRecoverableImplementationFailure,
  isReviewContractPredecessorRequiredFailure,
  isReviewFindingResolutionFailure,
} from "../workflows/recovery/implementation-failure-classifier.js";
import { ImplementationAutoRecoveryApplication } from "../workflows/recovery/implementation-auto-recovery-application.js";
import { ImplementationRecoveryRetryApplication } from "../workflows/recovery/implementation-recovery-retry-application.js";
import { prepareKnownWorkflowRecovery } from "../workflows/recovery/known-workflow-recovery-preparer.js";
import {
  appendHostSideRecoveryToFailureBrief,
  appendRecoveryAnalysisToFailureBrief,
  type WorkflowFailureBriefPresenter,
} from "../workflows/recovery/workflow-failure-brief-presenter.js";
import type { WorkflowMachineStateRepository } from "../workflows/recovery/workflow-machine-state-repository.js";
import { summarizeWorkflowOutput } from "../workflows/workflow-output-summary.js";

type CreatePiEnvironment = () => NodeJS.ProcessEnv;
type RecordPhaseProgress = (input: PhaseProgressInput) => Promise<void>;

export interface ImplementationRecoveryApplicationsDependencies {
  codeReviewFailureContext: CodeReviewFailureContextRepository;
  consoleSummary: WorkflowConsoleSummaryPresenter;
  createPiEnvironment: CreatePiEnvironment;
  ensureCargoShimDirectory(): string | null;
  failureBriefPresenter: Pick<WorkflowFailureBriefPresenter, "create">;
  lessons: ProjectLessonsLearnedContextReader;
  machineState: WorkflowMachineStateRepository;
  routeResolver: RoutingActionResolver;
  recordPhaseProgress: RecordPhaseProgress;
  runAutonomous: ConstructorParameters<typeof ImplementationRecoveryRetryApplication>[0]["runAutonomous"];
  runCoordinator: FeatureWorkflowRunCoordinator;
  targets: FeatureWorkflowTargetResolver;
  worker: ImplementationWorkerApplication;
}

/** Composes bounded autonomous recovery, host repair, recovery-agent analysis, and retry. */
export function createImplementationRecoveryApplications(dependencies: ImplementationRecoveryApplicationsDependencies) {
  const implementationRecoveryRetryApplication = new ImplementationRecoveryRetryApplication({
    runAutonomous: dependencies.runAutonomous,
  });
  let implementationAutoRecoveryApplication: ImplementationAutoRecoveryApplication;
  implementationAutoRecoveryApplication = new ImplementationAutoRecoveryApplication({
    appendAnalysis: appendRecoveryAnalysisToFailureBrief,
    appendHostRecovery: appendHostSideRecoveryToFailureBrief,
    createFailureBrief: ({ errorMessage, input }, currentFeature) => dependencies.failureBriefPresenter.create({
      command: input.command,
      currentStep: currentFeature.featureWorkflow?.lastRun?.currentStep ?? null,
      feature: currentFeature,
      rawError: errorMessage,
      runId: input.runId,
    }),
    extractFailurePhase: extractWorkflowFailurePhaseNumber,
    findCurrentFeature: (input, fallback) => dependencies.targets.findCurrentFeature(
      input.project,
      input.feature.externalId,
      fallback,
    ),
    isCodeReviewFailure: isCodeReviewBlockedFailure,
    isFatalFailure: (errorMessage) => isFixerResponseRepairCapFailure(errorMessage)
      || isReviewContractPredecessorRequiredFailure(errorMessage)
      || isAuthoritativeV1ReviewFailure(errorMessage),
    isProviderPromptRefusalFailure,
    isRecoverableFailure: isRecoverableImplementationFailure,
    isReviewFindingResolutionFailure,
    parseRecoveryResult: parseWorkflowRecoveryResult,
    prepareRecovery: (errorMessage) => prepareKnownWorkflowRecovery(errorMessage, {
      ensureCargoShimDirectory: dependencies.ensureCargoShimDirectory,
      findCodeReviewContext: (rawError) => dependencies.codeReviewFailureContext.extract(rawError),
      formatMissingPi: formatMissingPiCliError,
      resolvePi: () => {
        const resolution = resolvePiInvocation(dependencies.createPiEnvironment());
        return {
          diagnostics: resolution.diagnostics,
          invocation: resolution.invocation ? {
            displayCommand: renderPiInvocation(resolution.invocation),
            source: resolution.invocation.source,
          } : null,
        };
      },
    }),
    recordFeatureProgress: (input, feature, currentStep, summary) => dependencies.runCoordinator.recordFeatureProgress({
      cardKey: input.cardKey, command: input.command, currentStep, feature,
      project: input.project, runId: input.runId, summary,
    }),
    recordRecoveryProgress: async (input, feature, phaseNumber, model, currentStep) => {
      const phase = phaseNumber === null
        ? null
        : getNumberedPhases(feature).find((candidate) => candidate.number === phaseNumber) ?? null;
      if (phase) {
        await dependencies.recordPhaseProgress({
          agent: "Workflow Recovery Agent", cardKey: input.cardKey, command: input.command,
          currentStep, feature, model, phase, project: input.project, runId: input.runId,
          status: "checkpoint", summary: "Analyzing the failed phase and preparing a safe autonomous retry.",
        });
        return;
      }
      await dependencies.runCoordinator.recordFeatureProgress({
        cardKey: input.cardKey, command: input.command, currentStep, feature,
        project: input.project, runId: input.runId,
        summary: "Running workflow recovery analysis before retrying the phase.",
      });
    },
    resolveRecoveryModel: () => dependencies.routeResolver.resolvePlan("workflow-recovery"),
    retry: (retryInput) => implementationRecoveryRetryApplication.execute(
      retryInput,
      (nestedInput) => implementationAutoRecoveryApplication.attempt(nestedInput),
    ),
    runRecoveryWorker: async ({ errorMessage, failureBrief, feature, input, model, preparedRecovery, step }) => {
      const machineState = dependencies.machineState.captureRecovery(feature);
      const output = await dependencies.worker.execute({
        agentAction: "workflow-recovery",
        agentName: "Workflow Recovery Agent", agentRole: "workflow-recovery",
        cardKey: input.cardKey, feature, plan: model, phaseNumber: null,
        phaseTitle: "Workflow Recovery", project: input.project,
        prompt: buildWorkflowRecoveryPrompt(input.project, feature, {
          commandLabel: formatFeatureWorkflowCommand(input.command),
          consoleSummary: dependencies.consoleSummary.render(input.runId),
          failureBrief,
          lessonsLearnedContext: dependencies.lessons.render(input.project, {
            agentRole: "workflow-recovery", maxDocuments: 12,
          }),
          preparedRecoverySummary: preparedRecovery.summary,
          rawError: errorMessage,
          runId: input.runId,
        }, lessonsLearnedExecutionConstraintsRule),
        runId: input.runId, step,
      });
      return { output, revertedPaths: dependencies.machineState.restoreRecovery(machineState) };
    },
    summarizeOutput: summarizeWorkflowOutput,
  });

  return { implementationAutoRecoveryApplication };
}
