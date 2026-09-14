import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { parseFreshVerificationPlan, type FreshPlan } from "../src/manual-test-verification/fresh-verification-evidence.js";
import { inspectVerificationPlan } from "../src/manual-test-verification/verification-plan-correction.js";
import { reuseVerificationPlanBaseline, saveVerificationPlanBaseline } from "../src/manual-test-verification/verification-plan-baseline.js";

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "linked-verification-")); temporary.push(root);
  const repo = (name: string) => {
    const path = join(root, name); mkdirSync(path); execFileSync("git", ["init", "-q", path]);
    writeFileSync(join(path, ".gitignore"), ".hepha/\nfeature/\n"); return path;
  };
  const client = repo("frontend"), server = repo("backend"), unrelated = repo("unrelated");
  writeFileSync(join(client, "package.json"), JSON.stringify({ scripts: { integration: "bash ../backend/run.sh" } }));
  writeFileSync(join(server, "run.sh"), 'node --test "$(dirname "$0")/flow.test.cjs"\n');
  writeFileSync(join(server, "flow.test.cjs"), 'require("node:test")("full workflow", () => require("node:assert/strict").equal(2 + 2, 4));\n');
  const directory = join(client, ".hepha/verification-runs/first"); mkdirSync(directory, { recursive: true });
  const folder = join(client, "feature"); mkdirSync(folder);
  const plan: FreshPlan = { checks: [{ id: "integration", kind: "test", suiteKey: "full-workflow", cwd: client,
    command: "npm run integration", configurationFiles: ["package.json", "../backend/run.sh"],
    testPaths: ["../backend/*.test.cjs"], reason: "The configured frontend script delegates to the backend-owned integration runner.", gates: ["gherkin_e2e"] }],
    phases: [{ phaseNumber: 42, checkIds: ["integration"] }] };
  const input = { root: client, folder, featureId: "EXAMPLE", runId: "first", directory, sourceFingerprint: "requirements", contractHash: "contract", phases: [42], contextRoots: [client] };
  return { root, client, server, unrelated, directory, plan, input };
}
it("admits a configured cross-repository runner without correction and executes the original command", async () => {
  const f = fixture(), worker = vi.fn(async () => JSON.stringify(f.plan)), correcting = vi.fn();
  const selected = await inspectVerificationPlan({ directory: f.directory, phases: [42], prompt: "Inspect", worker, correcting, owned: async () => true });
  expect(selected).toEqual(f.plan); expect(correcting).not.toHaveBeenCalled(); expect(worker).toHaveBeenCalledTimes(1);
  const output = execFileSync("bash", ["-c", selected!.checks[0]!.command], { cwd: f.client, encoding: "utf8", timeout: 10000 });
  expect(output).toMatch(/# pass 1/); expect(output).toMatch(/# fail 0/);
});
it("includes delegated source in baseline invalidation even when no command runs from that repository", () => {
  const f = fixture(); saveVerificationPlanBaseline(f.input, f.plan);
  expect(reuseVerificationPlanBaseline(f.input)).not.toBeNull();
  writeFileSync(join(f.server, "implementation.cjs"), "module.exports = false;\n");
  expect(reuseVerificationPlanBaseline(f.input)).toBeNull();
});
it("rejects test selections outside the repositories bound by configuration", () => {
  const f = fixture(); writeFileSync(join(f.unrelated, "outside.test.cjs"), "test()");
  f.plan.checks[0]!.testPaths = ["../unrelated/*.test.cjs"];
  expect(() => parseFreshVerificationPlan(JSON.stringify(f.plan), [42])).toThrow(/testPaths/);
});
it("rejects symlink escape from a bound test repository", () => {
  const f = fixture(); writeFileSync(join(f.unrelated, "outside.test.cjs"), "test()");
  symlinkSync(join(f.unrelated, "outside.test.cjs"), join(f.server, "escape.test.cjs"));
  expect(() => parseFreshVerificationPlan(JSON.stringify(f.plan), [42])).toThrow(/outside|escape|bound/i);
});
it("preserves wrapper and direct runner references for inspection rather than inferring execution identity", () => {
  const f = fixture(); f.plan.checks.push({ ...f.plan.checks[0]!, id: "duplicate", cwd: f.server, command: "bash run.sh", configurationFiles: ["run.sh"], testPaths: ["*.test.cjs"] });
  f.plan.phases[0]!.checkIds.push("duplicate");
  expect(parseFreshVerificationPlan(JSON.stringify(f.plan), [42])).toEqual(f.plan);
});
it("accepts configured directories and focused files without inferring their runtime selection", () => {
  const f = fixture(); mkdirSync(join(f.server, "tests"));
  writeFileSync(join(f.server, "tests/contract.cjs"), "test()");
  f.plan.checks[0]!.testPaths = ["../backend/tests"];
  expect(parseFreshVerificationPlan(JSON.stringify(f.plan), [42])).toEqual(f.plan);
  f.plan.checks.push({ ...f.plan.checks[0]!, id: "focused", command: "npm run integration -- focused", testPaths: ["../backend/tests/contract.cjs"] });
  f.plan.phases[0]!.checkIds.push("focused");
  expect(parseFreshVerificationPlan(JSON.stringify(f.plan), [42])).toEqual(f.plan);
});
