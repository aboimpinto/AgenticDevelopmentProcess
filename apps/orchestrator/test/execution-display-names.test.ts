import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { parseExecutedReport, readRecoveryExecutionEvidence } from "../src/manual-test-verification/recovery-execution-evidence.js";
import { trxReport } from "./native-execution-fixtures.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
const hash = (content: string) => createHash("sha256").update(content).digest("hex");
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "hepha-display-names-")); roots.push(root);
  const directory = join(root, "verification"); mkdirSync(directory);
  return { root, directory };
}
function imported(contents: string[], tests: number) {
  const { root, directory } = workspace();
  const reports = contents.map((content, index) => {
    const path = join(directory, `report-${index}${content.startsWith("<") ? ".trx" : ".json"}`);
    writeFileSync(path, content); return { path, sha256: hash(content) };
  });
  const check = { id: "configured-check", kind: "test", cwd: root, command: "configured-test-command",
    testedRevision: "abcdef0123456789", success: true, exitCode: 0, tests, passed: tests, failed: 0, reports };
  const receipt = { schema: "phase-verification-receipt/v1", feature: "EXAMPLE", checks: [check] };
  const read = () => {
    writeFileSync(join(directory, "receipt.json"), JSON.stringify(receipt));
    return readRecoveryExecutionEvidence(root, root, "EXAMPLE");
  };
  return { read, reports, check };
}
function jsonReport() {
  return { success: true, numTotalTests: 2, numPassedTests: 2, numFailedTests: 0, numPendingTests: 0,
    testResults: [{ name: "validation.test.ts", status: "passed", assertionResults: [
      { fullName: "rejects invalid input", status: "passed" }, { fullName: "rejects invalid input", status: "passed" },
    ] }] };
}

it("imports real parameterized Vitest executions without requiring unique display names", () => {
  const { root } = workspace(), path = join(root, "results.json");
  symlinkSync(resolve("node_modules"), join(root, "node_modules"), "dir");
  writeFileSync(join(root, "vitest.config.mjs"), "export default {test:{include:['*.test.ts']}};");
  writeFileSync(join(root, "validation.test.ts"), `import {it,expect} from 'vitest';
    it.each([null, '', ' '])('rejects invalid input', value => expect(typeof value === 'string' && value.trim().length > 0).toBe(false));
    it('accepts valid input', () => expect('value'.trim().length > 0).toBe(true));`);
  const run = spawnSync(process.execPath, [resolve("node_modules/vitest/vitest.mjs"), "run", "--root", root,
    "--config", join(root, "vitest.config.mjs"), "--reporter=json", `--outputFile=${path}`], { encoding: "utf8", timeout: 25000 });
  expect(run.status, run.stderr).toBe(0);
  const content = readFileSync(path, "utf8"), result = imported([content], 4).read();
  expect(result.diagnostics).toEqual([]);
  const evidence = result.evidence[0]!;
  expect(evidence.verifiedExecution?.executedCount).toBe(4);
  expect(evidence.executionIdentities?.filter(name => name.includes("rejects invalid input"))).toHaveLength(3);
  expect(new Set(evidence.executionIdentities).size).toBe(4);
  // Importing execution does not assert that the acceptance criteria are sufficiently covered.
  expect(evidence.detail).toContain("not proof of a clean/current HEAD or full criterion coverage");
}, 30000);

it.each(["failed", "skipped", "missing", "count"])("still rejects a %s parameterized execution", mutation => {
  const report = jsonReport();
  if (mutation === "failed" || mutation === "skipped") report.testResults[0]!.assertionResults[1]!.status = mutation;
  if (mutation === "missing") report.testResults[0]!.assertionResults.pop();
  if (mutation === "count") report.numTotalTests = report.numPassedTests = 3;
  expect(imported([JSON.stringify(report)], report.numTotalTests).read().evidence).toEqual([]);
});

it("retains same-name TRX methods with distinct native test and execution IDs", () => {
  const xml = trxReport();
  const result = xml.match(/<UnitTestResult[^>]+\/>/)![0];
  const definition = xml.match(/<UnitTest id=.*?<\/UnitTest>/s)![0];
  const report = xml.replace(result, result + result.replaceAll("-1", "-2"))
    .replace(definition, definition + definition.replaceAll("-1", "-2"))
    .replace('total="1" executed="1" passed="1"', 'total="2" executed="2" passed="2"');
  const parsed = parseExecutedReport(report);
  expect(parsed.count).toBe(2);
  expect(new Set(parsed.identities).size).toBe(2);
  expect(parsed.identities.every(name => name.includes("Example.FormTests.SaveConfirmation"))).toBe(true);
  expect(imported([report], 2).read().diagnostics).toEqual([]);
  // A duplicate native execution is different from a duplicate display name.
  expect(() => parseExecutedReport(report.replaceAll("execution-2", "execution-1"))).toThrow();
});

it("imports identical method names from separate assemblies without merging their evidence", () => {
  const first = trxReport().replace('<TestMethod ', '<TestMethod codeBase="unit-tests.dll" ');
  const second = trxReport().replace('<TestMethod ', '<TestMethod codeBase="integration-tests.dll" ');
  const f = imported([first, second], 2), result = f.read();
  expect(result.diagnostics).toEqual([]);
  expect(result.evidence[0]!.verifiedExecution?.executedCount).toBe(2);
  expect(new Set(result.evidence[0]!.executionIdentities).size).toBe(2);
  expect(result.evidence[0]!.executionIdentities?.some(name => name.includes("unit-tests.dll"))).toBe(true);
  expect(result.evidence[0]!.executionIdentities?.some(name => name.includes("integration-tests.dll"))).toBe(true);
  // Copying the same native report under another filename cannot inflate execution totals.
  expect(imported([first, first], 2).read().evidence).toEqual([]);
  writeFileSync(f.reports[1]!.path, "changed report");
  expect(f.read().evidence).toEqual([]);
});

it("keeps independent same-named JSON report executions scoped to their own reports", () => {
  const first = jsonReport(), second = { ...jsonReport(), projectName: "integration" };
  const result = imported([JSON.stringify(first), JSON.stringify(second)], 4).read();
  expect(result.diagnostics).toEqual([]);
  expect(new Set(result.evidence[0]!.executionIdentities).size).toBe(4);
});

it("preserves repeated Cargo test names across supporting test binaries", () => {
  const content = ["unit_tests", "integration_tests"].map(binary => `Running ${binary}\n` +
    "test validation::rejects_invalid_input ... ok\ntest result: ok. 1 passed; 0 failed; 0 ignored;\n").join("");
  const parsed = parseExecutedReport(content);
  expect(parsed.count).toBe(2);
  expect(new Set(parsed.identities).size).toBe(2);
  expect(parsed.identities.every(name => name.includes("validation::rejects_invalid_input"))).toBe(true);
});
