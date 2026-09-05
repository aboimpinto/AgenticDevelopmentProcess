/**
 * FEAT-057: Workflow Interactions — Playwright Journeys
 *
 * Uses the current dashboard API contracts so every journey selects a real FEAT
 * card and renders its detail blade before exercising workflow controls.
 *
 * @see apps/web/e2e/features/workflow-interactions.feature
 */

import { expect, test, type Page, type Route } from "@playwright/test";
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
      detail.locator(".validation-panel").filter({ hasText: "Workflow readiness" }).getByText("Running", { exact: true }),
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
    });
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

    await expect(detail.getByText("Completion", { exact: true })).toBeVisible();
    await expect(detail.getByText("Blocked", { exact: true })).toBeVisible();
    await expect(detail.getByText("Implementation is not yet completed.")).toBeVisible();
    await expect(detail.getByRole("button", { name: "Complete Feature" })).toHaveCount(0);
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

    await expect(detail.getByLabel("Completion").getByText("Ready", { exact: true })).toBeVisible();
    await expect(detail.getByText("All completion conditions satisfied.")).toBeVisible();
    await expect(detail.getByRole("button", { name: "Complete Feature" })).toBeEnabled();
    expectNoBrowserErrors(browserErrors);
  });
});
