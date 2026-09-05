/**
 * FEAT-056: Workflow And Phase Interaction Decomposition
 *
 * Phase 4 — Presentation Logic tests.
 *
 * Tests that presentation selectors produce correct display models for
 * every supplied workflow state without re-evaluating policy predicates.
 */

import { describe, it, expect } from "vitest";
import type {
  FeatureWorkflowSummary,
  PhaseSummary,
  ImplementationAgentRunSummary,
  ImplementationPhaseRunSummary,
  FeatureFindingSummary,
  ManualTestPackDashboardStatus,
  FeatureImplementationEvidenceSummary,
} from "@hepha/shared";

import {
  buildOverviewDisplay,
  buildPhaseRows,
  buildRecoveryActions,
  buildHumanVerificationSummary,
  buildFindingDisplay,
  buildCompletionReadiness,
  buildFeatureTimingSummary,
  summarizeResolvedPhaseQualityGates,
} from "./workflow-presentation.js";

// ─── Factory helpers ────────────────────────────────────────────────────────

function makeWorkflow(overrides?: Partial<FeatureWorkflowSummary>): FeatureWorkflowSummary {
  return {
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
    hasRefinementArtifacts: false,
    implementationCompleted: false,
    implementationPhases: [],
    implementationAgentRuns: [],
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
    workflowMessage: "Ready",
    readiness: null,
    workflowPosition: null,
    ...overrides,
  };
}

