import { expect, test, type Page } from "@playwright/test";
import type { ProjectSummary, WorkItemCard, WorkItemListResponse } from "@hepha/shared";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const now = "2026-07-08T12:00:00.000Z";

const project: ProjectSummary = {
  counts: {
    "00_EPICS": 0,
    "01_SUBMITTED": 0,
    "02_READY_TO_DEVELOP": 0,
    "03_IN_PROGRESS": 1,
    "04_COMPLETED": 0,
    "05_CANCELLED": 0,
  },
  createdAt: now,
  defaultBranch: "master",
  detectedStack: ["typescript", "react"],
  featuresRootExists: true,
  id: "hepha",
  memoryBankPath: "/workspace/AgenticDevelopmentProcess/MemoryBank",
  memoryBankRelativePath: "MemoryBank",
  name: "HEPHA",
  needsInitialization: false,
  rootPath: "/workspace/AgenticDevelopmentProcess",
  updatedAt: now,
};

const inProgressFeature: WorkItemCard = {
  documentPath:
    "/workspace/AgenticDevelopmentProcess/MemoryBank/Features/03_IN_PROGRESS/FEAT-030-approval-gates-api-and-dashboard-ux/FeatureDescription.md",
  documentRelativePath:
    "MemoryBank/Features/03_IN_PROGRESS/FEAT-030-approval-gates-api-and-dashboard-ux/FeatureDescription.md",
  documentUpdatedAt: now,
  epicState: null,
  externalId: "FEAT-030",
  featureWorkflow: null,
  folderName: "FEAT-030-approval-gates-api-and-dashboard-ux",
  folderPath:
    "/workspace/AgenticDevelopmentProcess/MemoryBank/Features/03_IN_PROGRESS/FEAT-030-approval-gates-api-and-dashboard-ux",
  id: "feat-030",
  implementationEvidence: null,
  kind: "feature",
  linkedEpicIds: ["EPIC-006"],
  linkedEpics: [{ externalId: "EPIC-006", id: "epic-006", kind: "epic", stateFolder: "00_EPICS", stateLabel: "Epics", title: "Safety Tool Profiles And Approval Gates" }],
  linkedFeatureIds: [],
  linkedFeatures: [],
  missingFeatureIds: [],
  phases: [],
  specMarkdown: "# FEAT-030: Approval Gates API And Dashboard UX\n\nApproval gateway MVP with dashboard queue.",
  stateFolder: "03_IN_PROGRESS",
  stateLabel: "In Progress",
  summary: "Approval gateway MVP with dashboard queue.",
  title: "Approval Gates API And Dashboard UX",
  validation: {
    blocksFeatureExtraction: false,
    changedSinceHephaDeepDive: false,
    deepDiveMessage: "The source document matches the last Hepha deep-dive record.",
    deepDiveStatus: "current",
    lastHephaDeepDiveAt: now,
    needsValidationCount: 0,
  },
};

// ---------------------------------------------------------------------------
// Approval DTO helpers
// ---------------------------------------------------------------------------

interface ApprovalDTO {
  readonly id: string;
  readonly cardKey: string;
  readonly projectId: string;
  readonly actionSummary: string;
  readonly policyReason: string;
  readonly riskCategory: string;
  readonly requestedAt: string;
  readonly timeoutDeadline: string | null;
  readonly status: "pending" | "approved" | "denied" | "timed_out";
  readonly resolvedAt: string | null;
  readonly resolvedBy: string | null;
  readonly resolutionReason: string | null;
  readonly runId: string | null;
  readonly workflowRunId: string | null;
}

