import { expect, test, type Page } from "@playwright/test";
import type {
  FeatureWorkflowSummary,
  RuntimeFeatureEvidenceV1,
  RuntimePhaseExecutionEvidencePageV1,
  WorkItemCard,
} from "@hepha/shared";
import { FIXTURE_TIME, installDashboardFixtures, makeWorkItem } from "./fixtures/dashboard-fixtures";

const CARD_KEY = "feature:FEAT-071";
const SECRET = "feat-071-policy-secret-must-not-render";
const PHASE_ID = "execution-mode-evidence-projection";
const PHASE = {
  executionContractId: PHASE_ID,
  defaultImplementationModel: null,
  documentPath: "/workspace/MemoryBank/Features/FEAT-071/Phases/phase-5.md",
  documentRelativePath: "MemoryBank/Features/FEAT-071/Phases/phase-5.md",
  estimatedAiTime: null,
  estimatedHumanTime: null,
  fileName: "phase-5.md",
  number: 5,
  predictedModel: null,
  predictedModelSource: "workflow_policy" as const,
  recommendedAgent: "implementation-agent",
  recommendedModel: null,
  status: "completed",
  title: "Execution mode evidence projection",
  updatedAt: FIXTURE_TIME,
};
const FEATURE = makeWorkItem({
  externalId: "FEAT-071",
  featureWorkflow: workflow(),
  folderName: "FEAT-071-portable-model-authority",
  id: "feat-071-runtime-evidence",
  phases: [PHASE],
  title: "FEAT-071: Portable model authority",
}) as WorkItemCard;
const unrecorded = {
  schemaVersion: "runtime-execution/v1" as const,
  mode: "direct_host" as const,
  evidenceId: "direct-codex",
  projectId: "hepha",
  cardKey: CARD_KEY,
  phaseExecutionContractId: PHASE_ID,
  phaseNumber: 5,
  taskId: "task-codex",
  procedureId: "continue-implementation",
  actionId: "continue-implementing",
  hostKind: "codex" as const,
  hostIdentity: null,
  startedAt: "2026-07-26T10:00:00.000Z",
  settledAt: "2026-07-26T10:01:00.000Z",
  durationMs: 60_000,
  outcome: "completed" as const,
  failureCode: null,
  stateSync: { status: "completed" as const, operationId: "sync-codex" },
  modelEvidence: { status: "not_recorded" as const },
};
const observed = {
  ...unrecorded,
  evidenceId: "direct-pi",
  taskId: "task-pi",
  hostKind: "pi" as const,
  startedAt: "2026-07-26T10:02:00.000Z",
  settledAt: "2026-07-26T10:03:00.000Z",
  stateSync: { status: "not_requested" as const },
  modelEvidence: {
    status: "recorded" as const,
    modelId: "current-pi-model",
    providerId: "current-pi-provider",
    instrumentationSource: "trusted-pi-fixture/v1",
    observedAt: "2026-07-26T10:02:30.000Z",
  },
};
const summary: RuntimeFeatureEvidenceV1 = {
  schemaVersion: "runtime-execution/v1",
  projectId: "hepha",
  cardKey: CARD_KEY,
  phases: [{
    phaseExecutionContractId: PHASE_ID,
    phaseNumber: 5,
    phaseTitle: PHASE.title,
    state: "completed",
    invocationCount: 2,
    executionModes: ["direct_host"],
    directModelEvidence: [unrecorded.modelEvidence, observed.modelEvidence],
    actualRoutes: [],
    aggregateDurationMs: 120_000,
    finalOutcome: "completed",
    failureCode: null,
  }],
};
const details: RuntimePhaseExecutionEvidencePageV1 = {
  schemaVersion: "runtime-execution/v1",
  projectId: "hepha",
  cardKey: CARD_KEY,
  phaseExecutionContractId: PHASE_ID,
  executions: [unrecorded, observed],
  nextCursor: null,
};

