import { expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { freshScenarios, freshVerificationFixture, timestampMetadataModes, qualifiedRevisions } from "./support/fresh-verification-fixture.js";
import { ExecutionReceiptProducer } from "../src/manual-test-verification/execution-receipt-producer.js";
import { sha256 } from "../src/manual-test-verification/fresh-verification-evidence.js";
import { verificationSetupContract } from "../src/workflows/prompts/verification-setup-contract.js";
import { freshFeatureInspectionPrompt } from "../src/workflows/prompts/fresh-feature-verification-prompt.js";

it("reinspects an obsolete setup contract instead of executing its inherited external-service blocker", async () => {
  const f = await freshVerificationFixture("passed");
  try {
    const endpoint = `/api/projects/${f.project.id}/completion-readiness`;
    const input = { cardId: f.feature.id, reassess: true, verifyExisting: true };
    await f.post(endpoint, input);
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const baselinePath = join(f.feature.folderPath, "manual-test-verification/inspection-baseline.json");
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    const currentPrompt = freshFeatureInspectionPrompt(f.project, f.feature, { runId: "current-run", directory: "current-run-directory" });
    baseline.contractHash = sha256(JSON.stringify(f.project) + currentPrompt.replace(verificationSetupContract(), ""));
    baseline.plan.checks[1].reason = "Historical planning says an unrelated settlement daemon must be supplied externally";
    baseline.planHash = sha256(JSON.stringify(baseline.plan));
    writeFileSync(baselinePath, JSON.stringify(baseline));
    await f.post(endpoint, input);
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(m.inspectionReads).toBe(2); expect(m.executions).toBe(4);
    expect(m.fresh?.reusedPlanFromRunId).toBeUndefined();
    expect(m.fresh?.status).toBe("passed");
    expect(m.prompts.at(-1)).toContain(verificationSetupContract());
    expect(m.prompts.at(-1)).not.toContain("settlement daemon");
    expect(m.fresh?.plan?.checks[1]?.reason).toContain("setup.md verified");
    const confirmed = await f.post(endpoint, { cardId: f.feature.id});
    expect(confirmed.body.assessment.ready).toBe(true);
  } finally { await f.close(); }
});

it("upgrades a reused legacy plan before execution and preserves its original command for audit", async () => {
  const f = await freshVerificationFixture("manifest-resolution");
  try {
    const endpoint = `/api/projects/${f.project.id}/completion-readiness`;
    const input = { cardId: f.feature.id, reassess: true, verifyExisting: true };
    await f.post(endpoint, input);
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const baselinePath = join(f.feature.folderPath, "manual-test-verification/inspection-baseline.json");
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    // Reproduce a baseline written by the older runtime; source and scope agree.
    baseline.plan.checks[0].command = "cargo metadata --no-deps --format-version 1";
    baseline.planHash = sha256(JSON.stringify(baseline.plan));
    writeFileSync(baselinePath, JSON.stringify(baseline));
    await f.post(endpoint, input);
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(m.fresh?.status).toBe("passed"); expect(m.inspectionReads).toBe(1);
    expect(m.preparationCommands).toEqual(Array(2).fill("cargo metadata --manifest-path native/Cargo.toml --no-deps --format-version 1"));
    const artifact = (name: string) => JSON.parse(readFileSync(join(m.fresh!.directory, name), "utf8"));
    expect(artifact("inspection-before-command-resolution.json").checks[0].command).toBe(baseline.plan.checks[0].command);
    expect(artifact("execution-plan-corrections.json").corrections[0]).toMatchObject({ before: baseline.plan.checks[0].command, after: m.preparationCommands[0] });
    for (const name of ["inspection-selected.json", "receipt-context.json", "receipt.json"])
      expect(artifact(name).checks[0].command).toBe(m.preparationCommands[0]);
    expect(JSON.parse(readFileSync(baselinePath, "utf8")).plan.checks[0].command).toBe(m.preparationCommands[0]);
  } finally { await f.close(); }
});

it("accepts fresh native evidence when the worker and metadata producer both omit runId", async () => {
  const f = await freshVerificationFixture("missing-run-id");
  const disabled = vi.spyOn(ExecutionReceiptProducer.prototype, "finalize").mockImplementation(() => {});
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(m.executions).toBe(2); expect(disabled).toHaveBeenCalledOnce();
    expect(m.fresh?.status).toBe("passed");
    expect(m.fresh?.error).toBeUndefined();
    expect(m.activities).toContain("assessing"); expect(m.ready).toBe(true);
  } finally { disabled.mockRestore(); await f.close(); }
});

