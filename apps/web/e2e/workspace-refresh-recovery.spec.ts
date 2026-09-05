import { expect, test, type Page } from "@playwright/test";
import type { ProjectSummary, WorkItemListResponse } from "@hepha/shared";

declare global {
  interface Window {
    __liveActivityStreams?: { closed: number; created: number };
  }
}

const now = "2026-07-10T08:00:00.000Z";

const project: ProjectSummary = {
  id: "hepha",
  name: "HEPHA",
  rootPath: "/workspace/AgenticDevelopmentProcess",
  memoryBankPath: "/workspace/AgenticDevelopmentProcess/MemoryBank",
  memoryBankRelativePath: "MemoryBank",
  defaultBranch: "master",
  detectedStack: ["typescript", "react"],
  featuresRootExists: true,
  needsInitialization: false,
  counts: {
    "00_EPICS": 0, "01_SUBMITTED": 0, "02_READY_TO_DEVELOP": 0,
    "03_IN_PROGRESS": 0, "04_COMPLETED": 0, "05_CANCELLED": 0,
  },
  createdAt: now,
  updatedAt: now,
};

async function mockDashboardApi(page: Page) {
  await page.route("**/api/projects", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { projects: [project] } });
  });

  await page.route("**/api/projects/hepha/work-items", async (route) => {
    const response: WorkItemListResponse = {
      items: [],
      project,
    };
    await route.fulfill({ contentType: "application/json", json: response });
  });
}

test.describe("Workspace refresh failure and recovery", () => {
  test("shows accessible error on refresh failure and recovers after success", async ({ page }) => {
    // Given a project dashboard with loaded projects and work items
    await mockDashboardApi(page);
    await page.goto("/");

    // Wait until the initial project selection has loaded its work board.
    await expect(page.getByRole("region", { name: "MemoryBank work board" })).toBeVisible();

    // Rescan refreshes projects as well as selected-project work items.
    await page.unroute("**/api/projects");
    await page.unroute("**/api/projects/hepha/work-items");
    let refreshAttempts = 0;
    await page.route("**/api/projects", async (route) => {
      refreshAttempts++;
      if (refreshAttempts === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          json: { error: "Failed to refresh projects" },
        });
        return;
      }
      await route.fulfill({ contentType: "application/json", json: { projects: [project] } });
    });

    let workItemRefreshAttempts = 0;
    await page.route("**/api/projects/hepha/work-items", async (route) => {
      workItemRefreshAttempts++;
      if (workItemRefreshAttempts === 1) {
        await route.fulfill({ status: 500, contentType: "application/json", json: { error: "Failed to refresh work items" } });
        return;
      }
      await route.fulfill({ contentType: "application/json", json: { items: [], project } });
    });

    const refreshButton = page.getByRole("button", { name: "Rescan" });
    const failedRefresh = page.waitForResponse((response) => response.url().endsWith("/api/projects") && response.status() === 500);
    await refreshButton.click();
    await failedRefresh;

    const errorBanner = page.locator(".connection-banner");
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText("Failed to refresh work items");

    const recoveredRefresh = page.waitForResponse((response) => response.url().endsWith("/api/projects") && response.status() === 200);
    await refreshButton.click();
    await recoveredRefresh;
    await expect(errorBanner).not.toBeVisible();
  });
});