function workflow(): FeatureWorkflowSummary {
  return {
    activeRun: null,
    canAcceptHumanReviewFindings: false,
    canContinueImplementing: true,
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
    defaultImplementationModel: null,
    designCompletedAt: FIXTURE_TIME,
    findings: [],
    hasDesignArtifacts: true,
    hasRefinementArtifacts: true,
    implementationCompleted: false,
    implementationPhases: [],
    implementationTasks: [],
    lastRun: null,
    manualTestPackStatus: null,
    manualTestsCompletedAt: null,
    readiness: { ready: true, reasons: [] },
    refineCompletedAt: FIXTURE_TIME,
    uiRequirementCheckedAt: FIXTURE_TIME,
    uiRequirementDecision: "requires_ui",
    uiRequirementReason: "Execution mode is shown in Details.",
    userCodeReviewCompletedAt: null,
    workflowMessage: "Portable authority evidence is ready.",
    workflowPosition: null,
  };
}

async function install(page: Page, malformed: { value: boolean }) {
  await installDashboardFixtures(page, [FEATURE]);
  await page.route("**/api/delivery/status?*", (route) => route.fulfill({
    contentType: "application/json", json: { status: "not_applicable", statusLabel: "Not applicable", statusExplanation: "Fixture", canPrepare: false },
  }));
  await page.route("**/api/manual-test-verification/status?*", (route) => route.fulfill({
    contentType: "application/json", json: { success: true, status: null, summary: "No pack" },
  }));
  await page.route("**/api/projects/hepha/live-activity*", (route) => route.fulfill({
    body: "event: live-activity.connected\ndata: {}\n\n", contentType: "text/event-stream",
  }));
  await page.route("**/api/projects/hepha/features/**/runtime-evidence**", async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path.endsWith("/runtime-evidence")) {
      await route.fulfill({ contentType: "application/json", json: summary });
      return;
    }
    const value = malformed.value
      ? { ...details, executions: [{ ...unrecorded, revisionId: SECRET }] }
      : details;
    await route.fulfill({ contentType: "application/json", json: value });
  });
}

async function openRuntimeEvidence(page: Page, malformed: { value: boolean }) {
  await install(page, malformed);
  await page.goto("/");
  await page.getByRole("button", { name: /FEAT-071.*Portable model authority/iu }).click();
  const region = page.getByRole("region", { name: `Runtime evidence for ${PHASE.title}` });
  await expect(region).toBeVisible();
  await region.getByRole("button", { name: "Show runtime evidence" }).click();
  await expect(region.locator(".runtime-evidence-chain")).toHaveCount(2);
  return region;
}

test.describe("FEAT-071 portable model authority evidence", () => {
  test("E011-ASSET-004 direct execution never fabricates actual model evidence", async ({ page }) => {
    const region = await openRuntimeEvidence(page, { value: false });
    await expect(region.getByText("Direct host", { exact: true })).toHaveCount(2);
    await expect(region.getByText("Not recorded", { exact: true })).toHaveCount(2);
    await expect(region).toContainText("current-pi-provider / current-pi-model");
    await expect(region).toContainText("trusted-pi-fixture/v1");
    await expect(region).not.toContainText("Approved primary route");
    await expect(page.locator("body")).not.toContainText(SECRET);
  });

  test("E011-EVID-002 direct correction preserves confirmed evidence when cross-mode data is malformed", async ({ page }) => {
    const malformed = { value: false };
    const region = await openRuntimeEvidence(page, malformed);
    malformed.value = true;
    await region.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByRole("alert")).toContainText("Runtime evidence could not be refreshed.");
    await expect(region).toContainText("Last confirmed snapshot");
    await expect(region.locator(".runtime-evidence-chain")).toHaveCount(2);
    await expect(region).toContainText("current-pi-provider / current-pi-model");
    await expect(page.locator("body")).not.toContainText(SECRET);
  });
});
