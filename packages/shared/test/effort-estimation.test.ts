import { describe, expect, it } from "vitest";

import type { ImplementationAgentRunSummary, PhaseSummary, WorkItemCard } from "../src/index.js";
import {
  aggregateEffortEstimates,
  buildFeatureTimingAnalytics,
  buildPortfolioTimingAnalytics,
  parseEffortEstimate,
} from "../src/effort-estimation.js";

function phase(number: number, human: string, ai: string): PhaseSummary {
  return {
    defaultImplementationModel: null,
    documentPath: `/phase-${number}.md`,
    documentRelativePath: `Phases/phase-${number}.md`,
    estimatedAiTime: ai,
    estimatedHumanTime: human,
    fileName: `phase-${number}.md`,
    number,
    predictedModel: null,
    predictedModelSource: "workflow_policy",
    recommendedAgent: null,
    recommendedModel: null,
    status: "COMPLETED",
    title: `Phase ${number}`,
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
}

function run(id: string, durationMs: number): ImplementationAgentRunSummary {
  return {
    agentName: "Implementation Agent",
    agentRole: "implementation",
    completedAt: new Date(durationMs).toISOString(),
    currentStep: null,
    error: null,
    id,
    model: "model",
    phaseNumber: 1,
    phaseTitle: "Phase 1",
    reportPath: null,
    startedAt: new Date(0).toISOString(),
    status: "completed",
    summary: null,
    updatedAt: new Date(durationMs).toISOString(),
    workflowRunId: `workflow-${id}`,
  };
}

function feature(id: string, phases: PhaseSummary[], runs: ImplementationAgentRunSummary[]): WorkItemCard {
  return {
    id,
    externalId: id,
    kind: "feature",
    title: id,
    stateFolder: "04_COMPLETED",
    stateLabel: "Completed",
    folderName: id.toLowerCase(),
    folderPath: `/features/${id}`,
    documentPath: `/features/${id}/FeatureDescription.md`,
    documentUpdatedAt: null,
    documentRelativePath: "FeatureDescription.md",
    epicState: null,
    epicRefinements: [],
    specMarkdown: "",
    summary: "",
    linkedEpicIds: [],
    linkedEpics: [],
    linkedFeatureIds: [],
    linkedFeatures: [],
    missingFeatureIds: [],
    featureWorkflow: {
      activeRun: null,
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
      hasRefinementArtifacts: true,
      implementationCompleted: true,
      implementationPhases: [],
      implementationAgentRuns: runs,
      implementationTasks: [],
      findings: [],
      lastRun: null,
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
      workflowMessage: "",
      readiness: null,
      workflowPosition: null,
    },
    implementationEvidence: null,
    phases,
    validation: {
      blocksFeatureExtraction: false,
      changedSinceHephaDeepDive: false,
      deepDiveMessage: "",
      deepDiveStatus: "current",
      lastHephaDeepDiveAt: null,
      needsValidationCount: 0,
    },
  };
}

describe("effort estimation analytics", () => {
  it("parses compact, explicit mixed-unit, and displayed ranges", () => {
    expect(parseEffortEstimate("2-3h")).toMatchObject({ minimumMs: 7_200_000, maximumMs: 10_800_000 });
    expect(parseEffortEstimate("30m-1h")).toMatchObject({ minimumMs: 1_800_000, maximumMs: 3_600_000 });
    expect(parseEffortEstimate("1h 30m–2h 15m")).toMatchObject({ minimumMs: 5_400_000, maximumMs: 8_100_000 });
  });

  it("aggregates phase estimates without losing range bounds", () => {
    expect(aggregateEffortEstimates(["1-2h", "30m"])).toMatchObject({
      minimumMs: 5_400_000,
      maximumMs: 9_000_000,
      midpointMs: 7_200_000,
    });
  });

  it("compares actual AI execution with original AI and human estimates", () => {
    const actualMs = ((8 * 60 + 52) * 60 + 12) * 1000;
    const analytics = buildFeatureTimingAnalytics(
      [phase(1, "26-35h", "12-19h")],
      [run("actual", actualMs)],
    );

    expect(analytics.actualAiDurationMs).toBe(actualMs);
    expect(analytics.aiEstimateAssessment).toBe("under");
    expect(analytics.aiBoundaryDeltaMs).toBe(actualMs - 12 * 60 * 60 * 1000);
    expect(analytics.estimatedHumanTimeSavedMidpointMs).toBe(30.5 * 60 * 60 * 1000 - actualMs);
    expect(analytics.humanAccelerationMidpoint).toBeCloseTo(3.44, 2);
  });

  it("aggregates only comparable completed feature samples for portfolio calibration", () => {
    const measured = feature("FEATURE-A", [phase(1, "10h", "5h")], [run("a", 4 * 60 * 60 * 1000)]);
    const unmeasured = feature("FEATURE-B", [phase(1, "8h", "4h")], []);
    const analytics = buildPortfolioTimingAnalytics([measured, unmeasured]);

    expect(analytics.featureCount).toBe(2);
    expect(analytics.comparableFeatureCount).toBe(1);
    expect(analytics.totalActualAiDurationMs).toBe(4 * 60 * 60 * 1000);
    expect(analytics.estimatedHumanTimeSavedMidpointMs).toBe(6 * 60 * 60 * 1000);
    expect(analytics.medianActualToAiEstimateRatio).toBeCloseTo(0.8, 5);
  });
});
