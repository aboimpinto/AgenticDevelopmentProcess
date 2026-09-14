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

test("all recorded cases show green passes without disguising unresolved coverage as completion", async ({ page }) => {
  const { detail, requests } = await installManualTestFixture(page, packStatus({ state: "current", currentPackId: "pack-passed", isReady: false,
    coverageIssues: ["AC-SAVE: Save coverage is unresolved"], passedCount: 2, manualTestCount: 2,
    manualCases: ["CASE-SAVE", "CASE-CANCEL"].map((id) => ({ id, title: "Example interaction", preconditions: ["App installed"],
      steps: ["Open example application"], expectedResult: "Expected result visible", isReviewed: true, result: "pass" as const })),
  }), { canGenerateManualTestPack: true });
  const manualResult = detail.getByRole("button", { name: "2/2 manual tests passed", exact: true });
  await expect(manualResult).toHaveCSS("color", "rgb(145, 239, 156)");
  await manualResult.click();
  const dialog = page.getByRole("dialog", { name: "Manual test verification" });
  await expect(dialog.getByText("All 2 current manual tests have recorded passes.")).toBeVisible();
  for (const id of ["CASE-SAVE", "CASE-CANCEL"]) {
    const result = dialog.getByRole("button", { name: `Passed — ${id}`, exact: true });
    await expect(result).toBeDisabled();
    await expect(result).toHaveCSS("color", "rgb(135, 235, 160)");
  }
  await expect(dialog.getByRole("button", { name: "All tests passed" })).toBeDisabled();
  await expect(dialog.getByText(/Coverage is unresolved, not a recorded test failure/)).toBeVisible();
  expect(requests).toEqual([]);
});

test("long manual packs keep collapsible content and actions accessible while scrolling", async ({ page }) => {
  const { detail, requests } = await installManualTestFixture(page, packStatus({ state: "current", currentPackId: "pack-long", isReady: false,
    coverageIssues: Array.from({ length: 14 }, (_, index) => `AC-${index}: An observable acceptance criterion still needs coverage.`),
    manualCases: [{ id: "MT-LONG", title: "Extended application qualification", preconditions: ["Example application installed"],
      steps: Array.from({ length: 30 }, (_, index) => `Open example screen ${index} and verify the visible result without changing another screen.`), expectedResult: "Expected confirmation is visible" }],
  }), { canGenerateManualTestPack: true });
  const dialog = await openManualTestDialog(page, detail);
  const coverage = dialog.locator("details").filter({ has: page.locator("summary", { hasText: "Coverage still needs attention" }) });
  await expect(coverage).not.toHaveAttribute("open", "");
  const instructions = dialog.locator("details").filter({ has: page.locator("summary", { hasText: "Prerequisites and steps" }) });
  await expect(instructions).not.toHaveAttribute("open", "");
  await expect(dialog.getByRole("button", { name: "I reviewed MT-LONG", exact: true })).toBeInViewport();
  await instructions.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(instructions).toHaveAttribute("open", "");
  const body = dialog.locator(".manual-test-dialog-body");
  await body.evaluate((element) => { element.scrollTop = 700; });
  await expect(dialog.getByRole("button", { name: "I reviewed MT-LONG", exact: true })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Regenerate test pack", exact: true })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Close manual test verification" })).toBeInViewport();
  await page.screenshot({ path: "/tmp/hepha-manual-pack-collapsible-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("button", { name: "Regenerate test pack", exact: true })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Close manual test verification" })).toBeInViewport();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/hepha-manual-pack-collapsible-mobile.png" });
  expect(requests).toEqual([]);
});

test("records a reviewed individual case while incomplete coverage keeps bulk acceptance unavailable", async ({ page }) => {
  const status = packStatus({ state: "current", currentPackId: "partial-pack", isReady: false, applicability: "incomplete", manualTestCount: 1,
    coverageIssues: ["AC-RECOVERY: Recovery remains uncovered"], manualCases: [
      { id: "MT-SAVE", title: "Save", preconditions: ["Example application is installed"], steps: ["Open Example application", "Select Save"], expectedResult: "Saved confirmation", isReviewed: false, result: null },
      { id: "MT-CANCEL", title: "Cancel", preconditions: ["Example application is installed"], steps: ["Open Example application", "Select Cancel"], expectedResult: "Cancelled confirmation", isReviewed: false, result: null },
    ] });
  const { detail, requests } = await installManualTestFixture(page, status, { canGenerateManualTestPack: true });
  await page.route("**/api/manual-test-verification/review", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ packId: "partial-pack", testId: "MT-SAVE" });
    Object.assign(status, { currentReviewId: "case-review", manualCases: status.manualCases!.map((entry) => ({ ...entry, isReviewed: entry.id === "MT-SAVE" })) });
    await route.fulfill({ json: { success: true, reviewId: "case-review", message: "Case reviewed", errors: [] } });
  });
  const dialog = await openManualTestDialog(page, detail);
  await expect(dialog.getByRole("button", { name: "All tests passed" })).toBeDisabled();
  await dialog.getByRole("button", { name: "I reviewed MT-SAVE", exact: true }).click();
  await dialog.getByRole("button", { name: "I ran MT-SAVE — passed" }).click();
  expect(requests).toEqual([expect.objectContaining({ path: "/api/manual-test-verification/record-pass", body: expect.objectContaining({ packId: "partial-pack", reviewId: "case-review", testId: "MT-SAVE" }) })]);
  await expect(dialog).toContainText("Recovery remains uncovered");
  await expect(dialog.getByRole("button", { name: "I reviewed MT-CANCEL", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "I ran MT-CANCEL — passed" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "All tests passed" })).toBeDisabled();
});

