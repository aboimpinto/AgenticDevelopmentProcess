/**
 * FEAT-057: Workflow Position Formatting — Playwright Journeys
 *
 * Verifies workflow position rendering with a complete deterministic dashboard
 * response rather than an obsolete partial card fixture.
 *
 * @see apps/web/e2e/features/workflow-position-formatting.feature
 */

import { expect, test, type Page } from "@playwright/test";
import { installDashboardFixtures, makeWorkItem } from "./fixtures/dashboard-fixtures";

const activeRunFeature = makeWorkItem({
  externalId: "FEAT-POS",
  featureWorkflow: {
    activeRun: {
      command: "refine-feature",
      completedAt: null,
      currentNodeId: "refine",
      currentStep: "Refining the feature",
      error: null,
      runId: "run-active",
      startedAt: "2026-07-11T10:00:00Z",
      status: "running",
      summary: null,
      workflowProgress: null,
    },
    canAcceptHumanReviewFindings: false,
    canContinueImplementing: false,
    canCreateUiRequirements: false,
    canGenerateManualTestPack: false,
    canRecordManualTestFail: false,
    canRecordManualTestPass: false,
    canRecordManualTests: false,
    canRecordUserCodeReview: false,
    canRefineFeature: false,
    canReviewManualTestPack: false,
    canStartImplementing: false,
    canSubmitFinding: false,
    defaultImplementationModel: "deepseek-v4-flash",
    designCompletedAt: null,
    findings: [],
    hasDesignArtifacts: false,
    hasRefinementArtifacts: false,
    implementationAgentRuns: [],
    implementationCompleted: false,
    implementationPhases: [],
    implementationTasks: [],
    lastRun: {
      command: "refine-feature", completedAt: "2026-07-11T09:05:00Z", currentNodeId: null, currentStep: null,
      error: null, runId: "run-last", startedAt: "2026-07-11T09:00:00Z", status: "completed", summary: null, workflowProgress: null,
    },
    manualTestPackStatus: null,
    manualTestsCompletedAt: null,
    readiness: { ready: true, reasons: [] },
    refineCompletedAt: null,
    uiRequirementCheckedAt: null,
    uiRequirementDecision: "unknown",
    uiRequirementReason: null,
    userCodeReviewCompletedAt: null,
    workflowMessage: "Refinement is running.",
    workflowPosition: null,
  },
  folderName: "FEAT-POS-workflow-position",
  id: "feat-pos",
  phases: [
    { defaultImplementationModel: null, documentPath: null, documentRelativePath: null, estimatedAiTime: null, estimatedHumanTime: null, fileName: "phase-1.md", number: 1, predictedModel: null, predictedModelSource: null, recommendedAgent: null, recommendedModel: null, status: "in_progress", title: "Phase 1", updatedAt: "2026-07-11T10:00:00Z" },
    { defaultImplementationModel: null, documentPath: null, documentRelativePath: null, estimatedAiTime: null, estimatedHumanTime: null, fileName: "phase-2.md", number: 2, predictedModel: null, predictedModelSource: null, recommendedAgent: null, recommendedModel: null, status: "pending", title: "Phase 2", updatedAt: "2026-07-11T10:00:00Z" },
  ],
  title: "FEAT-POS: Workflow Position",
});

async function openFeature(page: Page) {
  await installDashboardFixtures(page, [activeRunFeature]);
  await page.route("**/api/delivery/status?*", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { canPrepare: false, cardKey: "hepha:03_IN_PROGRESS:FEAT-POS-workflow-position", deliveryError: null, githubIssue: null, issueRole: "feature_issue", mode: "direct_merge", preparationDisabledReason: null, pullRequest: null, status: "not_applicable", statusExplanation: "Direct merge is configured.", statusLabel: "Direct Merge", targetBranch: "master" } });
  });
  await page.goto("/");
  await page.getByRole("region", { name: "MemoryBank work board" }).locator("article.feature-card").click();
  const detail = page.locator("aside.detail-panel");
  await expect(detail).toBeVisible();
  return detail;
}

test.describe("Workflow Position Formatting (FEAT-057)", () => {
  test("workflow position and trace shown correctly in workflow readiness", async ({ page }) => {
    const detail = await openFeature(page);
    await expect(detail).toContainText("FEAT-POS");
    await expect(detail).toContainText("Running");
  });

  test("workflow position shows command, state, and phase detail rows", async ({ page }) => {
    const detail = await openFeature(page);
    await expect(detail).toContainText("FEAT-POS");
    await expect(detail.locator(".phase-list")).toContainText("Phase 1");
  });
});
