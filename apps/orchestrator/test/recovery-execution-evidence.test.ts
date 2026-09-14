import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { parseExecutedReport, readRecoveryExecutionEvidence } from "../src/manual-test-verification/recovery-execution-evidence.js";
import { readFeatureDocuments } from "../src/manual-test-verification/steered-pack-preparation.js";
import { trxReport, playwrightReport } from "./native-execution-fixtures.js";
const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "hepha-receipt-test-")); temporary.push(root);
  const directory = join(root, "verification"); mkdirSync(directory);
  const reportPath = join(root, "executed.json");
  const report = { success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0,
    testResults: [{ name: "form.test.ts", status: "passed", assertionResults: [{ fullName: "AC-01 Save displays confirmation", status: "passed" }] }] };
  const check = { kind: "form-unit", command: "npx vitest run --reporter=json", cwd: root, testedRevision: "abcde1234567890", tests: 1, passed: 1, failed: 0, exitCode: 0, success: true, reportPath, reportSha256: hash(JSON.stringify(report)) };
  const receipt = { schema: "phase-verification-receipt/v1", feature: "FEAT-EXAMPLE", checks: [check] };
  const publish = () => { writeFileSync(reportPath, JSON.stringify(report)); writeFileSync(join(directory, "receipt.json"), JSON.stringify(receipt)); };
  publish();
  return { root, directory, reportPath, report, check, receipt, publish, read: () => readRecoveryExecutionEvidence(root, root, "FEAT-EXAMPLE") };
}
it.each(["playwright", "trx"])("imports native %s plus a checksum-bound companion log without double-counting", format => {
  const h = fixture(), content = format === "trx" ? trxReport() : JSON.stringify(playwrightReport());
  const reportPath = join(h.root, format === "trx" ? "results.trx" : "playwright.json"), logPath = join(h.root, "console.log");
  Object.assign(h.check, { command: format === "trx" ? 'dotnet test --logger "trx"' : "npx playwright test", reportPath, reportSha256: hash(content), logPath, logSha256: hash("Build and test console output"),
    testedRevision: "working tree @ abcde1234567890 + documented uncommitted changes" });
  h.publish(); writeFileSync(reportPath, content); writeFileSync(logPath, "Build and test console output");
  const imported = h.read();
  expect(imported.diagnostics).toEqual([]);
  expect(imported.evidence).toHaveLength(1);
  expect(imported.evidence[0]!.executionIdentities).toHaveLength(1);
  expect(imported.evidence[0]!.detail).toContain("documented uncommitted changes");
  writeFileSync(logPath, "Changed audit output");
  expect(h.read().evidence).toEqual([]);
});
it("preserves archived reports with a qualified revision and the explicit extraReportPath spelling", () => {
  const h = fixture(), extra = structuredClone(h.report), extraPath = join(h.root, "supplemental.json");
  extra.testResults[0]!.assertionResults[0]!.fullName = "AC-02 Confirmation persists";
  Object.assign(h.check, { testedRevision: "abcde1234567890 + test-only working tree", extraReportPath: extraPath, extraReportSha256: hash(JSON.stringify(extra)), tests: 2, passed: 2 });
  h.publish(); writeFileSync(extraPath, JSON.stringify(extra));
  expect(h.read().diagnostics).toEqual([]);
  expect(h.read().evidence[0]!.executionIdentities).toHaveLength(2);
  expect(h.read().evidence[0]!.detail).toContain("+ test-only working tree");
  Object.assign(h.check, { extraPath, extraSha256: "0".repeat(64) }); h.publish();
  expect(h.read().evidence).toEqual([]); // contradictory aliases must not be silently preferred
});
it("counts a native stdout report once when the same file is also the audit log", () => {
  const h = fixture(), content = "test accepted_behaviour ... ok\ntest result: ok. 1 passed; 0 failed; 0 ignored;\n";
  const path = join(h.directory, "native.log");
  Object.assign(h.check, { reportPath: path, reportSha256: hash(content), logPath: path, logSha256: hash(content) });
  h.publish(); writeFileSync(path, content);
  expect(h.read().diagnostics).toEqual([]);
  expect(h.read().evidence[0]!.verifiedExecution?.executedCount).toBe(1);
  expect(h.read().evidence[0]!.verifiedExecution?.reportHashes).toEqual([hash(content)]);
  // A second native reference is still double counting, even with valid hashes.
  Object.assign(h.check, { extraReportPath: path, extraReportSha256: hash(content), tests: 2, passed: 2 }); h.publish();
  expect(h.read().diagnostics.join()).toContain("Repeated reports");
  delete (h.check as Record<string, unknown>).extraReportPath;
  delete (h.check as Record<string, unknown>).extraReportSha256;
  Object.assign(h.check, { tests: 1, passed: 1, logSha256: "0".repeat(64) }); h.publish();
  expect(h.read().diagnostics.join()).toContain("checksum");
});
it("cannot count the same native report as another check by changing its audit log", () => {
  const h = fixture(), logPath = join(h.directory, "companion.log");
  writeFileSync(logPath, "additional audit");
  h.receipt.checks.push({ ...h.check, kind: "other", logPath, logSha256: hash("additional audit") } as typeof h.check);
  h.publish();
  expect(h.read().diagnostics.join()).toContain("Duplicate report cannot count as separate checks");
});
it.each(["working tree @ abcde1234567890 or fedcb1234567890", "abcde1234567890 @ working tree or fedcb1234567890", "Current HEAD", "prebuilt from abcde1234567890"])("does not infer tested revision from %s", testedRevision => {
  const h = fixture(); h.check.testedRevision = testedRevision; h.publish();
  expect(h.read().evidence).toEqual([]);
});
it.each([
  "abcde1234567890 @ working tree (uncommitted runtime migration; test files unchanged)",
  "abcde1234567890 + documented uncommitted runtime migration working-tree edits (required to build; paired test files unchanged)",
  "working-tree @ abcde1234567890 (uncommitted runtime migration)",
])("accepts qualified source wording without rewriting it as a clean commit: %s", testedRevision => {
  const h = fixture();
  h.check.testedRevision = testedRevision;
  h.publish();
  const before = readFileSync(join(h.directory, "receipt.json"));
  const imported = h.read();
  expect(imported.diagnostics).toEqual([]);
  expect(imported.evidence[0]!.verifiedExecution).toMatchObject({ testedRevision: "abcde1234567890", sourceState: h.check.testedRevision });
  expect(readFileSync(join(h.directory, "receipt.json"))).toEqual(before);
});
it("imports every native report from a multi-suite command, rejecting a missing, changed or duplicated member", () => {
  const h = fixture();
  const reports = Array.from({ length: 4 }, (_, i) => {
    const content = trxReport().replaceAll("SaveConfirmation", `SaveConfirmation${i}`);
    const path = join(h.directory, `suite-${i}.trx`); writeFileSync(path, content);
    return { path, sha256: hash(content) };
  });
  delete (h.check as Partial<typeof h.check>).reportPath;
  delete (h.check as Partial<typeof h.check>).reportSha256;
  Object.assign(h.check, { reports, tests: 4, passed: 4 }); h.publish();
  expect(h.read().diagnostics).toEqual([]);
  expect(h.read().evidence[0]!.executionIdentities).toHaveLength(4);
  Object.assign(h.check, { reports: reports.slice(0, 3) }); h.publish();
  expect(h.read().evidence).toEqual([]);
  Object.assign(h.check, { reports: [reports[0], reports[1], reports[2], reports[0]] }); h.publish();
  expect(h.read().evidence).toEqual([]);
  Object.assign(h.check, { reports }); h.publish(); writeFileSync(reports[3]!.path, "changed");
  expect(h.read().evidence).toEqual([]);
});
it.each([null, [], "results.trx", [{}], [{ path: "results.trx", sha256: "invalid" }], Array(101).fill({ path: "results.trx", sha256: "a".repeat(64) })])("rejects malformed or excessive report collections (%j)", reports => {
  const h = fixture(); Object.assign(h.check, { reports }); h.publish();
  expect(h.read().evidence).toEqual([]);
});
it("keeps collection console logs audit-only and rejects conflicting legacy report fields", () => {
  const h = fixture(), content = trxReport(), nativePath = join(h.directory, "results.trx"), logPath = join(h.directory, "console.log");
  writeFileSync(nativePath, content); writeFileSync(logPath, "Passed! Total: 1");
  Object.assign(h.check, { reports: [{ path: nativePath, sha256: hash(content) }], logPath, logSha256: hash("Passed! Total: 1") });
  h.publish(); expect(h.read().diagnostics.join()).toContain("mix reports");
  delete (h.check as Partial<typeof h.check>).reportPath; delete (h.check as Partial<typeof h.check>).reportSha256;
  h.publish(); expect(h.read().diagnostics).toEqual([]);
  expect(h.read().evidence[0]!.executionIdentities).toHaveLength(1);
  writeFileSync(logPath, "changed"); expect(h.read().evidence).toEqual([]);
});
it("imports checksum-bound executed identities and deduplicates repeated receipts without adding tests", () => {
  const h = fixture();
  writeFileSync(join(h.directory, "repeat.json"), JSON.stringify(h.receipt));
  const result = h.read();
  expect(result.evidence).toHaveLength(1);
  expect(result.evidence[0]).toMatchObject({ status: "executed-passed", sourcePath: h.reportPath, command: h.check.command });
  expect(result.evidence[0]!.executionIdentities).toContain("form.test.ts: AC-01 Save displays confirmation");
  expect(result.diagnostics).toEqual([]);
});
it("fingerprints report mutations even when the receipt and Markdown did not change", () => {
  const h = fixture(), original = h.read();
  writeFileSync(h.reportPath, readFileSync(h.reportPath, "utf8") + "\n");
  const changed = h.read();
  expect(changed.fingerprint).not.toBe(original.fingerprint);
  expect(changed.evidence).toEqual([]);
  expect(changed.diagnostics.join()).toContain("checksum");
});
it("rejects discovered, prebuilt, failed, zero, mismatched, unbound and cross-feature claims", () => {
  const h = fixture();
  const original = structuredClone(h.check);
  for (const change of [{ command: "npx playwright test --list" }, { command: "dotnet test --no-build" }, { success: false }, { exitCode: 1 }, { tests: 0 }, { tests: 2 }, { testedRevision: "" }, { reportSha256: "" }, { cwd: "" }]) {
    Object.assign(h.check, original, change); h.publish();
    expect(h.read().evidence, JSON.stringify(change)).toEqual([]);
  }
  Object.assign(h.check, original); h.receipt.feature = "FEAT-OTHER"; h.publish();
  expect(h.read().evidence).toEqual([]);
});
it("does not accept a passing summary hiding failed or absent assertions", () => {
  const h = fixture();
  for (const assertions of [[], [{ fullName: "AC-01", status: "failed" }]]) {
    h.report.testResults[0]!.assertionResults = assertions;
    h.check.reportSha256 = hash(JSON.stringify(h.report)); h.publish();
    expect(h.read().evidence).toEqual([]);
  }
});
it("rejects symlink reports and sanitizes unsupported evidence", () => {
  const h = fixture();
  const alias = join(h.root, "alias.json"); symlinkSync(h.reportPath, alias);
  h.check.reportPath = alias; h.publish();
  expect(h.read().evidence).toEqual([]);
  expect(h.read().diagnostics.join()).toContain("symlink");
});
it("checks every report in a focused multi-report execution", () => {
  const h = fixture();
  const extraPath = join(h.root, "extra.json"), extra = structuredClone(h.report);
  extra.testResults[0]!.assertionResults[0]!.fullName = "AC-02 Open form";
  writeFileSync(extraPath, JSON.stringify(extra));
  Object.assign(h.check, { extraPath, extraSha256: hash(JSON.stringify(extra)), tests: 2, passed: 2 }); h.publish();
  expect(h.read().evidence).toHaveLength(1);
  writeFileSync(extraPath, "{}");
  expect(h.read().evidence).toEqual([]);
});
it("requires real Cargo identities and rejects prose, failed and zero-test summaries", () => {
  expect(parseExecutedReport("test form::save ... ok\ntest result: ok. 1 passed; 0 failed; 0 ignored;\n")).toEqual({ count: 1, identities: ["form::save"] });
  for (const report of ["1 tests passed, commit abc123456", "test result: ok. 0 passed; 0 failed; 0 ignored;", "test result: ok. 1 passed; 0 failed; 0 ignored;", "test form::save ... ok\ntest result: FAILED. 1 passed; 1 failed; 0 ignored;"]) expect(() => parseExecutedReport(report)).toThrow();
});

