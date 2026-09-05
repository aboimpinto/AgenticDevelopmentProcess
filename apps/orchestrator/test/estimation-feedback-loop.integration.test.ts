import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ImplementationAgentRunSummary, PhaseSummary } from "@hepha/shared";

import {
  buildEstimationCalibrationEvidence,
  buildSafeEstimationCalibrationContext,
  formatEstimationCalibrationContext,
  formatFeatureEstimationRetrospective,
  formatFeatureEstimationRetrospectiveSafely,
  type HistoricalTimingCandidate,
} from "../src/estimation-calibration.js";

const featurePath = resolve(import.meta.dirname, "estimation-feedback-loop.feature");

function candidate(id: string, options: { completed?: boolean; actualHours?: number } = {}): HistoricalTimingCandidate {
  const phase: PhaseSummary = {
    defaultImplementationModel: null,
    documentPath: "/phase.md",
    documentRelativePath: "Phases/phase.md",
    estimatedAiTime: "5h",
    estimatedHumanTime: "10h",
    fileName: "phase.md",
    number: 1,
    predictedModel: null,
    predictedModelSource: "workflow_policy",
    recommendedAgent: null,
    recommendedModel: null,
    status: options.completed === false ? "IN_PROGRESS" : "COMPLETED",
    title: "Delivery",
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
  const runs: ImplementationAgentRunSummary[] = options.actualHours === undefined ? [] : [{
    agentName: "Implementation Agent",
    agentRole: "implementation",
    completedAt: new Date(options.actualHours * 60 * 60 * 1000).toISOString(),
    currentStep: null,
    error: null,
    id: `run-${id}`,
    model: "model",
    phaseNumber: 1,
    phaseTitle: "Delivery",
    reportPath: null,
    startedAt: new Date(0).toISOString(),
    status: "completed",
    summary: null,
    updatedAt: new Date(options.actualHours * 60 * 60 * 1000).toISOString(),
    workflowRunId: `workflow-${id}`,
  }];

  return {
    externalId: id,
    title: "Generic delivery",
    stateFolder: options.completed === false ? "03_IN_PROGRESS" : "04_COMPLETED",
    phases: [phase],
    implementationCompleted: options.completed !== false,
    implementationAgentRuns: runs,
  };
}

describe("historical estimation feedback Gherkin integration", () => {
  it("keeps the behavior scenarios generic", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Feature: Historical estimation feedback improves future predictions");
    expect(feature).toContain("Scenario: Timing aggregates across delivery levels");
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+/);
  });

  it("includes comparable completed history and excludes incomplete or target work", () => {
    const evidence = buildEstimationCalibrationEvidence([
      candidate("HISTORY-A", { actualHours: 4 }),
      candidate("INCOMPLETE", { completed: false }),
      candidate("TARGET", { actualHours: 3 }),
    ], "TARGET");
    const context = formatEstimationCalibrationContext(evidence);

    expect(evidence.samples).toHaveLength(1);
    expect(context).toContain("Median actual/predicted-AI midpoint ratio: 0.80x");
    expect(context).toContain("HISTORY-A");
    expect(context).not.toContain("INCOMPLETE");
    expect(context).not.toContain("TARGET");
  });

  it("supplies deterministic completion evidence without inventing causality", () => {
    const retrospective = formatFeatureEstimationRetrospective(candidate("COMPLETED", { actualHours: 4 }));

    expect(retrospective).toContain("Original AI estimate: 5h");
    expect(retrospective).toContain("Actual AI execution: 4h 0m 0s");
    expect(retrospective).toContain("analysis, not measurement");
  });

  it("treats malformed historical calibration as advisory instead of failing Start Feature", () => {
    const malformed = {
      ...candidate("MALFORMED", { actualHours: 4 }),
      phases: undefined,
    } as unknown as HistoricalTimingCandidate;

    expect(() => buildSafeEstimationCalibrationContext([malformed], "TARGET")).not.toThrow();
    expect(buildSafeEstimationCalibrationContext([malformed], "TARGET"))
      .toContain("Calibration is advisory and its absence must not block Start Feature");
  });

  it("treats a malformed completion retrospective as optional instead of failing Complete Feature", () => {
    const malformed = {
      ...candidate("MALFORMED", { actualHours: 4 }),
      phases: undefined,
    } as unknown as HistoricalTimingCandidate;

    expect(() => formatFeatureEstimationRetrospectiveSafely(malformed)).not.toThrow();
    expect(formatFeatureEstimationRetrospectiveSafely(malformed))
      .toContain("must not block Complete Feature");
  });

  it("wires calibration into Start Feature and retrospective evidence into Complete Feature", () => {
    const orchestratorSource = [
      readFileSync(resolve(import.meta.dirname, "../src/index.ts"), "utf8"),
      readFileSync(resolve(import.meta.dirname, "../src/bootstrap/feature-completion-applications.ts"), "utf8"),
      readFileSync(resolve(import.meta.dirname, "../src/bootstrap/implementation-worker-applications.ts"), "utf8"),
      readFileSync(resolve(import.meta.dirname, "../src/workflows/prompts/start-feature-post-process-prompt.ts"), "utf8"),
    ].join("\n");
    const startSkill = readFileSync(resolve(import.meta.dirname, "../../../.hepha/commands/start-feature-postprocess.md"), "utf8");
    const completeSkill = readFileSync(resolve(import.meta.dirname, "../../../.hepha/commands/complete-feature.md"), "utf8");

    expect(orchestratorSource).toContain("buildSafeEstimationCalibrationContext(");
    expect(orchestratorSource).toContain("Historical project estimation calibration:");
    expect(orchestratorSource).toContain("formatFeatureEstimationRetrospectiveSafely(");
    expect(startSkill).toContain("historical_estimation_calibration");
    expect(completeSkill).toContain("estimation_retrospective");
  });
});
