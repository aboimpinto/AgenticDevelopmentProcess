import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { unlinkSync } from "node:fs";
import { sha256 } from "../src/manual-test-verification/fresh-verification-evidence.js";
import { freshVerificationFixture } from "./support/fresh-verification-fixture.js";

const receipt = (directory: string) => JSON.parse(readFileSync(join(directory, "receipt.json"), "utf8"));
const save = (directory: string, value: unknown) => writeFileSync(join(directory, "receipt.json"), JSON.stringify(value));

it.each(["command", "checksum", "json"])("repairs a %s evidence defect and reaches coverage without rerunning passing tests", async defect => {
  let original: string, repairs = 0;
  const f = await freshVerificationFixture("passed", {
    afterExecution: directory => {
      original = readFileSync(join(directory, "receipt.json"), "utf8");
      const r = receipt(directory);
      if (defect === "command") r.checks[0].command = r.checks[0].command + " --select-unrelated";
      if (defect === "checksum") r.checks[0].reportSha256 = "0".repeat(64);
      if (defect === "json") writeFileSync(join(directory, "receipt.json"), original.slice(0, -1));
      else save(directory, r);
    },
    repairEvidence: (directory, prompt) => {
      repairs++;
      expect(prompt).toContain("receipt-context.json");
      expect(prompt).toContain("inspection-selected.json");
      expect(prompt).toContain("Validation diagnostics");
      expect(prompt).toContain("Do not fabricate");
      // Simulates the agent checking actual invocation/native reports and repairing
      // only its representation. The initial runner really executed both tests.
      writeFileSync(join(directory, "receipt.json"), original!);
    },
  });
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(repairs).toBe(1); expect(m.executions).toBe(2);
    expect(m.fresh?.status).toBe("passed"); expect(m.activities).toContain("assessing");
    expect(m.record?.unresolved).toEqual([]);
    const audit = JSON.parse(readFileSync(join(m.fresh!.directory, "evidence-recovery-1.json"), "utf8"));
    expect(audit.diagnostics.length).toBeGreaterThan(0);
    expect(audit.receipt).not.toBe(original!);
  } finally { await f.close(); }
});

it("does not turn a real failed native report into a pass through receipt edits or repeated assurances", async () => {
  let repairs = 0;
  const f = await freshVerificationFixture("failed", { repairEvidence: directory => {
    repairs++;
    const r = receipt(directory);
    for (const c of r.checks) { c.exitCode = 0; c.success = true; c.passed = c.tests; c.failed = 0; }
    // Native results still fail. New audit metadata is not meaningful progress.
    r.verifiedAt = new Date().toISOString(); save(directory, r);
  } });
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(repairs).toBeGreaterThan(0); expect(repairs).toBeLessThanOrEqual(4);
    expect(m.fresh?.status).toBe("blocked"); expect(m.activities).not.toContain("assessing");
    expect(m.fresh?.error).toContain("no validation progress");
    expect(m.fresh?.error).toContain("passing execution");
    expect(m.executions).toBe(2);
  } finally { await f.close(); }
});

it("rechecks source freshness after an agent correction before allowing assessment", async () => {
  const f = await freshVerificationFixture("passed", {
    afterExecution: directory => { const r = receipt(directory); r.checks[0].reportSha256 = "0".repeat(64); save(directory, r); },
    repairEvidence: () => writeFileSync(join(f.project.rootPath, "source.json"), '{"value":9}'),
  });
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(m.fresh?.error).toContain("No successful command execution"); expect(m.executions).toBe(4); expect(m.activities).not.toContain("assessing");
  } finally { await f.close(); }
});

it("reruns only a check whose native report cannot be recovered", async () => {
  let unaffected = "", reruns = 0;
  const f = await freshVerificationFixture("passed", {
    afterExecution: directory => {
      const r = receipt(directory); unaffected = readFileSync(r.checks[1].reportPath, "utf8");
      unlinkSync(r.checks[0].reportPath);
    },
    repairEvidence: directory => {
      const r = receipt(directory), check = r.checks[0];
      const plan = JSON.parse(readFileSync(join(directory, "inspection-selected.json"), "utf8"));
      const selected = plan.checks.find((c: { id: string }) => c.id === check.id);
      const result = execFileSync(process.execPath, [selected.testPaths[0], check.id], { cwd: check.cwd, encoding: "utf8" });
      reruns++; writeFileSync(check.reportPath, result); check.reportSha256 = sha256(result); save(directory, r);
    },
  });
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(reruns).toBe(1); expect(m.executions).toBe(2);
    expect(m.fresh?.status).toBe("passed"); expect(m.activities).toContain("assessing");
    expect(readFileSync(receipt(m.fresh!.directory).checks[1].reportPath, "utf8")).toBe(unaffected);
  } finally { await f.close(); }
});

it("does not overwrite cancellation or start assessment after a late repair result", async () => {
  let release!: () => void, repairing = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  const f = await freshVerificationFixture("passed", {
    afterExecution: directory => { const r = receipt(directory); r.checks[0].reportSha256 = "0".repeat(64); save(directory, r); },
    repairEvidence: async () => { repairing = true; await held; },
  });
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(() => repairing).toBe(true);
    const m = await f.freshMetrics();
    await f.ports.store.recordFeatureWorkflowRun({ projectId: f.project.id, cardKey: `feature:${f.feature.externalId}`, runId: m.fresh!.runId, command: "continue-implementing", status: "cancelled" });
    release();
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const after = await f.freshMetrics();
    expect(after.metadata?.workflowStatus).toBe("cancelled"); expect(after.activities).not.toContain("assessing");
  } finally { release(); await f.close(); }
});

it("returns an execution worker error to the model and resumes from completed reports", async () => {
  let repairs = 0;
  const f = await freshVerificationFixture("passed", {
    afterExecution: () => { throw new Error("Evidence export failed after native reports were saved"); },
    repairEvidence: (_directory, prompt) => {
      repairs++;
      expect(prompt).toContain("Evidence export failed after native reports were saved");
      expect(prompt).toContain("Reuse valid passing evidence");
    },
  });
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(repairs).toBe(1); expect(m.executions).toBe(2);
    expect(m.fresh?.status).toBe("passed"); expect(m.activities).toContain("assessing");
  } finally { await f.close(); }
});

it("feeds a failed correction back into the next recovery prompt", async () => {
  let repairs = 0, original = "";
  const f = await freshVerificationFixture("passed", {
    afterExecution: directory => {
      original = readFileSync(join(directory, "receipt.json"), "utf8");
      const r = receipt(directory); r.checks[0].reportSha256 = "0".repeat(64); save(directory, r);
    },
    repairEvidence: (directory, prompt) => {
      if (++repairs === 1) throw new Error("Report location could not be resolved by the first repair");
      expect(prompt).toContain("Report location could not be resolved by the first repair");
      writeFileSync(join(directory, "receipt.json"), original);
    },
  });
  try {
    await f.post(`/api/projects/${f.project.id}/completion-readiness`, { cardId: f.feature.id, reassess: true, verifyExisting: true });
    await expect.poll(async () => (await f.freshMetrics()).busy).toBe(false);
    const m = await f.freshMetrics();
    expect(repairs).toBe(2); expect(m.executions).toBe(2); expect(m.fresh?.status).toBe("passed");
  } finally { await f.close(); }
});
