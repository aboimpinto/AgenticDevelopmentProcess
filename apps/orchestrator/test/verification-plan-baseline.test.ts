import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { saveVerificationPlanBaseline, reuseVerificationPlanBaseline } from "../src/manual-test-verification/verification-plan-baseline.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "stable-plan-")); roots.push(root);
  const repository = (name: string) => {
    const path = join(root, name); mkdirSync(path); execFileSync("git", ["init", "-q", path]);
    writeFileSync(join(path, ".gitignore"), ".hepha/\n");
    writeFileSync(join(path, "package.json"), "{}"); writeFileSync(join(path, "test.js"), "assert(true)"); return path;
  };
  const projectRoot = repository("client"), linked = repository("server"), folder = join(projectRoot, "feature"); mkdirSync(folder);
  const directory = join(projectRoot, ".hepha/verification-runs/run-first"); mkdirSync(directory, { recursive: true });
  const input = { root: projectRoot, folder, featureId: "FEAT-SYNTHETIC", runId: "run-first", directory, sourceFingerprint: "requirements-v1", contractHash: "contract-v1", phases: [23], contextRoots: [projectRoot] };
  const plan = { checks: [{ id: "server", kind: "test" as const, suiteKey: "node", cwd: linked, command: `node test.js > ${directory}/report.json`, configurationFiles: ["package.json"], testPaths: ["test.js"], reason: "Integration assertions" }], phases: [{ phaseNumber: 23, checkIds: ["server"] }] };
  const next = { ...input, runId: "run-next", directory: join(projectRoot, ".hepha/verification-runs/run-next") }; mkdirSync(next.directory);
  return { input, next, plan, linked };
}
it("reuses an unchanged validated plan with new report destinations and no old evidence", () => {
  const f = fixture(); saveVerificationPlanBaseline(f.input, f.plan);
  writeFileSync(join(f.input.directory, "report.json"), '{"passed":true}');
  const reused = reuseVerificationPlanBaseline(f.next)!;
  expect(reused.checks[0]!.command).toBe(`node test.js > ${f.next.directory}/report.json`);
  expect(reused.phases).toEqual(f.plan.phases);
  expect(() => readFileSync(join(f.next.directory, "report.json"))).toThrow();
});
it.each(["source", "linked source", "new test", "renamed test", "configuration", "requirements", "contract", "phases", "identity", "tampered", "malformed"])("invalidates a baseline after %s changes", kind => {
  const f = fixture(); saveVerificationPlanBaseline(f.input, f.plan);
  if (kind === "source") writeFileSync(join(f.input.root, "test.js"), "assert(false)");
  if (kind === "linked source") writeFileSync(join(f.linked, "test.js"), "assert(false)");
  if (kind === "new test") writeFileSync(join(f.linked, "new-test.js"), "assert(true)");
  if (kind === "renamed test") renameSync(join(f.linked, "test.js"), join(f.linked, "replacement.js"));
  if (kind === "configuration") writeFileSync(join(f.linked, "package.json"), '{"changed":true}');
  if (kind === "requirements") f.next.sourceFingerprint = "requirements-v2";
  if (kind === "contract") f.next.contractHash = "contract-v2";
  if (kind === "phases") f.next.phases = [23, 52];
  if (kind === "identity") f.next.featureId = "FEAT-DIFFERENT";
  const path = join(f.input.folder, "manual-test-verification/inspection-baseline.json");
  if (kind === "malformed") writeFileSync(path, "bad");
  if (kind === "tampered") {
    const saved = JSON.parse(readFileSync(path, "utf8")); saved.plan.checks[0].command = "node unrelated.js"; writeFileSync(path, JSON.stringify(saved));
  }
  expect(reuseVerificationPlanBaseline(f.next)).toBeNull();
});
it("does not store a plan whose configuration fails admission", () => {
  const f = fixture(); f.plan.checks[0]!.configurationFiles = ["missing.json"];
  expect(() => saveVerificationPlanBaseline(f.input, f.plan)).toThrow();
  expect(reuseVerificationPlanBaseline(f.next)).toBeNull();
});