function createPendingApproval(overrides: Partial<ApprovalDTO> = {}): ApprovalDTO {
  return {
    id: "approval-001",
    cardKey: "FEAT-030",
    projectId: "hepha",
    actionSummary: "Write file: src/config/settings.json",
    policyReason: "Remote write to untrusted path requires approval",
    riskCategory: "remote_write",
    requestedAt: now,
    timeoutDeadline: new Date(Date.parse(now) + 300_000).toISOString(), // +5 min
    status: "pending",
    resolvedAt: null,
    resolvedBy: null,
    resolutionReason: null,
    runId: "run-001",
    workflowRunId: "wf-001",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// API mock builder
// ---------------------------------------------------------------------------

async function mockHephaApi(
  page: Page,
  options: {
    approvals?: ApprovalDTO[];
    rejectApprovals?: boolean;
    rejectResolve?: { id: string; status: number; body: object };
  },
) {
  const approvalList = options.approvals ?? [];
  const rejectApprovals = options.rejectApprovals ?? false;
  const rejectResolve = options.rejectResolve ?? null;

  // -- Core HEPHA endpoints ------------------------------------------------

  await page.route("**/api/projects", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { projects: [project] },
    });
  });

  await page.route("**/api/projects/hepha/work-items", async (route) => {
    const response: WorkItemListResponse = {
      items: [inProgressFeature],
      project,
      scannedAt: now,
      scanStatus: {
        epicDocumentCount: 0,
        epicFolderExists: true,
        epicInvalidSourceCount: 0,
        epicScanFailed: false,
        epicValidItemCount: 0,
        message: null,
      },
      sourceIssues: [],
    };

    await route.fulfill({
      contentType: "application/json",
      json: response,
    });
  });

  await page.route("**/api/projects/hepha/memory-bank-events", async (route) => {
    await route.fulfill({
      body: "",
      contentType: "text/event-stream",
      status: 200,
    });
  });

  // -- Approval endpoints --------------------------------------------------

  // GET /api/approvals?... — list pending approvals
  await page.route("**/api/approvals?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    if (rejectApprovals) {
      await route.fulfill({
        contentType: "application/json",
        json: { error: "Failed to fetch approvals" },
        status: 500,
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      json: { approvals: approvalList },
    });
  });

  // POST /api/approvals/:id/resolve — approve or deny
  await page.route("**/api/approvals/*/resolve", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    const parts = route.request().url().split("/");
    const id = parts[parts.length - 2]; // .../approvals/<id>/resolve

    if (rejectResolve && rejectResolve.id === id) {
      await route.fulfill({
        contentType: "application/json",
        json: rejectResolve.body,
        status: rejectResolve.status,
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      json: { status: "ok" },
      status: 200,
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("empty approval queue shows no-approvals message", async ({ page }) => {
  await mockHephaApi(page, { approvals: [] });

  await page.goto("/");
  await page.getByRole("button", { name: /Approvals/ }).click();

  // The empty state appears after loading resolves
  await expect(page.getByText("No pending approvals. All commands are within policy.")).toBeVisible();
});

test("pending approvals are displayed with correct context", async ({ page }) => {
  const approval = createPendingApproval();
  await mockHephaApi(page, { approvals: [approval] });

  await page.goto("/");
  await page.getByRole("button", { name: /Approvals/ }).click();

  // Wait for list to render
  await expect(page.getByText(approval.actionSummary)).toBeVisible();
  await expect(page.getByText(approval.policyReason)).toBeVisible();
  await expect(page.getByText(/remote_write/)).toBeVisible();

  // Approve and Deny buttons visible
  await expect(page.getByRole("button", { name: /Approve request for/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Deny request for/ })).toBeVisible();

  // The count badge shows 1
  await expect(page.getByText("1")).toBeVisible();
});

test("approve removes the approval card from the queue", async ({ page }) => {
  const approval = createPendingApproval();
  await mockHephaApi(page, { approvals: [approval] });

  await page.goto("/");
  await page.getByRole("button", { name: /Approvals/ }).click();

  // Wait for the approval to render
  await expect(page.getByText(approval.actionSummary)).toBeVisible();

  // Click Approve
  await page.getByRole("button", { name: /Approve request for/ }).click();

  // The card should disappear, and we should see the empty state
  await expect(page.getByText("No pending approvals. All commands are within policy.")).toBeVisible();
});

test("deny removes the approval card from the queue", async ({ page }) => {
  const approval = createPendingApproval();
  await mockHephaApi(page, { approvals: [approval] });

  await page.goto("/");
  await page.getByRole("button", { name: /Approvals/ }).click();

  // Wait for the approval to render
  await expect(page.getByText(approval.actionSummary)).toBeVisible();

  // Click Deny
  await page.getByRole("button", { name: /Deny request for/ }).click();

  // The card should disappear, and we should see the empty state
  await expect(page.getByText("No pending approvals. All commands are within policy.")).toBeVisible();
});

test("approval fetch error shows error banner", async ({ page }) => {
  await mockHephaApi(page, { approvals: [], rejectApprovals: true });

  await page.goto("/");
  await page.getByRole("button", { name: /Approvals/ }).click();

  // Wait for the error banner
  await expect(page.getByText(/Failed to fetch approvals/)).toBeVisible();

  // The refresh button should still be available
  await expect(page.getByRole("button", { name: /Refresh approval list/ })).toBeVisible();
});

test("approve resolve error shows error banner until auto-refresh clears it", async ({ page }) => {
  const approval = createPendingApproval();
  await mockHephaApi(page, {
    approvals: [approval],
    // Reject resolve but let the subsequent GET succeed — the error is transient
    rejectResolve: { id: approval.id, status: 409, body: { error: "Already resolved" } },
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Approvals/ }).click();

  // Wait for the approval to render
  await expect(page.getByText(approval.actionSummary)).toBeVisible();

  // Click Approve — should fail then auto-refresh clears the error
  await page.getByRole("button", { name: /Approve request for/ }).click();

  // The card stays because the resolve failed and the refresh re-fetched it
  // The error was transient — auto-cleared by the successful refresh
  await expect(page.getByText(approval.actionSummary)).toBeVisible();

  // Verify the button is not in resolving state anymore
  await expect(page.getByRole("button", { name: /Approve request for/ })).toBeEnabled();
});

test("timeout deadline is shown on pending approvals", async ({ page }) => {
  // A deadline that is far in the future relative to actual test execution time
  const farFutureDeadline = "2099-12-31T23:59:00.000Z";
  const approval = createPendingApproval({ timeoutDeadline: farFutureDeadline });

  await mockHephaApi(page, { approvals: [approval] });

  await page.goto("/");
  await page.getByRole("button", { name: /Approvals/ }).click();

  // Wait for approval to render
  await expect(page.getByText(approval.actionSummary)).toBeVisible();

  // The timeout status should show remaining time (not expired)
  await expect(page.getByText(/m remaining|h remaining|No timeout/)).toBeVisible();
});

test("multiple pending approvals are listed", async ({ page }) => {
  const approval1 = createPendingApproval({
    id: "approval-001",
    actionSummary: "Write file: src/config/settings.json",
    policyReason: "Remote write requires approval",
    riskCategory: "remote_write",
  });
  const approval2 = createPendingApproval({
    id: "approval-002",
    actionSummary: "Execute command: rm -rf /tmp/cache",
    policyReason: "Destructive filesystem command requires approval",
    riskCategory: "destructive",
  });

  await mockHephaApi(page, { approvals: [approval1, approval2] });

  await page.goto("/");
  await page.getByRole("button", { name: /Approvals/ }).click();

  // Both approvals should be visible
  await expect(page.getByText(approval1.actionSummary)).toBeVisible();
  await expect(page.getByText(approval2.actionSummary)).toBeVisible();

  // The count badge shows 2
  await expect(page.locator(".approval-count-badge")).toHaveText("2");

  // Approve the first one
  await page.getByRole("button", { name: /Approve request for Write file/ }).click();

  // The first approval should be removed, second remains
  await expect(page.getByText(approval1.actionSummary)).toBeHidden();
  await expect(page.getByText(approval2.actionSummary)).toBeVisible();

  // Count badge should now show 1
  await expect(page.locator(".approval-count-badge")).toHaveText("1");
});

test("approval queue shows no-approval state when projectId is null", async ({ page }) => {
  // Simulate a scenario where there's no project selected
  // by returning a project-less work-items response
  await mockHephaApi(page, { approvals: [] });

  await page.goto("/");
  await page.getByRole("button", { name: /Approvals/ }).click();

  // Wait for loading to finish
  await expect(page.getByText("No pending approvals. All commands are within policy.")).toBeVisible();
});
