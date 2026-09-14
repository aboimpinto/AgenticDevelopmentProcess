/**
 * FEAT-057: Workflow Interactions — Playwright Journeys
 *
 * Uses the current dashboard API contracts so every journey selects a real FEAT
 * card and renders its detail blade before exercising workflow controls.
 *
 * @see apps/web/e2e/features/workflow-interactions.feature
 */

import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanFeaturePhaseQualityGates } from "../../orchestrator/src/memorybank/phase-quality-projection.js";
import type {
  FeatureWorkflowSummary,
  ManualTestPackDashboardStatus,
  ProjectSummary,
  WorkItemCard,
  WorkItemListResponse,
} from "@hepha/shared";

const NOW = "2026-07-11T10:00:00.000Z";

const PROJECT: ProjectSummary = {
  counts: {
    "00_EPICS": 0,
    "01_SUBMITTED": 0,
    "02_READY_TO_DEVELOP": 0,
    "03_IN_PROGRESS": 1,
    "04_COMPLETED": 0,
    "05_CANCELLED": 0,
  },
  createdAt: NOW,
  defaultBranch: "master",
  detectedStack: ["typescript", "react"],
  featuresRootExists: true,
  id: "hepha",
  memoryBankPath: "/workspace/AgenticDevelopmentProcess/MemoryBank",
  memoryBankRelativePath: "MemoryBank",
  name: "Hepha",
  needsInitialization: false,
  rootPath: "/workspace/AgenticDevelopmentProcess",
  updatedAt: NOW,
};

function makeWorkflow(overrides: Partial<FeatureWorkflowSummary> = {}): FeatureWorkflowSummary {
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
    canStartImplementing: true,
    canSubmitFinding: false,
    defaultImplementationModel: "deepseek-v4-flash",
    designCompletedAt: NOW,
    findings: [],
    hasDesignArtifacts: true,
    hasRefinementArtifacts: true,
    implementationCompleted: false,
    implementationPhases: [],
    implementationTasks: [],
    lastRun: {
      command: "continue-implementing",
      completedAt: NOW,
      currentNodeId: null,
      currentStep: null,
      error: null,
      runId: "run-2",
      startedAt: NOW,
      status: "completed",
      summary: "Phase 2 completed",
      workflowProgress: null,
    },
    manualTestPackStatus: null,
    manualTestsCompletedAt: null,
    readiness: { ready: true, reasons: [] },
    refineCompletedAt: NOW,
    uiRequirementCheckedAt: NOW,
    uiRequirementDecision: "no_ui",
    uiRequirementReason: "The workflow panel does not require a separate UI design artifact.",
    userCodeReviewCompletedAt: null,
    workflowMessage: "Implementation can continue from the next numbered phase.",
    workflowPosition: null,
    ...overrides,
  };
}

function makeFeature(
  workflowOverrides: Partial<FeatureWorkflowSummary> = {},
  itemOverrides: Partial<WorkItemCard> = {},
): WorkItemCard {
  const activePhaseNumber = workflowOverrides.implementationPhases?.find(
    (phase) => phase.status === "implementing" || phase.status === "code_review",
  )?.phaseNumber;
  const phases = Array.from({ length: 6 }, (_, index) => {
    const number = index + 1;
    return {
      defaultImplementationModel: "deepseek-v4-flash",
      documentPath: `/workspace/MemoryBank/Features/FEAT-056/Phases/phase-${number}.md`,
      documentRelativePath: `MemoryBank/Features/FEAT-056/Phases/phase-${number}.md`,
      estimatedAiTime: null,
      estimatedHumanTime: null,
      fileName: `phase-${number}.md`,
      number,
      predictedModel: "deepseek-v4-flash",
      predictedModelSource: "feature_default" as const,
      recommendedAgent: "implementation",
      recommendedModel: "deepseek-v4-flash",
      status: number === activePhaseNumber ? "in_progress" : number <= 2 ? "completed" : "pending",
      title: `Phase ${number}`,
      updatedAt: NOW,
    };
  });

  return {
    documentPath: "/workspace/MemoryBank/Features/FEAT-056/FeatureDescription.md",
    documentRelativePath: "MemoryBank/Features/FEAT-056/FeatureDescription.md",
    documentUpdatedAt: NOW,
    epicRefinements: [],
    epicState: null,
    externalId: "FEAT-056",
    featureWorkflow: makeWorkflow(workflowOverrides),
    folderName: "FEAT-056-workflow-interactions",
    folderPath: "/workspace/MemoryBank/Features/03_IN_PROGRESS/FEAT-056-workflow-interactions",
    id: "feat-056-test",
    implementationEvidence: {
      changedFiles: [
        {
          path: "/workspace/MemoryBank/Features/FEAT-056/planning-analysis-report.md",
          relativePath: "MemoryBank/Features/FEAT-056/planning-analysis-report.md",
          phases: [],
          reviewReportPaths: [],
          sources: ["planning-artifact"],
        },
      ],
      codeReviews: [],
      phaseQualityGates: phases.map((phase) => ({
        changedFiles: [],
        codeFiles: [],
        documentationFiles: [],
        gates: [
          { evidencePaths: [], gate: "tests" as const, justification: null, status: "satisfied" as const },
          { evidencePaths: [], gate: "gherkin_e2e" as const, justification: null, status: "satisfied" as const },
          { evidencePaths: [], gate: "code_review" as const, justification: null, status: "satisfied" as const },
        ],
        phaseNumber: phase.number,
        phaseStatus: phase.status,
        phaseTitle: phase.title,
        testFiles: [],
        warnings: [],
      })),
    },
    kind: "feature",
    linkedEpicIds: [],
    linkedEpics: [],
    linkedFeatureIds: [],
    linkedFeatures: [],
    missingFeatureIds: [],
    phases,
    specMarkdown: "# FEAT-056: Workflow Interactions",
    stateFolder: "03_IN_PROGRESS",
    stateLabel: "In Progress",
    summary: "Workflow interaction controls and quality gates.",
    title: "Workflow Interactions",
    validation: {
      blocksFeatureExtraction: false,
      changedSinceHephaDeepDive: false,
      deepDiveMessage: "The Deep-Dive is current.",
      deepDiveStatus: "current",
      lastHephaDeepDiveAt: NOW,
      needsValidationCount: 0,
    },
    ...itemOverrides,
  };
}

