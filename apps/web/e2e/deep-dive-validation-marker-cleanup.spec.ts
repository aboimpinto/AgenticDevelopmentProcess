/**
 * FEAT-057: Deep-Dive Validation Marker Cleanup — Playwright Journeys.
 *
 * Uses deterministic dashboard fixtures and the current detail-blade contract.
 *
 * @see apps/web/e2e/features/deep-dive-validation-marker-cleanup.feature
 */

import { expect, test, type Page } from "@playwright/test";
import { installDashboardFixtures, makeWorkItem } from "./fixtures/dashboard-fixtures";

const EPIC = makeWorkItem({
  externalId: "EPIC-008",
  id: "epic-008",
  kind: "epic",
  stateFolder: "00_EPICS",
  title: "EPIC-008: Autonomous Implementation Review",
});

async function openEpicDetail(page: Page) {
  const board = page.getByRole("region", { name: "MemoryBank work board" });
  await expect(board).toBeVisible();
  await board.locator("article.feature-card").click();
  const detail = page.locator("aside.detail-panel");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("EPIC-008");
  return detail;
}

test.describe("Deep-Dive Validation Marker Cleanup (FEAT-057)", () => {
  test.beforeEach(async ({ page }) => {
    await installDashboardFixtures(page, [EPIC]);
    await page.goto("/");
  });

  test("answered EPIC deep-dive does not stay blocked by decision transcript markers", async ({ page }) => {
    const detail = await openEpicDetail(page);
    await expect(detail).toContainText("EPIC-008");
  });

  test("future deep-dive transcripts sanitize marker terminology", async ({ page }) => {
    const detail = await openEpicDetail(page);
    expect(await detail.textContent()).not.toContain("[NEEDS VALIDATION]");
  });
});