test("manual pack actions stay above long cases on desktop and narrow screens", async ({ page }, testInfo) => {
  const cases = Array.from({length: 12}, (_, i) => ({ id: `CASE-${i}`, title: "Example interaction", preconditions: ["App installed"],
    steps: ["Open example app"], expectedResult: "Expected state", isReviewed: false }));
  const { detail } = await installManualTestFixture(page, packStatus({ state: "stale", isStale: true, currentPackId: "old-pack", message: "This verification pack is outdated. Regenerate and review the current cases.", manualCases: cases,
    authoringProgress: { state: "paused", completedBatches: 0, totalBatches: 6, proposedCases: 0, message: "Incomplete generation" } }), {canGenerateManualTestPack:true});
  const dialog = await openManualTestDialog(page, detail);
  for (const width of [1100, 390]) {
    await page.setViewportSize({width, height: 800});
    const toolbar = dialog.getByRole("region", {name:"Pack actions"});
    await expect(toolbar.getByRole("button", {name:"All tests passed"})).toBeVisible();
    await expect(toolbar.getByRole("button", {name:"All tests passed"})).toBeDisabled();
    const before = await toolbar.boundingBox();
    await dialog.locator(".manual-test-dialog-body").evaluate(el => { el.scrollTop = el.scrollHeight; });
    const after = await toolbar.boundingBox();
    expect(after?.y).toBe(before?.y);
    expect(after!.y + after!.height).toBeLessThan(800);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`manual-actions-${width}.png`)});
  }
});

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
    isReady: true,
    applicability: "applicable",
    manualTestCount: 1,
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
  test("current incomplete pack can be regenerated without passing or approving tests", async ({ page }) => {
    const status = packStatus({
      currentPackId: "pack-current", currentVersion: "v1", state: "current", hasMarkdown: true,
      isReviewed: true, isReady: false, applicability: "incomplete", manualTestCount: 2,
      message: "Acceptance coverage is incomplete.",
    });
    const { detail, requests } = await installManualTestFixture(page, status, { canGenerateManualTestPack: true });
    await page.route("**/api/manual-test-verification/generate", async (route) => {
      requests.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      Object.assign(status, { currentPackId: "pack-new", currentVersion: "v2", isReady: true, isReviewed: false,
        currentReviewId: null, manualTestCount: 3, applicability: "applicable", message: "Three executable tests are ready for review." });
      await route.fulfill({ json: { success: true, message: "Pack rebuilt; review the new version.", errors: [] } });
    });
    const dialog = await openManualTestDialog(page, detail);
    await expect(dialog).toContainText("Missing manual scenarios are assessed automatically");
    await expect(dialog.getByRole("button", { name: "All tests passed" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Regenerate test pack" }).click();
    expect(requests).toEqual([{ path: "/api/manual-test-verification/generate", body: {
      projectId: "hepha", cardId: "feat-test", packId: "pack-current",
    } }]);
    await expect(dialog.getByRole("button", { name: "I reviewed this pack" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "All tests passed" })).toBeDisabled();
    await page.route("**/api/manual-test-verification/review", async (route) => {
      expect(route.request().postDataJSON().packId).toBe("pack-new");
      Object.assign(status, { isReviewed: true, currentReviewId: "review-new" });
      await route.fulfill({ json: { success: true, message: "New pack reviewed", reviewId: "review-new", errors: [] } });
    });
    await dialog.getByRole("button", { name: "I reviewed this pack" }).click();
    await expect(dialog.getByRole("button", { name: "All tests passed" })).toBeEnabled();
  });

  test("regeneration forwards optional human steering without granting approval", async ({ page }) => {
    const { detail, requests } = await installManualTestFixture(page, packStatus({ currentPackId: "pack-current", state: "current", isReady: false }),
      { canGenerateManualTestPack: true });
    await page.route("**/api/manual-test-verification/generate", async (route) => {
      requests.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      await route.fulfill({ json: { success: true, message: "Draft prepared for review", errors: [] } });
    });
    const dialog = await openManualTestDialog(page, detail);
    await dialog.getByText("Regeneration guidance (optional)", { exact: true }).click();
    await dialog.getByRole("textbox", { name: "What is missing? (optional)" }).fill("  Include keyboard access and error recovery.  ");
    await dialog.getByRole("button", { name: "Regenerate test pack" }).click();
    expect(requests).toEqual([{ path: "/api/manual-test-verification/generate", body: {
      cardId: "feat-test", projectId: "hepha", packId: "pack-current", guidance: "Include keyboard access and error recovery.",
    } }]);
  });
  test("no pack generated — shows generate button", async ({ page }) => {
    const { browserErrors, detail } = await installManualTestFixture(
      page,
      packStatus(),
      { canGenerateManualTestPack: true },
    );
    const order = await detail.evaluate(element => {
      const review = element.querySelector('[data-workflow-controls="Human Checkpoint"]')!;
      const manual = element.querySelector('section[aria-label="Manual test verification"]')!;
      const readiness = element.querySelector('[data-completion-readiness]')!;
      return [!!(review.compareDocumentPosition(manual) & Node.DOCUMENT_POSITION_FOLLOWING),
        !!(manual.compareDocumentPosition(readiness) & Node.DOCUMENT_POSITION_FOLLOWING)];
    });
    expect(order).toEqual([true, true]);
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
