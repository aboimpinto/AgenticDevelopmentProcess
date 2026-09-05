import { expect, test } from "@playwright/test";
import { installDashboardFixtures } from "./fixtures/dashboard-fixtures";

/** @see apps/web/e2e/features/feat-068-shadow-rollout.feature */
function shadowDashboard() {
  const counts = [{ key: "APPROVED", count: 1 }];
  return {
    schemaVersion: "hepha-governance-dashboard/v1", projectId: "hepha",
    remediations: [], replans: [], architectureDebt: [], queue: [],
    metrics: { reviewResults: counts, gateStates: counts, cycleStates: counts, findingDispositions: counts, ruleReferences: counts, recoveryStopReasons: [], replanStates: counts, debtStates: counts, debtPriorities: counts, scopeDecisionOutcomes: [], replanDecisionOutcomes: [], futureTouchDecisionKinds: [], dispatchOutcomes: [], shadowOutcomes: [{ key: "MATCH", count: 1 }], pilotOutcomes: [], reviewRuns: 0, openRemediationCycles: 0, replanAggregates: 0, architectureDebtRecords: 0, actionableQueueItems: 0, postFixManifestations: 0, acceptedScopeExpansions: 0 },
    rollout: {
      mode: "DISABLED", eventVersion: 0,
      parity: { receiptId: "parity-receipt-1", projectionSchema: "hepha-governance-parity/v1", sourceVersionHash: "a".repeat(64), authoritativeHash: "b".repeat(64), dashboardHash: "b".repeat(64), result: "MATCH", differenceCategories: [], comparedAt: "2026-07-20T15:00:00.000Z", validUntil: "2026-07-21T15:00:00.000Z" },
      migration: { auditId: "migration-audit-1", schemaArea: "GOVERNANCE_ROLLOUT", fromVersion: 0, toVersion: 1, outcome: "APPLIED", completedAt: "2026-07-20T15:00:00.000Z", readBackHash: "c".repeat(64) },
      pilot: null,
    },
  };
}

function activePilotDashboard() {
  const data = shadowDashboard();
  return { ...data, rollout: { ...data.rollout, mode: "ACTIVE" as const, eventVersion: 1, pilot: { pilotId: "pilot-068", featureId: "feat-068", phaseContractId: "controlled-enforcement-pilot", taskId: "pilot-task-068", contractVersion: 1, pilotConfigHash: "d".repeat(64), approvalReceiptId: "approval-068", approvedAt: "2026-07-20T15:00:00.000Z", expiresAt: "2026-07-20T16:00:00.000Z", lastOutcome: "PILOT_ADMITTED" } } };
}

test("presents a disabled browser-visible shadow rollout status without enforcement controls", async ({ page }) => {
  await installDashboardFixtures(page, []);
  await page.route("**/api/projects/hepha/governance/dashboard", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { kind: "governance_read", data: shadowDashboard() } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Governance" }).click();

  const rollout = page.getByRole("region", { name: "Governance rollout status" });
  await expect(rollout).toContainText("DISABLED — enforcement is not enabled by this dashboard.");
  await expect(rollout).not.toContainText("a".repeat(64));
  await expect(rollout).not.toContainText("b".repeat(64));
  await expect(rollout).not.toContainText("c".repeat(64));
  await expect(rollout.getByRole("button")).toHaveCount(0);
});

test("shows the bounded active-pilot status and only an explicit disable control", async ({ page }) => {
  await installDashboardFixtures(page, []);
  await page.route("**/api/projects/hepha/governance/dashboard", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { kind: "governance_read", data: activePilotDashboard() } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Governance" }).click();
  const rollout = page.getByRole("region", { name: "Governance rollout status" });
  await expect(rollout).toContainText("ACTIVE — the pilot remains loopback-only and bounded by its persisted approval.");
  await expect(rollout.getByRole("button", { name: "Disable active pilot" })).toBeVisible();
  await expect(rollout).not.toContainText("d".repeat(64));
  await page.getByRole("button", { name: "Disable active pilot" }).click();
  await expect(page.getByRole("dialog", { name: "Confirm governance action" })).toBeVisible();
});
