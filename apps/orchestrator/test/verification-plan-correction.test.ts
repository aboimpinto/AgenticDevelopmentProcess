import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { inspectVerificationPlan } from "../src/manual-test-verification/verification-plan-correction.js";
import { applyVerificationPlanPatch } from "../src/manual-test-verification/verification-plan-patch.js";

it("does not dispatch a correction after cancellation during the stage handoff", async () => {
  const directory = mkdtempSync(join(tmpdir(), "plan-cancellation-"));
  try {
    let active = true;
    const worker = vi.fn(async () => "invalid JSON");
    const result = await inspectVerificationPlan({ directory, phases: [2], prompt: "Inspect", worker,
      owned: async () => active, correcting: async () => { active = false; } });
    expect(result).toBeNull(); expect(worker).toHaveBeenCalledTimes(1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("does not correct or retry a runtime/budget failure", async () => {
  const worker = vi.fn(async () => { throw new Error("HEPHA_INPUT_USAGE_BUDGET_EXCEEDED"); });
  const correcting = vi.fn();
  await expect(inspectVerificationPlan({ directory: tmpdir(), phases: [2], prompt: "Inspect", worker, owned: async () => true, correcting })).rejects.toThrow("HEPHA_INPUT_USAGE_BUDGET_EXCEEDED");
  expect(worker).toHaveBeenCalledTimes(1); expect(correcting).not.toHaveBeenCalled();
});

it("applies a small check correction without reconstructing unaffected checks or phase order", async () => {
  const directory = mkdtempSync(join(tmpdir(), "plan-patch-"));
  try {
    writeFileSync(join(directory, "package.json"), "{}");
    const check = { id: "alpha", kind: "static", cwd: directory, command: "npm run lint", configurationFiles: ["package.json"], testPaths: [], reason: "Configured static check" };
    const candidate = { checks: [check, { ...check, id: "beta", command: "npm run typecheck", configurationFiles: ["nested/package.json"] }], phases: [{ phaseNumber: 23, checkIds: ["beta", "alpha"] }] };
    const patch = { checkUpdates: [{ id: "beta", configurationFiles: ["package.json"] }], phaseUpdates: [] };
    const worker = vi.fn().mockResolvedValueOnce(JSON.stringify(candidate)).mockResolvedValueOnce(JSON.stringify(patch));
    const result = await inspectVerificationPlan({ directory, phases: [23], prompt: "Inspect", worker, owned: async () => true, correcting: async () => {} });
    expect(result?.checks[0]).toEqual(check); expect(result?.phases).toEqual(candidate.phases);
    expect(result?.checks[1]?.configurationFiles).toEqual(["package.json"]);
    expect(worker).toHaveBeenCalledTimes(2);
    expect(worker.mock.calls[1]![0]).toContain("checkUpdates");
    expect(worker.mock.calls[1]![0]).not.toContain("phase 23:");
    expect(JSON.parse(readFileSync(join(directory, "inspection-plan-1.json"), "utf8"))).toEqual(patch);
    expect(JSON.parse(readFileSync(join(directory, "inspection-selected.json"), "utf8"))).toEqual(result);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
it.each([
  { checkUpdates: [{ id: "unaffected", command: "npm run weaker-check" }], phaseUpdates: [] },
  { checkUpdates: [{ id: "broken", cwd: "/configured" }, { id: "broken", cwd: "/other" }], phaseUpdates: [] },
  { checkUpdates: [{ id: "broken", approve: true }], phaseUpdates: [] },
  { checkUpdates: [], phaseUpdates: [{ phaseNumber: 23, checkIds: [] }] },
])("rejects a correction that changes unrelated scope or invalid fields: %j", patch => {
  const candidate = { checks: [{ id: "broken" }, { id: "unaffected" }], phases: [{ phaseNumber: 23, checkIds: ["broken", "unaffected"] }] };
  const before = structuredClone(candidate);
  expect(() => applyVerificationPlanPatch(JSON.stringify(patch), candidate, "broken: configurationFiles path missing")).toThrow(/Invalid targeted correction/);
  expect(candidate).toEqual(before);
});
