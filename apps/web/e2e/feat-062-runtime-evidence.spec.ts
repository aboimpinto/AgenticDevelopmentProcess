/**
 * FEAT-062 deterministic runtime-evidence acceptance journeys.
 *
 * All runtime responses are guarded browser fixtures. These tests never call a
 * provider, Pi process, vault, or credential store.
 *
 * @see apps/web/e2e/features/feat-062-runtime-evidence.feature
 */

import { expect, test, type Page } from "@playwright/test";
import type {
  FeatureWorkflowSummary,
  RouteIdentityV1,
  RuntimeAttemptEvidenceViewV1,
  RuntimeFeatureEvidenceV1,
  OrchestratedRuntimeEvidenceViewV1,
  RuntimePhaseExecutionEvidencePageV1,
  RuntimePhaseEvidenceSummaryV1,
  WorkItemCard,
} from "@hepha/shared";
import { FIXTURE_TIME, installDashboardFixtures, makeWorkItem } from "./fixtures/dashboard-fixtures";

declare global {
  interface Window {
    __emitRuntimeEvidenceEvent?: (event: unknown) => void;
  }
}

const CARD_KEY = "feature:FEAT-062";
const SECRET = "feat-062-distinctive-secret-never-expose"; // gitleaks:allow -- synthetic non-leak fixture
const ROOT_ROUTE = route("deepseek-work", "implementation-model");
const REVIEW_ROUTE = route("openai-work", "review-model");
const FALLBACK_ROUTE = route("openai-work", "global-model");
const LATER_ROUTE = route("deepseek-work", "implementation-v2");

const PHASES = [
  phase(1, "contract-not-yet", "Queued work", "pending"),
  phase(2, "contract-legacy", "Imported legacy work", "completed"),
  phase(3, "contract-runtime", "Runtime execution", "completed"),
  phase(4, "contract-terminal", "Terminal execution", "failed"),
  phase(5, "contract-recovery", "Recovery execution", "completed"),
];

const FEATURE = makeWorkItem({
  externalId: "FEAT-062",
  featureWorkflow: workflow(),
  folderName: "FEAT-062-runtime-evidence",
  id: "feat-062-runtime",
  phases: PHASES,
  specMarkdown: "# FEAT-062: Runtime evidence fixture",
  title: "FEAT-062: Runtime evidence fixture",
}) as WorkItemCard;

type RuntimeFixtureState = {
  summary: RuntimeFeatureEvidenceV1;
  readonly pages: Record<string, Record<string, RuntimePhaseExecutionEvidencePageV1>>;
  failDetailRefresh: boolean;
  readonly detailRequests: string[];
  readonly requestUrls: string[];
  readonly responseBodies: string[];
};

function route(connectionId: string, modelId: string): RouteIdentityV1 {
  return { connectionId, modelId } as RouteIdentityV1;
}

function phase(number: number, executionContractId: string, title: string, status: string) {
  return {
    executionContractId,
    defaultImplementationModel: null,
    documentPath: `/workspace/MemoryBank/Features/FEAT-062/Phases/phase-${number}.md`,
    documentRelativePath: `MemoryBank/Features/FEAT-062/Phases/phase-${number}.md`,
    estimatedAiTime: null,
    estimatedHumanTime: null,
    fileName: `phase-${number}.md`,
    number,
    predictedModel: null,
    predictedModelSource: "workflow_policy" as const,
    recommendedAgent: "implementation-agent",
    recommendedModel: null,
    status,
    title,
    updatedAt: FIXTURE_TIME,
  };
}

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
    uiRequirementReason: "Runtime evidence is presented in FEAT Details.",
    userCodeReviewCompletedAt: null,
    workflowMessage: "Runtime evidence fixture is ready.",
    workflowPosition: null,
  };
}

