import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { parseFreshVerificationPlan } from "../src/manual-test-verification/fresh-verification-plan.js";
import { inspectVerificationPlan } from "../src/manual-test-verification/verification-plan-correction.js";
import { acceptedPlanResponses, rejectedPlanResponses } from "./support/verification-plan-responses.js";

const plan = { checks: [], phases: [{ phaseNumber: 31, checkIds: [], noAutomationReason: 'Documentation includes braces { } and an escaped "quote".' }] };
it.each(acceptedPlanResponses)("accepts $name without a model correction", async ({ wrap }) => {
  const directory = mkdtempSync(join(tmpdir(), "plan-handoff-"));
  try {
    const output = wrap(JSON.stringify(plan)), worker = vi.fn(async () => output), correcting = vi.fn();
    expect(await inspectVerificationPlan({ directory, phases: [31], prompt: "Inspect", worker, correcting, owned: async () => true })).toEqual(plan);
    expect(worker).toHaveBeenCalledTimes(1); expect(correcting).not.toHaveBeenCalled();
    expect(readFileSync(join(directory, "inspection-plan-0.json"), "utf8")).toBe(output);
    expect(JSON.parse(readFileSync(join(directory, "inspection-selected.json"), "utf8"))).toEqual(plan);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
it("does not start another correction after the correction runtime fails", async () => {
  const directory = mkdtempSync(join(tmpdir(), "plan-timeout-"));
  try {
    const worker = vi.fn().mockResolvedValueOnce("broken JSON").mockRejectedValueOnce(new Error("Correction runtime limit reached"));
    await expect(inspectVerificationPlan({ directory, phases: [31], prompt: "Inspect", worker, correcting: async () => {}, owned: async () => true })).rejects.toThrow("Correction runtime limit reached");
    expect(worker).toHaveBeenCalledTimes(2);
    expect(worker.mock.calls[1]![2]).toEqual({ maxRuntimeMs: 180000 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
it.each(rejectedPlanResponses)("rejects $name instead of extracting a nested or preferred plan", ({ wrap }) => {
  expect(() => parseFreshVerificationPlan(wrap(JSON.stringify(plan)), [31])).toThrow(/JSON|ambiguous/i);
});
it("retains semantic checks after unwrapping", () => {
  expect(() => parseFreshVerificationPlan(`Inspected:\n${JSON.stringify(plan)}`, [48])).toThrow(/phase|scope/i);
});
it("reports the exact malformed delimiter and location to the correction worker", async () => {
  const directory = mkdtempSync(join(tmpdir(), "plan-diagnostic-"));
  try {
    const output = '{\n "checks": [],\n "phases": [\n}';
    const worker = vi.fn().mockResolvedValueOnce(output).mockResolvedValueOnce(JSON.stringify(plan));
    const correcting = vi.fn();
    expect(await inspectVerificationPlan({ directory, phases: [31], prompt: "Inspect", worker, correcting, owned: async () => true })).toEqual(plan);
    expect(correcting.mock.calls[0]![0]).toMatchObject({ kind: "format", reason: expect.stringMatching(/JSON_DELIMITER.*line 4, column 1.*expected.*\]/) });
    expect(worker.mock.calls[1]![0]).toContain("JSON_DELIMITER");
    expect(worker.mock.calls[1]![0]).toContain("line 4, column 1");
    expect(worker).toHaveBeenCalledTimes(2);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
it.each([
  ['{checks: [], "phases": []}', /JSON_SYNTAX.*line 1, column 2/],
  ['{"checks": [], "phases": [', /JSON_INCOMPLETE.*expected.*\]/],
  ['No plan was returned.', /JSON_MISSING/],
])("provides actionable format diagnostics for %s", (output, diagnostic) => {
  expect(() => parseFreshVerificationPlan(output as string, [31])).toThrow(diagnostic as RegExp);
});
it("corrects a canonical candidate with targeted diagnostics and a bounded runtime", async () => {
  const directory = mkdtempSync(join(tmpdir(), "plan-correction-"));
  try {
    const invalid = { ...plan, phases: [{ ...plan.phases[0], phaseNumber: 99 }] };
    const worker = vi.fn().mockResolvedValueOnce(`Ignore this explanatory wrapper.\n${JSON.stringify(invalid)}`).mockResolvedValueOnce(`Corrected:\n${JSON.stringify(plan)}`);
    const correcting = vi.fn();
    expect(await inspectVerificationPlan({ directory, phases: [31], prompt: "Inspect", worker, correcting, owned: async () => true })).toEqual(plan);
    expect(worker).toHaveBeenCalledTimes(2);
    expect(worker.mock.calls[1]![0]).toContain("Do not repeat feature inspection");
    expect(worker.mock.calls[1]![0]).toContain("phase 99");
    expect(worker.mock.calls[1]![0]).toContain("inspection-candidate-0.json");
    expect(worker.mock.calls[1]![2]).toEqual({ maxRuntimeMs: 180000 });
    expect(JSON.parse(readFileSync(join(directory, "inspection-candidate-0.json"), "utf8"))).toEqual(invalid);
    expect(correcting.mock.calls[0]![0]).toMatchObject({ attempt: 1, kind: "semantic" });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
