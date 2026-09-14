import { expect, it } from "vitest";
import { parseExecutedReport } from "../src/manual-test-verification/recovery-execution-evidence.js";
import { playwrightReport, trxReport } from "./native-execution-fixtures.js";

it("reads native Playwright execution identities including project and nested suite titles", () => {
  const report = playwrightReport();
  expect(parseExecutedReport(JSON.stringify(report))).toEqual({ count: 1, identities: ["form.spec.ts:10:1 [chromium]: form.spec.ts > AC-01 Save displays confirmation"] });
  const other = structuredClone(report.suites[0]!.specs[0]!.tests[0]!); other.projectId = other.projectName = "firefox";
  report.suites[0]!.specs[0]!.tests.push(other); report.stats.expected = 2;
  expect(new Set(parseExecutedReport(JSON.stringify(report)).identities).size).toBe(2);
});
it.each(["discovery", "failed", "flaky", "skipped", "missing", "duplicate", "count", "error", "expected-failure"])("rejects Playwright %s instead of reporting a pass", mutation => {
  const r = playwrightReport(), test = r.suites[0]!.specs[0]!.tests[0]!;
  if (mutation === "discovery") test.results = [];
  if (mutation === "failed") test.results[0]!.status = "failed";
  if (mutation === "flaky") { test.status = "flaky"; test.results.push({ ...test.results[0]!, retry: 1 }); }
  if (mutation === "skipped") r.stats.skipped = 1;
  if (mutation === "missing") r.suites = [];
  if (mutation === "duplicate") r.suites.push(structuredClone(r.suites[0]!));
  if (mutation === "count") r.stats.expected = 2;
  if (mutation === "error") Object.assign(r, { errors: [{ message: "Global teardown failed" }] });
  if (mutation === "expected-failure") test.expectedStatus = "failed";
  expect(() => parseExecutedReport(JSON.stringify(r))).toThrow();
});
it("reads TRX method identities, decoded names and namespace prefixes", () => {
  expect(parseExecutedReport(trxReport())).toEqual({ count: 1, identities: ["Example.FormTests.SaveConfirmation: Save displays confirmation"] });
  expect(parseExecutedReport(trxReport().replaceAll("Save displays confirmation", "Save &amp; confirm")).identities[0]).toContain("Save & confirm");
  const prefixed = trxReport().replace('xmlns=', 'xmlns:t=').replace(/<(\/?)([A-Z][A-Za-z]*)/g, "<$1t:$2");
  expect(parseExecutedReport(prefixed).count).toBe(1);
});
it.each([
  ["failed", 'outcome="Passed"', 'outcome="Failed"'],
  ["skipped", 'notExecuted="0"', 'notExecuted="1"'],
  ["count", 'total="1"', 'total="2"'],
  ["summary failure", 'outcome="Completed"', 'outcome="Failed"'],
  ["unbound method", 'testId="test-1"', 'testId="unknown"'],
  ["unbound execution", 'executionId="execution-1"', 'executionId="unknown"'],
  ["missing method", 'name="SaveConfirmation"', 'name=""'],
  ["wrong namespace", 'TeamTest/2010', 'Wrong/2010'],
  ["malformed XML", '</TestRun>', ''],
  ["DTD", '<TestRun ', '<!DOCTYPE TestRun [<!ENTITY leak SYSTEM "file:///private">]><TestRun '],
])("rejects TRX %s", (_name, from, to) => expect(() => parseExecutedReport(trxReport().replace(from, to))).toThrow());
it("rejects duplicate TRX result identities and summary-only console output", () => {
  const xml = trxReport(), result = xml.match(/<UnitTestResult[^>]+\/>/)![0];
  expect(() => parseExecutedReport(xml.replace(result, result + result))).toThrow();
  expect(() => parseExecutedReport("Passed! - Failed: 0, Passed: 6, Skipped: 0, Total: 6")).toThrow();
});