function summary(
  phaseExecutionContractId: string,
  phaseNumber: number,
  phaseTitle: string,
  overrides: Partial<RuntimePhaseEvidenceSummaryV1> = {},
): RuntimePhaseEvidenceSummaryV1 {
  return {
    phaseExecutionContractId,
    phaseNumber,
    phaseTitle,
    state: "not_yet_run",
    invocationCount: 0,
    executionModes: overrides.invocationCount && overrides.invocationCount > 0 ? ["orchestrated"] : [],
    directModelEvidence: [],
    actualRoutes: [],
    aggregateDurationMs: null,
    finalOutcome: null,
    failureCode: null,
    ...overrides,
  };
}

function featureSummary(overrides: Record<string, Partial<RuntimePhaseEvidenceSummaryV1>> = {}): RuntimeFeatureEvidenceV1 {
  const values = [
    summary("contract-not-yet", 1, "Queued work"),
    summary("contract-legacy", 2, "Imported legacy work", { state: "not_recorded" }),
    summary("contract-runtime", 3, "Runtime execution"),
    summary("contract-terminal", 4, "Terminal execution"),
    summary("contract-recovery", 5, "Recovery execution"),
  ].map((value) => ({ ...value, ...overrides[value.phaseExecutionContractId!] }));
  return { schemaVersion: "runtime-execution/v1", projectId: "hepha", cardKey: CARD_KEY, phases: values };
}

function attempt(
  attemptId: string,
  attemptIndex: 0 | 1,
  attemptKind: "primary" | "fallback" | "recovery",
  approvedRoute: RouteIdentityV1,
  preparationStartedAt: string,
  terminalAt: string,
  overrides: Partial<RuntimeAttemptEvidenceViewV1> = {},
): RuntimeAttemptEvidenceViewV1 {
  const durationMs = new Date(terminalAt).getTime() - new Date(preparationStartedAt).getTime();
  return {
    attemptId,
    attemptIndex,
    attemptKind,
    approvedRoute,
    actualRoute: approvedRoute,
    providerId: `provider-${approvedRoute.connectionId}`,
    authenticationConnectionId: approvedRoute.connectionId,
    authenticationKind: "pi_session",
    credentialVersion: null,
    workState: "none",
    checkpointId: null,
    status: "completed",
    preparationStartedAt,
    startedAt: new Date(new Date(preparationStartedAt).getTime() + 1_000).toISOString(),
    spawnedAt: new Date(new Date(preparationStartedAt).getTime() + 2_000).toISOString(),
    terminalAt,
    durationMs,
    exitCode: 0,
    timeoutMarker: false,
    failureCode: null,
    ...overrides,
  };
}

function chain(options: {
  readonly invocationId: string;
  readonly phaseId: string;
  readonly phaseNumber: number;
  readonly route: RouteIdentityV1;
  readonly openedAt: string;
  readonly settledAt: string;
  readonly actionId?: string;
  readonly actionType?: "implementation" | "review";
  readonly roleId?: "implementation-agent" | "code-review-agent";
  readonly promptVersion?: string;
  readonly revisionId?: string;
  readonly invocationKind?: "root" | "nested";
  readonly rootInvocationId?: string;
  readonly parentInvocationId?: string | null;
  readonly selectedLessonIds?: readonly string[];
}): OrchestratedRuntimeEvidenceViewV1 {
  const invocationKind = options.invocationKind ?? "root";
  const primary = attempt(
    `${options.invocationId}-attempt-0`,
    0,
    "primary",
    options.route,
    options.openedAt,
    options.settledAt,
  );
  return {
    mode: "orchestrated",
    invocationId: options.invocationId,
    rootInvocationId: options.rootInvocationId ?? options.invocationId,
    parentInvocationId: invocationKind === "nested" ? options.parentInvocationId ?? "invocation-root" : null,
    invocationKind,
    approvedPlan: {
      planHash: options.invocationId.charCodeAt(0).toString(16).padStart(2, "0").repeat(32),
      actionId: options.actionId ?? "continue-implementing",
      actionType: options.actionType ?? "implementation",
      roleId: options.roleId ?? "implementation-agent",
      promptVersion: options.promptVersion ?? "implementation/v4",
      policySource: "action",
      revisionId: options.revisionId ?? "revision-41",
      primaryRoute: options.route,
      secondRoute: null,
      selectedLessonIds: options.selectedLessonIds ?? [],
    },
    phaseExecutionContractId: options.phaseId,
    phaseNumber: options.phaseNumber,
    status: "completed",
    openedAt: options.openedAt,
    settledAt: options.settledAt,
    durationMs: new Date(options.settledAt).getTime() - new Date(options.openedAt).getTime(),
    failureCode: null,
    attempts: [primary],
    routeChangeEvents: [],
  };
}

