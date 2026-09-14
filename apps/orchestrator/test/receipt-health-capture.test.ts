import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { assertExecutionReceiptBinding } from "../src/manual-test-verification/execution-receipt-binding.js";
import { readRecoveryExecutionEvidence } from "../src/manual-test-verification/recovery-execution-evidence.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture(kind: string, planned = "node check.cjs", grouped = false) {
  const cwd = mkdtempSync(join(tmpdir(), "health-capture-")); roots.push(cwd);
  const directory = join(cwd, "run"); mkdirSync(directory);
  const log = join(directory, "execution.log");
  writeFileSync(join(cwd, "check.cjs"), 'console.log("verified");\n');
  const command = `cd '${cwd}' && ${grouped ? `( ${planned} )` : planned} > '${log}' 2>&1`;
  const process = spawnSync("bash", ["-c", command], { encoding: "utf8", timeout: 10000 });
  const hash = createHash("sha256").update(readFileSync(log)).digest("hex");
  const check = { id: "check", cwd, kind, command, testedRevision: "abcdef0123456", exitCode: process.status, success: process.status === 0,
    tests: 0, passed: 0, failed: 0, logPath: log, logSha256: hash };
  const receipt = { schema: "phase-verification-receipt/v1", feature: "EXAMPLE", checks: [check] };
  const scope = { directory, runId: "current", checks: [{ id: "check", cwd, command: planned, kind }] };
  const save = () => writeFileSync(join(directory, "receipt.json"), JSON.stringify(receipt));
  const read = () => { save(); return readRecoveryExecutionEvidence(cwd, cwd, "EXAMPLE", scope); };
  return { cwd, directory, log, check, receipt, scope, read };
}
it.each(["static", "preparation", "discovery"])("imports captured %s execution without inventing test coverage", kind => {
  const f = fixture(kind);
  expect(() => assertExecutionReceiptBinding(f.receipt, "EXAMPLE", f.scope)).not.toThrow();
  expect(f.read()).toMatchObject({ diagnostics: [], evidence: [] });
  writeFileSync(f.log, "tampered");
  expect(f.read().diagnostics.join(" ")).toMatch(/checksum/i);
});
it("accepts whole-command capture while preserving a failed AND-chain outcome", () => {
  const f = fixture("static", "node check.cjs && node missing.cjs", true);
  expect(f.check.exitCode).not.toBe(0);
  expect(() => assertExecutionReceiptBinding(f.receipt, "EXAMPLE", f.scope)).not.toThrow();
  expect(f.read().diagnostics.join(" ")).toMatch(/No successful command/);
  f.check.command = f.check.command.replace("node missing.cjs", "node check.cjs");
  expect(() => assertExecutionReceiptBinding(f.receipt, "EXAMPLE", f.scope)).toThrow(/command/);
});
it.each(["node check.cjs", "node missing.cjs"])("imports a static AND-list with terminal capture and preserves %s outcome", last => {
  const f = fixture("static", `node check.cjs && ${last}`);
  const before = JSON.stringify(f.receipt);
  expect(() => assertExecutionReceiptBinding(f.receipt, "EXAMPLE", f.scope)).not.toThrow();
  const result = f.read();
  if (last === "node check.cjs") expect(result.diagnostics).toEqual([]);
  else expect(result.diagnostics.join(" ")).toMatch(/No successful command/);
  expect(result.evidence).toEqual([]); // Static success never invents test coverage.
  expect(JSON.stringify(f.receipt)).toBe(before);
  f.check.command = f.check.command.replace(" && node", " ; node");
  expect(() => assertExecutionReceiptBinding(f.receipt, "EXAMPLE", f.scope)).toThrow(/command/);
});
it("accepts native stdout as the test report only when native execution proves a nonzero passing run", () => {
  const f = fixture("test", "node --test test.cjs");
  writeFileSync(join(f.cwd, "test.cjs"), 'require("node:test")("behavior",()=>require("node:assert/strict").equal(2+2,4));');
  // A supported native Rust report exercises the stdout-report import boundary.
  writeFileSync(f.log, "running 1 test\ntest behavior ... ok\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s\n");
  const check: Record<string, unknown> = { ...f.check, exitCode: 0, success: true, tests: 1, passed: 1, reportPath: f.log,
    reportSha256: createHash("sha256").update(readFileSync(f.log)).digest("hex") };
  delete check.logPath; delete check.logSha256;
  const receipt = { ...f.receipt, checks: [check] };
  expect(() => assertExecutionReceiptBinding(receipt, "EXAMPLE", f.scope)).not.toThrow();
  writeFileSync(join(f.directory, "receipt.json"), JSON.stringify(receipt));
  expect(readRecoveryExecutionEvidence(f.cwd, f.cwd, "EXAMPLE", f.scope).evidence).toHaveLength(1);
  writeFileSync(f.log, "Everything passed");
  check.reportSha256 = createHash("sha256").update(readFileSync(f.log)).digest("hex");
  writeFileSync(join(f.directory, "receipt.json"), JSON.stringify(receipt));
  expect(readRecoveryExecutionEvidence(f.cwd, f.cwd, "EXAMPLE", f.scope).evidence).toHaveLength(0);
});