it("escalates repeated unchanged plan defects without dispatching tests or looping", async () => {
  const f = await freshVerificationFixture("invalid-plan");
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).fresh?.status).toBe("blocked");
    const m = await f.freshMetrics();
    expect(m.inspectionReads).toBe(3); expect(m.executions).toBe(0);
    expect(m.fresh?.error).toContain("no validation progress");
    expect(m.activities).not.toContain("testing"); expect(m.activities).not.toContain("assessing");
  } finally { await f.close(); }
});
it.each(["changed", "malformed"])("does not reuse a %s partial inspection checkpoint", async kind => {
  const f = await freshVerificationFixture("budget");
  try {
    const endpoint = `/api/projects/${f.project.id}/completion-readiness`, input = { cardId: f.feature.id, reassess: true, verifyExisting: true };
    await f.post(endpoint, input);
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const previous = (await f.freshMetrics()).fresh!;
    if (kind === "changed") writeFileSync(join(f.project.rootPath, "source.json"), '{"value":1,"revision":2}');
    else writeFileSync(join(previous.directory, "inspection-checkpoint.json"), "{bad JSON");
    await f.post(endpoint, input);
    await expect.poll(async () => (await f.freshMetrics()).executions).toBe(2);
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    expect((await f.freshMetrics()).prompts[1]).not.toContain("Previous partial inspection checkpoint (revalidate, never evidence):");
  } finally { await f.close(); }
});
for (const scenario of freshScenarios) it(`${scenario.id}: ${scenario.title}`, async () => {
  const f = await freshVerificationFixture(scenario.mode);
  const endpoint = `/api/projects/${f.project.id}/completion-readiness`, input = { cardId: f.feature.id, reassess: true, verifyExisting: true };
  try {
    const before = await f.metrics(); const release = f.hold();
    expect((await f.post(endpoint, input)).status).toBe(200);
    expect((await f.post(endpoint, input)).status).toBe(400);
    release();
    if (scenario.mode === "budget") {
      await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
      const stopped = await f.freshMetrics();
      expect(stopped.executions).toBe(0); expect(stopped.fresh?.status).toBe("blocked");
      expect(stopped.fresh?.error).toContain("limit=512000"); expect(stopped.fresh?.error).not.toContain("HEPHA_MODEL_REQUEST {");
      expect((await f.post(endpoint, input)).status).toBe(200);
    }
    await expect.poll(async () => (await f.freshMetrics()).metadata?.workflowStatus, { timeout: 10000 }).not.toBe("running");
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    let m = await f.freshMetrics();
    expect(m.inspectionReads).toBe(["budget", "mixed", "changed"].includes(scenario.mode) ? 2 : 1); expect(m.executions).toBe(scenario.mode === "changed" ? 4 : 2);
    if (scenario.mode === "mixed") expect(m.activities).toEqual(["inspecting", "correcting", "preparing", "testing", "waiting", "testing", "waiting", "checking", "waiting", "validating", "assessing"]);
    expect(m.commands).toEqual(scenario.mode === "changed" ? ["node runner.cjs save", "node runner.cjs browser", "node runner.cjs save", "node runner.cjs browser"] : ["node runner.cjs save", "node runner.cjs browser"]);
    const executionPrompt = m.prompts.find(p => p.startsWith("HEPHA fresh feature verification: execute"));
    expect(executionPrompt).toContain("rerun EVERY selected check");
    expect(executionPrompt).toContain("do not edit production code");
    if (scenario.mode === "budget") expect(m.prompts[1]).toContain("Previous partial inspection checkpoint (revalidate, never evidence):");
    expect(m.results).toEqual(before.results); expect(m.pack).toEqual(before.pack);
    expect(m.lifecycle).toBe("03_IN_PROGRESS"); expect(m.ready).toBe(!["failed", "skipped", "changed", "wrong-run-id"].includes(scenario.mode));
    if (scenario.mode === "missing-run-id") {
      const receipts = f.receiptArtifacts();
      expect(receipts.worker).not.toHaveProperty("runId");
      expect(receipts.canonical).toEqual({ ...receipts.worker, runId: m.fresh!.runId });
      expect(receipts.context.runId).toBe(m.fresh!.runId);
      expect(m.prompts.at(-1)).toContain(`audit.runId ${m.fresh!.runId}`);
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
      expect(m.fresh?.plan?.checks[1]?.reason).toContain("settlement-daemon"); // retained for audit, not forwarded
      expect(m.prompts.at(-1)).not.toContain("settlement-daemon");
      const context = JSON.parse(readFileSync(join(m.fresh!.directory, "receipt-context.json"), "utf8"));
      expect(context.checks.every((c: object) => Object.keys(c).sort().join() === "command,cwd,id,kind")).toBe(true);
    }
    if (timestampMetadataModes.includes(scenario.mode)) {
      const receipts = f.receiptArtifacts();
      expect(receipts.canonical).toEqual(receipts.worker);
      expect(receipts.canonical).not.toHaveProperty("runId");
      if (scenario.mode === "missing-timestamp") expect(receipts.canonical).not.toHaveProperty("verifiedAt");
      if (scenario.mode === "invalid-timestamp") expect(receipts.canonical.verifiedAt).toBe("clock unavailable");
      if (scenario.mode === "future-timestamp") expect(Date.parse(receipts.canonical.verifiedAt)).toBeGreaterThan(Date.now());
      if (scenario.mode === "stale-without-id") expect(Date.parse(receipts.canonical.verifiedAt)).toBeLessThan(Date.parse(m.fresh!.startedAt));
    }
    if (["failed", "skipped", "changed", "wrong-run-id"].includes(scenario.mode)) {
      expect(m.fresh?.status).toBe("blocked"); expect(m.metadata?.workflowStatus).toBe("failed");
      if (scenario.mode === "changed") expect(m.fresh?.error).toContain("No successful command execution");
      if (scenario.mode === "wrong-run-id") expect(m.fresh?.error).toContain("runId does not match");
      expect((await f.post(endpoint, { cardId: f.feature.id })).status).toBe(400);
    } else {
      expect(m.fresh?.status).toBe("passed");
      expect(m.record?.unresolved).toEqual([]);
      expect(m.record?.assessedLinks.filter(l => l.kind === "automated").every(l => l.evidenceId.startsWith("receipt-"))).toBe(true);
      const confirmation = await f.post(endpoint, { cardId: f.feature.id});
      expect(confirmation.status).toBe(200); expect(confirmation.body.assessment.ready).toBe(true);
      await f.post(endpoint, { cardId: f.feature.id });
      expect((await f.freshMetrics()).executions).toBe(2);
      if (scenario.mode === "manifest-resolution") {
        expect(m.preparationCommands).toEqual(["cargo metadata --manifest-path native/Cargo.toml --no-deps --format-version 1"]);
        expect(f.currentReceipt().checks.find((c: { id: string }) => c.id === "manifest").command).toBe(m.preparationCommands[0]);
      }
      if (scenario.mode === "repeat" || scenario.mode === "renamed" || scenario.mode === "manifest-resolution") {
        if (scenario.mode === "renamed") f.renameDocumentedTest();
        expect((await f.post(endpoint, input)).status).toBe(200);
        await expect.poll(async () => (await f.freshMetrics()).executions).toBe(4);
        await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
        m = await f.freshMetrics(); expect(m.ready).toBe(!["failed", "skipped", "changed", "wrong-run-id"].includes(scenario.mode)); expect(m.fresh?.status).toBe("passed");
        expect(m.inspectionReads).toBe(scenario.mode === "renamed" ? 2 : 1);
        expect(Boolean(m.fresh?.reusedPlanFromRunId)).toBe(scenario.mode !== "renamed");
        expect(m.commands.slice(2)).toEqual(scenario.mode !== "renamed" ? m.commands.slice(0, 2) : ["node renamed-runner.cjs save", "node renamed-runner.cjs browser"]);
        if (scenario.mode === "manifest-resolution") expect(m.preparationCommands).toEqual([m.preparationCommands[0], m.preparationCommands[0]]);
      }
    }
  } finally { await f.close(); }
}, 15000);