function failedChain(invocationId: string, phaseId = "contract-terminal"): OrchestratedRuntimeEvidenceViewV1 {
  const openedAt = "2026-07-23T10:10:00.000Z";
  const settledAt = "2026-07-23T10:10:30.000Z";
  const primary = attempt(`${invocationId}-attempt-0`, 0, "primary", ROOT_ROUTE, openedAt, settledAt, {
    status: "failed",
    exitCode: 1,
    failureCode: "provider_unavailable",
  });
  return {
    ...chain({ invocationId, phaseId, phaseNumber: 4, route: ROOT_ROUTE, openedAt, settledAt }),
    status: "failed",
    failureCode: "provider_unavailable",
    attempts: [primary],
  };
}

function secondStepChain(kind: "fallback" | "recovery", phaseId = "contract-runtime"): OrchestratedRuntimeEvidenceViewV1 {
  const invocationId = `invocation-${kind}`;
  const openedAt = "2026-07-23T10:20:00.000Z";
  const primaryTerminal = "2026-07-23T10:20:10.000Z";
  const eventAt = "2026-07-23T10:20:11.000Z";
  const secondStart = "2026-07-23T10:20:12.000Z";
  const settledAt = "2026-07-23T10:20:42.000Z";
  const primary = attempt(`${invocationId}-attempt-0`, 0, "primary", ROOT_ROUTE, openedAt, primaryTerminal, {
    status: "failed",
    exitCode: 1,
    failureCode: "rate_limited",
    workState: kind === "recovery" ? "checkpointed" : "none",
    checkpointId: kind === "recovery" ? "checkpoint-task-4" : null,
  });
  const second = attempt(`${invocationId}-attempt-1`, 1, kind, FALLBACK_ROUTE, secondStart, settledAt);
  return {
    mode: "orchestrated",
    invocationId,
    rootInvocationId: invocationId,
    parentInvocationId: null,
    invocationKind: "root",
    approvedPlan: {
      planHash: kind === "fallback" ? "b".repeat(64) : "c".repeat(64),
      actionId: "continue-implementing",
      actionType: "implementation",
      roleId: "implementation-agent",
      promptVersion: "implementation/v4",
      policySource: "action",
      revisionId: "revision-51",
      primaryRoute: ROOT_ROUTE,
      secondRoute: FALLBACK_ROUTE,
      selectedLessonIds: ["runtime-non-leak"],
    },
    phaseExecutionContractId: phaseId,
    phaseNumber: phaseId === "contract-recovery" ? 5 : 3,
    status: "completed",
    openedAt,
    settledAt,
    durationMs: 42_000,
    failureCode: null,
    attempts: [primary, second],
    routeChangeEvents: [{
      eventId: `${invocationId}-edge-0`,
      sourceInvocationId: invocationId,
      sourceAttemptId: primary.attemptId,
      targetInvocationId: invocationId,
      targetAttemptId: second.attemptId,
      kind,
      reasonCode: "rate_limited",
      occurredAt: eventAt,
      sourceApprovedRoute: ROOT_ROUTE,
      targetApprovedRoute: FALLBACK_ROUTE,
      result: "completed",
    }],
  };
}

function page(phaseExecutionContractId: string, executions: readonly OrchestratedRuntimeEvidenceViewV1[], nextCursor: string | null = null): RuntimePhaseExecutionEvidencePageV1 {
  return {
    schemaVersion: "runtime-execution/v1",
    projectId: "hepha",
    cardKey: CARD_KEY,
    phaseExecutionContractId,
    executions,
    nextCursor,
  };
}

function fixtureState(
  summaryValue: RuntimeFeatureEvidenceV1,
  pages: RuntimeFixtureState["pages"],
): RuntimeFixtureState {
  return {
    summary: summaryValue,
    pages,
    failDetailRefresh: false,
    detailRequests: [],
    requestUrls: [],
    responseBodies: [],
  };
}

