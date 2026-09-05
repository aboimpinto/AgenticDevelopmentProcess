/**
 * Manual Test Verification Pack — Playwright journeys
 *
 * Verifies the distinct generate, review, stale, pass, and fail behaviors
 * against the current dashboard and manual-verification API contracts.
 *
 * @see apps/web/e2e/features/manual-test-verification.feature
 */

import { expect, test, type Page, type Route } from "@playwright/test";
import type { FeatureWorkflowSummary, ManualTestPackDashboardStatus } from "@hepha/shared";
import { installDashboardFixtures, makeWorkItem } from "./fixtures/dashboard-fixtures";

type RecordedRequest = { body: unknown; path: string };

function workflow(overrides: Partial<FeatureWorkflowSummary> = {}): FeatureWorkflowSummary {
  return {
    activeRun: null,
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
    hasRefinementArtifacts: true,
    implementationCompleted: true,
    implementationPhases: [],
    implementationTasks: [],
    lastRun: null,
    manualTestPackStatus: null,
    manualTestsCompletedAt: null,
    readiness: { ready: true, reasons: [] },
    refineCompletedAt: "2026-07-11T10:00:00.000Z",
    uiRequirementCheckedAt: "2026-07-11T10:00:00.000Z",
    uiRequirementDecision: "no_ui",
    uiRequirementReason: "No separate UI requirements are needed.",
    userCodeReviewCompletedAt: "2026-07-11T10:00:00.000Z",
    workflowMessage: "Implementation is complete; manual verification remains.",
    workflowPosition: null,
    ...overrides,
  };
}

function packStatus(overrides: Partial<ManualTestPackDashboardStatus> = {}): ManualTestPackDashboardStatus {
  return {
    currentPackId: null,
    currentReviewId: null,
    currentVersion: null,
    failedCount: 0,
    hasMarkdown: false,
    hasPdf: false,
    hasResults: false,
    isReviewed: false,
    isStale: false,
    message: "No manual test pack generated.",
    passedCount: 0,
    state: "missing",
    ...overrides,
  };
}

async function installManualTestFixture(
  page: Page,
  status: ManualTestPackDashboardStatus,
  workflowOverrides: Partial<FeatureWorkflowSummary> = {},
) {
  const requests: RecordedRequest[] = [];
  const browserErrors: string[] = [];
  const item = makeWorkItem({
    externalId: "FEAT-TEST",
    featureWorkflow: workflow(workflowOverrides),
    folderName: "FEAT-TEST-manual-verification",
    id: "feat-test",
    title: "Manual Verification",
  });

  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await installDashboardFixtures(page, [item]);
  await page.route("**/api/projects/hepha/live-activity*", async (route) => {
    await route.fulfill({ body: "event: live-activity.connected\ndata: {}\n\n", contentType: "text/event-stream", status: 200 });
  });
  await page.route("**/api/delivery/status?*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        canPrepare: false,
        cardKey: `hepha:${item.stateFolder}:${item.folderName}`,
        deliveryError: null,
        githubIssue: null,
        issueRole: "feature_issue",
        mode: "direct_merge",
        preparationDisabledReason: null,
        pullRequest: null,
        status: "not_applicable",
        statusExplanation: "Direct merge is configured.",
        statusLabel: "Direct Merge",
        targetBranch: "master",
      },
    });
  });
  await page.route("**/api/manual-test-verification/status?*", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { status, success: true, summary: status.message } });
  });

  const recordResult = (message: string, findingId: string | null = null) => async (route: Route) => {
    requests.push({ body: route.request().postDataJSON(), path: new URL(route.request().url()).pathname });
    await route.fulfill({
      contentType: "application/json",
      json: { errors: [], findingId, message, resultId: "result-test", success: true },
    });
  };
  await page.route("**/api/manual-test-verification/record-pass", recordResult("All manual tests recorded."));
  await page.route("**/api/manual-test-verification/record-fail", recordResult("Failure recorded as finding F-TEST.", "F-TEST"));

  await page.goto("/");
  await page.getByRole("region", { name: "MemoryBank work board" }).locator("article.feature-card").click();
  const detail = page.locator("aside.detail-panel");
  await expect(detail).toBeVisible();
  return { browserErrors, detail, item, requests };
}

