import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readDocumentSnippet } from "../application/context/feature-workflow-context-collector.js";
import { DesignArtifactPolicy } from "../application/features/design-artifact-policy.js";
import {
  validateDevCycleImplementationArtifacts,
  validateDevCycleRefineArtifacts,
} from "../application/features/devcycle-refine-artifact-validator.js";
import { FeatureWorkflowProgressProjector } from "../application/features/feature-workflow-progress-projector.js";
import {
  createRecoveredFeatureWorkflowOutcome,
  isSupersededFeatureWorkflowFailure,
} from "../application/features/feature-workflow-recovery-policy.js";
import {
  createFeatureWorkflowMessage,
  formatFeatureWorkflowCommand,
} from "../application/features/feature-workflow-message-policy.js";
import { FeatureWorkflowSummaryProjector } from "../application/features/feature-workflow-summary-projector.js";
import type { ImplementationRunSummaryProjector } from "../application/features/implementation-run-summary-projector.js";
import { isImplementationWorkflowCommand } from "../application/features/implementation-run-summary-projector.js";
import { RefinementArtifactPolicy } from "../application/features/refinement-artifact-policy.js";
import { StartFeatureTimingPolicy } from "../application/features/start-feature-timing-policy.js";
import {
  evaluateContinueImplementing as evaluateReadinessContinue,
  evaluateFeatReadiness,
} from "../feat-readiness-evaluator.js";
import { loadHephaFeatureWorkflowSpec } from "../feature-workflow-spec.js";
import {
  validateImplementationContinuationArtifacts,
  validatePhaseExecutionArtifacts,
  validateRefineArtifacts,
} from "../refine-artifact-validator.js";
import { buildWorkflowPosition } from "../workflow-position-builder.js";
import {
  countMissingPhaseQualityGates,
} from "../workflows/phases/phase-quality-evidence-policy.js";
import {
  areAllImplementationPhasesResolved,
  getHumanReviewFindingsPhase,
  hasUnresolvedHumanReviewFindingsPhase,
  isHumanReviewFindingsPhaseAwaitingUser,
} from "../workflows/phases/phase-lifecycle-policy.js";
import { createUiRequirementSourceHash } from "../workflows/prompts/feature-entry-prompts.js";
import type { FeatureRecipeOperation, FeatureRecipeSource } from "../workflows/recipes/feature-recipe-source-policy.js";

type RunSummaryProjection = Pick<
  ImplementationRunSummaryProjector,
  "deriveCurrentStep" | "mapAgent" | "mapFinding" | "mapPhase"
>;

export interface FeatureProjectionApplicationsDependencies {
  getDefaultImplementationModel(): string | null;
  implementationRunSummary: RunSummaryProjection;
  metadataStoreEnabled: boolean;
  recipeSourceFor(operation: FeatureRecipeOperation): FeatureRecipeSource;
  workspaceRoot: string;
}

/** Composes artifact-readiness policies and workflow presentation projections. */
export function createFeatureProjectionApplications(dependencies: FeatureProjectionApplicationsDependencies) {
  const designArtifactPolicy = new DesignArtifactPolicy({
    exists: existsSync,
    readSnippet: readDocumentSnippet,
  });
  const devCycleContinuation = dependencies.recipeSourceFor("continueImplementing") === "devcycle-mcp";
  const refinementArtifactPolicy = new RefinementArtifactPolicy({
    validateContinuation: devCycleContinuation
      ? validateDevCycleImplementationArtifacts
      : validateImplementationContinuationArtifacts,
    validateInProgress: devCycleContinuation
      ? validateDevCycleImplementationArtifacts
      : validatePhaseExecutionArtifacts,
    validateRefined: dependencies.recipeSourceFor("refineFeature") === "devcycle-mcp"
      ? validateDevCycleRefineArtifacts
      : validateRefineArtifacts,
  });
  const startFeatureTimingPolicy = new StartFeatureTimingPolicy({
    exists: existsSync,
    read: (path) => readFileSync(path, "utf8"),
  });
  const featureWorkflowProgressProjector = new FeatureWorkflowProgressProjector({
    loadSpec: (command) => loadHephaFeatureWorkflowSpec(dependencies.workspaceRoot, command),
  });
  const featureWorkflowSummaryProjector = new FeatureWorkflowSummaryProjector({
    allImplementationPhasesResolved: areAllImplementationPhasesResolved,
    artifactExists: (item, name) => existsSync(resolve(item.folderPath, name)),
    buildProgress: (input) => featureWorkflowProgressProjector.build(input),
    buildWorkflowPosition,
    countMissingQualityGates: countMissingPhaseQualityGates,
    createMessage: createFeatureWorkflowMessage,
    createRecoveredOutcome: createRecoveredFeatureWorkflowOutcome,
    createUiRequirementSourceHash,
    deriveImplementationCurrentStep: (item) => dependencies.implementationRunSummary.deriveCurrentStep(item),
    evaluateContinueReadiness: evaluateReadinessContinue,
    evaluateReadiness: evaluateFeatReadiness,
    formatCommand: formatFeatureWorkflowCommand,
    getDefaultImplementationModel: dependencies.getDefaultImplementationModel,
    getHumanReviewPhase: getHumanReviewFindingsPhase,
    hasCompleteContinuationArtifacts: (item) => refinementArtifactPolicy.isContinuationComplete(item),
    hasCompleteRefinementArtifacts: (item) => refinementArtifactPolicy.isComplete(item),
    hasUnresolvedHumanReviewPhase: hasUnresolvedHumanReviewFindingsPhase,
    isHumanReviewPhaseAwaitingUser: isHumanReviewFindingsPhaseAwaitingUser,
    isImplementationWorkflowCommand,
    isSupersededWorkflowFailure: isSupersededFeatureWorkflowFailure,
    mapAgentRun: (run) => dependencies.implementationRunSummary.mapAgent(run),
    mapFinding: (finding) => dependencies.implementationRunSummary.mapFinding(finding),
    mapPhaseRun: (run, item, lastRun) => dependencies.implementationRunSummary.mapPhase(run, item, lastRun),
    metadataStoreEnabled: dependencies.metadataStoreEnabled,
    recipeSourceFor: dependencies.recipeSourceFor,
  });

  return {
    designArtifactPolicy,
    featureWorkflowProgressProjector,
    featureWorkflowSummaryProjector,
    refinementArtifactPolicy,
    startFeatureTimingPolicy,
  };
}
