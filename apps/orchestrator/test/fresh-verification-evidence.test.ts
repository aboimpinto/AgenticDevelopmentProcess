import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { parseFreshVerificationPlan, sourceSnapshot, type FreshPlan } from "../src/manual-test-verification/fresh-verification-evidence.js";
import { readRecoveryExecutionEvidence } from "../src/manual-test-verification/recovery-execution-evidence.js";
function imported(directory: string, runId: string, featureId: string, plan: FreshPlan) {
  const result = readRecoveryExecutionEvidence(directory, directory, featureId, { directory, runId, checks: plan.checks });
  if (result.diagnostics.length) throw new Error(result.diagnostics.join("\n"));
  return result;
}
const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "fresh-proof-")); roots.push(root);
  execFileSync("git", ["init", "-q", root]);
  writeFileSync(join(root, "source.ts"), "export const value = 1");
  writeFileSync(join(root, "package.json"), '{"scripts":{"test":"vitest run"}}');
  const directory = join(root, ".hepha", "verification-runs", "run-unique"); mkdirSync(directory, { recursive: true });
  const check = { id: "unit", cwd: root, command: "npm test", configurationFiles: ["package.json"], testPaths: ["source.ts"], reason: "Checks the feature contract" };
  const plan = { checks: [check], phases: [{ phaseNumber: 3, checkIds: ["unit"] }, { phaseNumber: 6, checkIds: ["unit"] }] };
  const parsed = () => parseFreshVerificationPlan(JSON.stringify(plan), [3, 6]);
  const publish = (status = "passed") => {
    const report = JSON.stringify({ success: status === "passed", numTotalTests: 1, numPassedTests: status === "passed" ? 1 : 0, numFailedTests: status === "failed" ? 1 : 0, numPendingTests: status === "pending" ? 1 : 0,
      testResults: [{ name: "feature.test", status, assertionResults: [{ fullName: "preserves contract", status }] }] });
    writeFileSync(join(directory, "unit.json"), report);
    writeFileSync(join(directory, "receipt.json"), JSON.stringify({ schema: "phase-verification-receipt/v1", runId: "run-unique", feature: "FEAT-SYNTHETIC", verifiedAt: new Date().toISOString(), checks: [{ id: "unit", kind: "unit", command: check.command, cwd: root, testedRevision: "abcdef0", success: status === "passed", exitCode: status === "passed" ? 0 : 1, tests: 1, passed: status === "passed" ? 1 : 0, failed: status === "failed" ? 1 : 0, reportPath: join(directory, "unit.json"), reportSha256: createHash("sha256").update(report).digest("hex") }] }));
  };
  return { root, directory, plan, parsed, publish };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
it("accounts for every phase while deduplicating shared checks", () => {
  const f = fixture(); expect(f.parsed().checks).toHaveLength(1);
  f.plan.phases.pop(); expect(f.parsed).toThrow(/phase/i);
});
it("rejects duplicate execution identities instead of counting aliases as more tests", () => {
  const f = fixture(); f.plan.checks.push({ ...f.plan.checks[0]!, id: "alias" });
  expect(f.parsed).toThrow(/duplicate/i);
});
it.each(["dotnet test --no-build", "playwright test --list"])("rejects non-fresh execution command %s", command => {
  const f = fixture(); f.plan.checks[0]!.command = command; expect(f.parsed).toThrow(/fresh source/);
});
it("fingerprints tracked and untracked source content, not just HEAD or status", () => {
  const f = fixture(); const before = sourceSnapshot(f.root, [f.directory]);
  writeFileSync(join(f.root, "source.ts"), "export const value = 2");
  expect(sourceSnapshot(f.root, [f.directory])).not.toBe(before);
});
it("validates only the new run's reports and rejects missing, failed and skipped results", () => {
  const f = fixture();
  const validate = () => imported(f.directory, "run-unique", "FEAT-SYNTHETIC", f.parsed());
  expect(validate).toThrow(/receipt/i);
  for (const status of ["failed", "pending"]) { f.publish(status); expect(validate).toThrow(); }
  f.publish(); expect(validate().evidence).toHaveLength(1);
  expect(() => imported(f.directory, "another-run", "FEAT-SYNTHETIC", f.parsed())).toThrow(/run/i);
});

it("requires successful bound non-test logs but never turns them into automated coverage", () => {
  const f = fixture(); f.publish();
  const plan = f.parsed(); plan.checks[0]!.kind = "static"; plan.checks[0]!.testPaths = [];
  const receiptPath = join(f.directory, "receipt.json"), receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  const validate = () => imported(f.directory, "run-unique", "FEAT-SYNTHETIC", plan);
  expect(validate).toThrow(/zero claimed tests/);
  Object.assign(receipt.checks[0], { tests: 0, passed: 0, failed: 0 });
  writeFileSync(receiptPath, JSON.stringify(receipt));
  expect(validate().evidence).toEqual([]);
  receipt.checks[0].exitCode = 1; writeFileSync(receiptPath, JSON.stringify(receipt));
  expect(validate).toThrow(/successful command execution/);
});