async function openManualTestDialog(page: Page, detail: ReturnType<Page["locator"]>) {
  await detail.getByRole("button", { name: /Manual test/ }).click();
  const dialog = page.getByRole("dialog", { name: "Manual test verification" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("Manual Test Verification Pack", () => {
  test("no pack generated — shows generate button", async ({ page }) => {
    const { browserErrors, detail } = await installManualTestFixture(
      page,
      packStatus(),
      { canGenerateManualTestPack: true },
    );
    const dialog = await openManualTestDialog(page, detail);

    await expect(dialog).toContainText("No manual test pack generated.");
    await expect(dialog.getByRole("button", { name: "Generate test pack" })).toBeEnabled();
    expect(browserErrors).toEqual([]);
  });

  test("pack generated and unreviewed — shows review prompt", async ({ page }) => {
    const { browserErrors, detail } = await installManualTestFixture(page, packStatus({
      currentPackId: "pack-1",
      currentVersion: "v1",
      hasMarkdown: true,
      hasPdf: true,
      message: "Test pack generated and awaiting review.",
      state: "current",
    }));
    const dialog = await openManualTestDialog(page, detail);

    await expect(dialog.getByRole("button", { name: "I reviewed this pack" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Open Markdown" })).toBeVisible();
    expect(browserErrors).toEqual([]);
  });

  test("review acknowledgement enables test recording", async ({ page }) => {
    const { browserErrors, detail } = await installManualTestFixture(page, packStatus({
      currentPackId: "pack-1",
      currentReviewId: "review-1",
      currentVersion: "v1",
      hasMarkdown: true,
      isReviewed: true,
      message: "Pack reviewed and ready for result recording.",
      state: "current",
    }));
    const dialog = await openManualTestDialog(page, detail);

    await expect(dialog.getByRole("button", { name: "All tests passed" })).toBeEnabled();
    await expect(dialog.getByRole("button", { name: "Record a failure" })).toBeEnabled();
    expect(browserErrors).toEqual([]);
  });

  test("stale pack shows warning and regenerate option", async ({ page }) => {
    const { browserErrors, detail } = await installManualTestFixture(
      page,
      packStatus({
        currentPackId: "pack-1",
        currentReviewId: "review-1",
        currentVersion: "v1",
        hasMarkdown: true,
        isReviewed: true,
        isStale: true,
        message: "Pack is stale because the implementation changed.",
        state: "stale",
      }),
      { canGenerateManualTestPack: true },
    );
    const dialog = await openManualTestDialog(page, detail);

    await expect(dialog).toContainText("Pack is stale");
    await expect(dialog.getByRole("button", { name: "Regenerate test pack" })).toBeEnabled();
    expect(browserErrors).toEqual([]);
  });

  test("record a passing test", async ({ page }) => {
    const { browserErrors, detail, item, requests } = await installManualTestFixture(page, packStatus({
      currentPackId: "pack-1",
      currentReviewId: "review-1",
      currentVersion: "v1",
      isReviewed: true,
      message: "Ready for result recording.",
      state: "current",
    }));
    const dialog = await openManualTestDialog(page, detail);
    await dialog.getByRole("button", { name: "All tests passed" }).click();

    await expect(page.getByText("All manual tests recorded.")).toBeVisible();
    expect(requests).toContainEqual({
      body: {
        actualResult: null,
        cardId: item.id,
        notes: null,
        packId: "pack-1",
        projectId: "hepha",
        result: "pass",
        reviewId: "review-1",
      },
      path: "/api/manual-test-verification/record-pass",
    });
    expect(browserErrors).toEqual([]);
  });

  test("record a failing test creates a finding", async ({ page }) => {
    const { browserErrors, detail, item, requests } = await installManualTestFixture(page, packStatus({
      currentPackId: "pack-1",
      currentReviewId: "review-1",
      currentVersion: "v1",
      isReviewed: true,
      message: "Ready for result recording.",
      state: "current",
    }));
    const dialog = await openManualTestDialog(page, detail);
    await dialog.getByRole("button", { name: "Record a failure" }).click();
    await dialog.getByLabel("Test ID").fill("MT-007");
    await dialog.getByLabel("Actual result").fill("The confirmation was not visible.");
    await dialog.getByLabel("Notes or evidence (optional)").fill("Captured during the verification run.");
    await dialog.getByRole("button", { name: "Submit failure" }).click();

    await expect(page.getByText("Failure recorded as finding F-TEST.")).toBeVisible();
    expect(requests).toContainEqual({
      body: {
        actualResult: "The confirmation was not visible.",
        cardId: item.id,
        notes: "Captured during the verification run.",
        packId: "pack-1",
        projectId: "hepha",
        result: "fail",
        reviewId: "review-1",
        testId: "MT-007",
      },
      path: "/api/manual-test-verification/record-fail",
    });
    expect(browserErrors).toEqual([]);
  });
});
