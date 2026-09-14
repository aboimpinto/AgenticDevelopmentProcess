import { expect, it } from "vitest";
import { VerificationExecutionActivity } from "../src/manual-test-verification/verification-execution-activity.js";

const checks = [{ id: "unit", kind: "test", cwd: "/synthetic/project", command: "npm test -- --reporter=json" },
  { id: "lint", kind: "static", cwd: "/synthetic/project", command: "npm run lint" }];
const start = (command: string, toolCallId = "tool-1") => ({ type: "tool_execution_start", toolName: "bash", toolCallId, args: { command } });
const end = (toolCallId = "tool-1") => ({ type: "tool_execution_end", toolName: "bash", toolCallId });
it.each([
  checks[0]!.command,
  `cd /synthetic/project && ${checks[0]!.command}`,
  `date -u +"%Y-%m-%dT%H:%M:%SZ"; cd "/synthetic/project" && ${checks[0]!.command}; echo "EXIT=$?"; date -u`,
  `echo "starting check"\ncd '/synthetic/project' && ${checks[0]!.command}\nprintf 'done\\n'`,
])("tracks the actual planned invocation through harmless logging: %s", command => {
  const tracker = new VerificationExecutionActivity(checks, "/synthetic/project");
  expect(tracker.observe(start(command))).toMatchObject({ stage: "testing", checkId: "unit" });
  expect(tracker.observe(end())).toMatchObject({ stage: "waiting" });
});
it.each([
  'echo "npm test -- --reporter=json"',
  'printf "%s" "npm test -- --reporter=json"',
  "false && npm test -- --reporter=json",
  "if false; then npm test -- --reporter=json; fi",
  "cat <<'EOF'\nnpm test -- --reporter=json\nEOF",
  "cd /different/project && npm test -- --reporter=json",
  "npm test -- --reporter=json --list",
  'echo "$(false)"; npm test -- --reporter=json',
])("does not infer execution from text, conditional code or a different selection: %s", command => {
  expect(new VerificationExecutionActivity(checks, "/synthetic/project").observe(start(command))).toBeNull();
});
it("tracks concurrent tool identities and separates supporting checks from tests", () => {
  const tracker = new VerificationExecutionActivity(checks, "/synthetic/project");
  expect(tracker.observe(start(checks[1]!.command, "lint"))).toMatchObject({ stage: "checking", checkId: "lint" });
  expect(tracker.observe(start(checks[0]!.command))).toMatchObject({ stage: "testing", checkId: "unit" });
  expect(tracker.observe(end("unrelated"))).toBeNull();
  expect(tracker.observe(end())).toMatchObject({ stage: "checking", checkId: "lint" });
  expect(tracker.observe(end("lint"))).toMatchObject({ stage: "waiting" });
});

it("tracks literal cwd/report wrapper variables without executing shell or inferring a pass", () => {
  const tracker = new VerificationExecutionActivity(checks, "/elsewhere");
  expect(tracker.observe(start('RUN_ROOT="/synthetic/project"; mkdir -p "$RUN_ROOT/reports"; cd "$RUN_ROOT" && npm test -- --reporter=json'))).toMatchObject({ stage: "testing", checkId: "unit" });
  expect(tracker.completedCheckIds.size).toBe(0);
});
