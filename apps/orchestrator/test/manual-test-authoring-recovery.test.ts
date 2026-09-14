import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { authorWithCheckpoints } from "../src/manual-test-verification/authoring-checkpoints.js";
import type { ManualTestDeliveryModel } from "../src/manual-test-verification/delivery-model.js";

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), "hepha-authoring-recovery-")); folders.push(folder);
  const model = { manifestEntries: Array.from({ length: 7 }, (_, index) => ({ sourceId: `AC-${index}`, criterionPreview: `Verify example behavior ${index}` })),
    tests: [], coverageMap: [], invalidManualTests: [], automatedEvidence: [], deferredSurfaces: [], applicability: "incomplete" } as unknown as ManualTestDeliveryModel;
  return { checkpointPath: join(folder, "progress.json"), fingerprint: "source-v1", guidance: "", sourceMarkdown: "Example application supports Save. No account or special data is required.", model };
}
const newCase = { id: "MT-SAVE", title: "Save", purpose: "Verify saving", sourceIds: ["AC-0"], role: "Operator", application: "Example application", preconditions: ["Example application is installed"], setupData: "No account or special data required", steps: ["Open the Example application", "Select Save"], expectedResult: "Saved confirmation is visible" };

it("persists validated batches and resumes only the remaining criteria after timeout", async () => {
  const options = fixture();
  const runPrompt = vi.fn().mockResolvedValueOnce(JSON.stringify({ tests: [newCase], unresolved: [] })).mockRejectedValueOnce(new Error("Timed out"));
  await expect(authorWithCheckpoints({ ...options, runPrompt })).rejects.toThrow(/saved|preserved/i);
  const progress = JSON.parse(readFileSync(options.checkpointPath, "utf8"));
  expect(progress.completedBatches).toHaveLength(1);
  expect(progress.state).toBe("paused");
  const resume = vi.fn().mockResolvedValue(JSON.stringify({ tests: [], unresolved: [] }));
  const result = await authorWithCheckpoints({ ...options, runPrompt: resume });
  expect(resume).toHaveBeenCalledTimes(2);
  expect(result.tests).toEqual([newCase]);
});

it("does not reuse saved proposals when source identity changes", async () => {
  const options = fixture();
  await expect(authorWithCheckpoints({ ...options, runPrompt: vi.fn().mockResolvedValueOnce(JSON.stringify({ tests: [newCase], unresolved: [] })).mockRejectedValue(new Error("Timeout")) })).rejects.toThrow();
  const runPrompt = vi.fn().mockResolvedValue(JSON.stringify({ tests: [], unresolved: [] }));
  expect((await authorWithCheckpoints({ ...options, fingerprint: "source-v2", runPrompt })).tests).toEqual([]);
  expect(runPrompt).toHaveBeenCalledTimes(3);
});

it("never checkpoints malformed or unvalidated model output", async () => {
  const options = fixture();
  await expect(authorWithCheckpoints({ ...options, runPrompt: async () => '{"tests":[' })).rejects.toThrow();
  expect(JSON.parse(readFileSync(options.checkpointPath, "utf8")).completedBatches).toEqual([]);
});

it("corrects a rejected batch in the same operation and checkpoints only its validated replacement", async () => {
  const options = fixture();
  const invalid = JSON.stringify({ tests: [{ ...newCase, setupData: "" }], unresolved: [] });
  const valid = JSON.stringify({ tests: [newCase], unresolved: [] });
  const runPrompt = vi.fn().mockResolvedValueOnce(invalid).mockImplementationOnce(async prompt => {
    const saved = JSON.parse(readFileSync(options.checkpointPath, "utf8"));
    expect(saved.state).toBe("running");
    expect(saved.message).toContain("Correcting batch");
    expect(saved.completedBatches).toEqual([]);
    expect(prompt).toContain(invalid);
    return valid;
  }).mockResolvedValue(JSON.stringify({ tests: [], unresolved: [] }));
  const result = await authorWithCheckpoints({ ...options, runPrompt });
  expect(result.tests).toEqual([newCase]);
  const saved = JSON.parse(readFileSync(options.checkpointPath, "utf8"));
  expect(saved.state).toBe("assessed");
  expect(saved.completedBatches).toHaveLength(3);
});

it("stops before corrective dispatch when the source or operation ownership changes", async () => {
  const options = fixture();
  const assertCurrent = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)
    .mockRejectedValue(new Error("Sources changed"));
  const runPrompt = vi.fn().mockResolvedValue(JSON.stringify({ tests: [{ ...newCase, setupData: "" }], unresolved: [] }));
  await expect(authorWithCheckpoints({ ...options, assertCurrent, runPrompt })).rejects.toThrow("Sources changed");
  expect(runPrompt).toHaveBeenCalledTimes(1);
  expect(JSON.parse(readFileSync(options.checkpointPath, "utf8")).completedBatches).toEqual([]);
});
