import { executionReceiptExchange } from "../src/manual-test-verification/execution-receipt-contract.js";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readRecoveryExecutionEvidence } from "../src/manual-test-verification/recovery-execution-evidence.js";
import { verificationExecutionContract } from "../src/workflows/prompts/verification-execution-contract.js";

const roots: string[] = [];
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "shared-verification-")); roots.push(root);
  const directory = join(root, "verification"); mkdirSync(directory);
  const report = JSON.stringify({ success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0,
    testResults: [{ name: "save.test.ts", status: "passed", assertionResults: [{ fullName: "save retains value", status: "passed" }] }] });
  writeFileSync(join(directory, "tests.json"), report);
  writeFileSync(join(directory, "console.log"), "");
  const check: Record<string, unknown> = { id: "save", kind: "test", cwd: root, command: "npm test", testedRevision: "abcdef123456", success: true, exitCode: 0,
    tests: 1, passed: 1, failed: 0, reportPath: "tests.json", reportSha256: hash(report), logPath: "console.log", logSha256: hash("") };
  const planned = { id: "save", kind: "test" as string, cwd: root, command: "npm test", reason: "Checks save" };
  const receipt: { schema: string; feature: string; runId?: string | null; verifiedAt: string; checks: Record<string, unknown>[] } = {
    schema: "phase-verification-receipt/v1", feature: "FEAT-SYNTHETIC", runId: "current-run", verifiedAt: new Date().toISOString(), checks: [check] };
  const publish = () => writeFileSync(join(directory, "receipt.json"), JSON.stringify(receipt));
  const read = (caller: string) => readRecoveryExecutionEvidence(root, root, receipt.feature,
    caller === "refresh" ? { directory, runId: "current-run", checks: [planned] } : undefined);
  return { root, directory, check, planned, receipt, publish, read };
}

