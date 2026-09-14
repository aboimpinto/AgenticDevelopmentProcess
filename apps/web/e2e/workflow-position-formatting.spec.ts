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

async function openFeature(page: Page, feature = activeRunFeature) {
  await installDashboardFixtures(page, [feature]);
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
  test("card and phase list show a running worker before its document status updates", async ({ page }) => {
    const workflow = activeRunFeature.featureWorkflow!;
    const feature = makeWorkItem({ ...activeRunFeature,
      phases: activeRunFeature.phases.map((phase, index) => ({ ...phase, number: index + 6, title: index ? "Later work" : "Adapter", status: "PENDING" })),
      featureWorkflow: { ...workflow,
        activeRun: { ...workflow.activeRun!, command: "continue-implementing", currentStep: "Implementing adapter" },
        implementationAgentRuns: [{ id: "live-worker", workflowRunId: "run-active", phaseNumber: 6, phaseTitle: "Adapter",
          agentName: "Implementation worker", agentRole: "devcycle-mcp-compatibility", model: "example-model", status: "running",
          startedAt: "2026-07-11T10:00:00Z", updatedAt: "2026-07-11T10:01:00Z", completedAt: null,
          currentStep: "Implementing adapter", error: null, reportPath: null, summary: null }],
        workflowPosition: { commandLabel: "continue-implementing", executionState: "running", activePhaseNumber: 6,
          activePhaseTitle: "Adapter", phaseStatus: "pending", qualityGateState: "unknown", deepDiveFreshness: "current",
          synopsis: "Phase 6: Adapter — running", evidence: [] },
      },
    });
    const detail = await openFeature(page, feature);
    await expect(page.locator("article.feature-card .wp-phase-badge")).toHaveText("Phase 6: Adapter — Running");
    const running = detail.locator('[data-phase-number="6"]');
    await expect(running.locator(".phase-row-status")).toHaveText("Running");
    await expect(running.locator(".phase-row-icon .spin-icon")).toBeVisible();
    await expect(running.locator(".phase-row-activity")).toContainText("Implementing adapter");
    await expect(detail.locator('[data-phase-number="7"] .phase-row-icon .spin-icon')).toHaveCount(0);
    await expect(detail.locator('[data-phase-number="7"] .phase-row-status')).toHaveText(/pending/i);
  });
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

for (const width of [1100, 390]) {
  test(`phase recovery content retains readable full-width layout at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 950 });
    const feature = makeWorkItem({ ...activeRunFeature,
      phases: [{ ...activeRunFeature.phases[0]!, number: 42, title: "Interaction verification and accessibility", status: "COMPLETED" }],
      featureWorkflow: { ...activeRunFeature.featureWorkflow!, activeRun: null, implementationCompleted: true },
      completionRecovery: { assessedAt: "2026-07-19T12:00:00Z", ready: false,
        blockers: [{ id: "artifact-status", action: "external", actionLabel: "Inspect declaration", phaseNumber: 42,
          message: "Document lifecycle declaration needs reconciliation.", prerequisite: "Read the explicit document metadata." }],
        phaseGaps: [{ id: "coverage", phaseNumber: 42, phaseTitle: "Interaction verification and accessibility", kind: "acceptance_coverage",
          title: "Acceptance evidence", details: ["Inspect existing assertions for save and cancel behavior."], sourceIds: ["AC-SAVE"], instruction: "Inspect existing evidence" }],
      },
    });
    const detail = await openFeature(page, feature);
    const row = detail.locator('[data-phase-number="42"]');
    await row.scrollIntoViewIfNeeded();
    const content = await row.locator(".phase-row-content").boundingBox();
    const title = await row.locator(".phase-row-title").boundingBox();
    const gap = await row.locator(".phase-completion-quality-gaps").boundingBox();
    const artifact = await row.getByRole("region", { name: "Phase artifact issue" }).boundingBox();
    expect(title!.width).toBeGreaterThan(140);
    expect(title!.height).toBeLessThan(100);
    for (const box of [gap!, artifact!]) {
      expect(Math.abs(box.x - content!.x)).toBeLessThan(2);
      expect(Math.abs(box.width - content!.width)).toBeLessThan(2);
    }
    await expect(row.getByRole("button", { name: "Verify / repair phase quality gaps" })).toBeVisible();
    await row.screenshot({ path: testInfo.outputPath(`phase-recovery-${width}.png`) });
  });
}


test("uncertain phase findings offer an explicit repair without confirming coverage", async ({ page }) => {
  const feature = makeWorkItem({ ...activeRunFeature,
    phases: [{ ...activeRunFeature.phases[0]!, number: 42, title: "Interaction verification", status: "COMPLETED" }],
    featureWorkflow: { ...activeRunFeature.featureWorkflow!, activeRun: null, implementationCompleted: true },
    completionRecovery: { assessedAt: "2026-07-19T12:00:00Z", ready: false, blockers: [], phaseGaps: [
      { id: "inspect", phaseNumber: 42, phaseTitle: "Interaction verification", kind: "evidence_investigation",
        title: "Uncertain assertion mapping", details: ["Trace the existing cancel assertion and fix confirmed defects."], sourceIds: ["AC-CANCEL"], instruction: "Investigate and repair" },
      { id: "review", phaseNumber: 42, phaseTitle: "Interaction verification", kind: "coverage_confirmation",
        title: "Coverage awaiting your confirmation", details: ["Save evidence is verified."], sourceIds: ["AC-SAVE"], instruction: "Human confirmation only",
        proposalId: "proposal-save", proposedLinks: [{ sourceId: "AC-SAVE", evidenceId: "report-save", kind: "automated", explanation: "Save passed" }] },
    ] },
  });
  const detail = await openFeature(page, feature);
  let repairRequest: Record<string, unknown> | undefined;
  await page.route("**/api/phase-quality/resolve", async route => {
    repairRequest = route.request().postDataJSON();
    await route.fulfill({ json: { items: [feature], summary: "Repair requested", filesChanged: [], filesCreated: [] } });
  });
  const row = detail.locator('[data-phase-number="42"]');
  const repair = row.getByRole("button", { name: "Investigate and fix phase findings", exact: true });
  await expect(repair).toBeVisible(); await expect(repair).toBeEnabled();
  await expect(row.getByRole("button", { name: /I confirm these evidence links/ })).toBeVisible();
  await repair.click();
  await expect.poll(() => repairRequest).toMatchObject({ phaseNumber: 42, gate: "completion_recovery", action: "repair" });
  expect(repairRequest).not.toHaveProperty("confirmProposalId");
});
