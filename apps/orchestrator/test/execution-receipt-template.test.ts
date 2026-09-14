import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ExecutionReceiptProducer } from "../src/manual-test-verification/execution-receipt-producer.js";
import { executionReceiptExchange } from "../src/manual-test-verification/execution-receipt-contract.js";
import { readRecoveryExecutionEvidence } from "../src/manual-test-verification/recovery-execution-evidence.js";
import { bindVerificationOutputDirectory } from "../src/manual-test-verification/verification-output-directory.js";
import { sha256 } from "../src/manual-test-verification/fresh-verification-evidence.js";
import { verificationExecutionContract } from "../src/workflows/prompts/verification-execution-contract.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "receipt-template-")); roots.push(root);
  const directory = join(root, ".hepha/verification-runs/current"); mkdirSync(directory, { recursive: true });
  const command = 'node --test --test-reporter=tap > ${VERIFICATION_OUTPUT_DIR}/tests.log';
  const scope = { directory, runId: "current", checks: [{ id: "integration", kind: "test", cwd: root, command }] };
  const producer = new ExecutionReceiptProducer(root, "SYNTHETIC", scope);
  const report = JSON.stringify({ success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0,
    testResults: [{ name: "integration", status: "passed", assertionResults: [{ fullName: "saves the record", status: "passed" }] }] });
  writeFileSync(join(directory, "native.json"), report);
  const template = JSON.parse(readFileSync(join(directory, "receipt-template.json"), "utf8"));
  const complete = structuredClone(template);
  Object.assign(complete.payload.checks[0], { testedRevision: "abcdef012345", success: true, exitCode: 0, tests: 1, passed: 1, failed: 0,
    reportPath: "native.json", reportSha256: sha256(report) });
  const publish = (value: unknown) => writeFileSync(join(directory, "receipt.json"), JSON.stringify(value));
  return { root, directory, scope, producer, template, complete, publish,
    read: () => readRecoveryExecutionEvidence(root, root, "SYNTHETIC", scope) };
}
it("uses one schema for instructions, generated contract and runtime, with no assumed passes", () => {
  const f = fixture();
  expect(readFileSync(join(f.directory, "receipt-schema.json"), "utf8")).toBe(executionReceiptExchange.renderContract());
  expect(verificationExecutionContract()).toContain(executionReceiptExchange.renderContract());
  expect(f.template.payload.checks[0]).toMatchObject({ id: "integration", success: null, tests: null });
  expect(f.template.payload.checks[0].command).not.toContain("${VERIFICATION_OUTPUT_DIR}");
  expect(executionReceiptExchange.decode(JSON.stringify(f.template)).valid).toBe(false);
  f.publish(f.complete); expect(f.read().diagnostics).toEqual([]); expect(f.read().evidence).toHaveLength(1);
});
it.each(["renamed", "unknown", "string-pass", "count", "hash", "command", "kind", "duplicate"])("rejects creatively changed %s without accepting evidence", change => {
  const f = fixture(), c = f.complete.payload.checks[0];
  if (change === "renamed") { c.passedTests = c.passed; delete c.passed; }
  if (change === "unknown") c.approved = true;
  if (change === "string-pass") c.success = "yes";
  if (change === "count") { c.tests = 2; c.passed = 2; }
  if (change === "hash") c.reportSha256 = "0".repeat(64);
  if (change === "command") c.command += " --skip";
  if (change === "kind") c.kind = "static";
  if (change === "duplicate") f.complete.payload.checks.push(c);
  f.publish(f.complete); expect(f.read().evidence).toHaveLength(0); expect(f.read().diagnostics.length).toBeGreaterThan(0);
});
it("preserves optional audit metadata and original exchange while host adds a missing run ID", () => {
  const f = fixture(); delete f.complete.audit; f.publish(f.complete); f.producer.finalize();
  const saved = JSON.parse(readFileSync(join(f.directory, "receipt.json"), "utf8"));
  expect(saved.kind).toBe("verification.execution.receipt"); expect(saved.audit.runId).toBe("current");
  expect(JSON.parse(readFileSync(join(f.directory, "receipt.worker.json"), "utf8"))).toEqual(f.complete);
  expect(f.read().evidence).toHaveLength(1);
});
it("reads an existing expanded-path legacy receipt without rewriting reports or rerunning tests", () => {
  const f = fixture(); f.publish({ schema: "phase-verification-receipt/v1", ...f.complete.payload });
  const before = readFileSync(join(f.directory, "receipt.json"), "utf8");
  expect(f.read().diagnostics).toEqual([]); expect(f.read().evidence).toHaveLength(1);
  expect(readFileSync(join(f.directory, "receipt.json"), "utf8")).toBe(before);
});
it.each(['$VERIFICATION_OUTPUT_DIR', '${VERIFICATION_OUTPUT_DIR}', '"${VERIFICATION_OUTPUT_DIR}"', "'${VERIFICATION_OUTPUT_DIR}'"])("binds %s with safe literal shell arguments", marker => {
  const path = "/tmp/it's a $literal `name`";
  const command = bindVerificationOutputDirectory(`printf '%s' ${marker}/report.json`, path);
  expect(execFileSync("bash", ["-c", command], { encoding: "utf8" })).toBe(path + "/report.json");
});
it("never expands unrelated environment variables or escaped literals", () => {
  expect(bindVerificationOutputDirectory('echo $HOME \\$VERIFICATION_OUTPUT_DIR $VERIFICATION_OUTPUT_DIRECTORY', '/tmp/run')).toBe('echo $HOME \\$VERIFICATION_OUTPUT_DIR $VERIFICATION_OUTPUT_DIRECTORY');
});

it("validates supporting provenance without misreading it as test results or letting it replace tests", () => {
  const f = fixture(), provenance = JSON.stringify({ source: "abcdef012345", inputs: ["configured-source"] });
  writeFileSync(join(f.directory, "provenance.json"), provenance);
  const c = f.complete.payload.checks[0];
  c.artifacts = [{ path: "provenance.json", sha256: sha256(provenance) }];
  f.publish(f.complete); expect(f.read().diagnostics).toEqual([]); expect(f.read().evidence).toHaveLength(1);
  c.artifacts[0].sha256 = "0".repeat(64); f.publish(f.complete);
  expect(f.read().evidence).toHaveLength(0);
  c.artifacts[0].sha256 = sha256(provenance); delete c.reportPath; delete c.reportSha256;
  f.publish(f.complete); expect(f.read().evidence).toHaveLength(0);
});
