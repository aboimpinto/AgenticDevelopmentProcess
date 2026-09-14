import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { compactCoverageContext, expandIdentities } from "../src/manual-test-verification/coverage-context-compaction.js";
import { proposeCoverageReconciliation } from "../src/manual-test-verification/coverage-reconciliation-prompt.js";
import { COVERAGE_PROMPT_LIMIT } from "../src/manual-test-verification/coverage-assessment-batches.js";
import type { ManualTestDeliveryModel } from "../src/manual-test-verification/delivery-model.js";

function fixture() {
  const identities = Array.from({ length: 1600 }, (_, i) => `${String(i % 40).padStart(2, "0")}: ${"shared fixture setup and verification ".repeat(8)} case ${Math.floor(i / 40)}`);
  return { manifestEntries: [{ sourceId: "AC-ROUNDTRIP", criterionPreview: "Automated save and reopen" }], coverageMap: [{ sourceId: "AC-ROUNDTRIP", coverageStatus: "uncovered" }], tests: [],
    automatedEvidence: [{ id: "REPORT", title: "Executed scenarios", status: "executed-passed", command: "test", sourcePath: "report.json", detail: "1600 tests passed; revision abcdef012345", executionIdentities: identities }] } as unknown as ManualTestDeliveryModel;
}

it("factors interleaved catalogues while retaining exact ordered membership, duplicates and Unicode", () => {
  const model = fixture(), identities = [...model.automatedEvidence[0]!.executionIdentities!, "", 'escaped \\" café 🐳', ""];
  const reports = [identities, [...identities].reverse().slice(0, 900)];
  const compact = compactCoverageContext({ ...model, automatedEvidence: reports.map((executionIdentities, i) => ({ ...model.automatedEvidence[0]!, id: `REPORT-${i}`, executionIdentities })) });
  expect("executionIdentityCatalog" in compact).toBe(true);
  if (!("executionIdentityCatalog" in compact)) throw new Error("Expected shared catalogue");
  const catalog = expandIdentities(compact.executionIdentityCatalog);
  expect(JSON.stringify(compact).length).toBeLessThan(40_000);
  compact.automatedEvidence.forEach((report, i) => {
    if (!("executionIdentityReferences" in report)) throw new Error("Expected report references");
    expect(report.executionIdentityReferences.map(index => catalog[index])).toEqual(reports[i]);
  });
});

it("losslessly shares diagnostic origins and reasons without altering manual outcomes or order", () => {
  const diagnostics = [...Array.from({ length: 100 }, (_, i) => `receipt-${i}.json check ${i}: Required execution provenance remains unavailable; do not infer missing implementation.`), "No separator 🐳", "Repeated: a: b", "Repeated: a: b"];
  const model = { ...fixture(), recoveryContext: { currentPackId: "current", manualResults: [{ testId: "HUMAN", result: "pass" }], executionDiagnostics: diagnostics } };
  const before = JSON.stringify(model), compact = compactCoverageContext(model);
  if (!("recoveryContext" in compact) || !("executionDiagnosticCatalog" in compact.recoveryContext)) throw new Error("Expected compact diagnostics");
  const encoded = compact.recoveryContext.executionDiagnosticCatalog;
  const origins = expandIdentities(encoded.origins), reasons = expandIdentities(encoded.reasons);
  expect(encoded.entries.map(([a, b]) => origins[a!]! + reasons[b!]!)).toEqual(diagnostics);
  expect(JSON.stringify(encoded).length).toBeLessThan(JSON.stringify(diagnostics).length / 2);
  expect(compact.recoveryContext.manualResults).toEqual(model.recoveryContext.manualResults);
  expect(JSON.stringify(model)).toBe(before);
});

it("compacts before extraction, fits complete evidence and source context including correction, then reuses validated checkpoints", async () => {
  const model = fixture();
  const source = Array.from({ length: 400 }, (_, i) => createHash("sha256").update(`source-${i}`).digest("hex")).join("\n");
  const directory = mkdtempSync(join(tmpdir(), "coverage-budget-"));
  const checkpoint = { directory, fingerprint: "synthetic-current-authority" };
  let inspected = 0, finalCalls = 0;
  const run = async (prompt: string) => {
    expect(prompt.length).toBeLessThanOrEqual(COVERAGE_PROMPT_LIMIT);
    const line = prompt.split("\n").find(line => line.startsWith("Extraction page "));
    if (line) {
      const page = JSON.parse(line.slice(line.indexOf(": ") + 2));
      inspected += page.identities.length;
      return JSON.stringify({ inspectedCount: page.identities.length, matches: [{ sourceId: "AC-ROUNDTRIP", evidenceId: page.evidenceId, identityIndexes: page.identities.map((x: { index: number }) => x.index) }] });
    }
    finalCalls++;
    expect(prompt).toContain(JSON.stringify(source));
    const evidence = JSON.parse(prompt.split("\n").find(line => line.startsWith("Evidence: "))!.slice(10));
    const catalog = expandIdentities(evidence.executionIdentityCatalog);
    expect(evidence.automatedEvidence[0].executionIdentityReferences.map((i: number) => catalog[i])).toEqual(model.automatedEvidence[0]!.executionIdentities);
    if (finalCalls === 1) return JSON.stringify({ links: [], unresolved: [{ sourceId: "AC-ROUNDTRIP", reason: "Shape error", execution: { command: "test", testPaths: null } }] });
    expect(prompt).toContain("Response schema correction (attempt 1)");
    return JSON.stringify({ links: [{ sourceId: "AC-ROUNDTRIP", kind: "automated", evidenceId: "REPORT", explanation: "Complete selected execution and source qualifications are supplied." }], unresolved: [] });
  };
  try {
    const result = await proposeCoverageReconciliation(model, run, source, checkpoint);
    expect(result.proposal.links).toHaveLength(1);
    expect(inspected).toBe(0); expect(finalCalls).toBe(2);
    const resumed = await proposeCoverageReconciliation(model, async () => { throw new Error("Validated stages must be reused"); }, source, { ...checkpoint });
    expect(resumed.proposal.links).toEqual(result.proposal.links);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
