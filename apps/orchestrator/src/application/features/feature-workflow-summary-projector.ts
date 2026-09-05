import type {
  StoredCardMetadata,
  StoredFeatureFinding,
  StoredImplementationAgentRun,
  StoredImplementationPhaseRun,
} from "@hepha/db";
import type {
  FeatureReadinessSummary,
  FeatureWorkflowCommand,
  FeatureWorkflowProgressSummary,
  FeatureWorkflowRunSummary,
  FeatureWorkflowSummary,
  PhaseSummary,
  WorkItemCard,
  WorkItemValidationSummary,
  WorkflowPositionSummary,
} from "@hepha/shared";
import { designArtifactDefinitions } from "@hepha/shared";
import type { FeatureWorkflowMessageInput } from "./feature-workflow-message-policy.js";
import type { FeatureWorkflowProgressInput } from "./feature-workflow-progress-projector.js";
import type { BuildWorkflowPositionInput } from "../../workflow-position-builder.js";
import type { FeatureRecipeOperation, FeatureRecipeSource } from "../../workflows/recipes/feature-recipe-source-policy.js";

interface SupersededWorkflowFailureInput {
  command: FeatureWorkflowCommand | null;
  hasDesignArtifacts: boolean;
  hasRefinementArtifacts: boolean;
  implementationCompleted: boolean;
  item: WorkItemCard;
  status: StoredCardMetadata["workflowStatus"];
}

interface RecoveredWorkflowOutcomeInput {
  command: FeatureWorkflowCommand;
  errorMessage: string | null;
  item: WorkItemCard;
}

type ReadinessEvaluator = (
  item: WorkItemCard,
  validation: WorkItemValidationSummary,
  metadataStoreEnabled: boolean,
  hasDesignArtifacts: boolean,
  uiRequirementDecision: FeatureWorkflowSummary["uiRequirementDecision"],
) => FeatureReadinessSummary;

export interface FeatureWorkflowSummaryProjectorDependencies {
  readonly allImplementationPhasesResolved: (item: Pick<WorkItemCard, "phases">) => boolean;
  readonly artifactExists: (item: WorkItemCard, name: string) => boolean;
  readonly buildProgress: (input: FeatureWorkflowProgressInput) => FeatureWorkflowProgressSummary | null;
  readonly buildWorkflowPosition: (input: BuildWorkflowPositionInput) => WorkflowPositionSummary;
  readonly countMissingQualityGates: (item: WorkItemCard) => number;
  readonly createMessage: (input: FeatureWorkflowMessageInput) => string;
  readonly createRecoveredOutcome: (input: RecoveredWorkflowOutcomeInput) => {
    summary: string;
    workflowMessage: string;
  };
  readonly createUiRequirementSourceHash: (documentHash: string) => string;
  readonly deriveImplementationCurrentStep: (item: WorkItemCard) => string | null;
  readonly evaluateContinueReadiness: ReadinessEvaluator;
  readonly evaluateReadiness: ReadinessEvaluator;
  readonly formatCommand: (command: FeatureWorkflowCommand) => string;
  readonly getDefaultImplementationModel: () => string | null;
  readonly getHumanReviewPhase: (item: Pick<WorkItemCard, "phases">) => PhaseSummary | undefined;
  readonly hasCompleteContinuationArtifacts: (item: WorkItemCard) => boolean;
  readonly hasCompleteRefinementArtifacts: (item: WorkItemCard) => boolean;
  readonly hasUnresolvedHumanReviewPhase: (item: Pick<WorkItemCard, "phases">) => boolean;
  readonly isHumanReviewPhaseAwaitingUser: (phase: PhaseSummary) => boolean;
  readonly isImplementationWorkflowCommand: (command: FeatureWorkflowCommand | null | undefined) => boolean;
  readonly isSupersededWorkflowFailure: (input: SupersededWorkflowFailureInput) => boolean;
  readonly mapAgentRun: (run: StoredImplementationAgentRun) => NonNullable<FeatureWorkflowSummary["implementationAgentRuns"]>[number];
  readonly mapFinding: (finding: StoredFeatureFinding) => FeatureWorkflowSummary["findings"][number];
  readonly mapPhaseRun: (
    run: StoredImplementationPhaseRun,
    item: WorkItemCard,
    lastRun: FeatureWorkflowSummary["lastRun"],
  ) => FeatureWorkflowSummary["implementationPhases"][number];
  readonly metadataStoreEnabled: boolean;
  readonly recipeSourceFor: (operation: FeatureRecipeOperation) => FeatureRecipeSource;
}

