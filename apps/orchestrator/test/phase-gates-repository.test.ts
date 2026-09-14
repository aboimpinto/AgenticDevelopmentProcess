import { afterEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { phaseGatesProtocol, type PhaseGateRecord } from "../src/exchanges/phase-gates.js";
import { readPhaseGates, retainPhaseGateBaseline, phaseGateProof } from "../src/exchanges/phase-gates-repository.js";
import { phaseGateProgressKey } from "../src/workflows/recipes/compatibility-phase-gate-repair.js";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "phase-gate-proof-")); roots.push(root);
  const documentPath = resolve(root, "Phases", "arbitrary-alpha.md"); mkdirSync(resolve(root,"Phases")); writeFileSync(documentPath, "# Work\n");
  const record: PhaseGateRecord = { phaseId: "arbitrary-alpha.md", flags: { needCodeReview: false, needTestCoverage: false }, criteria: [], checks: [],
    review: { outcome: "not_applicable", reason: "Document-only scope." }, coverage: { outcome: "not_applicable", reason: "Document-only scope.", criteria: [] } };
  const save = () => writeFileSync(`${documentPath}.gates.json`, phaseGatesProtocol.encode(record));
  const gates = () => readPhaseGates({ documentPath }, root)!;
  return { root, documentPath, record, save, gates };
}
it("retains the original gate declaration across new repository reads", () => {
  const f = fixture();
  f.record.flags.needCodeReview = true;
  f.record.review = { outcome: "changes_required", reportPath: "review.md" };
  writeFileSync(resolve(f.root,"review.md"), "**Status**: NEEDS_CHANGES\n"); f.save();
  retainPhaseGateBaseline(f.documentPath);
  f.record.flags.needCodeReview = false;
  f.record.review = { outcome: "not_applicable", reason: "Make completion green" }; f.save();
  expect(f.gates().some(g => g.justification?.includes("justification"))).toBe(true);
  // Another read, as on restart, cannot adopt the modified flags as a new baseline.
  retainPhaseGateBaseline(f.documentPath);
  expect(f.gates().some(g => g.status === "missing")).toBe(true);
});
it("real test failure remains unresolved until repaired execution succeeds", () => {
  const f = fixture();
  const testPath = resolve(f.root, "sequence.test.cjs");
  const command = `${process.execPath} --test ${testPath}`;
  f.record.flags.needTestCoverage = true;
  f.record.criteria = [{ id: "sequence", description: "Preserve order" }];
  f.record.coverage = { outcome: "sufficient", criteria: [{ criterionId: "sequence", checkIds: ["test"], testPaths: [testPath], assertions: "Exact sequence matches" }] };
  for (const broken of [true, false]) {
    writeFileSync(testPath, `const {test}=require('node:test');const assert=require('node:assert/strict');test('sequence',()=>assert.deepEqual([1,2],[${broken ? '2,1' : '1,2'}]));`);
    const execution = spawnSync(process.execPath, ["--test",testPath], { encoding:"utf8" });
    expect(execution.status).toBe(broken ? 1 : 0);
    const evidencePath = resolve(f.root,"execution.jsonl");
    writeFileSync(evidencePath, [
      { type:"tool_execution_start",toolCallId:"tool",toolName:"bash",args:{ command } },
      { type:"tool_execution_end",toolCallId:"tool",toolName:"bash",isError:execution.status !== 0,result:{content:[{type:"text",text:execution.stdout+execution.stderr}]} },
    ].map(v=>JSON.stringify(v)).join("\n"));
    f.record.checks = [{id:"test",gate:"tests",required:true,command,cwd:f.root,outcome:"passed",evidence:[{path:evidencePath,toolCallId:"tool"}]}];
    // Receipt command formatting is not a second execution-plan gate.
    f.record.checks[0]!.command = "node --test ./sequence.test.cjs";
    f.save();
    expect(f.gates().find(g=>g.gate==="tests")?.status).toBe(broken ? "missing" : "satisfied");
    writeFileSync(resolve(f.root, "native.log"), execution.stdout + execution.stderr);
    f.record.checks[0]!.evidence = [{ path: resolve(f.root,"native.log") }];
    f.save();
    expect(f.gates().find(g=>g.gate==="tests")?.status).toBe(broken ? "missing" : "satisfied");
  }
});
it("audit and report rewrites do not count as repair progress", () => {
  const f = fixture(); f.save();
  const feature = { implementationEvidence: { changedFiles: [] } } as never;
  const before = phaseGateProgressKey(feature, f.documentPath, f.root);
  writeFileSync(`${f.documentPath}.gates.json`, phaseGatesProtocol.encode(f.record,{runId:"different-run"}));
  f.record.review.reason = "Another prose description"; f.save();
  expect(phaseGateProgressKey(feature, f.documentPath, f.root)).toBe(before);
});
it("invalid JSON and a foreign phase identity cannot fall back to Markdown green", () => {
  const f = fixture();
  writeFileSync(f.documentPath, "## Quality Gate Evidence\n| Tests | satisfied | Everything passed |\n");
  writeFileSync(`${f.documentPath}.gates.json`, "broken");
  expect(f.gates()[0]?.status).toBe("missing");
  f.record.phaseId = "different.md";f.save();
  expect(f.gates()[0]?.justification).toContain("another phase");
});

