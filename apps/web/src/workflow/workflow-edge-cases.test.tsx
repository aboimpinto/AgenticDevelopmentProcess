/**
 * FEAT-056: Edge-case and accessibility tests for workflow modules.
 *
 * Tests that the modules handle unusual, empty, error, and boundary states
 * correctly without crashing or producing misleading output.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FeatureWorkflowSummary, PhaseSummary, FeatReadinessReason } from "@hepha/shared";

import { createWorkflowSnapshot, buildWorkflowReadModel } from "./workflow-mappers.js";
import {
  buildOverviewDisplay,
  buildPhaseRows,
  buildHumanVerificationSummary,
  buildCompletionReadiness,
} from "./workflow-presentation.js";
import { WorkflowOverviewPanel } from "./workflow-overview-panel.js";
import { WorkflowPhaseListPanel } from "./workflow-phase-list-panel.js";
import { LifecycleControlsPanel } from "./lifecycle-controls-panel.js";
import { CompletionReadinessPanel } from "./completion-readiness-panel.js";
import type { WorkflowActionId } from "./types.js";

// ─── Edge case: no workflow data ────────────────────────────────────────────

describe("workflow module edge cases", () => {
  describe("no workflow data", () => {
    it("createWorkflowSnapshot returns null for empty card", () => {
      const card = {
        id: "card-empty",
        externalId: "FEAT-EMPTY",
        kind: "feature" as const,
        title: "Empty",
        stateFolder: "01_SUBMITTED" as const,
        stateLabel: "Submitted",
        folderName: "FEAT-EMPTY",
        folderPath: "/empty",
        documentPath: null,
        documentUpdatedAt: null,
        documentRelativePath: null,
        epicState: null,
        epicRefinements: [],
        specMarkdown: "",
        summary: "",
        linkedEpicIds: [],
        linkedEpics: [],
        linkedFeatureIds: [],
        linkedFeatures: [],
        missingFeatureIds: [],
        featureWorkflow: null,
        implementationEvidence: null,
        phases: [],
        validation: {
          blocksFeatureExtraction: false,
          changedSinceHephaDeepDive: false,
          deepDiveMessage: "",
          deepDiveStatus: "current" as const,
          lastHephaDeepDiveAt: null,
          needsValidationCount: 0,
        },
      };
      expect(createWorkflowSnapshot(card)).toBeNull();
    });

    it("overview panel shows not-available for null workflow", () => {
      const display = buildOverviewDisplay(null);
      expect(display.readinessLabel).toBe("Not available");
      expect(display.readinessIcon).toBe("warning");
    });

    it("phase rows are empty for empty phase list", () => {
      expect(buildPhaseRows([], [])).toEqual([]);
    });

    it("human verification shows missing for null workflow", () => {
      const summary = buildHumanVerificationSummary(null);
      expect(summary.manualTestState).toBe("missing");
      expect(summary.userCodeReviewDone).toBe(false);
    });

    it("completion readiness shows not_applicable for null workflow", () => {
      const display = buildCompletionReadiness(null, 0, { missing: 0, total: 0 });
      expect(display.verdict).toBe("not_applicable");
    });

    it("read model shows available=false for empty card", () => {
      const card = {
        id: "card-1",
        externalId: "FEAT-001",
        kind: "feature" as const,
        title: "Test",
        stateFolder: "01_SUBMITTED" as const,
        stateLabel: "Submitted",
        folderName: "FEAT-001",
        folderPath: "/empty",
        documentPath: null,
        documentUpdatedAt: null,
        documentRelativePath: null,
        epicState: null,
        epicRefinements: [],
        specMarkdown: "",
        summary: "",
        linkedEpicIds: [],
        linkedEpics: [],
        linkedFeatureIds: [],
        linkedFeatures: [],
        missingFeatureIds: [],
        featureWorkflow: null,
        implementationEvidence: null,
        phases: [],
        validation: {
          blocksFeatureExtraction: false,
          changedSinceHephaDeepDive: false,
          deepDiveMessage: "",
          deepDiveStatus: "current" as const,
          lastHephaDeepDiveAt: null,
          needsValidationCount: 0,
        },
      };
      const model = buildWorkflowReadModel(card, () => false);
      expect(model.available).toBe(false);
      expect(model.actions).toEqual([]);
    });
  });

  // ─── Edge case: unknown / unexpected statuses ───────────────────────────

  describe("unknown statuses", () => {
    it("overview display handles null workflow gracefully", () => {
      const display = buildOverviewDisplay(null);
      expect(display.activeRunCommand).toBeNull();
      expect(display.lastRunStatus).toBeNull();
    });

    it("completion readiness with no conditions met shows blocked", () => {
      const workflow: FeatureWorkflowSummary = {
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
        readiness: {
          ready: false,
          reasons: [{ code: "deep_dive_not_recorded", message: "Deep-dive required", blocking: true }],
        },
        workflowPosition: null,
      };
      const display = buildCompletionReadiness(workflow, 0, { missing: 0, total: 0 });
      expect(display.verdict).toBe("blocked");
      expect(display.reasons.length).toBeGreaterThan(0);
    });
  });

  // ─── Edge case: no phases ───────────────────────────────────────────────

  describe("no phases", () => {
    it("phase list panel shows empty state", () => {
      render(<WorkflowPhaseListPanel phases={[]} />);
      expect(screen.getByText("No phases defined for this feature.")).toBeDefined();
    });
  });

  // ─── Edge case: long reasons / wrapping ─────────────────────────────────

  describe("long content", () => {
    it("overview panel handles long workflow messages", () => {
      const longMessage = "x".repeat(500);
      const workflow: FeatureWorkflowSummary = {
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
        workflowMessage: longMessage,
        readiness: null,
        workflowPosition: null,
      };
      const display = buildOverviewDisplay(workflow);
      expect(display.workflowMessage).toBe(longMessage);
    });
  });

  // ─── Edge case: empty actions ───────────────────────────────────────────

  describe("empty or unavailable actions", () => {
    it("returns null when no available actions", () => {
      const { container } = render(
        <LifecycleControlsPanel
          actions={[
            { id: "start-implementing", label: "Start", available: false, busy: false, reason: null, group: null },
          ]}
          onAction={vi.fn()}
        />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("handles empty action list", () => {
      const { container } = render(
        <LifecycleControlsPanel actions={[]} onAction={vi.fn()} />,
      );
      expect(container.innerHTML).toBe("");
    });
  });

  // ─── Edge case: completion with no items visible ────────────────────────

  describe("completion panel hidden states", () => {
    it("renders nothing for not_applicable verdict", () => {
      const readiness = {
        verdict: "not_applicable" as const,
        reasons: ["No workflow data"],
        canCompleteNow: false,
        isFinalizing: false,
        missingQualityGateCount: 0,
      };
      const { container } = render(
        <CompletionReadinessPanel readiness={readiness} onComplete={vi.fn()} />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("shows blocking reasons for blocked verdict", () => {
      const readiness = {
        verdict: "blocked" as const,
        reasons: ["Implementation not completed", "Open findings remain"],
        canCompleteNow: false,
        isFinalizing: false,
        missingQualityGateCount: 0,
      };
      render(<CompletionReadinessPanel readiness={readiness} onComplete={vi.fn()} />);
      expect(screen.getByText("Implementation not completed")).toBeDefined();
      expect(screen.getByText("Open findings remain")).toBeDefined();
    });
  });
});
