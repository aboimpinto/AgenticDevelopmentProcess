// Execution fixtures assert TAP evidence; pin the reporter across Node versions.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { inspectVerificationPlan } from "../src/manual-test-verification/verification-plan-correction.js";
import { parseFreshVerificationPlan } from "../src/manual-test-verification/fresh-verification-plan.js";
import { applyVerificationPlanPatch } from "../src/manual-test-verification/verification-plan-patch.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture(phaseNumber: number) {
  const cwd = mkdtempSync(join(tmpdir(), "shared-scenarios-")); roots.push(cwd);
  writeFileSync(join(cwd, "package.json"), "{}");
  writeFileSync(join(cwd, "journeys.test.cjs"), `const test = require('node:test');
const assert = require('node:assert/strict');
test('recovery', () => assert.equal('restored', 'restored'));
test('expiry', () => assert.equal(2 > 1, true));
test('compatibility', () => assert.equal(false, false));
`);
  const checks = ["recovery", "expiry", "compatibility"].map(id => ({ id, kind: "test", suiteKey: "node-integration", cwd,
    command: `node --test --test-reporter=tap --test-name-pattern=^${id}$ journeys.test.cjs`, configurationFiles: ["package.json"],
    testPaths: ["journeys.test.cjs"], reason: `Inspected separate ${id} scenario in the shared source`, gates: ["tests"] }));
  return { cwd, plan: { checks, phases: [{ phaseNumber, checkIds: checks.map(c => c.id) }] } };
}
it.each([12, 46])("admits and executes distinct scenario groups in shared files for phase %s without correction", async phase => {
  const f = fixture(phase), worker = vi.fn(async () => JSON.stringify(f.plan)), correcting = vi.fn();
  const selected = await inspectVerificationPlan({ directory: f.cwd, phases: [phase], prompt: "Inspect", worker, correcting, owned: async () => true });
  expect(selected).toEqual(f.plan); expect(worker).toHaveBeenCalledTimes(1); expect(correcting).not.toHaveBeenCalled();
  for (const check of selected!.checks) {
    const output = execFileSync("bash", ["-c", check.command], { cwd: f.cwd, encoding: "utf8", timeout: 10000 });
    expect(output).toContain(`# Subtest: ${check.id}`); expect(output).toMatch(/# pass 1\b/); expect(output).toMatch(/# fail 0\b/);
  }
});
it("still rejects identical commands with different labels and scopes", () => {
  const f = fixture(12); f.plan.checks[1]!.command = f.plan.checks[0]!.command;
  f.plan.checks[1]!.suiteKey = "different-label";
  expect(() => parseFreshVerificationPlan(JSON.stringify(f.plan), [12])).toThrow(/Duplicate verification execution/);
});
it("allows correction of either side of a saved overlap diagnostic without losing source references", () => {
  const f = fixture(46), patch = { checkUpdates: [{ id: "recovery", reason: "The configured filter selects only recovery scenarios." }], phaseUpdates: [] };
  const result = JSON.parse(applyVerificationPlanPatch(JSON.stringify(patch), f.plan, "expiry: overlap between recovery and expiry; choose one covering execution and map shared obligations to it"));
  expect(result.checks[0].testPaths).toEqual(["journeys.test.cjs"]);
  expect(result.checks[1]).toEqual(f.plan.checks[1]); expect(result.phases).toEqual(f.plan.phases);
  expect(() => applyVerificationPlanPatch(JSON.stringify({ checkUpdates: [{ id: "compatibility", command: "skip" }], phaseUpdates: [] }), f.plan,
    "expiry: overlap between recovery and expiry; choose one covering execution and map shared obligations to it")).toThrow(/identified by diagnostics/);
});
it("retains the rejected plan diagnostic and retry guidance when correction reaches its runtime limit", async () => {
  const f = fixture(46); f.plan.checks[0]!.configurationFiles = ["missing.json"];
  const worker = vi.fn().mockResolvedValueOnce(JSON.stringify(f.plan)).mockRejectedValueOnce(new Error("Maximum runtime 180 seconds. RUNTIME_ROUTE_SEQUENCE_EXHAUSTED"));
  await expect(inspectVerificationPlan({ directory: f.cwd, phases: [46], prompt: "Inspect", worker, correcting: async () => {}, owned: async () => true }))
    .rejects.toThrow(/Verification plan correction stopped before automated tests ran[\s\S]*recovery:.*configurationFiles[\s\S]*RUNTIME_ROUTE_SEQUENCE_EXHAUSTED[\s\S]*Refresh Completion Readiness/);
  expect(worker).toHaveBeenCalledTimes(2);
});

it("corrects either participant of a duplicate-command diagnostic and revalidates the full plan", async () => {
  const f = fixture(46), original = f.plan.checks[0]!.command;
  f.plan.checks[0]!.command = f.plan.checks[1]!.command;
  const worker = vi.fn().mockResolvedValueOnce(JSON.stringify(f.plan)).mockResolvedValueOnce(JSON.stringify({
    checkUpdates: [{ id: "recovery", command: original }], phaseUpdates: [],
  }));
  const selected = await inspectVerificationPlan({ directory: f.cwd, phases: [46], prompt: "Inspect", worker, correcting: async () => {}, owned: async () => true });
  expect(worker).toHaveBeenCalledTimes(2);
  expect(selected!.checks[0]!.command).toBe(original);
  expect(selected!.checks[1]).toEqual(f.plan.checks[1]);
  expect(selected!.phases).toEqual(f.plan.phases);
});
it("cancellation during a failed correction remains cancellation, not a new recovery request", async () => {
  const f = fixture(12); let active = true;
  const worker = vi.fn().mockResolvedValueOnce("broken JSON").mockImplementationOnce(async () => { active = false; throw new Error("Runtime limit reached"); });
  expect(await inspectVerificationPlan({ directory: f.cwd, phases: [12], prompt: "Inspect", worker, correcting: async () => {}, owned: async () => active })).toBeNull();
  expect(worker).toHaveBeenCalledTimes(2);
});

it("orders configured prerequisites before dependent tests and rejects cycles", () => {
  const f = fixture(12);
  const checks = f.plan.checks.map((c, i) => ({ ...c, ...(i === 0 ? { dependsOn: ["expiry"] } : {}) }));
  expect(parseFreshVerificationPlan(JSON.stringify({ ...f.plan, checks }), [12]).checks.map(c => c.id)).toEqual(["expiry", "recovery", "compatibility"]);
  checks[1]!.dependsOn = ["recovery"];
  expect(() => parseFreshVerificationPlan(JSON.stringify({ ...f.plan, checks }), [12])).toThrow(/cycle/);
});