async function installControlledEventSource(page: Page) {
  await page.addInitScript(() => {
    const sources: Array<EventTarget & { readonly url: string }> = [];
    class ControlledEventSource extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSED = 2;
      readonly url: string;
      onerror: ((this: EventSource, event: Event) => unknown) | null = null;
      readyState = ControlledEventSource.OPEN;
      withCredentials = false;
      constructor(url: string | URL) {
        super();
        this.url = String(url);
        sources.push(this);
        queueMicrotask(() => this.dispatchEvent(new MessageEvent("live-activity.connected", { data: "{}" })));
      }
      close() { this.readyState = ControlledEventSource.CLOSED; }
    }
    Object.defineProperty(window, "EventSource", { configurable: true, value: ControlledEventSource, writable: true });
    window.__emitRuntimeEvidenceEvent = (event: unknown) => {
      for (const source of sources.filter((candidate) => candidate.url.includes("/live-activity"))) {
        source.dispatchEvent(new MessageEvent("live-activity.event", { data: JSON.stringify(event) }));
      }
    };
  });
}

async function installRuntimeFixtures(page: Page, state: RuntimeFixtureState) {
  await installControlledEventSource(page);
  await page.route("**/api/**", async (request) => {
    state.requestUrls.push(request.request().url());
    await request.fulfill({ contentType: "application/json", status: 500, body: JSON.stringify({ error: "Unexpected deterministic fixture request" }) });
  });
  await installDashboardFixtures(page, [FEATURE]);
  await page.route("**/api/delivery/status?*", async (request) => {
    await request.fulfill({ contentType: "application/json", json: { status: "not_applicable", statusLabel: "Not applicable", statusExplanation: "Fixture", canPrepare: false } });
  });
  await page.route("**/api/manual-test-verification/status?*", async (request) => {
    await request.fulfill({ contentType: "application/json", json: { success: true, status: null, summary: "No pack" } });
  });
  await page.route("**/api/projects/hepha/features/**/runtime-evidence**", async (request) => {
    const url = new URL(request.request().url());
    state.requestUrls.push(url.toString());
    const decodedPath = decodeURIComponent(url.pathname);
    const phaseMatch = decodedPath.match(/\/runtime-evidence\/phases\/([^/]+)\/executions$/u);
    let value: RuntimeFeatureEvidenceV1 | RuntimePhaseExecutionEvidencePageV1;
    if (!phaseMatch) {
      value = state.summary;
    } else {
      const phaseId = phaseMatch[1]!;
      const cursor = url.searchParams.get("cursor") ?? "first";
      state.detailRequests.push(`${phaseId}:${cursor}`);
      if (state.failDetailRefresh) {
        await request.fulfill({ contentType: "application/json", status: 500, body: JSON.stringify({ error: "Safe fixture detail failure" }) });
        return;
      }
      value = state.pages[phaseId]?.[cursor] ?? page(phaseId, []);
    }
    const body = JSON.stringify(value);
    state.responseBodies.push(body);
    await request.fulfill({ contentType: "application/json", body });
  });
}

async function openFeatureDetails(page: Page, state: RuntimeFixtureState) {
  await installRuntimeFixtures(page, state);
  await page.goto("/");
  await page.getByRole("button", { name: /FEAT-062.*Runtime evidence fixture/iu }).click();
  const details = page.locator("aside.detail-panel");
  await expect(details).toBeVisible();
  await expect(details.locator("#work-item-detail-title")).toHaveText("FEAT-062: Runtime evidence fixture");
  return details;
}

function runtimeRegion(page: Page, phaseTitle: string) {
  return page.getByRole("region", { name: `Runtime evidence for ${phaseTitle}` });
}

function accessibleAttributes(page: Page) {
  return page.locator("[aria-label], [aria-labelledby], [aria-describedby], [title]").evaluateAll((elements) => elements.map((element) => [
    element.getAttribute("aria-label"),
    element.getAttribute("aria-labelledby"),
    element.getAttribute("aria-describedby"),
    element.getAttribute("title"),
  ].join(" ")).join("\n"));
}

