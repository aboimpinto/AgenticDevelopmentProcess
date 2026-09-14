import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkItemCard } from "@hepha/shared";
import { sha256 } from "../src/manual-test-verification/fresh-verification-evidence.js";
import { saveFreshState } from "../src/manual-test-verification/fresh-verification-state.js";
import { freshVerificationRepairAssessment } from "../src/application/features/fresh-verification-repair-context.js";
import { projectCompletionRecovery } from "../src/application/features/completion-recovery-projection.js";
import { PhaseQualityResolutionApplication } from "../src/application/features/phase-quality-resolution-application.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture(number = 42) {
  const root = mkdtempSync(join(tmpdir(), "hepha-failed-check-")); roots.push(root);
  const directory = join(root, "run"); mkdirSync(directory);
  const phasePath = join(root, "verification.md"); writeFileSync(phasePath, "Historical configured checks: GREEN\n");
  const path = join(directory, "check.log");
  const processResult = spawnSync(process.execPath, ["-e", "console.error('rule rejects a supported input'); process.exitCode=1"], { encoding: "utf8" });
  writeFileSync(path, processResult.stderr);
  const check = { id: "policy-check", kind: "static" as const, cwd: root, command: "node policy-check.mjs", configurationFiles: [], testPaths: [], reason: "Declared acceptance policy" };
  const receipt = { schema: "phase-verification-receipt/v1", feature: "EXAMPLE", checks: [{ ...check,
    success: false, exitCode: processResult.status, tests: 0, passed: 0, failed: 0, logPath: path, logSha256: sha256(processResult.stderr) }] };
  const publish = () => writeFileSync(join(directory, "receipt.json"), JSON.stringify(receipt)); publish();
  saveFreshState(root, { schema: "fresh-feature-verification/v1", runId: "failed-run", featureId: "EXAMPLE", directory,
    startedAt: "2026-01-01T00:00:00Z", sourceFingerprint: "prior-source", status: "blocked", stage: "validating", error: "Configured check exited 1",
    plan: { checks: [check], phases: [{ phaseNumber: number, checkIds: [check.id] }] } });
  const feature = { id: "card", externalId: "EXAMPLE", kind: "feature", stateFolder: "03_IN_PROGRESS", folderPath: root,
    phases: [{ number, title: "Verification owner", status: "completed", documentPath: phasePath, updatedAt: statSync(phasePath).mtime.toISOString() }],
    featureWorkflow: { activeRun: null, findings: [] }, implementationEvidence: { phaseQualityGates: [] } } as unknown as WorkItemCard;
  const project = { id: "project", rootPath: root, memoryBankPath: root, name: "Example" } as any;
  return { root, directory, feature, project, receipt, publish, path, phasePath, number };
}

it.each([5, 42])("projects a repair action for declared owner %i despite historical green evidence", async number => {
  const f = fixture(number), before = readFileSync(f.phasePath);
  const projected = await projectCompletionRecovery(f.project, f.feature, [f.feature], {} as any);
  const assessment = projected.completionRecovery!;
  expect(assessment.ready).toBe(false);
  expect(assessment.blockers).toContainEqual(expect.objectContaining({ action: "phase", phaseNumber: number, actionLabel: "Repair failed checks — Verification owner" }));
  expect(assessment.phaseGaps![0]).toMatchObject({ kind: "verification_failure", sourceIds: [], phaseNumber: number });
  expect(assessment.phaseGaps![0]!.instruction).toContain("git log/show/blame/diff");
  expect(assessment.phaseGaps![0]!.instruction).toContain("node policy-check.mjs");
  expect(assessment.phaseGaps![0]!.instruction).toContain("Continue the diagnose/repair/test/review loop");
  expect(readFileSync(f.phasePath)).toEqual(before);
});

it("does not invent failed checks from a generic error, changed receipt or tampered log", () => {
  const f = fixture();
  f.receipt.checks[0]!.exitCode = 0; f.receipt.checks[0]!.success = true; f.publish();
  expect(freshVerificationRepairAssessment(f.feature)).toBeUndefined();
  f.receipt.checks[0]!.exitCode = 1; f.receipt.checks[0]!.success = false;
  f.receipt.checks[0]!.command = "different command"; f.publish();
  expect(() => freshVerificationRepairAssessment(f.feature)).toThrow(/command/);
  f.receipt.checks[0]!.command = "node policy-check.mjs"; f.publish(); writeFileSync(f.path, "changed");
  expect(() => freshVerificationRepairAssessment(f.feature)).toThrow(/report changed/);
});

it("dispatches historical-green reconciliation from bound failures and verifies after repair, not from prose", async () => {
  const f = fixture(); let metadata = { workflowRunId: "", workflowStatus: "" };
  let finish!: (output: string) => void;
  const worker = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  const verifyFresh = vi.fn(async () => { metadata = { workflowRunId: "new-verification", workflowStatus: "running" }; });
  const refresh = vi.fn(), record = vi.fn(async (r: any) => { metadata = { workflowRunId: r.runId, workflowStatus: r.status }; });
  const app = new PhaseQualityResolutionApplication({ targets: { resolveCompatibility: async () => ({ feature: f.feature, project: f.project }) } as any,
    store: { enabled: true, recordFeatureWorkflowRun: record, getCardMetadata: async () => metadata } as any,
    scan: async () => [f.feature], worker, plan: () => ({}) as any, notify: vi.fn(), readiness: { refresh, isRunning: () => false }, verifyFresh });
  const input = { projectId: "project", cardId: "card", phaseNumber: f.number, gate: "completion_recovery" as const,
    action: "repair" as const, note: "", expectedUpdatedAt: f.feature.phases[0]!.updatedAt };
  await app.resolve(input);
  expect(worker).toHaveBeenCalledOnce();
  const prompt = (worker.mock.calls as unknown as [{ prompt: string }][]) [0]![0].prompt;
  expect(prompt).toContain("earlier implementation/checkpoint evidence was green");
  expect(prompt).toContain("policy-check");
  expect(verifyFresh).not.toHaveBeenCalled();
  finish("All repaired (worker prose, not passing evidence)");
  await vi.waitFor(() => expect(verifyFresh).toHaveBeenCalledExactlyOnceWith({ projectId: "project", cardId: "card" }));
  expect(refresh).not.toHaveBeenCalled();
  expect(metadata).toEqual({ workflowRunId: "new-verification", workflowStatus: "running" });
});
