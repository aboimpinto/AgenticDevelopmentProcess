import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runCoverageStage } from "../src/manual-test-verification/coverage-assessment-checkpoints.js";
import { CoverageResponseValidationError, runCorrectableCoverageStage } from "../src/manual-test-verification/coverage-response-correction.js";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));
function checkpoint() {
  const directory = mkdtempSync(join(tmpdir(), "coverage-stage-test-")); directories.push(directory);
  return { directory, fingerprint: "pack-revision-results-algorithm" };
}
const validate = (response: string) => {
  const result = JSON.parse(response);
  if (result.inspected !== 42) throw new Error("Incomplete inspection");
  return result;
};

it("explicit reassessment reruns decisions but reuses validated extraction pages", async () => {
  const options = checkpoint(), run = vi.fn(async () => '{"inspected":42}');
  await runCoverageStage("extraction", run, validate, options);
  await runCorrectableCoverageStage("decision", run, validate, options);
  const fresh = { ...options, reassessDecisions: true };
  await runCoverageStage("extraction", run, validate, fresh);
  await runCorrectableCoverageStage("decision", run, validate, fresh);
  expect(run.mock.calls.map(args => args[0])).toEqual(["extraction", "decision", "decision"]);
  await runCorrectableCoverageStage("decision", run, validate, options);
  expect(run).toHaveBeenCalledTimes(3);
});

it("revalidates saved stages and reruns damaged or schema-invalid checkpoints", async () => {
  const options = checkpoint(), run = vi.fn(async () => '{"inspected":42}');
  await runCoverageStage("page", run, validate, options);
  await runCoverageStage("page", run, validate, { ...options });
  expect(run).toHaveBeenCalledTimes(1);
  const path = join(options.directory, readdirSync(options.directory)[0]!);
  const saved = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, JSON.stringify({ ...saved, response: '{"inspected":0}' }));
  await runCoverageStage("page", run, validate, options);
  expect(run).toHaveBeenCalledTimes(2);
  writeFileSync(path, "broken JSON");
  await runCoverageStage("page", run, validate, options);
  expect(run).toHaveBeenCalledTimes(3);
});

it("does not persist failed validation and binds reuse to both full prompt and authority fingerprint", async () => {
  const options = checkpoint(), run = vi.fn(async () => '{"inspected":0}');
  await expect(runCoverageStage("page", run, validate, options)).rejects.toThrow("Incomplete inspection");
  expect(readdirSync(options.directory)).toEqual([]);
  run.mockResolvedValue('{"inspected":42}');
  await runCoverageStage("page", run, validate, options);
  await runCoverageStage("changed page", run, validate, options);
  await runCoverageStage("page", run, validate, { ...options, fingerprint: "changed-pack-revision-results-algorithm" });
  expect(run).toHaveBeenCalledTimes(4);
});

const validateCorrectable = (response: string) => {
  const result = JSON.parse(response);
  if (result.inspected !== 42) throw new CoverageResponseValidationError("inspected", "42", result.inspected);
  return result;
};

it("retains value-free rejection diagnostics and checkpoints only the corrected response for restart reuse", async () => {
  const options = checkpoint();
  const run = vi.fn().mockResolvedValueOnce('{"inspected":"secret-returned-value"}').mockResolvedValueOnce('{"inspected":42}');
  expect(await runCorrectableCoverageStage("same evidence", run, validateCorrectable, options)).toEqual({ inspected: 42 });
  expect(run).toHaveBeenCalledTimes(2);
  expect(run.mock.calls[1]![0]).not.toContain("secret-returned-value");
  const rejected = join(options.directory, "rejected-responses");
  const diagnostics = readdirSync(rejected).map(file => readFileSync(join(rejected, file), "utf8"));
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics.join()).not.toContain("secret-returned-value");
  expect(JSON.parse(diagnostics[0]!)).toMatchObject({ attempt: 1, issue: { path: "inspected", expected: "42", actual: "string(length=21)" }, responseHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  const freshProcess = vi.fn(async () => { throw new Error("must reuse validated checkpoint"); });
  expect(await runCorrectableCoverageStage("same evidence", freshProcess, validateCorrectable, options)).toEqual({ inspected: 42 });
  expect(freshProcess).not.toHaveBeenCalled();
});

it("escalates repeated unchanged field defects without caching rejection and permits a later explicit retry", async () => {
  const options = checkpoint(), run = vi.fn(async () => '{"inspected":null}');
  await expect(runCorrectableCoverageStage("same evidence", run, validateCorrectable, options)).rejects.toThrow("no validation progress");
  expect(run).toHaveBeenCalledTimes(3);
  expect(readdirSync(options.directory).filter(name => name.endsWith(".json"))).toEqual([]);
  expect(readdirSync(join(options.directory, "rejected-responses"))).toHaveLength(3);
  run.mockResolvedValue('{"inspected":42}');
  expect(await runCorrectableCoverageStage("same evidence", run, validateCorrectable, options)).toEqual({ inspected: 42 });
  expect(run).toHaveBeenCalledTimes(4);
});

it("does not repeat transport failures or remove evidence to fit a correction request", async () => {
  const run = vi.fn(async () => { throw new Error("provider unavailable"); });
  await expect(runCorrectableCoverageStage("evidence", run, validateCorrectable)).rejects.toThrow("provider unavailable");
  expect(run).toHaveBeenCalledTimes(1);
  const malformed = vi.fn(async () => '{"inspected":null}');
  await expect(runCorrectableCoverageStage("x".repeat(180_000), malformed, validateCorrectable)).rejects.toThrow("prompt bound");
  expect(malformed).toHaveBeenCalledTimes(1);
});
