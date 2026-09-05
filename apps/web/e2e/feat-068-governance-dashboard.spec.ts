import { expect, test, type Page } from "@playwright/test";
import { installDashboardFixtures } from "./fixtures/dashboard-fixtures";

function dashboard() {
  const count = [{ key: "APPROVED", count: 1 }];
  return {
    schemaVersion: "hepha-governance-dashboard/v1", projectId: "hepha",
    remediations: [{ reviewRunId: "review-1", featureId: "FEAT-068", phaseNumber: 4, reviewGateId: "gate-1", manifestHash: "a".repeat(64), manifestResult: "NEEDS_CHANGES", ruleSnapshotHash: "b".repeat(64), createdAt: "2026-07-20T00:00:00.000Z", gate: { gateState: "REJECTED", reasonCode: "NEEDS_FIX", basisManifestHash: "a".repeat(64), cycleId: "cycle-1", decidedAt: "2026-07-20T00:00:00.000Z" }, cycleState: "OPEN", findings: [], receipts: [] }],
    replans: [{ aggregateId: "aggregate-1", featureId: "FEAT-068", phaseNumber: 4, reviewGateId: "gate-1", defectClass: "BOUNDARY", state: "REPLAN_PENDING_APPROVAL", eventVersion: 2, recurrence: { postFixManifestations: 1, acceptedScopeExpansions: 0 }, currentRequest: { requestId: "request-1", planHash: "c".repeat(64), planVersion: 1, requestedAt: "2026-07-20T00:00:00.000Z" }, scopeExpansionDecisions: [], replanDecisions: [], dispatch: null, summary: { observations: 1, requests: 1, decisions: 0, dispatchAttempts: 0, reviewAssessments: 1 }, availableActions: ["APPROVE_REPLAN"] }],
    architectureDebt: [{ recordId: "debt-1", state: "PENDING_TRIAGE", eventVersion: 1, ownerId: "steward", priority: "P1", prioritySource: "AUTO_PENDING_DEFAULT", rule: { ruleId: "rule-1", ruleVersion: "1", category: "architecture", sourceReference: "catalog" }, architecturalBoundary: "web", rationale: "Safe debt rationale", risk: "medium", locations: [], futureTouchTrigger: { triggerId: "trigger-1", name: "future touch", paths: [], symbols: [], ruleTags: [] }, discovery: { featureId: "FEAT-068", phaseNumber: 4, reviewGateId: "gate-1", findingId: "finding-1" }, futureTouchDecisions: [], availableActions: [] }],
    queue: [{ itemId: "replan:aggregate-1", itemKind: "REPLAN", targetId: "aggregate-1", featureId: "FEAT-068", state: "REPLAN_PENDING_APPROVAL", currentVersion: 2, requiresAction: true, urgency: "REPLAN_APPROVAL", summaryCode: "REPLAN_APPROVAL", availableActions: ["APPROVE_REPLAN"] }],
    metrics: { reviewResults: count, gateStates: count, cycleStates: count, findingDispositions: count, ruleReferences: count, recoveryStopReasons: [], replanStates: count, debtStates: count, debtPriorities: count, scopeDecisionOutcomes: [], replanDecisionOutcomes: [], futureTouchDecisionKinds: [], dispatchOutcomes: [], shadowOutcomes: [], pilotOutcomes: [], reviewRuns: 1, openRemediationCycles: 1, replanAggregates: 1, architectureDebtRecords: 1, actionableQueueItems: 1, postFixManifestations: 1, acceptedScopeExpansions: 0 },
    rollout: { mode: "DISABLED", eventVersion: 0, parity: null, migration: null, pilot: null },
  };
}

async function installGovernanceFixtures(page: Page, actionResult: object) {
  await installDashboardFixtures(page, []);
  await page.route("**/api/projects/hepha/governance/dashboard", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { kind: "governance_read", data: dashboard() } });
  });
  await page.route("**/api/projects/hepha/governance/actions", async (route) => {
    await route.fulfill({ contentType: "application/json", json: actionResult });
  });
}

async function openActionDialog(page: Page) {
  await page.getByRole("button", { name: "Governance" }).click();
  await expect(page.getByRole("heading", { name: "Governance dashboard" })).toBeVisible();
  await page.getByRole("button", { name: /REPLAN: REPLAN_APPROVAL/ }).click();
  await page.getByRole("button", { name: "APPROVE_REPLAN" }).click();
}

test.describe("Governance dashboard (FEAT-068)", () => {
  test("lists safe governance state and confirms a replan action with focus restoration", async ({ page }) => {
    const sent: unknown[] = [];
    await installDashboardFixtures(page, []);
    await page.route("**/api/projects/hepha/governance/dashboard", async (route) => {
      await route.fulfill({ contentType: "application/json", json: { kind: "governance_read", data: dashboard() } });
    });
    await page.route("**/api/projects/hepha/governance/actions", async (route) => {
      const request = route.request().postDataJSON();
      sent.push(request);
      await route.fulfill({ contentType: "application/json", json: { kind: "governance_action_recorded", receipt: { actionId: request.actionId, projectId: "hepha", kind: request.kind, action: request.action, targetKey: "aggregate-1", actorId: "local-steward", authorizedRole: "ARCHITECTURE_STEWARD", reason: request.reason, expectedVersion: request.expectedVersion, resultingVersion: 3, recordedAt: "2026-07-20T00:00:00.000Z", providerReceiptId: "receipt-1" }, refreshed: dashboard() } });
    });

    await page.goto("/");
    await openActionDialog(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Confirm governance action" })).toBeFocused();
    const confirm = page.getByRole("button", { name: "Confirm APPROVE_REPLAN" });
    await expect(confirm).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("button", { name: "APPROVE_REPLAN" })).toBeFocused();

    await page.getByRole("button", { name: "APPROVE_REPLAN" }).click();
    await page.getByLabel("Reason").fill("Reviewed by the operator");
    await page.getByRole("checkbox").check();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByText("Recorded APPROVE_REPLAN; refreshed from the server.")).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ action: "APPROVE_REPLAN", expectedVersion: 2, confirmation: { statement: "I_CONFIRM_THIS_GOVERNANCE_ACTION", actionDigest: expect.stringMatching(/^[a-f0-9]{64}$/) } });
    await expect(page.locator("body")).not.toContainText("canonicalArtifact");
  });

  test("retains the current governance view and exposes a stale refusal", async ({ page }) => {
    await installGovernanceFixtures(page, { kind: "governance_action_refusal", code: "STALE_VERSION", message: "Version changed", currentVersion: 3 });
    await page.goto("/");
    await openActionDialog(page);
    await page.getByLabel("Reason").fill("Reviewed by the operator");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Confirm APPROVE_REPLAN" }).click();
    await expect(page.getByRole("alert")).toContainText("STALE_VERSION");
    await expect(page.getByRole("button", { name: /REPLAN: REPLAN_APPROVAL/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh governance dashboard" })).toBeEnabled();
  });
});