function makePhase(overrides?: Partial<PhaseSummary>): PhaseSummary {
  return {
    number: 1,
    title: "Phase 1",
    status: "pending",
    fileName: "phase-1.md",
    documentPath: "/phases/phase-1.md",
    documentRelativePath: "phases/phase-1.md",
    defaultImplementationModel: null,
    estimatedAiTime: null,
    estimatedHumanTime: null,
    predictedModel: null,
    predictedModelSource: "feature_default",
    recommendedAgent: null,
    recommendedModel: null,
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeImplPhase(overrides?: Partial<ImplementationPhaseRunSummary>): ImplementationPhaseRunSummary {
  return {
    phaseNumber: 1,
    phaseTitle: "Phase 1",
    status: "completed",
    agent: null,
    model: null,
    completedAt: "2026-01-01T00:00:00Z",
    currentStep: null,
    error: null,
    reportPath: null,
    startedAt: null,
    summary: null,
    updatedAt: "2026-01-01T00:00:00Z",
    workflowRunId: "run-1",
    ...overrides,
  };
}

function makeAgentRun(overrides?: Partial<ImplementationAgentRunSummary>): ImplementationAgentRunSummary {
  return {
    agentName: "Phase Worker",
    agentRole: "implementation-phase-worker",
    completedAt: "2026-01-01T00:01:00Z",
    currentStep: null,
    error: null,
    id: "agent-run-1",
    model: "gpt-5.6",
    phaseNumber: 1,
    phaseTitle: "Phase 1",
    reportPath: null,
    startedAt: "2026-01-01T00:00:00Z",
    status: "completed",
    summary: null,
    updatedAt: "2026-01-01T00:01:00Z",
    workflowRunId: "run-1",
    ...overrides,
  };
}

// ─── buildOverviewDisplay ───────────────────────────────────────────────────

describe("buildOverviewDisplay", () => {
  it("returns not-available display for null workflow", () => {
    const display = buildOverviewDisplay(null);
    expect(display.readinessLabel).toBe("Not available");
    expect(display.readinessIcon).toBe("warning");
    expect(display.hasActiveRun).toBe(false);
  });

  it("returns ready display when readiness.ready is true", () => {
    const workflow = makeWorkflow({
      readiness: { ready: true, reasons: [] },
    });
    const display = buildOverviewDisplay(workflow);
    expect(display.readinessLabel).toBe("Ready");
    expect(display.readinessIcon).toBe("success");
  });

  it("shows current implementation as ready to continue despite completion-only blockers", () => {
    const workflow = makeWorkflow({
      canContinueImplementing: true,
      readiness: {
        ready: false,
        reasons: [{
          code: "invalid_refine_artifacts",
          message: "A future phase is missing completion evidence.",
          blocking: true,
        }],
      },
    });

    expect(buildOverviewDisplay(workflow)).toMatchObject({
      readinessLabel: "Ready to continue",
      readinessIcon: "success",
      blockingReasons: [],
    });
  });

  it("returns blocked display when blocking reasons exist", () => {
    const workflow = makeWorkflow({
      readiness: {
        ready: false,
        reasons: [
          { code: "deep_dive_not_recorded", message: "No deep-dive", blocking: true },
        ],
      },
    });
    const display = buildOverviewDisplay(workflow);
    expect(display.readinessLabel).toBe("Blocked");
    expect(display.readinessIcon).toBe("blocked");
  });

  it("compacts an oversized code-review failure to its latest report and finding", () => {
    const workflow = makeWorkflow({
      workflowMessage: `Last workflow failed: ${"x".repeat(1000)}\n- Review report: /tmp/phase-4-code-review-latest.md\n### Review Finding Decision Queue\n- F1 [REQUIRED/runtime-code] Location: adapter.ts. Finding: reject malformed update DTOs. Decision requirement: Must be fixed.`,
    });

    const display = buildOverviewDisplay(workflow);
    expect(display.workflowMessage).toContain("Code-review gate needs changes.");
    expect(display.workflowMessage).toContain("phase-4-code-review-latest.md");
    expect(display.workflowMessage).toContain("F1 [REQUIRED/runtime-code]");
    expect(display.workflowMessage).not.toContain("x".repeat(1000));
    expect(display.workflowMessage).toContain(
      "Code-review gate needs changes.\nLatest report: phase-4-code-review-latest.md.\nCurrent finding:",
    );
    expect(display.workflowMessage).toContain(
      "F1 [REQUIRED/runtime-code]\nLocation: adapter.ts.\nFinding: reject malformed update DTOs.\nDecision requirement: Must be fixed.",
    );
  });

  it("returns active run info when activeRun is present", () => {
    const workflow = makeWorkflow({
      activeRun: {
        command: "start-implementing",
        runId: "run-1",
        status: "running",
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: null,
        currentNodeId: null,
        currentStep: "Building types",
        error: null,
        summary: null,
        workflowProgress: null,
      },
    });
    const display = buildOverviewDisplay(workflow);
    expect(display.hasActiveRun).toBe(true);
    expect(display.activeRunCommand).toBe("Start Implementation");
    expect(display.activeRunStep).toBe("Building types");
    expect(display.readinessLabel).toBe("Running");
  });

  it("treats terminal lifecycle as authoritative over a stale active run", () => {
    const workflow = makeWorkflow({
      activeRun: {
        command: "continue-implementing",
        runId: "stale-run",
        status: "running",
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: null,
        currentNodeId: "implementation-loop",
        currentStep: "Stale persisted step",
        error: null,
        summary: null,
        workflowProgress: null,
      },
    });

    const display = buildOverviewDisplay(workflow, "completed");

    expect(display.readinessLabel).toBe("Completed");
    expect(display.hasActiveRun).toBe(false);
    expect(display.activeRunCommand).toBeNull();
    expect(display.activeRunStep).toBeNull();
  });
});

// ─── buildPhaseRows ─────────────────────────────────────────────────────────

describe("buildPhaseRows", () => {
  it("returns empty array for empty phases", () => {
    expect(buildPhaseRows([], [])).toEqual([]);
  });

  it("marks the first non-completed phase as current", () => {
    const phases = [
      makePhase({ number: 1, status: "completed" }),
      makePhase({ number: 2, status: "in_progress" }),
      makePhase({ number: 3, status: "pending" }),
    ];
    const rows = buildPhaseRows(phases, []);
    expect(rows[0].isCompleted).toBe(true);
    expect(rows[1].isCurrent).toBe(true);
    expect(rows[2].isCurrent).toBe(false);
  });

  it("preserves supplied phase order", () => {
    const phases = [
      makePhase({ number: 2, title: "Phase 2" }),
      makePhase({ number: 1, title: "Phase 1" }),
    ];
    const rows = buildPhaseRows(phases, []);
    expect(rows[0].number).toBe(1);
    expect(rows[1].number).toBe(2);
  });

  it("excludes non-numbered planning artifacts and merges quality-gate evidence into its phase row", () => {
    const phases = [
      makePhase({ number: null, title: "Planning report", status: "Unknown" }),
      makePhase({ number: 1, title: "Data layer", status: "completed" }),
    ];
    const qualityEvidence: Parameters<typeof buildPhaseRows>[3] = [{
      phaseNumber: 1,
      phaseTitle: "Data layer",
      phaseStatus: "COMPLETED",
      changedFiles: [],
      codeFiles: ["src/data.ts"],
      documentationFiles: [],
      testFiles: ["src/data.test.ts"],
      warnings: [],
      gates: [
        { gate: "tests", status: "satisfied", justification: "Focused tests passed.", evidencePaths: ["src/data.test.ts"] },
        { gate: "gherkin_e2e", status: "not_applicable", justification: "No browser behaviour.", evidencePaths: [] },
        { gate: "code_review", status: "satisfied", justification: "Review approved.", evidencePaths: ["review.md"] },
      ],
    }];

    const rows = buildPhaseRows(phases, [], null, qualityEvidence);

    expect(rows).toHaveLength(1);
    expect(rows[0].number).toBe(1);
    expect(rows[0].evidence).toMatchObject({ codeFileCount: 1, testFileCount: 1 });
    expect(rows[0].evidence?.gates).toHaveLength(3);
  });

  it("keeps planned quality-gate evidence visible before execution while timing remains absent", () => {
    const rows = buildPhaseRows([makePhase({ status: "pending" })], [], null, [{
      phaseNumber: 1,
      phaseTitle: "Phase 1",
      phaseStatus: "PENDING",
      changedFiles: [],
      codeFiles: [],
      documentationFiles: [],
      testFiles: [],
      warnings: ["Tests are missing."],
      gates: [],
    }]);

    expect(rows[0].evidence?.warnings).toEqual(["Tests are missing."]);
    expect(rows[0].actualDurationMs).toBeNull();
    expect(rows[0].estimatedHumanTime).toBeNull();
    expect(rows[0].estimatedAiTime).toBeNull();
  });

  it("shows a persisted active phase run as Implementing before its Markdown status catches up", () => {
    const rows = buildPhaseRows(
      [makePhase({ status: "pending" })],
      [makeImplPhase({ completedAt: null, startedAt: "2026-01-01T00:00:00Z", status: "implementing" })],
    );

    expect(rows[0]).toMatchObject({ isActive: true, status: "implementing", statusLabel: "Implementing" });
  });

  it("keeps an IN_PROGRESS lifecycle phase visually active without a phase-bound runtime record", () => {
    const rows = buildPhaseRows(
      [makePhase({ number: 2, status: "IN_PROGRESS" })],
      [],
    );

    expect(rows[0]).toMatchObject({
      isActive: true,
      status: "IN_PROGRESS",
      statusLabel: "In Progress",
    });
  });

  it("shows the active recovery agent, model, and activity instead of stale review metadata", () => {
    const rows = buildPhaseRows(
      [makePhase({ number: 4, status: "AWAITING_REVIEW" })],
      [
        makeImplPhase({
          agent: "Code Review Agent",
          model: "gpt-5.6-terra",
          phaseNumber: 4,
          status: "code_review",
          updatedAt: "2026-01-01T00:00:00Z",
        }),
        makeImplPhase({
          agent: "Workflow Recovery Agent",
          currentStep: "Analyzing failed workflow and preparing autonomous retry",
          model: "deepseek-v4-flash",
          phaseNumber: 4,
          status: "checkpoint",
          updatedAt: "2026-01-01T00:01:00Z",
        }),
      ],
    );

    expect(rows[0]).toMatchObject({
      activityLabel: "Analyzing failed workflow and preparing autonomous retry",
      agent: "Workflow Recovery Agent",
      isActive: true,
      model: "deepseek-v4-flash",
      status: "recovering",
      statusLabel: "Recovering",
    });
  });

  it("sums actual timing across continuation workflows for a phase", () => {
    const rows = buildPhaseRows(
      [makePhase({ status: "completed", estimatedAiTime: "30m", estimatedHumanTime: "2h" })],
      [
        makeImplPhase({ completedAt: "2026-01-01T00:01:00Z", startedAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:01:00Z", workflowRunId: "start" }),
        makeImplPhase({ completedAt: "2026-01-01T00:03:00Z", startedAt: "2026-01-01T00:01:00Z", updatedAt: "2026-01-01T00:03:00Z", workflowRunId: "continue" }),
      ],
    );

    expect(rows[0]).toMatchObject({ actualDurationMs: 180_000, estimatedAiTime: "30m", estimatedHumanTime: "2h" });
  });

  it("tracks settled AI executions in their phase while the phase remains in progress", () => {
    const rows = buildPhaseRows(
      [makePhase({ number: 1, status: "IN_PROGRESS", updatedAt: "2026-01-01T00:10:00Z" })],
      [],
      null,
      [],
      [
        makeAgentRun({ completedAt: "2026-01-01T00:01:00Z", id: "agent-1", startedAt: "2026-01-01T00:00:00Z" }),
        makeAgentRun({ completedAt: "2026-01-01T00:04:00Z", id: "agent-2", startedAt: "2026-01-01T00:02:00Z" }),
      ],
      "deepseek-v4-flash",
      "2025-12-31T23:00:00Z",
    );

    expect(rows[0]).toMatchObject({
      actualDurationMs: 180_000,
      agent: "Phase Worker",
      model: "gpt-5.6",
      modelSource: "orchestrator_command",
    });
  });

  it("reconciles pre-fix MCP executions to the phase active at dispatch without counting refinement", () => {
    const rows = buildPhaseRows(
      [
        makePhase({ number: 0, status: "COMPLETED", title: "Health Check", updatedAt: "2026-01-01T00:05:00Z" }),
        makePhase({ number: 1, status: "IN_PROGRESS", title: "Planning", updatedAt: "2026-01-01T00:20:00Z" }),
      ],
      [],
      null,
      [],
      [
        makeAgentRun({ agentRole: "devcycle-mcp-compatibility", completedAt: "2025-12-31T23:55:00Z", id: "refine", model: "not-recorded", phaseNumber: null, phaseTitle: null, startedAt: "2025-12-31T23:50:00Z" }),
        makeAgentRun({ agentRole: "devcycle-mcp-compatibility", completedAt: "2026-01-01T00:04:00Z", id: "start", model: "not-recorded", phaseNumber: null, phaseTitle: null, startedAt: "2026-01-01T00:00:00Z" }),
        makeAgentRun({ agentRole: "devcycle-mcp-compatibility", completedAt: "2026-01-01T00:12:00Z", id: "continue", model: "not-recorded", phaseNumber: null, phaseTitle: null, startedAt: "2026-01-01T00:10:00Z" }),
      ],
      "deepseek-v4-flash",
      "2025-12-31T23:59:00Z",
    );

    expect(rows.map((row) => ({ duration: row.actualDurationMs, model: row.model, source: row.modelSource }))).toEqual([
      { duration: 240_000, model: "deepseek-v4-flash", source: "workflow_default" },
      { duration: 120_000, model: "deepseek-v4-flash", source: "workflow_default" },
    ]);
  });

  it("splits one autonomous MCP execution at durable phase artifact boundaries", () => {
    const rows = buildPhaseRows(
      [
        makePhase({ number: 0, status: "COMPLETED", updatedAt: "2026-01-01T00:06:00Z" }),
        makePhase({ number: 1, status: "IN_PROGRESS", updatedAt: "2026-01-01T00:20:00Z" }),
      ],
      [],
      null,
      [],
      [makeAgentRun({
        agentRole: "devcycle-mcp-compatibility",
        completedAt: "2026-01-01T00:10:00Z",
        id: "autonomous-run",
        model: "deepseek-v4-flash",
        phaseNumber: 0,
        phaseTitle: "Health Check",
        startedAt: "2026-01-01T00:00:00Z",
      })],
      "deepseek-v4-flash",
      "2025-12-31T23:00:00Z",
    );

    expect(rows.map((row) => row.actualDurationMs)).toEqual([360_000, 240_000]);
  });

  it("shows the orchestrator command model before a pending phase runs", () => {
    const rows = buildPhaseRows([makePhase({ status: "PENDING" })], [], null, [], [], "deepseek-v4-flash");

    expect(rows[0]).toMatchObject({
      agent: "Orchestrator",
      model: "deepseek-v4-flash",
      modelSource: "workflow_default",
    });
  });

  it("shows error state from implementation phase run", () => {
    const phases = [makePhase({ number: 1, status: "failed" })];
    const implPhases = [
      makeImplPhase({
        phaseNumber: 1,
        status: "failed",
        error: "Something went wrong",
        workflowRunId: "run-1",
      }),
    ];
    const rows = buildPhaseRows(phases, implPhases, "run-1");
    expect(rows[0].hasError).toBe(true);
    expect(rows[0].errorMessage).toBe("Something went wrong");
  });
});

// ─── buildFeatureTimingSummary ─────────────────────────────────────────────

describe("buildFeatureTimingSummary", () => {
  it("keeps estimates independent from persisted execution telemetry", () => {
    const result = buildFeatureTimingSummary(
      [
        makePhase({ number: 1, status: "completed", estimatedAiTime: "30m", estimatedHumanTime: "2h" }),
        makePhase({ number: 2, status: "completed", estimatedAiTime: "1-2h", estimatedHumanTime: "3h" }),
      ],
      [
        makeImplPhase({ phaseNumber: 1, startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:30:00Z" }),
        makeImplPhase({ phaseNumber: 2, startedAt: "2026-01-01T01:00:00Z", completedAt: "2026-01-01T02:00:00Z" }),
      ],
    );

    expect(result).toMatchObject({
      estimatedAiTime: "1h 30m–2h 30m",
      estimatedHumanTime: "5h",
      actualDurationMs: null,
      inProgressDurationMs: null,
    });
  });

  it("withholds estimates when a phase estimate is missing", () => {
    const result = buildFeatureTimingSummary(
      [
        makePhase({ number: 1, status: "completed", estimatedAiTime: "30m", estimatedHumanTime: "2h" }),
        makePhase({ number: 2, status: "pending", estimatedAiTime: null, estimatedHumanTime: null }),
      ],
      [makeImplPhase({ phaseNumber: 1, startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:30:00Z" })],
    );

    expect(result).toMatchObject({
      estimatedAiTime: null,
      estimatedHumanTime: null,
      actualDurationMs: null,
      inProgressDurationMs: null,
    });
  });

  it("aggregates post-process, phase, and recovery agent runtime with an in-progress total", () => {
    const result = buildFeatureTimingSummary(
      [makePhase({ status: "pending", estimatedAiTime: null, estimatedHumanTime: null })],
      [],
      [
        makeAgentRun({
          agentName: "Start Feature Postprocess Agent",
          agentRole: "start-feature-postprocess",
          completedAt: "2026-01-01T00:02:00Z",
          startedAt: "2026-01-01T00:00:00Z",
        }),
        makeAgentRun({
          agentName: "Workflow Recovery Agent",
          agentRole: "workflow-recovery",
          completedAt: "2026-01-01T00:05:00Z",
          id: "agent-run-2",
          startedAt: "2026-01-01T00:03:00Z",
        }),
        makeAgentRun({
          completedAt: null,
          id: "agent-run-3",
          startedAt: "2026-01-01T00:06:00Z",
          status: "running",
        }),
      ],
      Date.parse("2026-01-01T00:10:00Z"),
    );

    expect(result).toMatchObject({
      estimatedAiTime: null,
      estimatedHumanTime: null,
      actualDurationMs: 240_000,
      inProgressDurationMs: 480_000,
    });
  });

  it("derives prediction variance and estimated human-time gain", () => {
    const actualMs = ((8 * 60 + 52) * 60 + 12) * 1000;
    const result = buildFeatureTimingSummary(
      [makePhase({ number: 1, status: "completed", estimatedAiTime: "12-19h", estimatedHumanTime: "26-35h" })],
      [],
      [makeAgentRun({ completedAt: new Date(actualMs).toISOString(), startedAt: new Date(0).toISOString() })],
    );

    expect(result.aiEstimateAssessment).toBe("under");
    expect(result.aiBoundaryDeltaMs).toBe(actualMs - 12 * 60 * 60 * 1000);
    expect(result.estimatedHumanTimeSavedMidpointMs).toBe(30.5 * 60 * 60 * 1000 - actualMs);
    expect(result.humanAccelerationMidpoint).toBeCloseTo(3.44, 2);
  });
});

// ─── buildRecoveryActions ───────────────────────────────────────────────────

describe("buildRecoveryActions", () => {
  it("returns empty array for null workflow", () => {
    expect(buildRecoveryActions(null)).toEqual([]);
  });

  it("hides recovery actions while a workflow is running", () => {
    const workflow = makeWorkflow({
      activeRun: {
        command: "start-implementing",
        runId: "run-1",
        status: "running",
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: null,
        currentNodeId: "implementation-loop",
        currentStep: "Running phase 2",
        error: null,
        summary: null,
        workflowProgress: null,
      },
      readiness: {
        ready: false,
        reasons: [{ code: "ui_requirement_unknown", message: "UI requirement unknown", blocking: true }],
      },
    });

    expect(buildRecoveryActions(workflow)).toEqual([]);
  });

  it("does not offer a Deep-Dive rerun for a non-blocking continuation warning", () => {
    const workflow = makeWorkflow({
      readiness: {
        ready: true,
        reasons: [{ code: "deep_dive_stale", message: "Deep-Dive source hash is stale", blocking: false }],
      },
    });

    expect(buildRecoveryActions(workflow)).toEqual([]);
  });

  it("ignores historical Deep-Dive receipt absence and offers the active UI recovery", () => {
    const workflow = makeWorkflow({
      canCreateUiRequirements: true,
      readiness: {
        ready: false,
        reasons: [
          { code: "deep_dive_not_recorded", message: "No FEAT deep-dive", blocking: true },
          { code: "ui_requirement_unknown", message: "UI requirement unknown", blocking: true },
        ],
      },
    });

    expect(buildRecoveryActions(workflow)).toEqual([
      expect.objectContaining({ type: "ui_requirement", label: "Check UI Requirement" }),
    ]);
  });

  it("offers Deep-Dive recovery for a blocked refinement even after markers were consumed", () => {
    const workflow = makeWorkflow({
      canRefineFeature: false,
      hasRefinementArtifacts: false,
      readiness: { ready: true, reasons: [] },
      lastRun: {
        command: "refine-feature",
        completedAt: "2026-01-01T00:01:00Z",
        currentNodeId: "evaluate-result",
        currentStep: "Waiting for FEAT Deep-Dive answers",
        error: null,
        runId: "refine-run",
        startedAt: "2026-01-01T00:00:00Z",
        status: "blocked",
        summary: "Choose the authenticated discovery boundary.",
        workflowProgress: null,
      },
    });

    expect(buildRecoveryActions(workflow)).toEqual([{
      type: "deep_dive",
      label: "Continue FEAT Deep-Dive",
      description: "Choose the authenticated discovery boundary.",
      available: true,
    }]);
  });

  it("reopens a blocked refinement Deep-Dive when validation markers remain", () => {
    const workflow = makeWorkflow({
      canRefineFeature: false,
      readiness: {
        ready: false,
        reasons: [{
          code: "validation_markers_present",
          message: "The FEAT has unresolved validation markers.",
          blocking: true,
        }],
      },
      lastRun: {
        command: "refine-feature",
        completedAt: "2026-01-01T00:01:00Z",
        currentNodeId: "evaluate-result",
        currentStep: "Waiting for FEAT Deep-Dive answers",
        error: null,
        runId: "refine-run",
        startedAt: "2026-01-01T00:00:00Z",
        status: "blocked",
        summary: "Choose the authenticated discovery boundary.",
        workflowProgress: null,
      },
    });

    expect(buildRecoveryActions(workflow)).toEqual([{
      type: "deep_dive",
      label: "Continue FEAT Deep-Dive",
      description: "Choose the authenticated discovery boundary.",
      available: true,
    }]);
  });

  it("returns UI requirement recovery when blocked by ui_requirement_unknown", () => {
    const workflow = makeWorkflow({
      readiness: {
        ready: false,
        reasons: [
          { code: "ui_requirement_unknown", message: "UI requirement unknown", blocking: true },
        ],
      },
    });
    const actions = buildRecoveryActions(workflow);
    expect(actions.some((a) => a.type === "ui_requirement")).toBe(true);
  });

  it("returns design artifact recovery when blocked by missing_design_artifacts and requires_ui", () => {
    const workflow = makeWorkflow({
      uiRequirementDecision: "requires_ui",
      canCreateUiRequirements: true,
      readiness: {
        ready: false,
        reasons: [
          { code: "missing_design_artifacts", message: "Missing design", blocking: true },
        ],
      },
    });
    const actions = buildRecoveryActions(workflow);
    expect(actions.some((a) => a.type === "design_artifact")).toBe(true);
  });

  it("does not return design artifact recovery when canCreateUiRequirements is false", () => {
    const workflow = makeWorkflow({
      uiRequirementDecision: "requires_ui",
      canCreateUiRequirements: false,
      readiness: {
        ready: false,
        reasons: [
          { code: "missing_design_artifacts", message: "Missing design", blocking: true },
        ],
      },
    });
    const actions = buildRecoveryActions(workflow);
    const designAction = actions.find((a) => a.type === "design_artifact");
    expect(designAction?.available).toBe(false);
  });
});

// ─── buildHumanVerificationSummary ──────────────────────────────────────────

describe("buildHumanVerificationSummary", () => {
  it("returns missing state for null workflow", () => {
    const summary = buildHumanVerificationSummary(null);
    expect(summary.manualTestState).toBe("missing");
    expect(summary.manualTestMessage).toBe("No manual test data available.");
  });

  it("reports generating state", () => {
    const workflow = makeWorkflow({
      manualTestPackStatus: {
        state: "generating",
        currentPackId: null,
        currentVersion: null,
        currentReviewId: null,
        hasMarkdown: false,
        hasPdf: false,
        isStale: false,
        isReviewed: false,
        failedCount: 0,
        passedCount: 0,
        hasResults: false,
        message: "Generating...",
      },
    });
    const summary = buildHumanVerificationSummary(workflow);
    expect(summary.manualTestState).toBe("generating");
  });

  it("reports reviewed state with pass/fail counts", () => {
    const workflow = makeWorkflow({
      manualTestPackStatus: {
        state: "current",
        currentPackId: "pack-1",
        currentVersion: "v1",
        currentReviewId: null,
        hasMarkdown: true,
        hasPdf: true,
        isStale: false,
        isReviewed: true,
        failedCount: 2,
        passedCount: 8,
        hasResults: true,
        message: "Reviewed",
      },
    });
    const summary = buildHumanVerificationSummary(workflow);
    expect(summary.manualTestState).toBe("reviewed");
    expect(summary.manualTestMessage).toContain("8 passed");
    expect(summary.manualTestMessage).toContain("2 failed");
  });

  it("reports userCodeReviewDone from workflow", () => {
    const workflow = makeWorkflow({
      userCodeReviewCompletedAt: "2026-06-01T00:00:00Z",
    });
    const summary = buildHumanVerificationSummary(workflow);
    expect(summary.userCodeReviewDone).toBe(true);
    expect(summary.userCodeReviewTimestamp).toBe("2026-06-01T00:00:00Z");
  });
});

// ─── buildFindingDisplay ────────────────────────────────────────────────────

describe("buildFindingDisplay", () => {
  function makeFinding(overrides?: Partial<FeatureFindingSummary>): FeatureFindingSummary {
    return {
      id: "finding-1",
      title: "Test finding",
      status: "open",
      closedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      currentStep: null,
      error: null,
      events: [],
      runId: null,
      summary: "A test finding",
      updatedAt: "2026-01-01T00:00:00Z",
      ...overrides,
    };
  }

  it("shows open status correctly", () => {
    const finding = makeFinding({ status: "open" });
    const display = buildFindingDisplay(finding);
    expect(display.isOpen).toBe(true);
    expect(display.isClosed).toBe(false);
    expect(display.statusLabel).toBe("Open");
  });

  it("shows agent_running status as Investigating", () => {
    const finding = makeFinding({ status: "agent_running" });
    const display = buildFindingDisplay(finding);
    expect(display.isAgentRunning).toBe(true);
    expect(display.statusLabel).toBe("Investigating");
  });

  it("shows closed status as Resolved", () => {
    const finding = makeFinding({ status: "closed" });
    const display = buildFindingDisplay(finding);
    expect(display.isClosed).toBe(true);
    expect(display.statusLabel).toBe("Resolved");
  });

  it("truncates long event content for preview", () => {
    const longContent = "a".repeat(150);
    const finding = makeFinding({
      events: [{ id: "e1", content: longContent, createdAt: "", kind: "finding", role: "user" }],
    });
    const display = buildFindingDisplay(finding);
    expect(display.lastEventPreview?.length).toBe(103); // 100 + "..."
  });

  it("returns null lastEventPreview when there are no events", () => {
    const finding = makeFinding({ events: [] });
    const display = buildFindingDisplay(finding);
    expect(display.lastEventPreview).toBeNull();
  });
});

// ─── buildCompletionReadiness ───────────────────────────────────────────────

describe("summarizeResolvedPhaseQualityGates", () => {
  it("counts missing evidence only for phases that are already resolved", () => {
    const phases = [
      {
        phaseNumber: 0,
        phaseStatus: "COMPLETED",
        gates: [
          { gate: "Build", status: "passed", justification: null },
          { gate: "Tests", status: "missing", justification: null },
        ],
      },
      {
        phaseNumber: 1,
        phaseStatus: "IN_PROGRESS",
        gates: [{ gate: "Build", status: "missing", justification: null }],
      },
      {
        phaseNumber: 2,
        phaseStatus: "PENDING",
        gates: [{ gate: "Tests", status: "missing", justification: null }],
      },
    ] as unknown as FeatureImplementationEvidenceSummary["phaseQualityGates"];

    expect(summarizeResolvedPhaseQualityGates(phases)).toEqual({ missing: 1, total: 2 });
  });
});

describe("buildCompletionReadiness", () => {
  it("returns not_applicable for null workflow", () => {
    const display = buildCompletionReadiness(null, 0, { missing: 0, total: 0 });
    expect(display.verdict).toBe("not_applicable");
    expect(display.canCompleteNow).toBe(false);
  });

  it("returns ready when all conditions are satisfied", () => {
    const workflow = makeWorkflow({
      implementationCompleted: true,
      userCodeReviewCompletedAt: "2026-06-01T00:00:00Z",
      manualTestsCompletedAt: "2026-06-01T00:00:00Z",
      findings: [],
    });
    const display = buildCompletionReadiness(workflow, 0, { missing: 0, total: 3 });
    expect(display.verdict).toBe("ready");
    expect(display.canCompleteNow).toBe(true);
  });

  it("returns blocked when implementation is not completed", () => {
    const workflow = makeWorkflow({ implementationCompleted: false });
    const display = buildCompletionReadiness(workflow, 0, { missing: 0, total: 3 });
    expect(display.verdict).toBe("blocked");
    expect(display.canCompleteNow).toBe(false);
  });

  it("returns finalizing when active run is in progress", () => {
    const workflow = makeWorkflow({
      activeRun: {
        command: "complete-feature",
        runId: "run-1",
        status: "running",
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: null,
        currentNodeId: null,
        currentStep: null,
        error: null,
        summary: null,
        workflowProgress: null,
      },
    });
    const display = buildCompletionReadiness(workflow, 0, { missing: 0, total: 3 });
    expect(display.verdict).toBe("finalizing");
    expect(display.canCompleteNow).toBe(false);
  });

  it("counts missing quality gates", () => {
    const workflow = makeWorkflow({
      implementationCompleted: true,
      userCodeReviewCompletedAt: "2026-06-01T00:00:00Z",
      manualTestsCompletedAt: "2026-06-01T00:00:00Z",
      findings: [],
    });
    const display = buildCompletionReadiness(workflow, 0, { missing: 2, total: 5 });
    expect(display.missingQualityGateCount).toBe(2);
    expect(display.verdict).toBe("blocked");
  });
});