function manualTestStatus(overrides: Partial<ManualTestPackDashboardStatus> = {}): ManualTestPackDashboardStatus {
  return {
    currentPackId: "pack-056",
    currentReviewId: "review-056",
    currentVersion: "v1",
    failedCount: 0,
    hasMarkdown: true,
    hasPdf: false,
    hasResults: false,
    isReviewed: true,
    isReady: true,
    isStale: false,
    message: "Manual test pack is ready for result recording.",
    passedCount: 0,
    state: "current",
    ...overrides,
  };
}

type RecordedRequest = { body: unknown; path: string };

async function installFixture(page: Page, item: WorkItemCard, packStatus = manualTestStatus()) {
  const browserErrors: string[] = [];
  const requests: RecordedRequest[] = [];
  const workItemsResponse: WorkItemListResponse = {
    items: [item],
    project: PROJECT,
    scannedAt: NOW,
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

  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });

  // The fallback makes unmocked API traffic an explicit test failure rather
  // than silently proxying to a local orchestrator.
  await page.route("**/api/**", async (route) => {
    requests.push({ body: null, path: new URL(route.request().url()).pathname });
    await route.fulfill({
      body: JSON.stringify({ error: `Unexpected API request: ${route.request().method()} ${route.request().url()}` }),
      contentType: "application/json",
      status: 500,
    });
  });
  await page.route("**/api/projects", async (route) => {
    await route.fulfill({ body: JSON.stringify({ projects: [PROJECT] }), contentType: "application/json", status: 200 });
  });
  await page.route("**/api/projects/hepha/work-items", async (route) => {
    await route.fulfill({ body: JSON.stringify(workItemsResponse), contentType: "application/json", status: 200 });
  });
  await page.route("**/api/projects/hepha/completion-readiness", async route => {
    requests.push({ body: route.request().postDataJSON(), path: new URL(route.request().url()).pathname });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [item], assessment: item.completionRecovery, message: "Current evidence reassessed; human acceptance remains explicit." }) });
  });
  await page.route("**/api/projects/hepha/work-items/feat-056-test/document", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        cardId: item.id,
        content: item.specMarkdown,
        documentPath: item.documentPath,
        documentRelativePath: item.documentRelativePath,
        documentUpdatedAt: item.documentUpdatedAt,
        externalId: item.externalId,
        folderName: item.folderName,
        kind: item.kind,
        readError: null,
        readStatus: "ok",
        stateFolder: item.stateFolder,
        stateLabel: item.stateLabel,
        title: item.title,
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/projects/hepha/memory-bank-events", async (route) => {
    await route.fulfill({ body: ": connected\n\n", contentType: "text/event-stream", status: 200 });
  });
  await page.route("**/api/projects/hepha/live-activity*", async (route) => {
    await route.fulfill({ body: "event: live-activity.connected\ndata: {}\n\n", contentType: "text/event-stream", status: 200 });
  });
  await page.route("**/api/projects/hepha/features/**/runtime-evidence", async (route) => {
    const encodedCardKey = new URL(route.request().url()).pathname.match(/\/features\/([^/]+)\/runtime-evidence$/u)?.[1];
    await route.fulfill({
      contentType: "application/json",
      json: {
        schemaVersion: "runtime-execution/v1",
        projectId: PROJECT.id,
        cardKey: encodedCardKey ? decodeURIComponent(encodedCardKey) : "feature:FEAT-056",
        phases: [],
      },
    });
  });

  const recordWorkflowAction = async (route: Route) => {
    requests.push({ body: route.request().postDataJSON(), path: new URL(route.request().url()).pathname });
    await route.fulfill({
      body: JSON.stringify({ filesChanged: [], filesCreated: [], items: [item], project: PROJECT, summary: "Workflow action recorded." }),
      contentType: "application/json",
      status: 200,
    });
  };

  await page.route("**/api/design-feature", recordWorkflowAction);
  await page.route("**/api/refine-feature", recordWorkflowAction);
  await page.route("**/api/start-implementing", recordWorkflowAction);
  await page.route("**/api/continue-implementing", recordWorkflowAction);
  await page.route("**/api/complete-feature", recordWorkflowAction);
  await page.route("**/api/phase-quality/resolve", recordWorkflowAction);
  await page.route("**/api/feature-human-review", recordWorkflowAction);
  await page.route("**/api/feature-findings", recordWorkflowAction);
  await page.route("**/api/delivery/status?*", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        canPrepare: false,
        cardKey: `hepha:${item.stateFolder}:${item.folderName}`,
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
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/manual-test-verification/status?*", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ success: true, status: packStatus, summary: packStatus.message }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/manual-test-verification/record-pass", async (route) => {
    requests.push({ body: route.request().postDataJSON(), path: new URL(route.request().url()).pathname });
    await route.fulfill({
      body: JSON.stringify({ errors: [], message: "All manual tests recorded.", resultId: "result-056", success: true }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/");
  return { browserErrors, requests };
}

async function openFeatureDetail(page: Page) {
  await page.getByRole("button", { name: /FEAT-056.*Workflow Interactions/ }).click();
  const detail = page.locator("aside.detail-panel");
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("heading", { level: 2, name: "Workflow Interactions" })).toBeVisible();
  return detail;
}

function expectNoBrowserErrors(browserErrors: readonly string[]) {
  expect(browserErrors).toEqual([]);
}

test.describe("Workflow Interactions (FEAT-057 / FEAT-056)", () => {
  test("Existing refresh validates approved coverage without repeating human verification", async ({ page }) => {
    const item = makeFeature({ implementationCompleted: true, canStartImplementing: false,
      readiness: { ready: true, reasons: [] }, userCodeReviewCompletedAt: NOW, manualTestsCompletedAt: NOW });
    item.phases.forEach(phase => { phase.status = "completed"; });
    const { requests, browserErrors } = await installFixture(page, item);
    await page.route("**/api/projects/hepha/completion-readiness", async route => {
      const body = route.request().postDataJSON();
      requests.push({ body, path: "/api/projects/hepha/completion-readiness" });
      item.completionRecovery = { assessedAt: NOW, ready: true, verifiedCriterionCount: 1, blockers: [], phaseGaps: [] };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [item], assessment: item.completionRecovery,
        message: "Current evidence satisfies completion readiness." }) });
    });
    const detail = await openFeatureDetail(page);
    const readiness = detail.getByRole("region", { name: "Complete Feature readiness" });
    await readiness.getByRole("button", { name: "Refresh Completion Readiness" }).click();
    await expect(readiness.getByText("1 accepted criteria verified against the feature plan.")).toBeVisible();
    await expect(detail.getByRole("button", { name: "I confirm these evidence links cover the listed criteria" })).toHaveCount(0);
    await expect(readiness.getByRole("button", { name: "Complete Feature", exact: true })).toBeEnabled();
    expect(item.featureWorkflow!.userCodeReviewCompletedAt).toBe(NOW);
    expect(item.featureWorkflow!.manualTestsCompletedAt).toBe(NOW);
    expect(requests.filter(request => ["/api/complete-feature", "/api/feature-human-review", "/api/manual-tests/record-pass"].includes(request.path))).toEqual([]);
    expect(requests.filter(request => request.path === "/api/projects/hepha/completion-readiness").map(request => request.body)).toEqual([
      { cardId: item.id, reassess: true, verifyExisting: true },
    ]);
    expectNoBrowserErrors(browserErrors);
  });

  test("Phase-owned recovery dispatches a real repair without a finding or automatic completion", async ({ page }) => {
    const item = makeFeature({ implementationCompleted: true, canStartImplementing: false,
      readiness: { ready: true, reasons: [] }, userCodeReviewCompletedAt: NOW, manualTestsCompletedAt: NOW });
    item.phases.forEach(phase => { phase.status = "completed"; });
    item.completionRecovery = { ready: false, assessedAt: NOW,
      blockers: [{ id: "phase-recovery-1", phaseNumber: 1, action: "phase", actionLabel: "Fix Phase 1 quality gaps", message: "1 quality gap in Phase 1" }],
      phaseGaps: [{ id: "phase-1-acceptance_coverage", phaseNumber: 1, phaseTitle: item.phases.find(phase => phase.number === 1)!.title,
        kind: "acceptance_coverage", title: "Acceptance coverage and test evidence", details: Array.from({ length: 14 }, (_, i) => `AC-${i + 1}: Missing evidence link`),
        sourceIds: Array.from({ length: 14 }, (_, i) => `AC-${i + 1}`), instruction: "Inspect existing reports first." }] };
    const { requests, browserErrors } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);
    const readiness = detail.getByRole("region", { name: "Complete Feature readiness" });
    await expect(readiness.getByText(/Missing evidence link/)).toHaveCount(0);
    const phase = detail.getByRole("region", { name: "Phase 1 completion quality gaps" });
    const repair = phase.getByRole("button", { name: "Verify / repair phase quality gaps" });
    await phase.scrollIntoViewIfNeeded();
    await expect(repair).toBeEnabled();
    await expect(phase.getByText("AC-14: Missing evidence link")).not.toBeVisible();
    const guidance = phase.getByRole("textbox", { name: "Additional repair guidance (optional)" });
    const repairBox = await repair.boundingBox(), guidanceBox = await guidance.boundingBox();
    expect(repairBox!.y - (guidanceBox!.y + guidanceBox!.height)).toBeGreaterThanOrEqual(12);
    await repair.click();
    await expect.poll(() => requests.filter(request => request.path === "/api/phase-quality/resolve").length).toBe(1);
    expect(requests.find(request => request.path === "/api/phase-quality/resolve")?.body).toEqual(expect.objectContaining({ gate: "completion_recovery", phaseNumber: 1, action: "repair", note: "" }));
    expect(requests.filter(request => ["/api/feature-findings", "/api/complete-feature", "/api/feature-human-review"].includes(request.path))).toEqual([]);
    await expect(readiness.getByRole("button", { name: "Complete Feature", exact: true })).toBeDisabled();
    expectNoBrowserErrors(browserErrors);
  });

  test("Refresh completion readiness reloads blockers without granting human acceptance", async ({ page }) => {
    const item = makeFeature({ implementationCompleted: true, canStartImplementing: false,
      readiness: { ready: false, reasons: [{ code: "invalid_refine_artifacts", message: "Invalid saved lifecycle metadata.", blocking: true }] },
    });
    const { requests, browserErrors } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);
    const readiness = detail.getByRole("region", { name: "Complete Feature readiness" });
    await expect(readiness.getByText("Invalid saved lifecycle metadata.")).toBeVisible();
    const refreshBox = await readiness.getByRole("button", { name: "Refresh Completion Readiness" }).boundingBox();
    const reasonBox = await readiness.getByText("Invalid saved lifecycle metadata.").boundingBox();
    expect(reasonBox!.y - (refreshBox!.y + refreshBox!.height)).toBeGreaterThanOrEqual(12);
    item.featureWorkflow!.readiness = { ready: true, reasons: [] };
    item.featureWorkflow!.canRecordUserCodeReview = true;
    const refreshed = page.waitForResponse(r => r.url().endsWith("/api/projects/hepha/completion-readiness") && r.request().method() === "POST");
    await readiness.getByRole("button", { name: "Refresh Completion Readiness" }).click();
    await refreshed;
    await expect(readiness.getByText("Invalid saved lifecycle metadata.")).toHaveCount(0);
    await expect(readiness.getByText("User code review is pending.")).toBeVisible();
    await expect(readiness.getByText("Manual tests are pending.")).toBeVisible();
    await expect(readiness.getByRole("button", { name: "Complete Feature", exact: true })).toBeDisabled();
    expect(requests.filter(r => ["/api/complete-feature", "/api/feature-human-review", "/api/phase-quality/resolve"].includes(r.path))).toEqual([]);
    expectNoBrowserErrors(browserErrors);
  });

  test("A human requests one phase gate repair or explicitly justifies its waiver", async ({ page }) => {
    const item = makeFeature({ implementationCompleted: true, canStartImplementing: false });
    item.phases.forEach(phase => { phase.status = "completed"; });
    const gates = item.implementationEvidence!.phaseQualityGates[0]!.gates;
    gates[0]!.status = "missing";
    gates[2]!.status = "missing";
    const { requests, browserErrors } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);
    await detail.locator('[data-phase-number="1"]').getByText("2 verification issues — how to resolve").click();
    const issue = detail.getByRole("region", { name: "Phase 1 — Automated tests", exact: true });
    await expect(issue.getByRole("button", { name: "Waive this gate", exact: true })).toBeDisabled();
    await issue.getByRole("textbox").fill("Add the missing integration scenarios for retries.");
    await issue.getByRole("button", { name: "Verify / repair this gate", exact: true }).click();
    await expect.poll(() => requests.filter(r => r.path === "/api/phase-quality/resolve").length).toBe(1);
    expect(requests.find(r => r.path === "/api/phase-quality/resolve")?.body).toEqual({ projectId: PROJECT.id, cardId: item.id, phaseNumber: 1, gate: "tests", action: "repair", note: "Add the missing integration scenarios for retries.", confirmWaiver: false, expectedUpdatedAt: NOW });
    await page.route("**/api/phase-quality/resolve", async route => {
      requests.push({ path: "/api/phase-quality/resolve", body: route.request().postDataJSON() });
      gates[0]!.status = "waived"; gates[0]!.justification = "Human approved documentation-only scope.";
      await route.fulfill({ json: { filesChanged: [], filesCreated: [], items: [item], project: PROJECT, summary: "Human waiver recorded." } });
    });
    await issue.getByRole("textbox").fill("No production output in this phase; documentation-only changes.");
    await expect(issue.getByRole("button", { name: "Waive this gate", exact: true })).toBeDisabled();
    await issue.getByRole("checkbox").check();
    await issue.getByRole("button", { name: "Waive this gate", exact: true }).click();
    await expect(detail.locator('[data-phase-number="1"]').getByText("tests: waived", { exact: true })).toBeVisible();
    expect(requests.at(-1)?.body).toEqual(expect.objectContaining({ action: "waive", gate: "tests", phaseNumber: 1, confirmWaiver: true }));
    await expect(detail.getByRole("button", { name: "Complete Feature", exact: true })).toBeDisabled();
    expect(requests.filter(r => r.path === "/api/complete-feature")).toEqual([]);
    expectNoBrowserErrors(browserErrors);
  });
  test("Checkpoint build diagnostics remain distinct from missing tests", async ({ page }) => {
    const item = makeFeature({ implementationCompleted: true, canStartImplementing: false, userCodeReviewCompletedAt: NOW, manualTestsCompletedAt: NOW });
    item.phases.forEach(phase => { phase.status = "completed"; });
    item.implementationEvidence!.phaseQualityGates[0]!.gates = [
      { gate: "tests", status: "satisfied", justification: "Host test execution passed", evidencePaths: ["phase.md.verification.json"] },
      { gate: "build", status: "missing", justification: "Build emitted warnings despite exit zero", evidencePaths: ["phase.md.verification.json"] },
      { gate: "lint", status: "satisfied", justification: "Host lint execution passed", evidencePaths: ["phase.md.verification.json"] },
    ];
    const { requests, browserErrors } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);
    await detail.locator('[data-phase-number="1"]').getByText("1 non-blocking warning — how to resolve").click();
    const issue = detail.getByRole("region", { name: "Phase 1 — Build", exact: true });
    await expect(issue.getByText("Non-blocking warning. The recorded outcome is preserved; you may choose whether to repair it.", { exact: true })).toBeVisible();
    await expect(issue.getByText("Recorded diagnostic: Build emitted warnings despite exit zero", { exact: true })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Complete Feature", exact: true })).toBeEnabled();
    expect(requests.filter(request => request.path === "/api/complete-feature")).toEqual([]);
    expectNoBrowserErrors(browserErrors);
  });
  test("Document-only phase gates stay N/A while real verification gaps remain on their own phase", async ({ page }) => {
    const root = mkdtempSync(join(tmpdir(), "hepha-browser-applicability-"));
    try {
      const item = makeFeature({ implementationCompleted: true, canStartImplementing: false, canContinueImplementing: false });
      item.phases = item.phases.slice(0, 2);
      item.phases.forEach((phase, index) => {
        phase.documentPath = join(root, `phase-${index}.md`);
        writeFileSync(phase.documentPath, index === 0
          ? "### Test Verification\nNot applicable: documentation-only output.\n### Code Review\nNot required: documentation-only output.\n### Preservation\nNo unrelated change was modified (`generated.d.ts` preserved untouched)."
          : "## Changed Files\n- `packages/service.ts`\n### Test Verification\nRequired: execute service tests.\n### Code Review\nRequired for the service changes.");
      });
      item.implementationEvidence!.phaseQualityGates = scanFeaturePhaseQualityGates(item.phases, []);
      const { requests, browserErrors } = await installFixture(page, item);
      const detail = await openFeatureDetail(page);
      const planning = detail.locator('[data-phase-number="1"]');
      await expect(planning.getByText("tests: N/A", { exact: true })).toBeVisible();
      await expect(planning.getByText("Review: N/A", { exact: true })).toHaveAttribute("title", "documentation-only output.");
      await expect(planning.locator(".phase-quality-issues")).toHaveCount(0);
      await expect(planning.getByText("Completed", { exact: true })).toBeVisible();
      const code = detail.locator('[data-phase-number="2"]');
      await code.getByText("2 verification issues — how to resolve", { exact: true }).click();
      await expect(code.getByText("Phase 2 — Automated tests", { exact: true })).toBeVisible();
      await expect(detail.getByRole("region", { name: "Complete Feature readiness", exact: true }).getByText("2 phase quality gate(s) are missing.", { exact: true })).toBeVisible();
      expect(requests.filter(r => ["/api/continue-implementing", "/api/complete-feature"].includes(r.path))).toEqual([]);
      expectNoBrowserErrors(browserErrors);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("Phase cards expand their own verification issues without a duplicate completion list", async ({ page }) => {
    const item = makeFeature({ implementationCompleted: true, canStartImplementing: false, canContinueImplementing: false,
      hasContinuationArtifacts: false, lastRun: { command: "start-implementing", status: "failed", error: "INVALID_FEATURE_STATUS: task header is malformed", runId: "failed", startedAt: NOW, completedAt: NOW, currentNodeId: null, currentStep: null, summary: null, workflowProgress: null },
      readiness: { ready: false, reasons: [{ blocking: true, code: "invalid_refine_artifacts", message: "INVALID_FEATURE_STATUS: task header is malformed" }] } });
    item.implementationEvidence!.phaseQualityGates = [1, 2].map(phaseNumber => ({ phaseNumber, phaseTitle: `Phase ${phaseNumber}`, phaseStatus: "COMPLETED", changedFiles: ["src/sample.ts"], codeFiles: ["src/sample.ts"], testFiles: [], documentationFiles: [], warnings: [], gates: [
      { gate: "tests", status: "missing", evidencePaths: [], justification: null },
      { gate: "code_review", status: "missing", evidencePaths: [], justification: null },
    ] }));
    const { requests, browserErrors } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);
    const readiness = detail.getByRole("region", { name: "Complete Feature readiness", exact: true });
    const first = detail.locator('[data-phase-number="1"]');
    const second = detail.locator('[data-phase-number="2"]');
    await expect(first.getByText("Phase 1 — Automated tests", { exact: true })).not.toBeVisible();
    await first.getByText("2 verification issues — how to resolve", { exact: true }).click();
    await expect(first.getByText("Phase 1 — Automated tests", { exact: true })).toBeVisible();
    await expect(first.getByText("Evidence missing or not recognised; this is not a recorded failure.")).toBeVisible();
    await expect(first.getByText(/If an existing review/)).toBeVisible();
    await expect(first.getByText(/If tests were already executed/)).toBeVisible();
    await expect(second.getByText("Phase 2 — Code review", { exact: true })).not.toBeVisible();
    await second.getByText("2 verification issues — how to resolve", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(second.getByText("Phase 2 — Code review", { exact: true })).toBeVisible();
    await first.getByText("2 verification issues — how to resolve", { exact: true }).click();
    await expect(first.getByText("Phase 1 — Automated tests", { exact: true })).not.toBeVisible();
    await expect(readiness.getByText(/How to resolve/)).toHaveCount(0);
    await expect(readiness.getByText(/Phase [12] —/)).toHaveCount(0);
    await expect(detail.getByRole("button", { name: /Inspect Phase/ })).toHaveCount(0);
    await expect(readiness.getByText(/INVALID_FEATURE_STATUS/).first()).toBeVisible();
    expect(requests.filter(r => ["/api/continue-implementing", "/api/complete-feature"].includes(r.path))).toEqual([]);
    expectNoBrowserErrors(browserErrors);
  });
  test("opens the selected FEAT detail and starts an eligible workflow", async ({ page }) => {
    const item = makeFeature({ canStartImplementing: true, canContinueImplementing: false });
    const { browserErrors, requests } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);

    await detail.getByRole("button", { name: "Start Implementing" }).click();
    await expect(page.getByText("Workflow action recorded.")).toBeVisible();
    expect(requests).toContainEqual({
      body: { autonomous: true, cardId: item.id, projectId: PROJECT.id },
      path: "/api/start-implementing",
    });
    expectNoBrowserErrors(browserErrors);
  });

  test("shows Start Feature transition and post-process progress", async ({ page }) => {
    const item = makeFeature({
      implementationPhases: [{
        agent: "implementation",
        completedAt: null,
        currentStep: "Implementing Phase 2",
        error: null,
        model: "deepseek-v4-flash",
        phaseNumber: 2,
        phaseTitle: "Phase 2",
        reportPath: null,
        startedAt: NOW,
        status: "implementing",
        summary: null,
        updatedAt: NOW,
        workflowRunId: "start-run",
      }],
      activeRun: {
        command: "start-implementing",
        completedAt: null,
        currentNodeId: "implementation-loop",
        currentStep: "Running Phase 2: Data Layer",
        error: null,
        runId: "start-run",
        startedAt: NOW,
        status: "running",
        summary: "Adding phase routing recommendations and effort estimates.",
        workflowProgress: {
          currentNodeId: "implementation-loop",
          steps: [
            { detail: "Creating branch", id: "create-branch", kind: "action", label: "Create Branch", status: "completed" },
            { detail: "Moving FEAT to In Progress", id: "move-in-progress", kind: "action", label: "Move In Progress", status: "completed" },
            { detail: "Updating linked EPIC state", id: "sync-linked-epic-state", kind: "action", label: "Update Linked Epic State", status: "completed" },
            { detail: "Post-processing phase routing and estimates", id: "post-process", kind: "prompt", label: "Post Process", status: "completed" },
            { detail: "Running Phase 2: Data Layer", id: "implementation-loop", kind: "loop", label: "Implementation Loop", status: "running" },
          ],
        },
      },
    });
    const { browserErrors } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);
    const progress = detail.getByLabel("Start Feature workflow progress");

    await expect(progress).toContainText("Create Branch");
    await expect(progress).toContainText("Move In Progress");
    await expect(progress).toContainText("Update Linked Epic State");
    await expect(progress).toContainText("Post Process");
    await expect(progress).toContainText("Implementation Loop");
    await expect(progress).toContainText("Post-processing phase routing and estimates");
    await expect(
      detail.getByRole("region", { name: "Current workflow", exact: true }).getByText("Running", { exact: true }),
    ).toBeVisible();
    await expect(detail.getByText("Recovery Actions", { exact: true })).toHaveCount(0);
    const activePhase = detail.locator(".phase-row").filter({ hasText: "Phase 2" });
    await expect(activePhase).toContainText("Implementing");
    await expect(activePhase.locator(".spin-icon")).toBeVisible();
    expectNoBrowserErrors(browserErrors);
  });

  test("continues an eligible workflow through the current command route", async ({ page }) => {
    const item = makeFeature({ canStartImplementing: false, canContinueImplementing: true });
    const { browserErrors, requests } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);

    await detail.getByRole("button", { name: "Continue Implementing" }).click();
    await expect(page.getByText("Workflow action recorded.")).toBeVisible();
    expect(requests).toContainEqual({
      body: { autonomous: true, cardId: item.id, projectId: PROJECT.id },
      path: "/api/continue-implementing",
    });
    expectNoBrowserErrors(browserErrors);
  });

  test("Continue admits lifecycle repair without offering Design or Refine", async ({ page }) => {
    const item = makeFeature({ canStartImplementing: false, canContinueImplementing: true,
      canCreateUiRequirements: false, canRefineFeature: false, hasContinuationArtifacts: false,
      uiRequirementDecision: "unknown", readiness: { ready: false, reasons: [] },
      workflowMessage: "Continue Implementing will repair the saved lifecycle status before resuming." });
    const { requests, browserErrors } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);
    await expect(detail.getByText(item.featureWorkflow!.workflowMessage, { exact: true })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Design Feature", exact: true })).toHaveCount(0);
    await expect(detail.getByRole("button", { name: "Refine Feature", exact: true })).toHaveCount(0);
    await detail.getByRole("button", { name: "Continue Implementing", exact: true }).click();
    await expect(page.getByText("Workflow action recorded.")).toBeVisible();
    expect(requests).toContainEqual({ body: { autonomous: true, cardId: item.id, projectId: PROJECT.id }, path: "/api/continue-implementing" });
    expectNoBrowserErrors(browserErrors);
  });

  test("renders a contract-to-ledger mismatch as blocked without dispatching implementation", async ({ page }) => {
    const mismatch = "Phase Task Ledger contains an uncontracted checkbox; repair it to exactly match PhaseExecutionContract.json.";
    const item = makeFeature({
      canContinueImplementing: false,
      canStartImplementing: false,
      readiness: {
        ready: false,
        reasons: [{
          blocking: true,
          code: "invalid_refine_artifacts",
          detail: "[CONTRACT_TASK_LEDGER_MISMATCH]",
          message: mismatch,
        }],
      },
      workflowMessage: `[CONTRACT_TASK_LEDGER_MISMATCH] ${mismatch}`,
    });
    const { browserErrors, requests } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);

    await expect(detail.locator(".readiness-reason").getByText(`[CONTRACT_TASK_LEDGER_MISMATCH] ${mismatch}`, { exact: true })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Start Implementing" })).toHaveCount(0);
    await expect(detail.getByRole("button", { name: "Continue Implementing" })).toHaveCount(0);
    expect(requests.filter((request) => ["/api/start-implementing", "/api/continue-implementing"].includes(request.path))).toEqual([]);
    expectNoBrowserErrors(browserErrors);
  });

  test("Continue opens the persisted Deep-Dive recovery question without a generic recovery button", async ({ page }) => {
    const item = makeFeature({
      canContinueImplementing: true,
      canStartImplementing: false,
      readiness: {
        ready: true,
        reasons: [{ blocking: false, code: "deep_dive_stale", message: "Continue will recover the stale Deep-Dive." }],
      },
      workflowMessage: "Continue safely recovers stale Deep-Dive metadata.",
    });
    const { browserErrors, requests } = await installFixture(page, item);
    await page.route("**/api/continue-implementing", async (route) => {
      requests.push({ body: route.request().postDataJSON(), path: new URL(route.request().url()).pathname });
      await route.fulfill({
        body: JSON.stringify({
          filesChanged: [], filesCreated: [], items: [item], project: PROJECT,
          summary: "Deep-Dive recovery is waiting for an explicit answer.",
          deepDiveRecoverySession: {
            id: "recovery-session", projectId: PROJECT.id, cardId: item.id, cardExternalId: item.externalId,
            cardKind: "feature", cardTitle: item.title, createdAt: NOW, updatedAt: NOW, completedAt: null,
            originalDocumentHash: "changed", originalDocumentPath: item.documentPath,
            agentConnectionStatus: "finished", status: "question_round",
            questions: [{ id: "recovery-question", topic: "Changed FeatureDescription scope", prompt: "Confirm the intended implementation decision; Hepha will not infer an answer.", recommendedOptionId: null, selectedOptionId: null, answerText: null, status: "pending", chatMessages: [], options: [{ id: "confirm", label: "Confirm current scope", description: "Use the current scope." }] }],
          },
        }),
        contentType: "application/json", status: 201,
      });
    });
    const detail = await openFeatureDetail(page);

    await expect(detail.getByRole("button", { name: "Start Deep-Dive" })).toHaveCount(0);
    await detail.getByRole("button", { name: "Continue Implementing" }).click();
    await expect(page.getByText("Changed FeatureDescription scope").first()).toBeVisible();
    await expect(page.getByText("Hepha will not infer an answer.").first()).toBeVisible();
    expect(requests).toContainEqual({ body: { autonomous: true, cardId: item.id, projectId: PROJECT.id }, path: "/api/continue-implementing" });
    expectNoBrowserErrors(browserErrors);
  });

  test("shows Refine Feature after a current no-UI Deep-Dive", async ({ page }) => {
    const item = makeFeature(
      {
        canRefineFeature: true,
        hasRefinementArtifacts: false,
        uiRequirementDecision: "no_ui",
        uiRequirementReason: "No UI requirements are needed. The FEAT can be refined.",
      },
      { stateFolder: "01_SUBMITTED", stateLabel: "Submitted" },
    );
    const { browserErrors, requests } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);

    await expect(detail.getByText("Feature Preparation", { exact: true })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Refine Feature" })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Design Feature" })).toHaveCount(0);
    await detail.getByRole("button", { name: "Refine Feature" }).click();
    await expect(page.getByText("Workflow action recorded.")).toBeVisible();
    expect(requests).toContainEqual({
      body: { autonomous: true, cardId: item.id, projectId: PROJECT.id },
      path: "/api/refine-feature",
    });
    expectNoBrowserErrors(browserErrors);
  });

  test("Submitted UI feature exposes Design after Deep-Dive without recovery errors", async ({ page }) => {
    const item = makeFeature({
      canStartImplementing: false, canCreateUiRequirements: true, canRefineFeature: false,
      hasDesignArtifacts: false, hasRefinementArtifacts: false,
      readiness: { ready: true, reasons: [] }, uiRequirementDecision: "requires_ui",
      workflowMessage: "This FEAT needs UI requirements before refinement.",
      lastRun: { ...makeWorkflow().lastRun!, command: "deep-dive-feature", summary: "Completed feature Deep-Dive." },
    }, { stateFolder: "01_SUBMITTED", stateLabel: "Submitted", phases: [] });
    const { browserErrors, requests } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);
    await expect(detail.getByText("This FEAT needs UI requirements before refinement.", { exact: true })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Design Feature" })).toBeEnabled();
    await expect(detail.getByRole("button", { name: "Refine Feature" })).toBeDisabled();
    await expect(detail.getByRole("button", { name: "Start FEAT Deep-Dive" })).toBeEnabled();
    await detail.getByRole("button", { name: "Design Feature" }).click();
    await expect(page.getByText("Workflow action recorded.")).toBeVisible();
    expect(requests).toContainEqual({ path: "/api/design-feature", body: { autonomous: true, cardId: item.id, projectId: PROJECT.id } });
    expect(requests.some(request => request.path === "/api/refine-feature")).toBe(false);
    expectNoBrowserErrors(browserErrors);
  });

  test("UI feature exposes Refine after design becomes available", async ({ page }) => {
    const item = makeFeature({ canStartImplementing: false, canCreateUiRequirements: false,
      canRefineFeature: true, hasDesignArtifacts: true, hasRefinementArtifacts: false,
      readiness: { ready: true, reasons: [] }, uiRequirementDecision: "requires_ui",
    }, { stateFolder: "01_SUBMITTED", stateLabel: "Submitted", phases: [] });
    const { browserErrors, requests } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);
    await expect(detail.getByRole("button", { name: "Refine Feature" })).toBeEnabled();
    await detail.getByRole("button", { name: "Refine Feature" }).click();
    await expect(page.getByText("Workflow action recorded.")).toBeVisible();
    expect(requests).toContainEqual({ path: "/api/refine-feature", body: { autonomous: true, cardId: item.id, projectId: PROJECT.id } });
    expectNoBrowserErrors(browserErrors);
  });

  test("shows Design Feature when the current Deep-Dive requires UI artifacts", async ({ page }) => {
    const item = makeFeature({
      canCreateUiRequirements: true,
      canRefineFeature: false,
      hasDesignArtifacts: false,
      readiness: {
        ready: false,
        reasons: [{ blocking: true, code: "missing_design_artifacts", message: "Design artifacts are required." }],
      },
      uiRequirementDecision: "requires_ui",
      uiRequirementReason: "This FEAT changes provider configuration forms.",
    }, { stateFolder: "01_SUBMITTED", stateLabel: "Submitted" });
    const { browserErrors, requests } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);

    await expect(detail.getByRole("button", { name: "Design Feature" })).toBeVisible();
    await detail.getByRole("button", { name: "Design Feature" }).click();
    await expect(page.getByText("Workflow action recorded.")).toBeVisible();
    expect(requests).toContainEqual({
      body: { autonomous: true, cardId: item.id, projectId: PROJECT.id },
      path: "/api/design-feature",
    });
    expectNoBrowserErrors(browserErrors);
  });

  test("renders only the canonical numbered phase list, in order", async ({ page }) => {
    const item = makeFeature();
    const { browserErrors } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);
    const phaseList = detail.locator(".phase-list");

    await expect(phaseList).toBeVisible();
    await expect(phaseList.locator(".phase-row")).toHaveCount(6);
    await expect(phaseList.locator(".phase-row").evaluateAll((rows) => rows.map((row) => row.textContent))).resolves.toEqual([
      expect.stringContaining("Phase 1"),
      expect.stringContaining("Phase 2"),
      expect.stringContaining("Phase 3"),
      expect.stringContaining("Phase 4"),
      expect.stringContaining("Phase 5"),
      expect.stringContaining("Phase 6"),
    ]);
    await expect(phaseList).toContainText(/tests: satisfied/i);
    await expect(phaseList).toContainText("E2E: satisfied");
    await expect(phaseList).toContainText("Review: satisfied");
    await expect(detail.getByText("Planning Analysis Report", { exact: false })).toHaveCount(0);
    expectNoBrowserErrors(browserErrors);
  });

  test("retains planned quality gates while keeping a pending phase out of active-running state", async ({ page }) => {
    const item = makeFeature();
    const { browserErrors } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);
    const pendingPhase = detail.locator(".phase-row").filter({ hasText: "Phase 3" });

    await expect(pendingPhase).toContainText("Pending");
    await expect(pendingPhase.getByText(/tests: satisfied/i)).toBeVisible();
    await expect(pendingPhase.getByText(/0 code/i)).toBeVisible();
    await expect(pendingPhase.locator(".spin-icon")).toHaveCount(0);
    await expect(pendingPhase.getByLabel(/Timing for/i)).toHaveCount(0);
    expectNoBrowserErrors(browserErrors);
  });

  test("shows phase and FEAT timing from post-process estimates and completed worker runs", async ({ page }) => {
    const template = makeFeature();
    const phases = template.phases.map((phase, index) => ({
      ...phase,
      estimatedAiTime: "30m",
      estimatedHumanTime: "2h",
      status: "completed",
    }));
    const implementationPhases = phases.map((phase, index) => ({
      agent: "implementation",
      completedAt: `2026-07-11T${String(10 + index).padStart(2, "0")}:05:00.000Z`,
      currentStep: null,
      error: null,
      model: "deepseek-v4-flash",
      phaseNumber: phase.number!,
      phaseTitle: phase.title,
      reportPath: null,
      startedAt: `2026-07-11T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
      status: "completed" as const,
      summary: null,
      updatedAt: `2026-07-11T${String(10 + index).padStart(2, "0")}:05:00.000Z`,
      workflowRunId: index === 0 ? "start-run" : "continue-run",
    }));
    const implementationAgentRuns = implementationPhases.map((phase, index) => ({
      agentName: "implementation",
      agentRole: "implementation",
      completedAt: phase.completedAt,
      currentStep: null,
      error: null,
      id: `agent-run-${index + 1}`,
      model: "deepseek-v4-flash",
      phaseNumber: phase.phaseNumber,
      phaseTitle: phase.phaseTitle,
      reportPath: null,
      startedAt: phase.startedAt!,
      status: "completed" as const,
      summary: null,
      updatedAt: phase.updatedAt,
      workflowRunId: phase.workflowRunId,
    }));
    const item = makeFeature(
      { implementationAgentRuns, implementationCompleted: true, implementationPhases },
      { phases },
    );
    const { browserErrors } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);

    const timing = detail.getByLabel("Implementation timing");
    await expect(timing).toContainText("Human delivery estimate");
    await expect(timing).toContainText("12h");
    await expect(timing).toContainText("Original AI planning estimate");
    await expect(timing).toContainText("3h");
    await expect(timing).toContainText("Actual AI execution");
    await expect(timing).toContainText("30m 0s");
    await expect(detail.locator(".phase-row").first()).toContainText("Human delivery estimate: 2h · Actual AI execution: 5m 0s · AI planning estimate: 30m");
    expectNoBrowserErrors(browserErrors);
  });

  test("opens manual-test verification and records a passing outcome", async ({ page }) => {
    const item = makeFeature({
      canGenerateManualTestPack: true,
      canRecordManualTestPass: true,
      canRecordManualTests: true,
      implementationCompleted: true,
    });
    const { browserErrors, requests } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);

    await detail.getByRole("button", { name: "Manual tests" }).click();
    const dialog = page.getByRole("dialog", { name: "Manual test verification" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "All tests passed" }).click();
    await expect(page.getByText("All manual tests recorded.")).toBeVisible();
    expect(requests).toContainEqual({
      body: {
        actualResult: null,
        cardId: item.id,
        notes: null,
        packId: "pack-056",
        projectId: PROJECT.id,
        result: "pass",
        reviewId: "review-056",
      },
      path: "/api/manual-test-verification/record-pass",
    });
    expectNoBrowserErrors(browserErrors);
  });

  test("records User Code Review through the dedicated Human Checkpoint route", async ({ page }) => {
    const item = makeFeature({ canRecordUserCodeReview: true, implementationCompleted: true });
    const { browserErrors, requests } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);

    await expect(detail.getByText("Human Checkpoint", { exact: true })).toBeVisible();
    await detail.getByRole("button", { name: "User Code Review" }).click();
    await expect(page.getByText("Workflow action recorded.")).toBeVisible();
    expect(requests).toContainEqual({
      body: { cardId: item.id, check: "user-code-review", projectId: PROJECT.id },
      path: "/api/feature-human-review",
    });
    expect(requests.some((request) => request.path.startsWith("/api/feature-workflow/"))).toBe(false);
    expectNoBrowserErrors(browserErrors);
  });

  test("submits a finding through the feature-finding request route", async ({ page }) => {
    const item = makeFeature({ canSubmitFinding: true, implementationCompleted: true });
    const { browserErrors, requests } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);

    await detail.getByRole("button", { name: "Submit Finding" }).click();
    await page.getByRole("textbox", { name: "Finding" }).fill("The workflow button has the wrong route.");
    await page.getByRole("button", { name: "Submit Finding" }).last().click();
    await expect(page.getByText("Workflow action recorded.")).toBeVisible();
    expect(requests).toContainEqual({
      body: {
        cardId: item.id,
        content: "The workflow button has the wrong route.",
        projectId: PROJECT.id,
      },
      path: "/api/feature-findings",
    });
    expectNoBrowserErrors(browserErrors);
  });

  test("shows completion as blocked until human checks are recorded", async ({ page }) => {
    const item = makeFeature({ implementationCompleted: false });
    const { browserErrors } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);

    await expect(detail.getByRole("region", { name: "Complete Feature readiness", exact: true })).toBeVisible();
    await expect(detail.getByRole("region", { name: "Complete Feature readiness", exact: true }).getByText("Blocked", { exact: true })).toBeVisible();
    await expect(detail.getByText("Implementation is not yet completed.")).toBeVisible();
    await expect(detail.getByRole("button", { name: "Complete Feature" })).toBeDisabled();
    expectNoBrowserErrors(browserErrors);
  });

  test("shows completion ready after implementation, review, tests, and findings are clear", async ({ page }) => {
    const item = makeFeature({
      implementationCompleted: true,
      manualTestsCompletedAt: NOW,
      userCodeReviewCompletedAt: NOW,
    });
    const { browserErrors } = await installFixture(page, item);
    const detail = await openFeatureDetail(page);

    await expect(detail.getByRole("region", { name: "Complete Feature readiness", exact: true }).getByText("Ready", { exact: true })).toBeVisible();
    await expect(detail.getByText("All completion conditions satisfied.")).toBeVisible();
    await expect(detail.getByRole("button", { name: "Complete Feature" })).toBeEnabled();
    expectNoBrowserErrors(browserErrors);
  });
});
