import { expect, it } from "vitest";
import { assertExecutionReceiptBinding } from "../src/manual-test-verification/execution-receipt-binding.js";

function validate(command: string, cwd = "/project/tests", receiptCwd = cwd, planned = "npm test -- --reporter=json > results.json 2>&1") {
  const scope = { directory: "/run", runId: "current", checks: [{ id: "tests", cwd, command: planned }] };
  return () => assertExecutionReceiptBinding({ schema: "phase-verification-receipt/v1", feature: "FEAT-SYNTHETIC",
    checks: [{ id: "tests", cwd: receiptCwd, command }] }, "FEAT-SYNTHETIC", scope);
}
const command = "npm test -- --reporter=json > results.json 2>&1";
it.each([
  `cd /project/tests && ${command}`,
  `cd '/project/tests' && ${command}`,
  `cd "/project/tests" && ${command}`,
  `cd -- '/project/tests' && ${command}`,
  `cd '/project/tests'&&${command}`,
  `  cd\t/project/tests\t&&\t${command}  `,
])("accepts equivalent literal cwd presentation: %s", actual => expect(validate(actual)).not.toThrow());
it.each([
  ["/project/test files", "'/project/test files'"],
  ["/project/test files", '"/project/test files"'],
  ["/project/test files", "/project/test\\ files"],
  ["/project/it's tests", "'/project/it'\\''s tests'"],
  ["/project/$literal", "'/project/$literal'"],
])("accepts a quoted literal path %s", (cwd, quoted) => expect(validate(`cd ${quoted} && ${command}`, cwd)).not.toThrow());
it.each([
  `cd /other/tests && ${command}`,
  `cd /project/tests; ${command}`,
  `cd /project/tests || ${command}`,
  `echo 'cd /project/tests && ${command}'`,
  `false && cd /project/tests && ${command}`,
  `cd "$PWD" && ${command}`,
  `cd $(pwd) && ${command}`,
  `cd /project/* && ${command}`,
  `cd /project/tests && ${command} -- --filter different`,
  `cd /project/tests && ${command}; true`,
  `cd /project/tests && echo '${command}'`,
  `cd /project/tests && ${command.replace("results.json", "old-results.json")}`,
])("still rejects changed directories, commands or selection: %s", actual => expect(validate(actual)).toThrow(/command/));
it("does not hide a separately mismatched cwd field", () => {
  expect(validate(`cd /project/tests && ${command}`, "/project/tests", "/other/tests")).toThrow(/cwd/);
});
it("does not treat a newly added manifest option as directory formatting", () => {
  expect(validate("cd /project/tests && cargo metadata --manifest-path native/Cargo.toml", "/project/tests", "/project/tests", "cargo metadata")).toThrow(/command/);
});
