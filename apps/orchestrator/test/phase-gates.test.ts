import { describe, expect, it } from "vitest";
import { evaluatePhaseGates, phaseGatesProtocol, validatePhaseGateRevision, type PhaseGateRecord } from "../src/exchanges/phase-gates.js";
import { testExecutionProblem } from "../src/exchanges/phase-gates-repository.js";
const proof = { check: () => null, review: () => null, source: () => true };
function record(review: boolean, coverage: boolean): PhaseGateRecord {
  return { phaseId: "opaque-delta", flags: { needCodeReview: review, needTestCoverage: coverage },
    criteria: [{ id: "ordering", description: "Preserve request order" }],
    checks: coverage ? [{ id: "behavior", gate: "tests", required: true, command: "runner test", cwd: ".", outcome: "passed", evidence: [{ path: "run.log" }] }] : [],
    coverage: coverage ? { outcome: "sufficient", criteria: [{ criterionId: "ordering", checkIds: ["behavior"], testPaths: ["ordering.test.ts"], assertions: "Two queued requests return in original order." }] }
      : { outcome: "not_applicable", reason: "No behavior changed in the implemented scope.", criteria: [] },
    review: review ? { outcome: "approved", reportPath: "review.md" } : { outcome: "not_applicable", reason: "No code review scope." } };
}
describe("independent phase gate contract", () => {
  it.each([[false,false], [false,true], [true,false], [true,true]])("supports review=%s coverage=%s for arbitrary identities", (review, coverage) => {
    for (const phaseId of ["alpha", "phase-38.md", "delta", "checkpoint", "DTO", "planning"]) {
      const value = { ...record(review, coverage), phaseId };
      const decoded = phaseGatesProtocol.decode(phaseGatesProtocol.encode(value));
      expect(decoded.valid).toBe(true);
      const gates = evaluatePhaseGates(value, proof);
      expect(gates.find(g => g.gate === "code_review")?.status).toBe(review ? "satisfied" : "not_applicable");
      expect(gates.find(g => g.gate === "tests")?.status).toBe(coverage ? "satisfied" : "not_applicable");
    }
  });
  it.each(["build", "lint", "tests", "gherkin_e2e"] as const)("disabled coverage does not waive configured %s", gate => {
    const value = record(false, false);
    value.checks.push({ id: "health", gate, required: true, command: "verify", cwd: ".", outcome: "failed", evidence: [] });
    expect(evaluatePhaseGates(value, proof).find(g => g.gate === gate)?.status).toBe("missing");
    value.checks[0]!.outcome = "passed";
    expect(evaluatePhaseGates(value, proof).find(g => g.gate === gate)?.status).toBe("satisfied");
  });
  it("green execution alone does not prove missing behavior coverage", () => {
    const value = record(false, true);
    value.criteria.push({ id: "recovery", description: "Retry preserves request order." });
    expect(evaluatePhaseGates(value, proof).find(g => g.gate === "tests")?.justification).toContain("recovery");
  });
  it("rejects invented pass, missing assertion source and rejected review", () => {
    const value = record(true, true);
    const gates = evaluatePhaseGates(value, { check: () => "No observed execution", source: () => false, review: () => "Changes requested" });
    expect(gates.filter(g => g.status === "missing").map(g => g.gate)).toEqual(["tests", "code_review"]);
  });
  it("permits justified flag revision, independently of JSON key order", () => {
    const before = record(true, true), after = record(false, false);
    after.revisions = [{ before: { needTestCoverage: true, needCodeReview: true }, after: after.flags, reason: "Only API declarations were required", implementedScope: "Declarations without runtime behavior", evidencePaths: ["contract.ts"] }];
    expect(validatePhaseGateRevision(before, after, proof.source)).toBeNull();
    before.checks.push({ id: "health", gate: "lint", required: true, command: "lint", cwd: ".", outcome: "failed", evidence: [] });
    expect(validatePhaseGateRevision(before, after, proof.source)).toBeNull();
    before.checks[0]!.outcome = "failed";
    expect(validatePhaseGateRevision(before, after, proof.source)).toContain("Resolve");
    after.revisions = [];
    expect(validatePhaseGateRevision(before, after, proof.source)).toContain("justification");
  });
  it("audit IDs and timestamps never decide acceptance", () => {
    const decoded = phaseGatesProtocol.decode(JSON.stringify({ schemaVersion: "hepha-exchange/v1", kind: "phase.gates", payload: record(false, false), audit: { runId: null, testExecutionTimestamp: "broken" } }));
    expect(decoded.valid).toBe(true);
  });
  it.each([
    ["test result: ok. 4 passed; 0 failed; 0 ignored;", null],
    ["test result: FAILED. 4 passed; 1 failed;", "failing"],
    ["test result: ok. 0 passed; 0 failed;", "no tests"],
    ["# pass 2\n# fail 0", null],
    [" Tests  2 passed (2)", null],
    ["Tests: 1 failed, 2 passed, 3 total", "failing"],
    ["================ 3 passed in 1.2s ================", null],
    ["  4 passed (2s)", null],
    ["Ran 3 tests in 1.000s\n\nOK", null],
    ["PASS — 20/20 portable matrix", "native runner"],
  ])("reads native result %s without using report prose", (output, problem) => {
    if (problem) expect(testExecutionProblem(output!)).toContain(problem);
    else expect(testExecutionProblem(output!)).toBeNull();
  });
});

it("does not allow a required command or criterion to disappear without scope evidence", () => {
  const before = record(false, true), after = record(false, true);
  after.checks = [];
  expect(validatePhaseGateRevision(before, after, proof.source)).toContain("justification");
  after.checks = before.checks;
  after.criteria = [];
  expect(validatePhaseGateRevision(before, after, proof.source)).toContain("justification");
});

it.each(["alpha", "phase-1.md", "phase-47.md", "Final checkpoint"])("accepts supporting health checks alongside behavioral coverage for %s", phaseId => {
  const value = record(false, true); value.phaseId = phaseId;
  value.checks.push({ id: "style", gate: "lint", required: true, command: "analyzer check", cwd: ".", outcome: "passed", evidence: [{path: "lint.log"}] });
  value.coverage.criteria[0]!.checkIds.push("style");
  expect(evaluatePhaseGates(value, proof).every(g => g.status !== "missing")).toBe(true);
  value.checks[1]!.outcome = "failed";
  expect(evaluatePhaseGates(value, proof).find(g => g.gate === "lint")?.status).toBe("missing");
  expect(evaluatePhaseGates(value, proof).find(g => g.gate === "tests")?.status).toBe("satisfied");
  value.checks[1]!.outcome = "passed";
  value.coverage.criteria[0]!.checkIds = ["style"];
  expect(evaluatePhaseGates(value, proof).find(g => g.gate === "tests")?.status).toBe("missing");
  value.coverage.criteria[0]!.checkIds = ["behavior", "unknown"];
  expect(evaluatePhaseGates(value, proof).find(g => g.gate === "tests")?.status).toBe("missing");
});
