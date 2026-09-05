import type { StoredCardMetadata } from "@hepha/db";
import type { WorkItemCard, WorkItemValidationSummary } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  FeatureWorkflowSummaryProjector,
  type FeatureWorkflowSummaryProjectorDependencies,
} from "../src/application/features/feature-workflow-summary-projector.js";

const validation = {
  changedSinceHephaDeepDive: false,
  deepDiveStatus: "current",
  needsValidationCount: 0,
} as WorkItemValidationSummary;

const feature = {
  externalId: "WORK",
  folderPath: "/work",
  implementationEvidence: null,
  kind: "feature",
  phases: [],
  stateFolder: "03_IN_PROGRESS",
  stateLabel: "In Progress",
} as WorkItemCard;

function harness(overrides: Partial<FeatureWorkflowSummaryProjectorDependencies> = {}) {
  const dependencies: FeatureWorkflowSummaryProjectorDependencies = {
    allImplementationPhasesResolved: () => false,
    artifactExists: () => false,
    buildProgress: () => null,
    buildWorkflowPosition: () => ({ executionState: "idle" }) as never,
    countMissingQualityGates: () => 0,
    createMessage: () => "projected message",
    createRecoveredOutcome: () => ({ summary: "recovered summary", workflowMessage: "recovered message" }),
    createUiRequirementSourceHash: (hash) => `classifier:${hash}`,
    deriveImplementationCurrentStep: () => "Implementing current work",
    evaluateContinueReadiness: () => ({ ready: true, reasons: [] }),
    evaluateReadiness: () => ({ ready: true, reasons: [] }),
    formatCommand: (command) => command,
    getDefaultImplementationModel: () => "model",
    getHumanReviewPhase: () => undefined,
    hasCompleteContinuationArtifacts: () => true,
    hasCompleteRefinementArtifacts: () => true,
    hasUnresolvedHumanReviewPhase: () => false,
    isHumanReviewPhaseAwaitingUser: () => false,
    isImplementationWorkflowCommand: () => true,
    isSupersededWorkflowFailure: () => false,
    mapAgentRun: () => ({}) as never,
    mapFinding: () => ({}) as never,
    mapPhaseRun: () => ({}) as never,
    metadataStoreEnabled: true,
    recipeSourceFor: () => "native-hepha",
    ...overrides,
  };
  return { dependencies, projector: new FeatureWorkflowSummaryProjector(dependencies) };
}

function build(
  projector: FeatureWorkflowSummaryProjector,
  item: WorkItemCard = feature,
  metadata: StoredCardMetadata | null = null,
  validationOverride: WorkItemValidationSummary = validation,
) {
  return projector.build({
    documentHash: "document",
    featureFindings: [],
    implementationAgentRuns: [],
    implementationPhaseRuns: [],
    item,
    metadata,
    validation: validationOverride,
  });
}