// One scenario table, not different expectations for phase, repair and Refresh.
for (const caller of ["phase", "repair", "refresh"]) {
  it.each(["native", "missing-id", "null-id", "empty-id", "supplemental", "silent-static", "unsupported", "changed-report", "changed-audit", "ambiguous-revision", "failed", "discovery"])(`${caller}: shared evidence rules for %s`, scenario => {
    const f = fixture();
    if (scenario === "missing-id") delete f.receipt.runId;
    if (scenario === "null-id") f.receipt.runId = null;
    if (scenario === "empty-id") f.receipt.runId = "";
    if (scenario === "silent-static") {
      Object.assign(f.check, { kind: "static", tests: 0, passed: 0, failed: 0, reportPath: "console.log", reportSha256: hash("") });
      delete f.check.logPath; delete f.check.logSha256; f.planned.kind = "static";
    }
    if (scenario === "unsupported") { writeFileSync(join(f.directory, "tests.json"), "PASS"); f.check.reportSha256 = hash("PASS"); }
    if (scenario === "supplemental") {
      const extra = readFileSync(join(f.directory, "tests.json"), "utf8").replace("save retains value", "reload retains value");
      writeFileSync(join(f.directory, "extra.json"), extra);
      Object.assign(f.check, { extraReportPath: "extra.json", extraReportSha256: hash(extra), tests: 2, passed: 2 });
    }
    if (scenario === "changed-report") writeFileSync(join(f.directory, "tests.json"), "{}");
    if (scenario === "changed-audit") writeFileSync(join(f.directory, "console.log"), "changed after execution");
    if (scenario === "ambiguous-revision") f.check.testedRevision = "abcdef123456 or fedcba654321";
    if (scenario === "failed") Object.assign(f.check, { success: false, exitCode: 1 });
    if (scenario === "discovery") { f.check.command = "npm test -- --list"; f.planned.command = String(f.check.command); }
    f.publish(); const result = f.read(caller);
    expect(result.evidence).toHaveLength(["native", "missing-id", "null-id", "empty-id", "supplemental"].includes(scenario) ? 1 : 0);
    expect(result.diagnostics.length === 0).toBe(["native", "missing-id", "null-id", "empty-id", "supplemental", "silent-static"].includes(scenario));
  });
}
it.each(["wrong-run", "wrong-command", "missing-check"])("Refresh adds only invocation binding: %s cannot use a historical pass", mode => {
  const f = fixture();
  if (mode === "wrong-run") f.receipt.runId = "old-run";
  if (mode === "wrong-command") f.check.command = "another test command";
  if (mode === "missing-check") f.receipt.checks = [];
  f.publish(); expect(f.read("refresh").diagnostics.length).toBeGreaterThan(0);
  expect(f.read("refresh").evidence).toEqual([]);
});
it("has no second native-report validator in the Refresh adapter", () => {
  const source = readFileSync("apps/orchestrator/src/manual-test-verification/fresh-verification-evidence.ts", "utf8");
  expect(source).not.toContain("function validateFreshReports");
  expect(source).not.toContain("parseExecutedReport");
});
it("imports an equivalent cwd-prefixed receipt without rewriting evidence or changing phase/Refresh identities", () => {
  const f = fixture(); f.check.command = `cd '${f.root}' && ${f.planned.command}`; f.publish();
  const before = readFileSync(join(f.directory, "receipt.json"), "utf8");
  const fresh = f.read("refresh"), normal = f.read("phase");
  expect(fresh.diagnostics).toEqual([]); expect(fresh.evidence).toHaveLength(1);
  expect(fresh.evidence).toEqual(normal.evidence);
  expect(readFileSync(join(f.directory, "receipt.json"), "utf8")).toBe(before);
});
it("accepts additional run-owned console capture while preserving the native report and raw receipt", () => {
  const f = fixture(); f.check.command = `cd '${f.root}' && npm test > '${f.directory}/console.log' 2>&1`; f.publish();
  const before = readFileSync(join(f.directory, "receipt.json"));
  expect(f.read("refresh").diagnostics).toEqual([]);
  expect(f.read("refresh").evidence).toEqual(f.read("phase").evidence);
  expect(readFileSync(join(f.directory, "receipt.json"))).toEqual(before);
  writeFileSync(join(f.directory, "console.log"), "changed");
  expect(f.read("refresh").evidence).toEqual([]);
});
it.each(["different log", "outside run", "native destination", "append", "extra command", "expansion", "changed filter", "existing redirect", "missing audit binding"])("rejects console capture with %s", mode => {
  const f = fixture(); const log = join(f.directory, "console.log");
  f.check.command = `npm test > '${log}' 2>&1`;
  if (mode === "different log") f.check.command = `npm test > '${log}.other' 2>&1`;
  if (mode === "outside run") { f.check.command = `npm test > '${f.root}/console.log' 2>&1`; f.check.logPath = join(f.root, "console.log"); writeFileSync(String(f.check.logPath), ""); }
  if (mode === "native destination") { f.check.command = `npm test > '${log}' 2>&1`; f.check.reportPath = log; }
  if (mode === "append") f.check.command = `npm test >> '${log}' 2>&1`;
  if (mode === "extra command") f.check.command += "; true";
  if (mode === "expansion") f.check.command = "npm test > \"$(pwd)/console.log\" 2>&1";
  if (mode === "changed filter") f.check.command = `npm test -- different > '${log}' 2>&1`;
  if (mode === "existing redirect") { f.planned.command = "npm test > expected.json"; f.check.command = `${f.planned.command} > '${log}' 2>&1`; }
  if (mode === "missing audit binding") delete f.check.logPath;
  f.publish(); expect(f.read("refresh").evidence).toEqual([]);
});
it("cannot downgrade a planned test to a static check in its receipt", () => {
  const f = fixture(); Object.assign(f.check, { kind: "static", tests: 0, passed: 0, failed: 0 }); f.publish();
  expect(f.read("refresh").diagnostics.length).toBeGreaterThan(0);
  expect(f.read("refresh").evidence).toEqual([]);
});
it("uses one receipt-production contract with an explicit destination and authority", () => {
  const normal = verificationExecutionContract();
  const fresh = verificationExecutionContract({ directory: "run-output", runId: "current", rerunAll: true, repair: false });
  expect(fresh).toContain('Persist receipt.json and all reports inside run-output');
  expect(fresh).not.toContain("under the FEATURE folder verification/");
  expect(fresh).not.toContain("Reuse valid passing evidence for unchanged obligations");
  expect(fresh).not.toContain("make at most one focused correction attempt");
  expect(normal).toContain(executionReceiptExchange.renderContract());
  expect(fresh).toContain(executionReceiptExchange.renderContract());
  expect(fresh).toContain("receipt-template.json");
  expect(fresh).toContain("audit.runId current");
});