it("does not resurrect an older passing receipt after a newer failure of the same check", () => {
  const h = fixture();
  Object.assign(h.receipt, { verifiedAt: "2026-01-01T12:00:00Z" }); h.publish();
  writeFileSync(join(h.directory, "newer.json"), JSON.stringify({ ...h.receipt, verifiedAt: "2026-01-01T12:05:00Z", checks: [{ ...h.check, success: false, exitCode: 1 }] }));
  expect(h.read().evidence).toEqual([]);
});
it("includes late exact criterion mappings without changing the normal source fingerprint", () => {
  const h = fixture();
  writeFileSync(join(h.root, "Phase23.md"), `# Old acceptance evidence\n${"Earlier narrative. ".repeat(6000)}\n\n# New repair report\n| AC-01 | form.test.ts Save displays confirmation |\n| AC-010 | unrelated evidence |\n`);
  const ordinary = readFeatureDocuments(h.root, "acceptance evidence");
  const recovery = readFeatureDocuments(h.root, "acceptance evidence", ["AC-01"]);
  expect(recovery.split("\n")[0]).toBe(ordinary.split("\n")[0]);
  expect(recovery.split("Exact criterion context:")[1]).toContain("form.test.ts Save displays confirmation");
  expect(recovery).not.toContain("AC-010 (bounded source mentions");
});

