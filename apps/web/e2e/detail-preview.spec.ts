/**
 * FEAT-055 EPIC/FEAT Detail Selection and Document Preview — Playwright Journeys
 *
 * Verifies user-visible detail selection, document preview, stale-document
 * recovery, visible error states, and accessibility controls through browser
 * network interception and deterministic API fixtures.
 *
 * @see apps/web/e2e/features/feat-055-detail-preview.feature
 */

import { test, expect } from "@playwright/test";
import { installDashboardFixtures, makeWorkItem } from "./fixtures/dashboard-fixtures";

const epic = makeWorkItem({
  externalId: "EPIC-055",
  id: "epic-055",
  kind: "epic",
  stateFolder: "00_EPICS",
  title: "EPIC-055: Detail fixture",
});
const feature = makeWorkItem({
  externalId: "FEAT-055",
  id: "feat-055",
  stateFolder: "03_IN_PROGRESS",
  title: "FEAT-055: Detail fixture",
});

test.describe("Detail Selection and Document Preview (FEAT-055)", () => {
  test.beforeEach(async ({ page }) => {
    await installDashboardFixtures(page, [epic, feature]);
    await page.goto("/");
  });

  test("opens EPIC detail blade from EPIC board", async ({ page }) => {
    // Navigate to EPIC board
    await page.getByRole("button", { name: "EPIC Board" }).click();

    // Click the EPIC card.
    await page.getByRole("region", { name: "Selected project EPIC board" }).locator("article.feature-card").first().click();

    // Verify the detail blade opens with EPIC content.
    await expect(page.locator(".detail-panel")).toBeVisible();
    await expect(page.locator("#work-item-detail-title")).toHaveText(epic.title);
  });

  test("opens FEAT detail blade from FEAT board", async ({ page }) => {
    // Navigate to FEAT board
    await page.getByRole("button", { name: "FEAT Board" }).click();

    // Click the FEAT card.
    await page.getByRole("region", { name: "Selected project FEAT board" }).locator("article.feature-card").first().click();

    // Verify the detail blade opens.
    await expect(page.locator(".detail-panel")).toBeVisible();
  });

  test("document refresh loads updated content", async ({ page }) => {
    // Select a work item to open detail
    await page.getByRole("region", { name: "MemoryBank work board" }).locator("article.feature-card").first().click();
    await expect(page.locator(".detail-panel")).toBeVisible();

    // Click reload button and verify the fixture-backed document request resolves.
    const response = page.waitForResponse("**/api/projects/hepha/work-items/*/document");
    await page.getByRole("button", { name: "Reload document from disk" }).click();
    await expect((await response).status()).toBe(200);
    await expect(page.getByText("Fixture document content.")).toBeVisible();
  });

  test("document shows missing state", async ({ page }) => {
    // Intercept document API to return missing status
    await page.route("**/api/**/document", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: "",
          readStatus: "missing",
          readError: "File not found on disk.",
        }),
      });
    });

    // Select a work item to trigger detail load
    await page.getByRole("region", { name: "MemoryBank work board" }).locator("article.feature-card").first().click();

    // Verify missing state is displayed.
    await expect(page.getByText("(missing)")).toBeVisible();
    await expect(page.getByText("File not found on disk.")).toBeVisible();
  });

  test("document shows unreadable state", async ({ page }) => {
    // Intercept document API to return unreadable status
    await page.route("**/api/**/document", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: "",
          readStatus: "unreadable",
          readError: "Permission denied.",
        }),
      });
    });

    // Select a work item
    await page.getByRole("region", { name: "MemoryBank work board" }).locator("article.feature-card").first().click();

    // Verify unreadable state is displayed.
    await expect(page.getByText("(unreadable)")).toBeVisible();
    await expect(page.getByText("Could not read the selected document")).toBeVisible();
  });

  test("detail blade closes on close button click", async ({ page }) => {
    await page.getByRole("region", { name: "MemoryBank work board" }).locator("article.feature-card").first().click();
    await expect(page.locator(".detail-panel")).toBeVisible();

    await page.getByRole("button", { name: "Close detail" }).click();
    await expect(page.locator(".detail-panel")).not.toBeVisible();
  });

  test("detail blade expands and restores", async ({ page }) => {
    await page.getByRole("region", { name: "MemoryBank work board" }).locator("article.feature-card").first().click();

    // Click expand button.
    await page.getByRole("button", { name: "Expand detail" }).click();
    await expect(page.locator(".detail-overlay-backdrop")).toBeVisible();

    // Click restore button.
    await page.getByRole("button", { name: "Restore detail blade" }).click();
    await expect(page.locator(".detail-overlay-backdrop")).not.toBeVisible();
  });
});