it.each(["no-report", "blocked"] as const)("a %s worker cannot replace fresh evidence with old passes", async mode => {
  const f = await freshVerificationFixture(mode);
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).fresh?.status).toBe("blocked");
    expect((await f.freshMetrics()).ready).toBe(false);
  } finally { await f.close(); }
});

it("later dirty source changes invalidate completion without deleting human results", async () => {
  const f = await freshVerificationFixture("passed");
  try {
    const endpoint = `/api/projects/${f.project.id}/completion-readiness`;
    await f.post(endpoint, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).record?.baselineId).toBeTruthy();
    const before = await f.freshMetrics();
    await f.post(endpoint, { cardId: f.feature.id});
    expect((await f.freshMetrics()).ready).toBe(true);
    writeFileSync(join(f.project.rootPath, "source.json"), '{"value":10}');
    const after = await f.freshMetrics(); expect(after.ready).toBe(false); expect(after.results).toEqual(before.results);
    expect(after.executions).toBe(2);
  } finally { await f.close(); }
});

it("cancellation during inspection prevents execution and cannot be overwritten by late success", async () => {
  const f = await freshVerificationFixture("passed"), release = f.hold();
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    const current = await f.freshMetrics();
    await f.ports.store.recordFeatureWorkflowRun({ projectId: f.project.id, cardKey: `feature:${f.feature.externalId}`, runId: current.fresh!.runId, command: "continue-implementing", status: "cancelled" });
    release();
    await expect.poll(async () => (await f.freshMetrics()).fresh?.status).toBe("blocked");
    const after = await f.freshMetrics(); expect(after.executions).toBe(0); expect(after.metadata?.workflowStatus).toBe("cancelled"); expect(after.ready).toBe(false);
  } finally { release(); await f.close(); }
});

