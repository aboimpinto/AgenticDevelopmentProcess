import { expect, it } from "vitest";
import { projectFreshPhaseEvidence } from "../src/application/features/fresh-phase-evidence.js";
it("a fresh report supersedes only its mapped automated gate, never code review or another layer", () => {
  const feature = { implementationEvidence: { phaseQualityGates: [{ phaseNumber: 9, gates: ["tests", "gherkin_e2e", "code_review"].map(gate => ({ gate, status: "missing", evidencePaths: [] })) }] } } as any;
  const fresh = { error: undefined, state: { runId: "fresh", plan: { phases: [{ phaseNumber: 9, checkIds: ["unit"] }], checks: [{ id: "unit", gates: ["tests"] }] } }, evidence: [{ title: "unit", sourcePath: "fresh-report.json" }] } as any;
  const next = projectFreshPhaseEvidence(feature, fresh);
  expect(next.implementationEvidence!.phaseQualityGates[0]!.gates.map(g => g.status)).toEqual(["satisfied", "missing", "missing"]);
  expect(feature.implementationEvidence.phaseQualityGates[0].gates[0].status).toBe("missing");
  expect(projectFreshPhaseEvidence(feature, { ...fresh, error: "source changed" })).toBe(feature);
});

it("does not enable a disabled coverage gate when an existing regression suite passes", () => {
  const gate = { gate: "tests", status: "not_applicable", justification: "needTestCoverage: false. No new behavior.", evidencePaths: ["delivery.md"] };
  const feature = { implementationEvidence: { phaseQualityGates: [{ phaseNumber: 23, gates: [gate] }] } } as any;
  const fresh = { state: { runId: "current", plan: { phases: [{ phaseNumber: 23, checkIds: ["baseline"] }], checks: [{ id: "baseline", gates: ["tests"] }] } }, evidence: [{ title: "baseline", sourcePath: "baseline.json" }] } as any;
  expect(projectFreshPhaseEvidence(feature, fresh).implementationEvidence!.phaseQualityGates[0]!.gates[0]).toEqual(gate);
});