describe("feature workflow summary projector", () => {
  it("returns no EPIC workflow projection without persisted run metadata", () => {
    const epic = { ...feature, kind: "epic" } as WorkItemCard;
    expect(build(harness().projector, epic)).toBeNull();
  });

  it("projects persisted EPIC workflow metadata without feature actions", () => {
    const buildProgress = vi.fn(() => null);
    const epic = { ...feature, kind: "epic" } as WorkItemCard;
    const metadata = {
      workflowCommand: "deep-dive-epic",
      workflowCurrentNodeId: "inspect",
      workflowCurrentStep: "Inspecting",
      workflowRunId: "run",
      workflowStartedAt: "2026-01-01T00:00:00Z",
      workflowStatus: "running",
      workflowSummary: "Active",
    } as StoredCardMetadata;
    const result = build(harness({ buildProgress }).projector, epic, metadata);
    expect(result?.activeRun?.runId).toBe("run");
    expect(result?.canStartImplementing).toBe(false);
    expect(result?.workflowMessage).toContain("running for this EPIC");
    expect(buildProgress).toHaveBeenCalledOnce();
  });

  it("exposes MCP compatibility actions from lifecycle folders without native Hepha artifact gates", () => {
    const recipeSourceFor = () => "devcycle-mcp" as const;
    const staleValidation = {
      ...validation,
      changedSinceHephaDeepDive: true,
      deepDiveStatus: "stale",
    } as WorkItemValidationSummary;
    const submitted = { ...feature, stateFolder: "01_SUBMITTED" } as WorkItemCard;
    const ready = { ...feature, stateFolder: "02_READY_TO_DEVELOP" } as WorkItemCard;

    expect(build(harness({
      hasCompleteRefinementArtifacts: () => false,
      recipeSourceFor,
    }).projector, submitted, null, staleValidation)).toMatchObject({
      canCreateUiRequirements: true,
      canRefineFeature: true,
    });
    expect(build(harness({
      evaluateReadiness: () => ({ ready: false, reasons: [] }),
      hasCompleteRefinementArtifacts: () => false,
      recipeSourceFor,
    }).projector, ready, null, staleValidation)?.canStartImplementing).toBe(true);
    expect(build(harness({
      hasCompleteRefinementArtifacts: () => true,
      recipeSourceFor,
    }).projector, ready, null, staleValidation)).toMatchObject({
      canRefineFeature: false,
      canStartImplementing: true,
      hasRefinementArtifacts: true,
      readiness: { ready: true, reasons: [] },
    });
    expect(build(harness({
      evaluateContinueReadiness: () => ({
        ready: false,
        reasons: [{
          blocking: true,
          code: "invalid_refine_artifacts",
          message: "A future phase is missing completion evidence.",
        }],
      }),
      hasCompleteContinuationArtifacts: () => false,
      recipeSourceFor,
    }).projector, feature, null, staleValidation)).toMatchObject({
      canContinueImplementing: true,
      readiness: { ready: true, reasons: [] },
    });
  });

  it("enables continuation from durable refinement and continuation readiness", () => {
    const result = build(harness().projector);
    expect(result).toMatchObject({
      canContinueImplementing: true,
      canStartImplementing: false,
      hasRefinementArtifacts: true,
      implementationCompleted: false,
      workflowMessage: "projected message",
    });
  });

  it.each(["failed", "blocked", "cancelled"] as const)(
    "keeps manual continuation available after a %s run when durable execution work remains",
    (workflowStatus) => {
      const metadata = {
        workflowCommand: "continue-implementing",
        workflowCompletedAt: "2026-01-01T00:01:00Z",
        workflowError: "Automatic recovery stopped.",
        workflowRunId: "run",
        workflowStartedAt: "2026-01-01T00:00:00Z",
        workflowStatus,
      } as StoredCardMetadata;
      const stalePreparation = {
        ...validation,
        changedSinceHephaDeepDive: true,
        deepDiveStatus: "stale",
      } as WorkItemValidationSummary;
      const result = build(harness({
        evaluateContinueReadiness: () => ({
          ready: true,
          reasons: [{
            blocking: false,
            code: "deep_dive_stale",
            message: "Preparation changed; continuation owns recovery.",
          }],
        }),
        hasCompleteRefinementArtifacts: () => false,
      }).projector, feature, metadata, stalePreparation);

      expect(result).toMatchObject({
        canContinueImplementing: true,
        hasContinuationArtifacts: true,
        hasRefinementArtifacts: false,
      });
    },
  );

  it("withholds manual continuation while another workflow is running", () => {
    const metadata = {
      workflowCommand: "continue-implementing",
      workflowRunId: "run",
      workflowStartedAt: "2026-01-01T00:00:00Z",
      workflowStatus: "running",
    } as StoredCardMetadata;
    expect(build(harness().projector, feature, metadata)?.canContinueImplementing).toBe(false);
  });

  it("withholds manual continuation when the execution contract is invalid", () => {
    const result = build(harness({
      hasCompleteContinuationArtifacts: () => false,
      hasCompleteRefinementArtifacts: () => false,
    }).projector);
    expect(result).toMatchObject({
      canContinueImplementing: false,
      hasContinuationArtifacts: false,
    });
  });

  it("keeps post-implementation human actions available from continuation authority", () => {
    const result = build(harness({
      allImplementationPhasesResolved: () => true,
      hasCompleteRefinementArtifacts: () => false,
    }).projector);
    expect(result).toMatchObject({
      canGenerateManualTestPack: true,
      canRecordManualTests: true,
      canRecordUserCodeReview: true,
      canSubmitFinding: true,
      hasContinuationArtifacts: true,
      hasRefinementArtifacts: false,
    });
  });

  it("keeps manual verification available after a provider completes the feature", () => {
    const completed = {
      ...feature,
      stateFolder: "04_COMPLETED",
      stateLabel: "Completed",
    } as WorkItemCard;
    const result = build(harness({
      allImplementationPhasesResolved: () => true,
    }).projector, completed);

    expect(result).toMatchObject({
      canContinueImplementing: false,
      canGenerateManualTestPack: true,
      canRecordManualTests: true,
      canRecordUserCodeReview: true,
      canSubmitFinding: true,
      implementationCompleted: true,
    });
  });

  it("treats stale UI classification as unknown", () => {
    const metadata = {
      uiRequirementDecision: "no_ui",
      uiRequirementSourceHash: "classifier:old-document",
    } as StoredCardMetadata;
    expect(build(harness().projector, feature, metadata)?.uiRequirementDecision).toBe("unknown");
  });

  it("supersedes an earlier MCP refine result when durable ready artifacts now exist", () => {
    const ready = { ...feature, stateFolder: "02_READY_TO_DEVELOP", stateLabel: "Ready To Develop" } as WorkItemCard;
    const metadata = {
      workflowCommand: "refine-feature",
      workflowCompletedAt: "2026-01-01T00:01:00Z",
      workflowRunId: "run",
      workflowStartedAt: "2026-01-01T00:00:00Z",
      workflowStatus: "completed",
      workflowSummary: "Cannot run refine-feature yet.",
    } as StoredCardMetadata;
    const result = build(harness({
      hasCompleteRefinementArtifacts: () => true,
      recipeSourceFor: () => "devcycle-mcp",
    }).projector, ready, metadata);

    expect(result?.lastRun).toMatchObject({
      status: "completed",
      summary: "Current DevCycle MCP refinement artifacts supersede the previous Refine run result.",
    });
    expect(result?.canRefineFeature).toBe(false);
    expect(result?.canStartImplementing).toBe(true);
  });

  it("reconciles a completed MCP refine without artifacts as blocked Deep-Dive recovery", () => {
    const submitted = { ...feature, stateFolder: "01_SUBMITTED" } as WorkItemCard;
    const metadata = {
      workflowCommand: "refine-feature",
      workflowCompletedAt: "2026-01-01T00:01:00Z",
      workflowRunId: "run",
      workflowStartedAt: "2026-01-01T00:00:00Z",
      workflowStatus: "completed",
      workflowSummary: "Refinement is blocked pending target decisions.",
    } as StoredCardMetadata;
    const buildProgress = vi.fn(() => null);
    const result = build(harness({
      buildProgress,
      hasCompleteRefinementArtifacts: () => false,
      recipeSourceFor: () => "devcycle-mcp",
    }).projector, submitted, metadata);

    expect(result?.lastRun).toMatchObject({
      status: "blocked",
      currentNodeId: "evaluate-result",
      currentStep: "Waiting for FEAT Deep-Dive answers",
    });
    expect(buildProgress).toHaveBeenCalledWith(expect.objectContaining({
      currentNodeId: "evaluate-result",
      status: "blocked",
    }));
    expect(result?.refineCompletedAt).toBeNull();
    expect(result?.canRefineFeature).toBe(false);
  });

  it("projects superseded failures as completed recovered runs", () => {
    const metadata = {
      workflowCommand: "refine-feature",
      workflowCompletedAt: "2026-01-01T00:01:00Z",
      workflowError: "worker stopped",
      workflowRunId: "run",
      workflowStartedAt: "2026-01-01T00:00:00Z",
      workflowStatus: "failed",
    } as StoredCardMetadata;
    const result = build(harness({ isSupersededWorkflowFailure: () => true }).projector, feature, metadata);
    expect(result?.lastRun).toMatchObject({ status: "completed", summary: "recovered summary", error: null });
    expect(result?.refineCompletedAt).toBe("2026-01-01T00:01:00Z");
  });

  it("withholds refinement while a blocked refinement is waiting for Deep-Dive answers", () => {
    const submitted = { ...feature, stateFolder: "01_SUBMITTED" } as WorkItemCard;
    const metadata = {
      uiRequirementDecision: "no_ui",
      uiRequirementSourceHash: "classifier:document",
      workflowCommand: "refine-feature",
      workflowCompletedAt: "2026-01-01T00:01:00Z",
      workflowCurrentNodeId: "evaluate-result",
      workflowCurrentStep: "Waiting for FEAT Deep-Dive answers",
      workflowRunId: "run",
      workflowStartedAt: "2026-01-01T00:00:00Z",
      workflowStatus: "blocked",
      workflowSummary: "A user decision is required.",
    } as StoredCardMetadata;
    const result = build(harness({ hasCompleteRefinementArtifacts: () => false }).projector, submitted, metadata);
    expect(result).toMatchObject({
      activeRun: null,
      canRefineFeature: true,
      lastRun: { command: "refine-feature", status: "blocked", summary: "A user decision is required." },
    });
  });

  it("allows refinement after marker-free design output changes", () => {
    const submitted = { ...feature, stateFolder: "01_SUBMITTED" } as WorkItemCard;
    const metadata = {
      uiRequirementDecision: "requires_ui",
      uiRequirementSourceHash: "classifier:document",
    } as StoredCardMetadata;
    const stalePreparation = {
      ...validation,
      changedSinceHephaDeepDive: true,
      deepDiveStatus: "stale",
    } as WorkItemValidationSummary;
    const current = harness({
      artifactExists: () => true,
      hasCompleteRefinementArtifacts: () => false,
    });

    const result = build(current.projector, submitted, metadata, stalePreparation);

    expect(result).toMatchObject({
      canCreateUiRequirements: false,
      canRefineFeature: true,
      hasDesignArtifacts: true,
    });
  });
});
