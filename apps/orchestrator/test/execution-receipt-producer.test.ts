import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ExecutionReceiptProducer } from "../src/manual-test-verification/execution-receipt-producer.js";
import { readRecoveryExecutionEvidence } from "../src/manual-test-verification/recovery-execution-evidence.js";
import { sha256 } from "../src/manual-test-verification/fresh-verification-evidence.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "receipt-producer-")); roots.push(root);
  const runId = "run-current", featureId = "FEAT-SYNTHETIC", directory = join(root, ".hepha/verification-runs", runId); mkdirSync(directory, { recursive: true });
  const scope = { directory, runId, startedAt: new Date().toISOString(), checks: [{ id: "unit", kind: "test", cwd: root, command: "node test.cjs" }] };
  const producer = new ExecutionReceiptProducer(root, featureId, scope);
  const report = JSON.stringify({ success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0,
    testResults: [{ name: "save", status: "passed", assertionResults: [{ fullName: "saves the value", status: "passed" }] }] });
  writeFileSync(join(directory, "unit.json"), report);
  const receipt: any = { schema: "phase-verification-receipt/v1", feature: featureId, verifiedAt: new Date().toISOString(),
    checks: [{ ...scope.checks[0], testedRevision: "abcdef012345", success: true, exitCode: 0, tests: 1, passed: 1, failed: 0, reportPath: "unit.json", reportSha256: sha256(report) }] };
  const path = join(directory, "receipt.json"), publish = () => writeFileSync(path, JSON.stringify(receipt));
  return { root, featureId, scope, producer, directory, receipt, path, publish,
    import: () => readRecoveryExecutionEvidence(root, root, featureId, scope) };
}
it("supplies the current invocation ID without changing worker evidence and preserves the original receipt", () => {
  const f = fixture(); f.publish(); const raw = readFileSync(f.path, "utf8");
  f.producer.finalize();
  expect(JSON.parse(readFileSync(f.path, "utf8"))).toEqual({ ...f.receipt, runId: f.scope.runId });
  expect(readFileSync(join(f.directory, "receipt.worker.json"), "utf8")).toBe(raw);
  expect(JSON.parse(readFileSync(join(f.directory, "receipt-context.json"), "utf8"))).toMatchObject({ runId: f.scope.runId, feature: f.featureId });
  expect(f.import().diagnostics).toEqual([]); expect(f.import().evidence).toHaveLength(1);
});
it("leaves a correctly bound receipt unchanged", () => {
  const f = fixture(); f.receipt.runId = f.scope.runId; f.publish(); const raw = readFileSync(f.path, "utf8"); f.producer.finalize();
  expect(readFileSync(f.path, "utf8")).toBe(raw); expect(existsSync(join(f.directory, "receipt.worker.json"))).toBe(false);
});
it.each(["wrong-id", "wrong-feature", "duplicate", "missing-check", "wrong-command", "wrong-cwd", "symlink"])("does not repair or admit %s evidence", kind => {
  const f = fixture();
  if (kind === "wrong-id") f.receipt.runId = "other-run";
  if (kind === "wrong-feature") f.receipt.feature = "FEAT-OTHER";
  if (kind === "duplicate") f.receipt.checks.push(f.receipt.checks[0]);
  if (kind === "missing-check") f.receipt.checks = [];
  if (kind === "wrong-command") f.receipt.checks[0].command = "node different.cjs";
  if (kind === "wrong-cwd") f.receipt.checks[0].cwd = f.directory;
  f.publish(); const raw = readFileSync(f.path, "utf8");
  if (kind === "symlink") { writeFileSync(join(f.directory, "other.json"), raw); rmSync(f.path); symlinkSync("other.json", f.path); }
  expect(() => f.producer.finalize()).not.toThrow(); expect(readFileSync(f.path, "utf8")).toBe(raw);
  expect(f.import().evidence).toEqual([]);
});
it.each(["missing", "corrupt", "failed"])("metadata does not make a %s report pass", kind => {
  const f = fixture();
  if (kind === "missing") rmSync(join(f.directory, "unit.json"));
  if (kind === "corrupt") writeFileSync(join(f.directory, "unit.json"), "{}");
  if (kind === "failed") Object.assign(f.receipt.checks[0], { success: false, exitCode: 1, passed: 0, failed: 1 });
  f.publish(); f.producer.finalize();
  expect(f.import().evidence).toEqual([]); expect(f.import().diagnostics.length).toBeGreaterThan(0);
});
it("records blocked checks honestly without inventing an observed execution", () => {
  const f = fixture(); Object.assign(f.receipt.checks[0], { success: false, exitCode: null, tests: 0, passed: 0, failed: 0 });
  f.publish(); f.producer.finalize(); expect(f.import().evidence).toEqual([]);
});
it("cannot attach to an existing receipt from a previous worker", () => {
  const f = fixture(); f.publish();
  expect(() => new ExecutionReceiptProducer(f.root, f.featureId, f.scope)).toThrow(/already exists/);
});

