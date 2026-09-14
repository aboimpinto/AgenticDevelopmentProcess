import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { sourceSnapshot, type FreshPlan } from "../src/manual-test-verification/fresh-verification-evidence.js";
import type { FreshVerificationState } from "../src/manual-test-verification/fresh-verification-state.js";
import { captureVerificationSources, VerificationSourceChanged, VerificationSourceRecovery } from "../src/manual-test-verification/verification-source-recovery.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
const temporary = () => { const root = mkdtempSync(join(tmpdir(), "verification-source-")); roots.push(root); return root; };

it("captures diagnostic file hashes without changing aggregate snapshot semantics", () => {
  const root = temporary(), directory = temporary();
  execFileSync("git", ["init", "-q", root]);
  writeFileSync(join(root, "generated.d.ts"), "export type Result = string;\n");
  const before = sourceSnapshot(root);
  expect(captureVerificationSources([root], [], directory)).toEqual([{ root, hash: before }]);
  const manifest = JSON.parse(readFileSync(join(directory, "source-snapshot-files.json"), "utf8"));
  expect(manifest[0].files[join(root, "generated.d.ts")]).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(manifest)).not.toContain("export type");
  writeFileSync(join(root, "generated.d.ts"), "export type Result = number;\n");
  expect(sourceSnapshot(root)).not.toBe(before);
});

it.each(["missing check", "demoted test", "removed gate", "removed assignment"])("source recovery rejects %s", mode => {
  const directory = temporary(), recovery = new VerificationSourceRecovery();
  const plan: FreshPlan = { checks: [{ id: "contract", kind: "test", cwd: directory, command: "configured-runner", configurationFiles: ["project.json"], testPaths: ["contract.test"], gates: ["tests"], reason: "Accepted contract" }], phases: [{ phaseNumber: 31, checkIds: ["contract"] }] };
  const state: FreshVerificationState = { schema: "fresh-feature-verification/v1", featureId: "FEAT-100", runId: "workflow-synthetic", directory, startedAt: "now", sourceFingerprint: "baseline", status: "executing", plan };
  recovery.next(state, new VerificationSourceChanged([{ root: directory, path: "generated.d.ts", before: "a", after: "b" }]));
  const candidate = structuredClone(plan);
  if (mode === "missing check") candidate.checks = [];
  if (mode === "demoted test") candidate.checks[0]!.kind = "static";
  if (mode === "removed gate") candidate.checks[0]!.gates = [];
  if (mode === "removed assignment") candidate.phases[0]!.checkIds = [];
  expect(() => recovery.validate(candidate)).toThrow(/must preserve/);
  expect(() => recovery.validate(plan)).not.toThrow();
});
