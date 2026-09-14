export function playwrightReport() {
  return { stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 }, errors: [], suites: [{ title: "form.spec.ts", file: "form.spec.ts", specs: [
    { title: "AC-01 Save displays confirmation", ok: true, file: "form.spec.ts", line: 10, column: 1, tests: [
      { projectId: "chromium", projectName: "chromium", expectedStatus: "passed", status: "expected", results: [
        { status: "passed", retry: 0, duration: 15, startTime: "2026-01-01T12:00:00Z", errors: [] },
      ] },
    ] },
  ], suites: [] }] };
}
export function trxReport() {
  return `<?xml version="1.0" encoding="utf-8"?>
<TestRun xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">
 <Results><UnitTestResult executionId="execution-1" testId="test-1" testName="Save displays confirmation" outcome="Passed" duration="00:00:00.015" /></Results>
 <TestDefinitions><UnitTest id="test-1" name="Save displays confirmation">
  <Execution id="execution-1" /><TestMethod className="Example.FormTests" name="SaveConfirmation" />
 </UnitTest></TestDefinitions>
 <ResultSummary outcome="Completed"><Counters total="1" executed="1" passed="1" failed="0" error="0" timeout="0" aborted="0" inconclusive="0" passedButRunAborted="0" notRunnable="0" notExecuted="0" disconnected="0" warning="0" completed="0" inProgress="0" pending="0" /></ResultSummary>
</TestRun>`;
}