export interface FeatureWorkflowSummaryInput {
  documentHash: string | null;
  featureFindings: StoredFeatureFinding[];
  implementationAgentRuns: StoredImplementationAgentRun[];
  implementationPhaseRuns: StoredImplementationPhaseRun[];
  item: WorkItemCard;
  metadata: StoredCardMetadata | null;
  validation: WorkItemValidationSummary;
}

export class FeatureWorkflowSummaryProjector {
  readonly #dependencies: FeatureWorkflowSummaryProjectorDependencies;

  constructor(dependencies: FeatureWorkflowSummaryProjectorDependencies) {
    this.#dependencies = dependencies;
  }

  build(input: FeatureWorkflowSummaryInput): FeatureWorkflowSummary | null {
    return input.item.kind === "feature" ? this.#buildFeature(input) : this.#buildEpic(input.metadata);
  }

  #buildEpic(metadata: StoredCardMetadata | null): FeatureWorkflowSummary | null {
    const workflowStartedAt = metadata?.workflowStartedAt ?? metadata?.workflowCompletedAt ?? null;
    const lastRun = metadata?.workflowStatus && metadata.workflowCommand && metadata.workflowRunId && workflowStartedAt
      ? {
          command: metadata.workflowCommand,
          completedAt: metadata.workflowCompletedAt,
          currentNodeId: metadata.workflowCurrentNodeId,
          currentStep: metadata.workflowCurrentStep,
          error: metadata.workflowStatus === "failed" ? metadata.workflowError : null,
          runId: metadata.workflowRunId,
          startedAt: workflowStartedAt,
          status: metadata.workflowStatus,
          summary: metadata.workflowSummary,
          workflowProgress: this.#dependencies.buildProgress({
            command: metadata.workflowCommand,
            currentNodeId: metadata.workflowCurrentNodeId,
            currentStep: metadata.workflowCurrentStep,
            status: metadata.workflowStatus,
          }),
        }
      : null;
    const activeRun = lastRun?.status === "running" ? { ...lastRun, completedAt: null, error: null } : null;
    if (!lastRun) return null;

    return {
      activeRun,
      canAcceptHumanReviewFindings: false,
      canRecordManualTests: false,
      canRecordUserCodeReview: false,
      canSubmitFinding: false,
      canContinueImplementing: false,
      canCreateUiRequirements: false,
      canRefineFeature: false,
      canStartImplementing: false,
      defaultImplementationModel: null,
      designCompletedAt: null,
      hasDesignArtifacts: false,
      hasContinuationArtifacts: false,
      hasRefinementArtifacts: false,
      implementationCompleted: false,
      implementationPhases: [],
      implementationAgentRuns: [],
      implementationTasks: [],
      findings: [],
      lastRun,
      manualTestsCompletedAt: null,
      manualTestPackStatus: null,
      canGenerateManualTestPack: false,
      canReviewManualTestPack: false,
      canRecordManualTestPass: false,
      canRecordManualTestFail: false,
      refineCompletedAt: null,
      uiRequirementCheckedAt: null,
      uiRequirementDecision: "unknown",
      uiRequirementReason: null,
      userCodeReviewCompletedAt: null,
      workflowMessage: activeRun
        ? `${this.#dependencies.formatCommand(activeRun.command)} is running for this EPIC.`
        : lastRun.status === "failed"
          ? `Last workflow failed: ${lastRun.error ?? lastRun.summary ?? "unknown error"}`
          : "EPIC workflow metadata is available.",
      readiness: null,
      workflowPosition: null,
    };
  }

  #buildFeature(input: FeatureWorkflowSummaryInput): FeatureWorkflowSummary {
    const { item, metadata, validation } = input;
    const hasDesignArtifacts = designArtifactDefinitions
      .every(({ fileName }) => this.#dependencies.artifactExists(item, fileName));
    const hasRefinementArtifacts = this.#dependencies.hasCompleteRefinementArtifacts(item);
    const mcpDesign = this.#dependencies.recipeSourceFor("designFeature") === "devcycle-mcp";
    const mcpRefine = this.#dependencies.recipeSourceFor("refineFeature") === "devcycle-mcp";
    const mcpStart = this.#dependencies.recipeSourceFor("startImplementing") === "devcycle-mcp";
    const mcpContinue = this.#dependencies.recipeSourceFor("continueImplementing") === "devcycle-mcp";
    const hasContinuationArtifacts = item.stateFolder === "03_IN_PROGRESS"
      && this.#dependencies.hasCompleteContinuationArtifacts(item);
    const sourceHash = input.documentHash
      ? this.#dependencies.createUiRequirementSourceHash(input.documentHash)
      : null;
    const decisionIsCurrent = Boolean(sourceHash) &&
      metadata?.uiRequirementSourceHash === sourceHash && Boolean(metadata.uiRequirementDecision);
    const uiRequirementDecision = decisionIsCurrent ? metadata!.uiRequirementDecision! : "unknown";
    const isWorkflowReady = validation.needsValidationCount === 0;
    const implementationCompleted = this.#dependencies.allImplementationPhasesResolved(item);
    const workflowFailureSuperseded = this.#dependencies.isSupersededWorkflowFailure({
      command: metadata?.workflowCommand ?? null,
      hasDesignArtifacts,
      hasRefinementArtifacts,
      implementationCompleted,
      item,
      status: metadata?.workflowStatus ?? null,
    });
    const mcpRefineRunSuperseded = mcpRefine && hasRefinementArtifacts &&
      item.stateFolder === "02_READY_TO_DEVELOP" && metadata?.workflowCommand === "refine-feature" &&
      metadata.workflowStatus !== "running";
    const mcpRefineNeedsDeepDiveRecovery = mcpRefine && !hasRefinementArtifacts &&
      metadata?.workflowCommand === "refine-feature" &&
      (metadata.workflowStatus === "completed" || metadata.workflowStatus === "blocked") &&
      (item.stateFolder === "01_SUBMITTED" || item.stateFolder === "02_READY_TO_DEVELOP");
    const workflowRunSuperseded = workflowFailureSuperseded || mcpRefineRunSuperseded;
    const recoveredOutcome = mcpRefineRunSuperseded
      ? {
          summary: "Current DevCycle MCP refinement artifacts supersede the previous Refine run result.",
          workflowMessage: "DevCycle MCP refinement artifacts are complete and the FEAT is Ready To Develop. Start Implementing is the next action.",
        }
      : workflowFailureSuperseded && metadata?.workflowCommand
        ? this.#dependencies.createRecoveredOutcome({
            command: metadata.workflowCommand,
            errorMessage: metadata.workflowError ?? metadata.workflowSummary ?? null,
            item,
          })
        : null;
    const effectiveStatus = workflowRunSuperseded
      ? "completed"
      : mcpRefineNeedsDeepDiveRecovery
        ? "blocked"
        : metadata?.workflowStatus ?? null;
    const effectiveSummary = workflowRunSuperseded
      ? recoveredOutcome?.summary ?? `${this.#dependencies.formatCommand(metadata!.workflowCommand!)} result was superseded by the current FEAT artifacts.`
      : metadata?.workflowSummary ?? null;
    const workflowStartedAt = metadata?.workflowStartedAt ?? metadata?.workflowCompletedAt ?? null;
    const currentNodeId = mcpRefineNeedsDeepDiveRecovery
      ? "evaluate-result"
      : metadata?.workflowCurrentNodeId ?? null;
    const currentStep = mcpRefineNeedsDeepDiveRecovery
      ? "Waiting for FEAT Deep-Dive answers"
      : effectiveStatus === "running" && this.#dependencies.isImplementationWorkflowCommand(metadata?.workflowCommand)
        ? this.#dependencies.deriveImplementationCurrentStep(item) ?? metadata!.workflowCurrentStep
        : metadata?.workflowCurrentStep ?? null;
    const lastRun: FeatureWorkflowRunSummary | null = effectiveStatus && metadata?.workflowCommand &&
      metadata.workflowRunId && workflowStartedAt
      ? {
          command: metadata.workflowCommand,
          completedAt: metadata.workflowCompletedAt,
          currentNodeId,
          currentStep,
          error: effectiveStatus === "failed" ? metadata.workflowError : null,
          runId: metadata.workflowRunId,
          startedAt: workflowStartedAt,
          status: effectiveStatus,
          summary: effectiveSummary,
          workflowProgress: this.#dependencies.buildProgress({
            command: metadata.workflowCommand,
            currentNodeId,
            currentStep,
            status: effectiveStatus,
          }),
        }
      : null;
    const activeRun = lastRun?.status === "running" ? { ...lastRun, completedAt: null, error: null } : null;
    const hasRunningWorkflow = Boolean(activeRun);
    const readinessItem = {
      ...item,
      featureWorkflow: {
        ...(item.featureWorkflow ?? {}),
        hasContinuationArtifacts,
        hasDesignArtifacts,
        hasRefinementArtifacts,
      } as FeatureWorkflowSummary,
    };
    const readinessArguments = [
      readinessItem,
      validation,
      this.#dependencies.metadataStoreEnabled,
      hasDesignArtifacts,
      uiRequirementDecision,
    ] as const;
    const baseReadiness = this.#dependencies.evaluateReadiness(...readinessArguments);
    const continueReadiness = item.stateFolder === "03_IN_PROGRESS"
      ? this.#dependencies.evaluateContinueReadiness(...readinessArguments)
      : null;
    const readiness = continueReadiness ?? baseReadiness;
    const canCreateUiRequirements = mcpDesign
      ? !hasRunningWorkflow && !hasDesignArtifacts &&
        (item.stateFolder === "01_SUBMITTED" || item.stateFolder === "02_READY_TO_DEVELOP")
      : isWorkflowReady && !hasRunningWorkflow && uiRequirementDecision === "requires_ui" && !hasDesignArtifacts;
    const canRefineFeature = mcpRefine
      ? !hasRunningWorkflow && !hasRefinementArtifacts && !mcpRefineNeedsDeepDiveRecovery &&
        (item.stateFolder === "01_SUBMITTED" || item.stateFolder === "02_READY_TO_DEVELOP")
      : isWorkflowReady && !hasRunningWorkflow &&
        (item.stateFolder === "01_SUBMITTED" ||
          (item.stateFolder === "02_READY_TO_DEVELOP" && !hasRefinementArtifacts)) &&
        (uiRequirementDecision === "no_ui" || (uiRequirementDecision === "requires_ui" && hasDesignArtifacts));
    const canStartImplementing = mcpStart
      ? !hasRunningWorkflow && item.stateFolder === "02_READY_TO_DEVELOP"
      : readiness.ready && validation.needsValidationCount === 0 && !hasRunningWorkflow &&
        hasRefinementArtifacts && item.stateFolder === "02_READY_TO_DEVELOP";
    const humanReviewPhase = this.#dependencies.getHumanReviewPhase(item);
    const hasUnresolvedHumanReviewPhase = this.#dependencies.hasUnresolvedHumanReviewPhase(item);
    const missingQualityGateCount = this.#dependencies.countMissingQualityGates(item);
    const canContinueImplementing = mcpContinue
      ? !hasRunningWorkflow && item.stateFolder === "03_IN_PROGRESS" && !implementationCompleted
      : (continueReadiness?.ready ?? false) && validation.needsValidationCount === 0 &&
        !hasRunningWorkflow && hasContinuationArtifacts && item.stateFolder === "03_IN_PROGRESS" &&
        (!implementationCompleted || hasUnresolvedHumanReviewPhase || missingQualityGateCount > 0);
    const projectedReadiness = item.stateFolder === "03_IN_PROGRESS" &&
      (canContinueImplementing || implementationCompleted)
      ? { ready: true, reasons: [] }
      : readiness;
    const canAcceptHumanReviewFindings = validation.needsValidationCount === 0 && !hasRunningWorkflow &&
      hasContinuationArtifacts && item.stateFolder === "03_IN_PROGRESS" &&
      Boolean(humanReviewPhase && this.#dependencies.isHumanReviewPhaseAwaitingUser(humanReviewPhase));
    const userCodeReviewCompletedAt = metadata?.userCodeReviewCompletedAt ?? null;
    const manualTestsCompletedAt = metadata?.manualTestsCompletedAt ?? null;
    const supportsManualVerification = item.stateFolder === "03_IN_PROGRESS" || item.stateFolder === "04_COMPLETED";
    const canRecordHumanReview = this.#dependencies.metadataStoreEnabled && validation.needsValidationCount === 0 &&
      !hasRunningWorkflow && supportsManualVerification && implementationCompleted &&
      (item.stateFolder === "04_COMPLETED" || hasContinuationArtifacts);
    let workflowPosition: WorkflowPositionSummary | null = null;
    try {
      workflowPosition = this.#dependencies.buildWorkflowPosition({
        activeRun,
        lastRun,
        phases: item.phases,
        implementationPhases: [],
        implementationEvidence: item.implementationEvidence,
        validation,
        phaseLifecycleEvents: [],
      });
    } catch {
      workflowPosition = null;
    }

    return {
      activeRun,
      canAcceptHumanReviewFindings,
      canRecordManualTests: canRecordHumanReview && !manualTestsCompletedAt,
      canRecordUserCodeReview: canRecordHumanReview && !userCodeReviewCompletedAt,
      canSubmitFinding: canRecordHumanReview,
      canContinueImplementing,
      canCreateUiRequirements,
      canRefineFeature,
      canStartImplementing,
      defaultImplementationModel: this.#dependencies.getDefaultImplementationModel(),
      designCompletedAt: metadata?.designFeatureCompletedAt ??
        (workflowRunSuperseded && metadata?.workflowCommand === "design-feature" ? metadata.workflowCompletedAt : null),
      hasDesignArtifacts,
      hasContinuationArtifacts,
      hasRefinementArtifacts,
      implementationCompleted,
      implementationPhases: input.implementationPhaseRuns.map((run) => this.#dependencies.mapPhaseRun(run, item, lastRun)),
      implementationAgentRuns: input.implementationAgentRuns.map(this.#dependencies.mapAgentRun),
      implementationTasks: [],
      findings: input.featureFindings.map(this.#dependencies.mapFinding),
      lastRun,
      manualTestsCompletedAt,
      refineCompletedAt: hasRefinementArtifacts
        ? metadata?.refineFeatureCompletedAt ??
          (workflowRunSuperseded && metadata?.workflowCommand === "refine-feature" ? metadata.workflowCompletedAt : null)
        : null,
      uiRequirementCheckedAt: decisionIsCurrent ? metadata?.uiRequirementCheckedAt ?? null : null,
      uiRequirementDecision,
      uiRequirementReason: decisionIsCurrent ? metadata?.uiRequirementReason ?? null : null,
      userCodeReviewCompletedAt,
      manualTestPackStatus: null,
      canGenerateManualTestPack: supportsManualVerification && implementationCompleted && !hasRunningWorkflow,
      canReviewManualTestPack: false,
      canRecordManualTestPass: false,
      canRecordManualTestFail: false,
      workflowMessage: this.#dependencies.createMessage({
        humanReviewCompleted: Boolean(userCodeReviewCompletedAt && manualTestsCompletedAt),
        hasDesignArtifacts,
        hasRefinementArtifacts: item.stateFolder === "03_IN_PROGRESS"
          ? hasContinuationArtifacts
          : hasRefinementArtifacts,
        implementationCompleted,
        lastError: effectiveStatus === "failed" ? metadata?.workflowError ?? null : null,
        manualTestsCompleted: Boolean(manualTestsCompletedAt),
        missingQualityGateCount,
        recoveredWorkflowMessage: recoveredOutcome?.workflowMessage ?? null,
        runningCommand: activeRun?.command ?? null,
        isWorkflowReady: item.stateFolder === "03_IN_PROGRESS"
          ? projectedReadiness.ready
          : isWorkflowReady,
        stateFolder: item.stateFolder,
        uiRequirementDecision,
        userCodeReviewCompleted: Boolean(userCodeReviewCompletedAt),
      }),
      readiness: projectedReadiness,
      workflowPosition,
    };
  }
}
