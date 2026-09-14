import { expect, test } from "@playwright/test";
import { completionLoopFixture, completionScenarios } from "../../orchestrator/test/support/completion-loop-fixture.js";

// Browser twins use real HTTP, SQLite, artifact projection and the built dashboard.
// Only model/worker ports use synthetic outcomes, shared with the server twins.
for (const scenario of completionScenarios) test(`${scenario.id}: ${scenario.title}`, async ({ page }) => {
  const f = await completionLoopFixture(scenario.mode, scenario.id === "CR-04" ? 41 : 23);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const endpoint = `/api/projects/${f.project.id}/completion-readiness`;
  const assess = async () => {
    const response = await f.post(endpoint, { cardId: f.feature.id, reassess: true });
    expect(response.status).toBe(200); return response.body;
  };
  try {
    const original = await f.metrics();
    await page.goto(f.url);
    await page.getByRole("button", { name: /FEAT-EXAMPLE.*Synthetic delivery/ }).click();
    const detail = page.locator("aside.detail-panel");
    const complete = detail.getByRole("button", { name: "Complete Feature", exact: true });
    const confirmation = detail.getByRole("button", { name: /I confirm these evidence links/ });
    await expect(detail.getByRole("button", { name: "Refresh Completion Readiness", exact: true })).toBeVisible();
    let state = await assess();
    await expect(confirmation).toHaveCount(0);
    if (["assessment-error", "schema-exhaustion"].includes(scenario.mode)) {
      await expect(complete).toBeDisabled();
      await expect(detail.getByText(/Coverage assessment incomplete/).first()).toBeVisible();
      expect((await f.metrics()).workerCalls).toBe(0);
      state = await assess();
    }
    if (scenario.mode === "reassessment") {
      await expect(complete).toBeDisabled();
      state = await assess(); state = await assess();
    }
    if (scenario.mode === "changed-report") {
      await expect(complete).toBeEnabled();
      await f.post("/api/test/tamper", {}); state = await assess();
    }
    const requiresWorker = ["repair", "changed-report", "discovery-only", "configured-execution", "diagnosis-repair", "repair-no-execution", "large-routing"].includes(scenario.mode);
    if (requiresWorker) {
      await expect(complete).toBeDisabled();
      const attempts = ["discovery-only", "configured-execution"].includes(scenario.mode) ? 2 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const current = await f.metrics();
        const gap = current.record?.phaseGaps?.find(g => g.kind !== "coverage_confirmation");
        expect(gap).toBeTruthy();
        if (attempt && ["discovery-only", "configured-execution"].includes(scenario.mode)) await f.post("/api/test/environment-ready", {});
        if (gap!.kind === "execution_evidence") {
          const checkbox = detail.getByRole("checkbox", { name: "The listed execution prerequisites are available" });
          if (gap!.executions?.some(e => e.prerequisite)) {
            await expect(detail.getByRole("button", { name: "Run existing verification", exact: true })).toBeDisabled();
            await checkbox.check();
          }
          await detail.getByRole("button", { name: "Run existing verification", exact: true }).click();
        } else {
          await detail.getByRole("button", { name: "Verify / repair phase quality gaps", exact: true }).click();
        }
        const expectedCalls = ["discovery-only", "configured-execution"].includes(scenario.mode) ? (attempt ? 4 : 3)
          : scenario.mode === "diagnosis-repair" ? 2 : scenario.mode === "repair-no-execution" ? 3 : 1;
        await expect.poll(async () => { const m = await f.metrics(); return m.workerCalls === expectedCalls && !m.busy; }).toBe(true);
        await expect.poll(async () => (await f.metrics()).metadata?.workflowCurrentStep).not.toBe("Repair finished; refreshing completion readiness");
        await expect(confirmation).toHaveCount(0);
      }
    }
    if (scenario.mode === "repair-no-execution") {
      await expect(complete).toBeDisabled();
      expect((await f.metrics()).record?.unresolved.length).toBeGreaterThan(0);
      const report = detail.locator(".workflow-last-run-summary");
      await expect(report).toContainText("Round 3:");
      await expect(report).toContainText("Independent verification:");
      await expect(report).toContainText("Why HEPHA stopped:");
      await expect(report).toContainText("repair textbox");
    } else {
      await expect(complete).toBeEnabled();
      await expect(detail.getByRole("button", { name: "Verify / repair phase quality gaps", exact: true })).toHaveCount(0);
    }
    if (scenario.mode === "mixed-evidence") {
      await expect(detail.getByText("1 improvements for future planning — non-blocking", { exact: true })).toBeVisible();
      expect((await f.metrics()).record?.assessedLinks?.filter(l => l.sourceId === "AC-02").map(l => l.kind).sort()).toEqual(["automated", "manual"]);
    }
    const final = await f.metrics();
    expect(final.results).toEqual(original.results); expect(final.pack).toEqual(original.pack);
    expect(final.metadata?.userCodeReviewCompletedAt).toBe(original.metadata?.userCodeReviewCompletedAt);
    expect(final.lifecycle).toBe("03_IN_PROGRESS");
    expect(final.unexpected).toEqual([]); expect(errors).toEqual([]);
    // Complete Feature stays an explicit user action; the tests never click it.
  } finally { await f.close(); }
});
