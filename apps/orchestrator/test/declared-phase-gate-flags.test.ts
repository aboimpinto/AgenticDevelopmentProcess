import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { isUnresolvedQualityGate } from "@hepha/shared";
import { scanFeaturePhaseQualityGates } from "../src/memorybank/phase-quality-projection.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function project(flags: unknown, extra = "", reason = "The documented scope determines these independent obligations.") {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-explicit-flags-")); roots.push(root);
  const documentPath = resolve(root, "delivery-alpha.md");
  writeFileSync(documentPath, `# Delivery Alpha\n## Phase Gate Declarations\n\`\`\`json\n${JSON.stringify(flags)}\n\`\`\`\n**Scope justification:** ${reason}\n## Quality Gate Evidence\n| Tests | missing | Old execution placeholder |\n| Code review | missing | Old review placeholder |\n${extra}`);
  return scanFeaturePhaseQualityGates([{ documentPath, number: null, title: "Delivery Alpha", status: "COMPLETED" } as never], [])[0]!;
}
it.each([[false, false], [false, true], [true, false], [true, true]])("uses independent booleans coverage=%s review=%s regardless of identity", (needTestCoverage, needCodeReview) => {
  const phase = project({ needTestCoverage, needCodeReview }, "### Test Verification\nRequired: run existing regression checks.\n");
  expect(phase.gates.find(g => g.gate === "tests")?.status).toBe(needTestCoverage ? "missing" : "not_applicable");
  expect(phase.gates.find(g => g.gate === "code_review")?.status).toBe(needCodeReview ? "missing" : "not_applicable");
});
it("does not let old N/A evidence disable an explicitly enabled gate", () => {
  const phase = project({ needTestCoverage: true, needCodeReview: true }, "## Phase Quality Gate Contract\n| Tests | not applicable | Earlier scope |\n| Code review | not applicable | Earlier scope |\n");
  expect(phase.gates.filter(g => ["tests", "code_review"].includes(g.gate)).every(isUnresolvedQualityGate)).toBe(true);
});
it("keeps failed regression execution even when no new coverage is required", () => {
  const phase = project({ needTestCoverage: false, needCodeReview: false }, "## Phase Checkpoint\n| Check | Command | Result |\n| --- | --- | --- |\n| Regression tests | runner test | FAIL — 2 passed, 1 failed |\n");
  expect(phase.gates.find(g => g.gate === "tests")).toMatchObject({ status: "missing", justification: expect.stringContaining("1 failed") });
});
it.each(["false", 0, null])("does not coerce non-boolean applicability %s into a waiver", value => {
  expect(project({ needTestCoverage: value, needCodeReview: false }).gates.find(g => g.gate === "tests")?.status).not.toBe("not_applicable");
});
it("requires context for explicit non-applicability", () => {
  expect(project({ needTestCoverage: false, needCodeReview: false }, "", "").gates.filter(g => ["tests", "code_review"].includes(g.gate)).every(isUnresolvedQualityGate)).toBe(true);
});
it("keeps unknown health results visible as warnings without blocking phase acceptance", () => {
  const phase = project({ needTestCoverage: false, needCodeReview: false }, "## Phase Checkpoint\n| Check | Command | Result |\n| --- | --- | --- |\n| Build | builder compile | Legacy summary unavailable |\n| Lint | analyzer check | Legacy summary unavailable |\n");
  expect(phase.gates.filter(g => ["build", "lint"].includes(g.gate)).map(g => g.status)).toEqual(["unknown", "unknown"]);
  expect(phase.warnings).toHaveLength(2);
  expect(phase.gates.filter(isUnresolvedQualityGate)).toEqual([]);
});
it.each(["build", "lint"] as const)("keeps an actual failed %s check advisory without calling it passed", gate => {
  expect(isUnresolvedQualityGate({ gate, status: "missing", justification: "Exit 1; diagnostic recorded." })).toBe(false);
});

it.each(["approved", "approved_with_notes", "needs_changes", "unknown"] as const)("evaluates a recognised %s report instead of a required-review placeholder", result => {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-required-review-")); roots.push(root);
  const documentPath = resolve(root, "delivery-zeta.md");
  writeFileSync(documentPath, '# Delivery Zeta\n## Phase Gate Declarations\n```json\n{"needTestCoverage":false,"needCodeReview":true}\n```\n**Scope justification:** Interface review without behavioral changes.\n### Code Review\nRequired: review the declared interface scope.\n');
  const phase = scanFeaturePhaseQualityGates([{ documentPath, number: 31, title: "Interface", status: "COMPLETED" } as never], [{ phaseNumber: 31, result, updatedAt: "2031-01-01", reportPath: "reviews/review.md", reportRelativePath: "reviews/review.md" } as never])[0]!;
  const gate = phase.gates.find(g => g.gate === "code_review")!;
  expect(gate.status).toBe(result === "approved" || result === "approved_with_notes" ? "satisfied" : "missing");
  expect(gate.evidencePaths).toContain("reviews/review.md");
  expect(gate.justification).not.toContain("needCodeReview: true. Record");
});
