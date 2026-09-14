import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { inspectVerificationPlan } from "../src/manual-test-verification/verification-plan-correction.js";
import { CoverageResponseValidationError, runCorrectableCoverageStage } from "../src/manual-test-verification/coverage-response-correction.js";
import { VerificationPlanError } from "../src/manual-test-verification/fresh-verification-plan.js";
import { recoverVerificationWorker } from "../src/manual-test-verification/verification-worker-recovery.js";

it("finishes successive plan corrections instead of stopping while validation progresses", async () => {
  const directory = mkdtempSync(join(tmpdir(), "plan-progress-"));
  try {
    writeFileSync(join(directory, "package.json"), "{}");
    const checks = ["alpha", "beta", "gamma"].map(id => ({ id, kind: "static", cwd: directory, command: `npm run ${id}`, configurationFiles: ["missing.json"], testPaths: [], reason: "Configured verification" }));
    const worker = vi.fn(async () => {
      const fixed = worker.mock.calls.length - 1;
      return JSON.stringify({ checks: checks.map((c, index) => index < fixed ? { ...c, configurationFiles: ["package.json"] } : c), phases: [{ phaseNumber: 42, checkIds: checks.map(c => c.id) }] });
    });
    const result = await inspectVerificationPlan({ directory, phases: [42], prompt: "Inspect current configuration", worker, owned: async () => true, correcting: async () => {} });
    expect(worker).toHaveBeenCalledTimes(4); expect(result?.checks).toHaveLength(3);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("resumes inspection after a worker error with the original scope and the exact failure", async () => {
  const directory = mkdtempSync(join(tmpdir(), "inspect-resume-"));
  try {
    const worker = vi.fn().mockRejectedValueOnce(new Error("Configured inventory lookup failed"))
      .mockResolvedValueOnce(JSON.stringify({ checks: [], phases: [{ phaseNumber: 42, checkIds: [], noAutomationReason: "Documentation-only accepted scope" }] }));
    const result = await inspectVerificationPlan({ directory, phases: [42], prompt: "Inspect current configuration", worker, owned: async () => true, correcting: async () => {} });
    expect(result?.checks).toEqual([]);
    expect(worker.mock.calls[1]![0]).toContain("Inspect current configuration");
    expect(worker.mock.calls[1]![0]).toContain("Configured inventory lookup failed");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("corrects several distinct coverage response defects using the same evidence", async () => {
  const responses = [{}, { links: [] }, { links: [], unresolved: [] }, { links: [], unresolved: [], inspected: 1 }];
  let call = 0;
  const run = vi.fn(async (_prompt: string) => JSON.stringify(responses[call++]));
  const validate = (response: string) => {
    const value = JSON.parse(response);
    for (const field of ["links", "unresolved", "inspected"]) if (!(field in value)) throw new CoverageResponseValidationError(field, "required field", undefined);
    return value;
  };
  expect(await runCorrectableCoverageStage("Preserved evidence catalogue", run, validate)).toEqual(responses[3]);
  expect(run).toHaveBeenCalledTimes(4);
  expect(run.mock.calls.every(([p]) => p.startsWith("Preserved evidence catalogue"))).toBe(true);
});

it("returns command admission errors from a saved plan for targeted model correction", async () => {
  const directory = mkdtempSync(join(tmpdir(), "command-admission-"));
  try {
    writeFileSync(join(directory, "package.json"), "{}");
    const initialPlan = { checks: [{ id: "configured", kind: "static" as const, cwd: directory, command: "node old-check.cjs", configurationFiles: ["package.json"], testPaths: [], reason: "Configured static obligation" }], phases: [{ phaseNumber: 42, checkIds: ["configured"] }] };
    const worker = vi.fn(async (_prompt: string) => JSON.stringify({ checkUpdates: [{ id: "configured", command: "node current-check.cjs" }], phaseUpdates: [] }));
    const result = await inspectVerificationPlan({ directory, phases: [42], prompt: "Inspect", initialPlan, worker, owned: async () => true, correcting: async () => {},
      validate: candidate => {
        if (candidate.checks[0]!.command !== "node current-check.cjs") throw new VerificationPlanError("configured: the configured check entry point must be reconciled", "semantic", candidate);
      },
    });
    expect(worker).toHaveBeenCalledOnce();
    expect(worker.mock.calls[0]![0]).toContain("configured: the configured check entry point must be reconciled");
    expect(result?.checks[0]?.command).toBe("node current-check.cjs"); expect(result?.phases).toEqual(initialPlan.phases);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it.each(["HEPHA_INPUT_USAGE_BUDGET_EXCEEDED", "RUNTIME_ROUTE_SEQUENCE_EXHAUSTED", "Permission denied", "Provider budget exhausted", "Correction runtime limit reached"])("does not retry the runtime/authority boundary %s", async message => {
  const worker = vi.fn(async () => { throw new Error(message); });
  await expect(recoverVerificationWorker({ directory: tmpdir(), prompt: "Inspect", worker, owned: async () => true, recovering: async () => {} })).rejects.toThrow(message);
  expect(worker).toHaveBeenCalledOnce();
});

it("does not resume inspection after cancellation at recovery handoff", async () => {
  const directory = mkdtempSync(join(tmpdir(), "inspection-cancel-"));
  try {
    let owned = true;
    const worker = vi.fn(async () => { throw new Error("Inspection file lookup failed"); });
    expect(await recoverVerificationWorker({ directory, prompt: "Inspect", worker, owned: async () => owned, recovering: async () => { owned = false; } })).toBeNull();
    expect(worker).toHaveBeenCalledOnce();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("changing invalid response lengths does not reset coverage recovery progress", async () => {
  let call = 0;
  const run = vi.fn(async () => JSON.stringify({ links: "x".repeat(++call) }));
  await expect(runCorrectableCoverageStage("Same evidence", run, response => {
    const value = JSON.parse(response); throw new CoverageResponseValidationError("links", "array", value.links);
  })).rejects.toThrow("no validation progress");
  expect(run).toHaveBeenCalledTimes(3);
});