it("a successful output wrapper cannot hide a failing build exit", () => {
  const f = fixture();
  const evidence = resolve(f.root, "build.jsonl");
  writeFileSync(evidence, [
    { type: "tool_execution_start", toolCallId: "build", toolName: "bash", args: { command: "compiler build | tail; echo EXIT=9" } },
    { type: "tool_execution_end", toolCallId: "build", toolName: "bash", isError: false, result: { content: [{ type: "text", text: "build failed\nEXIT=9\n" }] } },
  ].map(v => JSON.stringify(v)).join("\n"));
  f.record.checks = [{ id: "build", gate: "build", required: true, command: "compiler build", cwd: f.root, outcome: "passed", evidence: [{ path: evidence, toolCallId: "build" }] }];
  f.save();
  expect(f.gates().find(g => g.gate === "build")?.status).toBe("missing");
});

it("resolves test and report paths from the configured working checkout", () => {
  const f = fixture();
  const checkout = resolve(f.root, "worktrees", "delivery");
  mkdirSync(resolve(checkout, "tests"), { recursive: true });
  writeFileSync(resolve(checkout, "tests", "ordering.test.ts"), "assert.deepEqual(actual, expected);");
  const proof = phaseGateProof(f.documentPath, f.root, [checkout]);
  expect(proof.source("tests/ordering.test.ts")).toBe(true);
  expect(proof.source("tests/missing.test.ts")).toBe(false);
});

it.each(["No numeric production coverage threshold is configured.", "Instrumentation is unavailable.", "The old percentage measurement was N/A."])(
  "does not silently disable an existing acceptance assessment because %s", reason => {
    const f = fixture();
    const testPath = resolve(f.root, "preservation.test.cjs");
    writeFileSync(testPath, "const {test}=require('node:test');const assert=require('node:assert/strict');test('preserves values',()=>assert.deepEqual([1,2].map(x=>x*2),[2,4]));");
    const executed = spawnSync(process.execPath, ["--test", testPath], { encoding: "utf8" });
    expect(executed.status).toBe(0);
    const reportPath = resolve(f.root, "native-tests.log");
    writeFileSync(reportPath, executed.stdout + executed.stderr);
    f.record.criteria = [{ id: "preservation", description: "Preserve ordered values." }];
    f.record.checks = [{ id: "behavior", gate: "tests", required: true, command: "node --test preservation.test.cjs", cwd: f.root,
      outcome: "passed", evidence: [{ path: reportPath }] }];
    f.record.coverage = { outcome: "not_applicable", reason,
      criteria: [{ criterionId: "preservation", checkIds: ["behavior"], testPaths: [testPath], assertions: "Exact ordered output equals the expected doubled values." }] };
    f.save();
    // Actual tests are green. The defect is an internally contradictory scope
    // decision that bypasses the provided acceptance assessment.
    expect(f.gates().find(g => g.gate === "tests")?.status).toBe("missing");
    expect(f.gates().find(g => g.gate === "tests")?.justification).toContain("acceptance");
    // Correcting scope, without inventing a percentage or rerunning valid tests,
    // admits the same real execution and meaningful assertions.
    f.record.flags.needTestCoverage = true;
    f.record.coverage.outcome = "sufficient";
    delete f.record.coverage.reason;
    f.save();
    expect(f.gates().find(g => g.gate === "tests")?.status).toBe("satisfied");
  },
);
