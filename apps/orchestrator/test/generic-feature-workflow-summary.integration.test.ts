import type { StoredCardMetadata } from "@hepha/db";
import type { WorkItemCard, WorkItemValidationSummary } from "@hepha/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FeatureWorkflowSummaryProjector,
  type FeatureWorkflowSummaryProjectorDependencies,
} from "../src/application/features/feature-workflow-summary-projector.js";

const featurePath = fileURLToPath(new URL("./generic-feature-workflow-summary.feature", import.meta.url));
const item = {
  externalId: "WORK",
  folderPath: "/work",
  implementationEvidence: null,
  kind: "feature",
  phases: [],
  stateFolder: "03_IN_PROGRESS",
  stateLabel: "In Progress",
} as WorkItemCard;
const validation = {
  changedSinceHephaDeepDive: false,
  deepDiveStatus: "current",
  needsValidationCount: 0,
} as WorkItemValidationSummary;

function projector(
  superseded = false,
  overrides: Partial<FeatureWorkflowSummaryProjectorDependencies> = {},
) {
  const dependencies: FeatureWorkflowSummaryProjectorDependencies = {
    allImplementationPhasesResolved: () => false,
    artifactExists: () => false,
    buildProgress: () => null,
    buildWorkflowPosition: () => ({}) as never,
    countMissingQualityGates: () => 0,
    createMessage: () => "summary",
    createRecoveredOutcome: () => ({ summary: "recovered", workflowMessage: "recovered" }),
    createUiRequirementSourceHash: (hash) => `current:${hash}`,
    deriveImplementationCurrentStep: () => null,
    evaluateContinueReadiness: () => ({ ready: true, reasons: [] }),
    evaluateReadiness: () => ({ ready: true, reasons: [] }),
    formatCommand: (command) => command,
    getDefaultImplementationModel: () => null,
    getHumanReviewPhase: () => undefined,
    hasCompleteContinuationArtifacts: () => true,
    hasCompleteRefinementArtifacts: () => true,
    hasUnresolvedHumanReviewPhase: () => false,
    isHumanReviewPhaseAwaitingUser: () => false,
    isImplementationWorkflowCommand: () => true,
    isSupersededWorkflowFailure: () => superseded,
    mapAgentRun: () => ({}) as never,
    mapFinding: () => ({}) as never,
    mapPhaseRun: () => ({}) as never,
    metadataStoreEnabled: true,
    recipeSourceFor: () => "native-hepha",
    ...overrides,
  };
  return new FeatureWorkflowSummaryProjector(dependencies);
}

function build(projectorUnderTest: FeatureWorkflowSummaryProjector, workItem = item, metadata: StoredCardMetadata | null = null) {
  return projectorUnderTest.build({
    documentHash: "document",
    featureFindings: [],
    implementationAgentRuns: [],
    implementationPhaseRuns: [],
    item: workItem,
    metadata,
    validation,
  });
}

describe("generic workflow summary Gherkin integration", () => {
  it("binds every scenario to the production projector", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification.match(/^  Scenario(?: Outline)?:/gm)).toHaveLength(9);
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);

    expect(build(projector(), { ...item, kind: "epic" } as WorkItemCard)).toBeNull();
    expect(build(projector())?.canContinueImplementing).toBe(true);
    expect(build(projector(false, {
      evaluateContinueReadiness: () => ({
        ready: false,
        reasons: [{
          blocking: true,
          code: "invalid_refine_artifacts",
          message: "Completion evidence is not available yet.",
        }],
      }),
      recipeSourceFor: () => "devcycle-mcp",
    }))?.readiness).toEqual({ ready: true, reasons: [] });
    for (const workflowStatus of ["failed", "blocked", "cancelled"] as const) {
      expect(build(projector(false, {
        hasCompleteRefinementArtifacts: () => false,
      }), item, {
        workflowCommand: "continue-implementing",
        workflowCompletedAt: "completed",
        workflowRunId: `run-${workflowStatus}`,
        workflowStartedAt: "started",
        workflowStatus,
      } as StoredCardMetadata)?.canContinueImplementing).toBe(true);
    }
    expect(build(projector(), item, {
      workflowCommand: "continue-implementing",
      workflowRunId: "active-run",
      workflowStartedAt: "started",
      workflowStatus: "running",
    } as StoredCardMetadata)?.canContinueImplementing).toBe(false);
    expect(build(projector(false, {
      hasCompleteContinuationArtifacts: () => false,
      hasCompleteRefinementArtifacts: () => false,
    }))?.canContinueImplementing).toBe(false);
    expect(build(projector(false, {
      allImplementationPhasesResolved: () => true,
    }), {
      ...item,
      stateFolder: "04_COMPLETED",
      stateLabel: "Completed",
    } as WorkItemCard)).toMatchObject({
      canContinueImplementing: false,
      canGenerateManualTestPack: true,
      canRecordManualTests: true,
    });
    expect(build(projector(), item, {
      uiRequirementDecision: "no_ui",
      uiRequirementSourceHash: "current:old",
    } as StoredCardMetadata)?.uiRequirementDecision).toBe("unknown");
    expect(build(projector(true), item, {
      workflowCommand: "continue-implementing",
      workflowRunId: "run",
      workflowStartedAt: "start",
      workflowStatus: "failed",
    } as StoredCardMetadata)?.lastRun?.status).toBe("completed");
  });
});
