import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { resolveVerificationCommands } from "../src/manual-test-verification/verification-command-resolution.js";
import { saveVerificationPlanBaseline, reuseVerificationPlanBaseline } from "../src/manual-test-verification/verification-plan-baseline.js";
import { receiptCommandMatches } from "../src/manual-test-verification/receipt-command-binding.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture(directory = "native") {
  const root = mkdtempSync(join(tmpdir(), "command-resolution-")); roots.push(root);
  execFileSync("git", ["init", "-q", root]);
  mkdirSync(join(root, directory), { recursive: true });
  writeFileSync(join(root, directory, "Cargo.toml"), '[package]\nname="synthetic"\nversion="0.1.0"\n');
  const command = "cargo metadata --locked --no-deps --format-version 1 > report.log 2>&1";
  const plan = { checks: [{ id: "manifest", kind: "preparation" as const, cwd: root, command,
    configurationFiles: [`${directory}/Cargo.toml`], testPaths: [], reason: "Configured native manifest check" }], phases: [{ phaseNumber: 7, checkIds: ["manifest"] }] };
  return { root, plan };
}

it("resolves the configured manifest without changing cwd, scope, flags or report destination", () => {
  const f = fixture(); const original = structuredClone(f.plan);
  const { plan, corrections } = resolveVerificationCommands(f.plan, [7]);
  expect(plan.checks[0]!.command).toBe("cargo metadata --manifest-path native/Cargo.toml --locked --no-deps --format-version 1 > report.log 2>&1");
  expect({ ...plan.checks[0], command: original.checks[0]!.command }).toEqual(original.checks[0]);
  expect(plan.phases).toEqual(original.phases); expect(f.plan).toEqual(original);
  expect(corrections).toHaveLength(1);
  expect(resolveVerificationCommands(plan, [7]).corrections).toEqual([]);
});

it.each(["test", "build", "check", "fmt", "clippy", "+stable metadata"])("resolves the configured manifest for cargo %s", command => {
  const f = fixture(); f.plan.checks[0]!.command = `cargo ${command} --locked`;
  expect(resolveVerificationCommands(f.plan, [7]).plan.checks[0]!.command).toBe(`cargo ${command} --manifest-path native/Cargo.toml --locked`);
});

it.each(["--manifest-path elsewhere/Cargo.toml", "--manifest-path=elsewhere/Cargo.toml"])("preserves an explicit %s instead of overriding selection", option => {
  const f = fixture(); f.plan.checks[0]!.command = `cargo metadata ${option}`;
  expect(resolveVerificationCommands(f.plan, [7]).corrections).toEqual([]);
});

it.each(["cargo custom-command", "echo cargo metadata", "sh -c 'cargo metadata'"])("does not reinterpret %s", command => {
  const f = fixture(); f.plan.checks[0]!.command = command;
  expect(resolveVerificationCommands(f.plan, [7]).corrections).toEqual([]);
});

it("preserves a discoverable workspace manifest instead of selecting its member", () => {
  const f = fixture(); writeFileSync(join(f.root, "Cargo.toml"), '[workspace]\nmembers=["native"]\n');
  expect(resolveVerificationCommands(f.plan, [7]).corrections).toEqual([]);
});

it("rejects ambiguous configured manifests without selecting one arbitrarily", () => {
  const f = fixture(); mkdirSync(join(f.root, "other")); writeFileSync(join(f.root, "other/Cargo.toml"), "[workspace]");
  f.plan.checks[0]!.configurationFiles.push("other/Cargo.toml");
  expect(() => resolveVerificationCommands(f.plan, [7])).toThrow("multiple configured Cargo manifests");
});

it("quotes literal path characters without expanding or executing them", () => {
  const directory = "native ' $(touch unexpected)"; const f = fixture(directory);
  const { plan } = resolveVerificationCommands(f.plan, [7]);
  const argument = plan.checks[0]!.command.split(" --manifest-path ")[1]!.split(" --locked")[0]!;
  const actual = execFileSync("bash", ["-c", `printf '%s' ${argument}`], { cwd: f.root, encoding: "utf8" });
  expect(actual).toBe(`${directory}/Cargo.toml`);
  expect(() => readFileSync(join(f.root, "unexpected"))).toThrow();
});

it("saves the corrected command for the next run and still rejects a changed test filter", () => {
  const f = fixture(); const folder = join(f.root, "feature"); mkdirSync(folder);
  const input = { root: f.root, folder, featureId: "FEAT-SYNTHETIC", runId: "first", directory: join(f.root, ".hepha/verification-runs/first"), sourceFingerprint: "requirements", contractHash: "contract", phases: [7], contextRoots: [f.root] };
  const next = { ...input, runId: "second", directory: join(f.root, ".hepha/verification-runs/second") };
  mkdirSync(input.directory, { recursive: true }); mkdirSync(next.directory);
  saveVerificationPlanBaseline(input, f.plan); // Legacy saved plan has the omission.
  const repaired = resolveVerificationCommands(reuseVerificationPlanBaseline(next)!, [7]);
  saveVerificationPlanBaseline(next, repaired.plan);
  const reused = reuseVerificationPlanBaseline({ ...next, runId: "third", directory: join(f.root, ".hepha/verification-runs/third") })!;
  expect(reused.checks[0]!.command).toBe(repaired.plan.checks[0]!.command);
  expect(resolveVerificationCommands(reused, [7]).corrections).toEqual([]);
  expect(receiptCommandMatches(reused.checks[0]!.command + " --filter unrelated", reused.checks[0]!.command, f.root)).toBe(false);
});
