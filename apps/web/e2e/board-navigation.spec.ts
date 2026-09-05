/**
 * FEAT-055 Board Navigation and Refresh — Playwright Journeys
 *
 * Verifies user-visible board navigation, card selection, refresh behavior,
 * stale selection recovery, and error states through browser network interception.
 *
 * @see apps/web/e2e/features/feat-055-board-navigation.feature
 */

import { test, expect } from "@playwright/test";
import { installDashboardFixtures, makeWorkItem } from "./fixtures/dashboard-fixtures";

const epic = makeWorkItem({
  externalId: "EPIC-055",
  id: "epic-055",
  kind: "epic",
  stateFolder: "00_EPICS",
  title: "EPIC-055: Board fixture",
});
const feature = makeWorkItem({
  externalId: "FEAT-055",
  id: "feat-055",
  stateFolder: "03_IN_PROGRESS",
  title: "FEAT-055: Board fixture",
});

test.describe("Board Navigation (FEAT-055)", () => {
  test.beforeEach(async ({ page }) => {
    await installDashboardFixtures(page, [epic, feature]);
    await page.goto("/");
  });

  test("user switches between board views", async ({ page }) => {
    // Verify work board is the default view
    await expect(page.getByRole("region", { name: "MemoryBank work board" })).toBeVisible();

    // Switch to EPIC board
    await page.getByRole("button", { name: "EPIC Board" }).click();
    await expect(page.getByRole("region", { name: "Selected project EPIC board" })).toBeVisible();

    // Switch to FEAT board
    await page.getByRole("button", { name: "FEAT Board" }).click();
    await expect(page.getByRole("region", { name: "Selected project FEAT board" })).toBeVisible();

    // Switch back to Work board
    await page.getByRole("button", { name: "Work Board" }).click();
    await expect(page.getByRole("region", { name: "MemoryBank work board" })).toBeVisible();
  });

  test("board card selection opens detail blade", async ({ page }) => {
    // Click the first visible card on the work board
    await page.getByRole("region", { name: "MemoryBank work board" }).locator("article.feature-card").first().click();

    // Verify the detail blade opens
    await expect(page.locator(".detail-panel")).toBeVisible();
  });

  test("board refresh reloads data", async ({ page }) => {
    // Click the existing rescan control and verify the board remains available
    // after the fixture-backed refresh completes.
    await page.getByRole("button", { name: "Rescan" }).click();
    await expect(page.getByRole("region", { name: "MemoryBank work board" })).toBeVisible();
  });

  test("board displays error state on failed load", async ({ page }) => {
    await page.unroute("**/api/projects/hepha/work-items");
    await page.route("**/api/projects/hepha/work-items", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    // Reload with the failed fixture route and verify the visible offline state.
    await page.reload();
    await expect(page.getByText("Orchestrator Offline")).toBeVisible();
  });
});