it("continues with valid timestamped evidence when optional ID enrichment cannot write its archive", () => {
  const f = fixture(); f.publish();
  const raw = readFileSync(f.path, "utf8");
  writeFileSync(join(f.directory, "receipt.worker.json"), "existing audit record");
  f.producer.finalize();
  expect(readFileSync(f.path, "utf8")).toBe(raw);
  expect(JSON.parse(raw)).not.toHaveProperty("runId");
  expect(f.import().diagnostics).toEqual([]); expect(f.import().evidence).toHaveLength(1);
  expect(readFileSync(join(f.directory, "receipt.worker.json"), "utf8")).toBe("existing audit record");
});

it.each(["absent", "null", "empty"])("imports current evidence directly with an %s ID without rewriting its receipt", mode => {
  const f = fixture();
  if (mode === "null") f.receipt.runId = null;
  if (mode === "empty") f.receipt.runId = "";
  f.publish(); const raw = readFileSync(f.path, "utf8");
  expect(f.import().diagnostics).toEqual([]); expect(f.import().evidence).toHaveLength(1);
  expect(readFileSync(f.path, "utf8")).toBe(raw);
});

it.each(["yesterday", "future", "invalid", "missing", "null"])("imports valid reports despite a %s receipt timestamp, with or without a run ID", mode => {
  const f = fixture();
  f.receipt.verifiedAt = mode === "yesterday" ? new Date(Date.now() - 86_400_000).toISOString()
    : mode === "future" ? new Date(Date.now() + 86_400_000).toISOString() : mode === "invalid" ? "not a date" : mode === "null" ? null : undefined;
  for (const runId of [undefined, f.scope.runId]) {
    f.receipt.runId = runId; f.publish();
    const raw = readFileSync(f.path, "utf8");
    expect(f.import().evidence).toHaveLength(1);
    expect(f.import().diagnostics).toEqual([]);
    expect(readFileSync(f.path, "utf8")).toBe(raw);
  }
  delete f.receipt.runId; f.publish(); f.producer.finalize();
  expect(JSON.parse(readFileSync(f.path, "utf8"))).toEqual({ ...JSON.parse(JSON.stringify(f.receipt)), runId: f.scope.runId });
  expect(f.import().evidence).toHaveLength(1);
});

it.each(["valid", "wrong-command"])("validates an unchanged %s receipt identically before and after its claimed timestamp", mode => {
  const f = fixture();
  f.scope.startedAt = "2026-09-09T12:00:00Z";
  if (mode === "wrong-command") f.receipt.checks[0].command = "node other.cjs";
  f.receipt.verifiedAt = "2026-09-09T12:01:00Z"; f.publish();
  const clock = vi.spyOn(Date, "now");
  try {
    clock.mockReturnValue(Date.parse("2026-09-09T12:00:00Z"));
    const before = f.import();
    clock.mockReturnValue(Date.parse("2026-09-09T12:02:00Z"));
    expect(f.import()).toEqual(before);
    expect(before.evidence).toHaveLength(mode === "valid" ? 1 : 0);
    if (mode === "wrong-command") expect(before.diagnostics.join(" ")).toContain("command does not match");
  } finally { clock.mockRestore(); }
});

it.each(["missing", "corrupt", "failed", "wrong-command", "wrong-id"])("still rejects %s evidence when both bookkeeping fields are absent", mode => {
  const f = fixture(); delete f.receipt.verifiedAt;
  if (mode === "missing") rmSync(join(f.directory, "unit.json"));
  if (mode === "corrupt") writeFileSync(join(f.directory, "unit.json"), "{}");
  if (mode === "failed") Object.assign(f.receipt.checks[0], { success: false, exitCode: 1 });
  if (mode === "wrong-command") f.receipt.checks[0].command = "node other.cjs";
  if (mode === "wrong-id") f.receipt.runId = "another-run";
  f.publish();
  expect(f.import().evidence).toEqual([]); expect(f.import().diagnostics.length).toBeGreaterThan(0);
});