it("freshly mapped execution replaces an old failed automated phase gate before coverage assessment", async () => {
  const f = await freshVerificationFixture("passed");
  try {
    f.feature.implementationEvidence!.phaseQualityGates = [{ phaseNumber: 31, phaseStatus: "COMPLETED", phaseTitle: "Verification",
      changedFiles: [], codeFiles: [], documentationFiles: [], testFiles: [], warnings: [],
      gates: [{ gate: "tests", status: "missing", justification: "Recorded failed historical execution", evidencePaths: [] }] }];
    const endpoint = `/api/projects/${f.project.id}/completion-readiness`;
    await f.post(endpoint, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).record?.baselineId).toBeTruthy();
    const m = await f.freshMetrics();
    const result = await f.post(endpoint, { cardId: f.feature.id});
    expect(result.body.assessment.ready).toBe(true);
    expect((await f.freshMetrics()).ready).toBe(true);
    expect(f.feature.implementationEvidence!.phaseQualityGates[0]!.gates[0]!.status).toBe("missing"); // historical input is not rewritten
  } finally { await f.close(); }
});

it("publishing future improvement advice preserves fresh source validity and human results", async () => {
  const f = await freshVerificationFixture("passed");
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const before = await f.freshMetrics(); expect(before.ready).toBe(true);
    const { publishReadinessImprovements } = await import("../src/manual-test-verification/readiness-improvements.js");
    const { freshVerificationEvidence } = await import("../src/manual-test-verification/fresh-verification-state.js");
    publishReadinessImprovements(f.project.memoryBankPath, f.feature.externalId, { ...before.record!, improvements: [{ id: "future-browser-depth", observation: "Consider another browser scenario", rationale: "Outside this accepted feature scope", references: ["tests/browser.spec.ts"], status: "proposed-for-future-planning" }] });
    expect(freshVerificationEvidence(f.feature.folderPath)?.error).toBeUndefined();
    const after = await f.freshMetrics(); expect(after.ready).toBe(true);
    expect(after.results).toEqual(before.results); expect(after.pack).toEqual(before.pack);
  } finally { await f.close(); }
});
