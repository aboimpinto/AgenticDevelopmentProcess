import { expect, test } from "@playwright/test";
import { freshScenarios, freshVerificationFixture, qualifiedRevisions } from "../../orchestrator/test/support/fresh-verification-fixture.js";
for (const scenario of freshScenarios) test(`${scenario.id}: ${scenario.title}`, async ({ page }) => {
  const f = await freshVerificationFixture(scenario.mode), errors: string[] = [];
  const releaseTests = scenario.mode === "mixed" ? f.holdTests() : undefined;
  const releaseAssessment = scenario.mode === "mixed" ? f.holdAssessment() : undefined;
  page.on("pageerror", error => errors.push(error.message));
  try {
    const before = await f.metrics(), release = f.hold();
    await page.goto(f.url);
    await page.getByRole("button", { name: /FEAT-EXAMPLE.*Synthetic delivery/ }).click();
    const detail = page.locator("aside.detail-panel");
    const refresh = detail.getByRole("button", { name: /^(Refresh Completion Readiness|Retry verification)$/ });
    const complete = detail.getByRole("button", { name: "Complete Feature", exact: true });
    try {
      await refresh.click();
      await expect(detail.locator("button:enabled").filter({ hasText: /^Complete Feature$/ })).toHaveCount(0);
      await expect.poll(async () => (await f.freshMetrics()).stages).toBe(1);
      await expect(detail.locator("button:enabled").filter({ hasText: /^Refresh Completion Readiness$/ })).toHaveCount(0);
    } finally { release(); }
    if (releaseTests) {
      try {
        await expect.poll(async () => (await f.freshMetrics()).executions).toBe(1);
        await expect(page.getByRole("status", { name: "Completion readiness refresh running" })).toContainText("Running relevant tests");
        const activityBadge = page.getByRole("status", { name: "Completion readiness refresh running" }).locator(".wp-execution-state");
        const expectedGap = await page.locator(".validation-badge").first().evaluate(element => getComputedStyle(element).columnGap);
        // Flex items compute inline-flex to flex inside the card's flex stack.
        await expect(activityBadge).toHaveCSS("display", "flex");
        await expect(activityBadge).toHaveCSS("column-gap", expectedGap);
        await expect(activityBadge).toHaveCSS("align-items", "center");
        await expect(detail.getByText("Finalization in progress", { exact: true })).toHaveCount(0);
      } finally { releaseTests(); }
      try {
        await expect.poll(async () => (await f.freshMetrics()).executions).toBe(2);
        await expect(page.getByRole("status", { name: "Completion readiness refresh running" })).toContainText("Evaluating test evidence");
        await expect(detail.locator("button:enabled").filter({ hasText: /^Complete Feature$/ })).toHaveCount(0);
      } finally { releaseAssessment?.(); }
    }
    if (scenario.mode === "budget") {
      await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
      await expect(detail.getByRole("button", { name: "Retry verification", exact: true })).toBeEnabled(); await expect(complete).toBeDisabled();
      expect((await f.freshMetrics()).executions).toBe(0);
      await expect(detail.getByText(/HEPHA_INPUT_USAGE_BUDGET_EXCEEDED/).first()).toBeVisible();
      expect(await detail.textContent()).not.toContain("HEPHA_MODEL_REQUEST {");
      await refresh.click();
    }
    await expect.poll(async () => (await f.freshMetrics()).executions).toBe(2);
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    await expect(refresh).toBeEnabled();
    const m = await f.freshMetrics();
    expect(m.inspectionReads).toBe(["budget", "mixed", "changed"].includes(scenario.mode) ? 2 : 1);
    expect(m.executions).toBe(scenario.mode === "changed" ? 4 : 2);
    if (scenario.mode === "mixed") expect(m.activities).toEqual(["inspecting", "correcting", "preparing", "testing", "waiting", "testing", "waiting", "checking", "waiting", "validating", "assessing"]);
    if (scenario.mode === "budget") expect(m.prompts[1]).toContain("Previous partial inspection checkpoint (revalidate, never evidence):");
    expect(m.commands).toEqual(scenario.mode === "changed"
      ? ["node runner.cjs save", "node runner.cjs browser", "node runner.cjs save", "node runner.cjs browser"]
      : ["node runner.cjs save", "node runner.cjs browser"]);
    expect(m.results).toEqual(before.results); expect(m.pack).toEqual(before.pack);
    if (scenario.mode === "missing-run-id") {
      const receipts = f.receiptArtifacts();
      expect(receipts.worker).not.toHaveProperty("runId");
      expect(receipts.canonical).toEqual({ ...receipts.worker, runId: m.fresh!.runId });
      expect(receipts.context.runId).toBe(m.fresh!.runId);
    }
    if (scenario.mode === "unwritten-run-id") {
      const receipts = f.receiptArtifacts();
      expect(receipts.canonical).not.toHaveProperty("runId");
      expect(receipts.canonical).toEqual(receipts.worker);
      expect(Date.parse(receipts.canonical.verifiedAt)).toBeGreaterThanOrEqual(Date.parse(m.fresh!.startedAt));
    }
    if (scenario.mode === "cwd-prefix") {
      expect(f.currentReceipt().checks.map((check: { command: string }) => check.command))
        .toEqual(m.commands.map(command => `cd '${f.project.rootPath}' && ${command}`));
    }
    if (scenario.mode === "hash-first-revision") expect(f.currentReceipt().checks.map((c: { testedRevision: string }) => c.testedRevision)).toEqual(qualifiedRevisions);
    if (scenario.mode === "console-capture") {
      expect(f.currentReceipt().checks.every((c: { command: string }) => c.command.endsWith("2>&1"))).toBe(true);
      expect(m.fresh?.plan?.checks.map(c => c.command)).toEqual(m.commands);
    }
    if (scenario.mode === "inherited-setup-claim") {
      expect(m.fresh?.plan?.checks[1]?.reason).toContain("settlement-daemon");
      expect(m.prompts.at(-1)).not.toContain("settlement-daemon");
    }
    if (["stale-without-id", "missing-timestamp", "invalid-timestamp", "future-timestamp"].includes(scenario.mode)) {
      const receipts = f.receiptArtifacts();
      expect(receipts.canonical).toEqual(receipts.worker);
      expect(receipts.canonical).not.toHaveProperty("runId");
      if (scenario.mode === "missing-timestamp") expect(receipts.canonical).not.toHaveProperty("verifiedAt");
      if (scenario.mode === "invalid-timestamp") expect(receipts.canonical.verifiedAt).toBe("clock unavailable");
      if (scenario.mode === "future-timestamp") expect(Date.parse(receipts.canonical.verifiedAt)).toBeGreaterThan(Date.now());
      if (scenario.mode === "stale-without-id") expect(Date.parse(receipts.canonical.verifiedAt)).toBeLessThan(Date.parse(m.fresh!.startedAt));
    }
    if (["failed", "skipped", "changed", "wrong-run-id"].includes(scenario.mode)) {
      expect(m.fresh?.status).toBe("blocked"); await expect(complete).toBeDisabled();
      await expect(detail.getByRole("button", { name: "Retry verification", exact: true })).toBeEnabled();
      expect(m.fresh?.error).toBeTruthy();
      // Surface the shared importer's diagnosis, not a Refresh-specific error dialect.
      await expect(detail).toContainText(m.fresh!.error!);
    } else {
      expect(m.fresh?.status).toBe("passed");
      const confirm = detail.getByRole("button", { name: /I confirm these evidence links/ });
      await expect(confirm).toHaveCount(0);
      await expect(complete).toBeEnabled();
      if (scenario.mode === "manifest-resolution") {
        expect(m.preparationCommands).toEqual(["cargo metadata --manifest-path native/Cargo.toml --no-deps --format-version 1"]);
        expect(f.currentReceipt().checks.find((c: { id: string }) => c.id === "manifest").command).toBe(m.preparationCommands[0]);
      }
      if (scenario.mode === "repeat" || scenario.mode === "renamed" || scenario.mode === "manifest-resolution") {
        if (scenario.mode === "renamed") f.renameDocumentedTest();
        await refresh.click();
        await expect.poll(async () => (await f.freshMetrics()).executions).toBe(4);
        await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
        await expect(complete).toBeEnabled(); await expect(confirm).toHaveCount(0);
        const repeated = await f.freshMetrics();
        expect(repeated.inspectionReads).toBe(scenario.mode === "renamed" ? 2 : 1);
        expect(Boolean(repeated.fresh?.reusedPlanFromRunId)).toBe(scenario.mode !== "renamed");
        expect(repeated.commands.slice(2)).toEqual(scenario.mode !== "renamed" ? repeated.commands.slice(0, 2) : ["node renamed-runner.cjs save", "node renamed-runner.cjs browser"]);
        if (scenario.mode === "manifest-resolution") expect(repeated.preparationCommands).toEqual([m.preparationCommands[0], m.preparationCommands[0]]);
      }
    }
    expect((await f.freshMetrics()).lifecycle).toBe("03_IN_PROGRESS"); expect(errors).toEqual([]);
    // Never click Complete Feature; acceptance and finalization remain human owned.
  } finally { releaseTests?.(); releaseAssessment?.(); await page.close(); await f.close(); }
});