// Regression coverage for the former prefix-only execution evidence import.
// Assert the required evidence, not the implementation's current slice lengths.
it.each([
  { boundary: "a large number of short test identities", preceding: 260, padding: "" },
  { boundary: "long identities in a smaller suite", preceding: 120, padding: " unrelated baseline scenario".repeat(12) },
])("retains acceptance evidence after $boundary", ({ preceding, padding }) => {
  const h = fixture();
  const target = "AC-01 Save confirmation remains visible after navigation";
  const assertions = Array.from({ length: preceding }, (_, index) => ({ fullName: `Baseline ${index}${padding}`, status: "passed" }));
  assertions.push({ fullName: target, status: "passed" });
  h.report.testResults[0]!.assertionResults = assertions;
  h.report.numTotalTests = h.report.numPassedTests = assertions.length;
  h.check.tests = h.check.passed = assertions.length;
  h.check.reportSha256 = hash(JSON.stringify(h.report));
  h.publish();
  // Prove the target actually executed and the receipt passed import validation first.
  expect(parseExecutedReport(readFileSync(h.reportPath, "utf8")).identities.some(identity => identity.includes(target))).toBe(true);
  const imported = h.read();
  expect(imported.evidence).toHaveLength(1);
  expect(imported.evidence[0]!.status).toBe("executed-passed");
  expect(JSON.stringify(imported.evidence).includes(target), "Late passing acceptance evidence must remain available to assessment").toBe(true);
});

it("retains a supplemental report's acceptance evidence after a large primary report", () => {
  const h = fixture();
  const target = "AC-01 Save confirmation survives Forward and reload";
  h.report.testResults[0]!.assertionResults = Array.from({ length: 280 }, (_, index) => ({ fullName: `Baseline ${index}`, status: "passed" }));
  h.report.numTotalTests = h.report.numPassedTests = 280;
  const extra = { ...h.report, numTotalTests: 1, numPassedTests: 1,
    testResults: [{ name: "history.test.ts", status: "passed", assertionResults: [{ fullName: target, status: "passed" }] }] };
  const extraPath = join(h.root, "supplemental.json");
  writeFileSync(extraPath, JSON.stringify(extra));
  Object.assign(h.check, { tests: 281, passed: 281, reportSha256: hash(JSON.stringify(h.report)), extraPath, extraSha256: hash(JSON.stringify(extra)) });
  h.publish();
  const imported = h.read();
  expect(imported.evidence).toHaveLength(1);
  expect(imported.evidence[0]!.detail).toContain("281 tests executed and passed");
  expect(JSON.stringify(imported.evidence).includes(target), "An imported supplemental report must not lose its executed assertions").toBe(true);
});
