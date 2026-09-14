import { afterEach, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFreshVerificationPlan } from "../src/manual-test-verification/fresh-verification-evidence.js";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "mixed-plan-")); roots.push(root);
  writeFileSync(join(root, "package.json"), '{}'); writeFileSync(join(root, "a.test.ts"), 'test');
  const check = { id: "unit", kind: "test", suiteKey: "unit-profile", cwd: root, command: "npm test", configurationFiles: ["package.json"], testPaths: ["*.test.ts"], reason: "Current feature assertions" };
  return { root, check, parse: (checks: unknown[]) => parseFreshVerificationPlan(JSON.stringify({ checks, phases: [{ phaseNumber: 2, checkIds: checks.map((c: any) => c.id) }] }), [2]) };
}
it("accepts separately typed lint, build and discovery without treating them as tests", () => {
  const f = fixture();
  const plan = f.parse([f.check, ...["static", "preparation", "discovery"].map(kind => ({ ...f.check, id: kind, kind, command: kind === "discovery" ? "runner --list" : `npm run ${kind}`, testPaths: [] }))]);
  expect(plan.checks).toHaveLength(4);
});
it("does not infer duplicate executions from overlapping source selections", () => {
  const f = fixture(); expect(f.parse([f.check, { ...f.check, id: "focused", command: "npm test -- a.test.ts", testPaths: ["a.test.ts"] }]).checks).toHaveLength(2);
});
it("reports all invalid checks for one bounded correction, rather than failing one field at a time", () => {
  const f = fixture(); expect(() => f.parse([{ ...f.check, id: "lint", testPaths: [] }, { ...f.check, id: "catalogue", command: "runner --list" }])).toThrow(/lint[\s\S]*catalogue/);
});
it("identifies invalid configuration as the cause of dependent references without inventing phase defects", () => {
  const f = fixture();
  try { f.parse([{ ...f.check, configurationFiles: ["nested/missing.json"] }]); throw new Error("Expected rejection"); }
  catch (error) {
    expect((error as Error).message).toContain("unit");
    expect((error as Error).message).toContain("configurationFiles");
    expect((error as Error).message).toContain("relative to cwd");
    expect((error as Error).message).not.toContain("phase 2");
    expect((error as Error).message).not.toContain("omitted a phase");
  }
});
it("never accepts non-test commands as automated phase gates", () => {
  const f = fixture(); expect(() => f.parse([{ ...f.check, kind: "static", gates: ["tests"], testPaths: [] }])).toThrow(/only actual tests/);
});
it("preserves distinct configured execution profiles for the same test source", () => {
  const f = fixture(); expect(f.parse([f.check, { ...f.check, id: "browser", suiteKey: "browser-profile", command: "npm run browser" }]).checks).toHaveLength(2);
});
it("rejects a stale test location instead of accepting an empty selection", () => {
  const f = fixture();
  expect(() => f.parse([{ ...f.check, testPaths: ["renamed-away.test.ts"] }])).toThrow(/testPaths.*no.*match/i);
});