test.describe("FEAT-062 runtime evidence", () => {
  test("E011-EVID-001 and E011-NEST-001 lazily show actual root and nested invocation evidence", async ({ page: browser }) => {
    const root = chain({ invocationId: "invocation-root", phaseId: "contract-runtime", phaseNumber: 3, route: ROOT_ROUTE, openedAt: "2026-07-23T10:00:00.000Z", settledAt: "2026-07-23T10:03:30.000Z" });
    const nested = chain({
      invocationId: "invocation-review", phaseId: "contract-runtime", phaseNumber: 3, route: REVIEW_ROUTE,
      openedAt: "2026-07-23T10:03:45.000Z", settledAt: "2026-07-23T10:05:00.000Z",
      actionId: "code-review", actionType: "review", roleId: "code-review-agent", promptVersion: "code-review/v3",
      revisionId: "revision-42", invocationKind: "nested", rootInvocationId: root.invocationId, parentInvocationId: root.invocationId,
    });
    const state = fixtureState(featureSummary({
      "contract-runtime": { state: "completed", invocationCount: 2, actualRoutes: [ROOT_ROUTE, REVIEW_ROUTE], aggregateDurationMs: 285_000, finalOutcome: "completed" },
    }), { "contract-runtime": { first: page("contract-runtime", [root], "cursor-review"), "cursor-review": page("contract-runtime", [nested]) } });
    const details = await openFeatureDetails(browser, state);
    const region = runtimeRegion(browser, "Runtime execution");

    await expect(region).toContainText("2 executions · Orchestrated · 2 executed routes · 4m 45s · Completed");
    expect(state.detailRequests).toEqual([]);
    await region.getByRole("button", { name: "Show runtime evidence" }).click();
    await expect(region).toContainText("deepseek-work / implementation-model");
    await expect(region).toContainText("continue-implementing");
    await expect(region).toContainText("implementation-agent / implementation/v4");
    expect(state.detailRequests).toEqual(["contract-runtime:first"]);
    await region.getByRole("button", { name: "Load more runtime evidence" }).click();
    await expect(region).toContainText("Nested invocation");
    await expect(region).toContainText("openai-work / review-model");
    await expect(region).toContainText("Parent invocation-root · root invocation-root");
    await expect(region).toContainText("revision revision-42");
    expect(state.detailRequests).toEqual(["contract-runtime:first", "contract-runtime:cursor-review"]);
    await expect(details.getByText("Phases", { exact: true })).toBeVisible();
  });

  test("E011-EVID-002 distinguishes absent, legacy, and failed runtime evidence", async ({ page: browser }) => {
    const failed = failedChain("invocation-failed");
    const state = fixtureState(featureSummary({
      "contract-terminal": { state: "failed", invocationCount: 1, actualRoutes: [ROOT_ROUTE], aggregateDurationMs: 30_000, finalOutcome: "failed", failureCode: "provider_unavailable" },
    }), { "contract-terminal": { first: page("contract-terminal", [failed]) } });
    await openFeatureDetails(browser, state);

    await expect(runtimeRegion(browser, "Queued work")).toContainText("Not yet run");
    await expect(runtimeRegion(browser, "Imported legacy work")).toContainText("Legacy activity · Not recorded");
    await expect(runtimeRegion(browser, "Imported legacy work")).not.toContainText("implementation-model");
    const failedRegion = runtimeRegion(browser, "Terminal execution");
    await expect(failedRegion).toContainText("1 execution · Orchestrated · deepseek-work / implementation-model · 30.0s · Failed");
    await failedRegion.getByRole("button", { name: "Show runtime evidence" }).click();
    await expect(failedRegion).toContainText("Executed route");
    await expect(failedRegion).toContainText("Provider Unavailable");
    await expect(failedRegion).toContainText("30.0s");
  });

  test("E011-EVID-003 and E011-FAIL-001/002 keep failed planned primary distinct from one successful fallback after refresh", async ({ page: browser }) => {
    const fallback = secondStepChain("fallback");
    const state = fixtureState(featureSummary({
      "contract-runtime": { state: "completed", invocationCount: 1, actualRoutes: [ROOT_ROUTE, FALLBACK_ROUTE], aggregateDurationMs: 42_000, finalOutcome: "completed" },
    }), { "contract-runtime": { first: page("contract-runtime", [fallback]) } });
    await openFeatureDetails(browser, state);
    const region = runtimeRegion(browser, "Runtime execution");
    await region.getByRole("button", { name: "Show runtime evidence" }).click();

    await expect(region).toContainText("Approved primary route");
    await expect(region).toContainText("deepseek-work / implementation-model");
    await expect(region).toContainText("openai-work / global-model");
    await expect(region).toContainText("Primary · Failed");
    await expect(region).toContainText("Fallback · Completed");
    await expect(region).toContainText("Rate Limited");
    await expect(region.locator(".runtime-evidence-attempts > li")).toHaveCount(2);
    await expect(region.locator(".runtime-evidence-history > li")).toHaveCount(1);
    await region.getByRole("button", { name: "Refresh" }).click();
    await expect(region).toContainText("Fallback · Completed");
    await expect(region.locator(".runtime-evidence-attempts > li")).toHaveCount(2);
  });

  test("E011-FAIL-003/004/005 show terminal and checkpoint-recovery sequences without an invented route", async ({ page: browser }) => {
    const terminal = failedChain("invocation-terminal");
    const recovery = secondStepChain("recovery", "contract-recovery");
    const state = fixtureState(featureSummary({
      "contract-terminal": { state: "failed", invocationCount: 1, actualRoutes: [ROOT_ROUTE], aggregateDurationMs: 30_000, finalOutcome: "failed", failureCode: "provider_unavailable" },
      "contract-recovery": { state: "completed", invocationCount: 1, actualRoutes: [ROOT_ROUTE, FALLBACK_ROUTE], aggregateDurationMs: 42_000, finalOutcome: "completed" },
    }), {
      "contract-terminal": { first: page("contract-terminal", [terminal]) },
      "contract-recovery": { first: page("contract-recovery", [recovery]) },
    });
    await openFeatureDetails(browser, state);
    const terminalRegion = runtimeRegion(browser, "Terminal execution");
    const recoveryRegion = runtimeRegion(browser, "Recovery execution");
    await terminalRegion.getByRole("button", { name: "Show runtime evidence" }).click();
    await recoveryRegion.getByRole("button", { name: "Show runtime evidence" }).click();

    await expect(terminalRegion).toContainText("Approved second route");
    await expect(terminalRegion).toContainText("None approved");
    await expect(terminalRegion.locator(".runtime-evidence-attempts > li")).toHaveCount(1);
    await expect(terminalRegion.locator(".runtime-evidence-history > li")).toHaveCount(0);
    await expect(recoveryRegion).toContainText("Checkpointed · checkpoint checkpoint-task-4");
    await expect(recoveryRegion).toContainText("Recovery · Completed");
    await expect(recoveryRegion.locator(".runtime-evidence-attempts > li")).toHaveCount(2);
    await expect(recoveryRegion.locator(".runtime-evidence-history > li")).toHaveCount(1);
  });

  test("E011-ROUTE-003 preserves revision 41 while the next invocation uses revision 42", async ({ page: browser }) => {
    const first = chain({ invocationId: "invocation-revision-41", phaseId: "contract-runtime", phaseNumber: 3, route: ROOT_ROUTE, openedAt: "2026-07-23T11:00:00.000Z", settledAt: "2026-07-23T11:01:00.000Z", revisionId: "revision-41" });
    const next = chain({ invocationId: "invocation-revision-42", phaseId: "contract-runtime", phaseNumber: 3, route: LATER_ROUTE, openedAt: "2026-07-23T11:02:00.000Z", settledAt: "2026-07-23T11:03:00.000Z", revisionId: "revision-42" });
    const state = fixtureState(featureSummary({
      "contract-runtime": { state: "completed", invocationCount: 2, actualRoutes: [ROOT_ROUTE, LATER_ROUTE], aggregateDurationMs: 120_000, finalOutcome: "completed" },
    }), { "contract-runtime": { first: page("contract-runtime", [first], "cursor-revision-42"), "cursor-revision-42": page("contract-runtime", [next]) } });
    await openFeatureDetails(browser, state);
    const region = runtimeRegion(browser, "Runtime execution");
    await region.getByRole("button", { name: "Show runtime evidence" }).click();
    await region.getByRole("button", { name: "Load more runtime evidence" }).click();

    await expect(region).toContainText("revision revision-41");
    await expect(region).toContainText("revision revision-42");
    await expect(region).toContainText("deepseek-work / implementation-model");
    await expect(region).toContainText("deepseek-work / implementation-v2");
    await expect(region.locator(".runtime-evidence-chain").nth(0)).toContainText("implementation-model");
    await expect(region.locator(".runtime-evidence-chain").nth(0)).not.toContainText("implementation-v2");
  });

  test("E011-EVID-001 atomically refreshes card-correlated evidence without browser secret leakage", async ({ page: browser }) => {
    const consoleMessages: string[] = [];
    browser.on("console", (message) => consoleMessages.push(message.text()));
    const first = chain({ invocationId: "invocation-before-refresh", phaseId: "contract-runtime", phaseNumber: 3, route: ROOT_ROUTE, openedAt: "2026-07-23T12:00:00.000Z", settledAt: "2026-07-23T12:01:00.000Z" });
    const refreshed = chain({ invocationId: "invocation-after-refresh", phaseId: "contract-runtime", phaseNumber: 3, route: LATER_ROUTE, openedAt: "2026-07-23T12:02:00.000Z", settledAt: "2026-07-23T12:03:00.000Z", revisionId: "revision-42" });
    const state = fixtureState(featureSummary({
      "contract-runtime": { state: "completed", invocationCount: 1, actualRoutes: [ROOT_ROUTE], aggregateDurationMs: 60_000, finalOutcome: "completed" },
    }), { "contract-runtime": { first: page("contract-runtime", [first]) } });
    await openFeatureDetails(browser, state);
    const region = runtimeRegion(browser, "Runtime execution");
    await region.getByRole("button", { name: "Show runtime evidence" }).click();
    await expect(region).toContainText("invocation-before-refresh");

    state.summary = featureSummary({
      "contract-runtime": { state: "completed", invocationCount: 1, actualRoutes: [LATER_ROUTE], aggregateDurationMs: 60_000, finalOutcome: "completed" },
    });
    state.pages["contract-runtime"] = { first: page("contract-runtime", [refreshed]) };
    state.failDetailRefresh = true;
    await browser.evaluate(() => window.__emitRuntimeEvidenceEvent?.({
      id: "event-runtime-refresh",
      projectId: "hepha",
      category: "phase",
      type: "phase.completed",
      occurredAt: "2026-07-23T12:04:00.000Z",
      cardId: "feature:FEAT-062",
      summary: "payload route provider-payload / model-payload must not render",
      replayable: true,
      metadata: { claimedRoute: "provider-payload / model-payload" },
    }));
    await expect(region.getByText("Last confirmed snapshot", { exact: true })).toBeVisible();
    await expect(region).toContainText("invocation-before-refresh");
    await expect(region).not.toContainText("invocation-after-refresh");
    await expect(region).not.toContainText("provider-payload / model-payload");

    state.failDetailRefresh = false;
    await region.getByRole("button", { name: "Refresh" }).click();
    await expect(region).toContainText("invocation-after-refresh");
    await expect(region).not.toContainText("invocation-before-refresh");
    await expect(region.getByText("Last confirmed snapshot", { exact: true })).toHaveCount(0);

    expect(state.responseBodies.join("\n")).not.toContain(SECRET);
    expect(state.requestUrls.join("\n")).not.toContain(SECRET);
    expect(await browser.locator("body").innerText()).not.toContain(SECRET);
    expect(await accessibleAttributes(browser)).not.toContain(SECRET);
    expect(consoleMessages.join("\n")).not.toContain(SECRET);
  });
});
