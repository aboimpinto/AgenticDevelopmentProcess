/**
 * Delivery Panel — Playwright journeys
 *
 * Exercises the current dashboard and delivery-status API contracts with
 * deterministic fixtures for each delivery lifecycle state.
 */

import { expect, test, type Page } from "@playwright/test";
import { installDashboardFixtures, makeWorkItem } from "./fixtures/dashboard-fixtures";

type DeliveryStatus = {
  canPrepare: boolean;
  cardKey: string;
  deliveryError: string | null;
  githubIssue: number | null;
  issueRole: "feature_issue" | "tracking" | "epic";
  mode: "direct_merge" | "pull_request";
  preparationDisabledReason: string | null;
  pullRequest: number | null;
  status: "not_applicable" | "blocked" | "ready" | "preparing" | "open" | "error";
  statusExplanation: string;
  statusLabel: string;
  targetBranch: string;
};

const feature = makeWorkItem({
  externalId: "FEAT-DELIVERY",
  folderName: "FEAT-DELIVERY-current-contract",
  id: "feat-delivery",
  title: "Delivery lifecycle fixture",
});

function deliveryStatus(overrides: Partial<DeliveryStatus> = {}): DeliveryStatus {
  return {
    canPrepare: false,
    cardKey: `hepha:${feature.stateFolder}:${feature.folderName}`,
    deliveryError: null,
    githubIssue: null,
    issueRole: "feature_issue",
    mode: "direct_merge",
    preparationDisabledReason: null,
    pullRequest: null,
    status: "not_applicable",
    statusExplanation: "Direct merge is configured for this feature.",
    statusLabel: "Direct Merge",
    targetBranch: "master",
    ...overrides,
  };
}

async function openDeliveryPanel(page: Page, status: DeliveryStatus) {
  await installDashboardFixtures(page, [feature]);
  await page.route("**/api/delivery/status?*", async (route) => {
    await route.fulfill({ contentType: "application/json", json: status });
  });
  await page.route("**/api/projects/hepha/live-activity*", async (route) => {
    await route.fulfill({ body: "event: live-activity.connected\ndata: {}\n\n", contentType: "text/event-stream", status: 200 });
  });
  await page.goto("/");
  await page.getByRole("region", { name: "MemoryBank work board" }).locator("article.feature-card").click();
  const panel = page.locator(".delivery-panel");
  await expect(panel).toBeVisible();
  return panel;
}

test.describe("Delivery Panel — Direct Merge", () => {
  test("shows Direct Merge label when no delivery section exists", async ({ page }) => {
    const panel = await openDeliveryPanel(page, deliveryStatus());

    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Direct Merge");
    await expect(panel).not.toContainText("Prepare PR");
  });
});

test.describe("Delivery Panel — Pull Request PR Blocked", () => {
  test("shows PR Blocked when prerequisites are missing", async ({ page }) => {
    const panel = await openDeliveryPanel(page, deliveryStatus({
      mode: "pull_request",
      preparationDisabledReason: "Complete implementation and required checks first.",
      status: "blocked",
      statusExplanation: "Pull-request preparation is blocked by incomplete quality gates.",
      statusLabel: "PR Blocked",
    }));

    await expect(panel).toBeVisible();
    await expect(panel.locator(".delivery-badge.blocked")).toBeVisible();
    await expect(panel.locator(".delivery-badge")).toContainText("PR Blocked");
    await expect(panel.getByRole("button", { name: "Complete implementation and required checks first." })).toBeDisabled();
  });
});

test.describe("Delivery Panel — PR Ready", () => {
  test("shows PR Ready and enables Prepare button when all gates pass", async ({ page }) => {
    const panel = await openDeliveryPanel(page, deliveryStatus({
      canPrepare: true,
      mode: "pull_request",
      status: "ready",
      statusExplanation: "All prerequisites are satisfied.",
      statusLabel: "PR Ready",
    }));

    await expect(panel.locator(".delivery-badge.ready")).toBeVisible();
    await expect(panel.locator(".delivery-badge")).toContainText("PR Ready");
    await expect(panel.getByRole("button", { name: "Prepare pull request" })).toBeEnabled();
  });
});

test.describe("Delivery Panel — PR Open", () => {
  test("shows PR Open with link to existing PR", async ({ page }) => {
    const panel = await openDeliveryPanel(page, deliveryStatus({
      mode: "pull_request",
      pullRequest: 84,
      status: "open",
      statusExplanation: "PR #84 is open for review.",
      statusLabel: "PR Open",
    }));

    await expect(panel.locator(".delivery-badge.open")).toBeVisible();
    await expect(panel.locator(".delivery-pr-link-text")).toBeVisible();
    await expect(panel.locator(".delivery-pr-link-text")).toContainText("PR #84");
  });
});

test.describe("Delivery Panel — Issue Linkage", () => {
  test("displays associated GitHub issue", async ({ page }) => {
    const panel = await openDeliveryPanel(page, deliveryStatus({ githubIssue: 46 }));
    const issueField = panel.locator(".delivery-field").filter({ hasText: "Issue:" });

    await expect(issueField).toContainText("Issue:");
    await expect(issueField.getByRole("link", { name: "#46" })).toHaveAttribute("href", /issues\/46$/);
  });
});

test.describe("Delivery Panel — Active PR-Mode Lifecycle", () => {
  test("shows explanation that FEAT remains in progress after PR creation", async ({ page }) => {
    const panel = await openDeliveryPanel(page, deliveryStatus({
      mode: "pull_request",
      pullRequest: 84,
      status: "open",
      statusExplanation: "PR #84 is open; the FEAT remains in progress until delivery completes.",
      statusLabel: "PR Open",
    }));

    await expect(panel.locator(".delivery-explanation")).toContainText("PR");
    await expect(panel.locator(".delivery-explanation")).toContainText("in progress");
  });
});
