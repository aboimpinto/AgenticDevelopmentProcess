import { expect, it, vi } from "vitest";
import { validateCoverageLinks } from "../src/manual-test-verification/acceptance-coverage-reconciliation.js";
import { proposeCoverageReconciliation } from "../src/manual-test-verification/coverage-reconciliation-prompt.js";
import type { ManualTestDeliveryModel } from "../src/manual-test-verification/delivery-model.js";
const model = { manifestEntries: [{ sourceId: "AC-SAVE" }], tests: [{ id: "MANUAL-SAVE", steps: ["Open application", "Select Save"] }], automatedEvidence: [] } as unknown as ManualTestDeliveryModel;
const link = { sourceId: "AC-SAVE", evidenceId: "MANUAL-SAVE", kind: "manual", explanation: "Save is exercised by the second step", stepNumbers: [2] };
it("retains complementary evidence for an unresolved boundary without offering partial proof for approval", async () => {
  const result = await proposeCoverageReconciliation(model, async () => JSON.stringify({ links: [link], unresolved: [{ sourceId: link.sourceId, reason: "Persistence boundary is not exercised" }] }));
  expect(result.proposal.links).toEqual([]);
  expect(result.partialLinks).toEqual([link]);
  expect(result.unresolved).toHaveLength(1);
});
it("rejects uncited or invented diagnosis categories instead of inferring implementation authority", async () => {
  for (const diagnosis of [{ kind: "implementation_missing", explanation: "missing", nextAction: "repair", references: [] }, { kind: "approved", explanation: "done", nextAction: "complete", references: ["phase.md"] }]) {
    await expect(proposeCoverageReconciliation(model, async () => JSON.stringify({ links: [], unresolved: [{ sourceId: link.sourceId, reason: "Unresolved", diagnosis }] }))).rejects.toThrow("diagnosis");
  }
});
it("assesses several passing reports collectively without requiring every test to prove the entire criterion", async () => {
  const evidence = ["calculation", "persistence", "interaction"].map(id => ({ id, status: "executed-passed", command: "project verification", sourcePath: `${id}.json`, detail: "1 test passed; revision: abcdef012345" }));
  const links = evidence.map(item => ({ sourceId: link.sourceId, kind: "automated", evidenceId: item.id, explanation: `Proves ${item.id}; the other reports prove the remaining aspects.` }));
  const result = await proposeCoverageReconciliation({ ...model, automatedEvidence: evidence } as never, async prompt => {
    expect(prompt).toContain("Assess complementary evidence collectively");
    expect(prompt).toContain("required integration boundary");
    return JSON.stringify({ links, unresolved: [] });
  });
  expect(result.proposal.links).toEqual(links);
});
it("accepts only exact known criterion, case and step identities", () => {
  expect(validateCoverageLinks([link], model)).toEqual([link]);
  expect(() => validateCoverageLinks([{ ...link, stepNumbers: [3] }], model)).toThrow();
  expect(() => validateCoverageLinks([{ ...link, sourceId: "UNKNOWN" }], model)).toThrow();
  expect(() => validateCoverageLinks([{ ...link, evidenceId: "UNKNOWN" }], model)).toThrow();
});
it("ignores known but unrequested criteria instead of adding unrelated manual obligations to recovery", async () => {
  const source = { ...model, coverageMap: [{ sourceId: "AC-SAVE" }], manifestEntries: [...model.manifestEntries, { sourceId: "MT-OTHER" }] } as ManualTestDeliveryModel;
  const result = await proposeCoverageReconciliation(source, async () => JSON.stringify({ links: [link], unresolved: [{ sourceId: "MT-OTHER", reason: "Not part of this coverage request" }] }));
  expect(result.proposal.links).toEqual([link]);
  expect(result.unresolved).toEqual([]);
});
it("does not treat zero-selection, unexecuted or uncited automation as coverage", () => {
  for (const status of ["zero-tests-discovered", "not-executed", "executed-failed"]) {
    expect(() => validateCoverageLinks([{ ...link, kind: "automated", evidenceId: "AUTO" }], { ...model, automatedEvidence: [{ id: "AUTO", status }] } as never)).toThrow();
  }
});
it("rejects manual-only links for explicit automation requirements", () => {
  for (const criterionPreview of ["Real-root Playwright must cover success", "Matching TwinTests must run", "Measure test coverage"]) {
    expect(() => validateCoverageLinks([link], { ...model, manifestEntries: [{ sourceId: link.sourceId, criterionPreview }] } as never)).toThrow("automated verification");
  }
});
it("requires a tested revision in addition to a passing automation report", () => {
  const evidence = { id: "AUTO", status: "executed-passed", command: "test", sourcePath: "results/report.json", detail: "5 tests passed; revision: abcdef012345" };
  const automatedLink = { ...link, kind: "automated", evidenceId: "AUTO" };
  expect(validateCoverageLinks([automatedLink], { ...model, automatedEvidence: [evidence] } as never)).toHaveLength(1);
  expect(() => validateCoverageLinks([automatedLink], { ...model, automatedEvidence: [{ ...evidence, detail: "5 tests passed" }] } as never)).toThrow("tested revision");
});
it("validates imported execution provenance without searching unrelated descriptive commits", () => {
  const evidence = { id: "AUTO", status: "executed-passed", command: "dotnet test", sourcePath: "results.trx", executionIdentities: ["Example.Save"],
    detail: "Historical working tree execution; unrelated client commit deadbee", verifiedExecution: {
      schema: "verified-execution/v1", testedRevision: "abcdef012345", sourceState: "working tree @ abcdef012345 + uncommitted changes", executedCount: 1, reportHashes: ["a".repeat(64)],
    } };
  const value = [{ ...link, kind: "automated", evidenceId: "AUTO" }];
  expect(validateCoverageLinks(value, { ...model, automatedEvidence: [evidence] } as never)).toHaveLength(1);
  for (const change of [{ testedRevision: "" }, { executedCount: 0 }, { reportHashes: [] }]) {
    expect(() => validateCoverageLinks(value, { ...model, automatedEvidence: [{ ...evidence, detail: "5 tests passed; commit deadbee", verifiedExecution: { ...evidence.verifiedExecution, ...change } }] } as never)).toThrow();
  }
});

it("retains valid proposals when a different criterion's manual-only automation link is rejected", async () => {
  const source = { ...model, manifestEntries: [...model.manifestEntries, { sourceId: "AC-BROWSER", criterionPreview: "Real-root Playwright journeys must execute" }] } as ManualTestDeliveryModel;
  const result = await proposeCoverageReconciliation(source, async () => JSON.stringify({ links: [link, { ...link, sourceId: "AC-BROWSER" }], unresolved: [] }));
  expect(result.proposal.links).toEqual([link]);
  expect(result.unresolved).toEqual([{ sourceId: "AC-BROWSER", reason: expect.stringContaining("automated verification") }]);
});

it("keeps a criterion unresolved if any of its mappings is invalid or explicitly contradictory", async () => {
  for (const response of [
    { links: [link, { ...link, stepNumbers: [999] }], unresolved: [] },
    { links: [link], unresolved: [{ sourceId: link.sourceId, reason: "Expected outcome is only partially covered" }] },
  ]) {
    const result = await proposeCoverageReconciliation(model, async () => JSON.stringify(response));
    expect(result.proposal.links).toHaveLength(0);
    expect(result.unresolved).toHaveLength(1);
  }
});

it("rejects malformed or unknown-criterion responses without manufacturing coverage", async () => {
  for (const response of [{ links: {}, unresolved: [] }, { links: [{ ...link, sourceId: "UNKNOWN" }], unresolved: [] }]) {
    await expect(proposeCoverageReconciliation(model, async () => JSON.stringify(response))).rejects.toThrow();
  }
});

it("rejects malformed execution plans instead of turning model prose into a runnable action", async () => {
  for (const execution of [null, { command: "", testPaths: ["test.ts"] }, { command: "test", testPaths: [] }, { command: "test", testPaths: ["test.ts"], prerequisite: 42 }]) {
    await expect(proposeCoverageReconciliation(model, async () => JSON.stringify({ links: [], unresolved: [{ sourceId: "AC-SAVE", reason: "Execution missing", execution }] }))).rejects.toThrow("execution requirement");
  }
});

it("preserves bounded execution prerequisites without treating them as a coverage link", async () => {
  const execution = { command: "playwright test existing.spec.ts", testPaths: ["existing.spec.ts"], prerequisite: "Configure the controlled test fixture using the project setup guide." };
  const result = await proposeCoverageReconciliation(model, async prompt => {
    expect(prompt).toContain("Discovery (--list) is not a run");
    return JSON.stringify({ links: [], unresolved: [{ sourceId: "AC-SAVE", reason: "No executed browser report", execution }] });
  });
  expect(result.proposal.links).toEqual([]);
  expect(result.unresolved).toEqual([{ sourceId: "AC-SAVE", reason: "No executed browser report", execution }]);
});

it("corrects one malformed execution envelope using the same evidence without manufacturing test results", async () => {
  const run = vi.fn().mockResolvedValueOnce(JSON.stringify({ links: [], unresolved: [{ sourceId: "AC-SAVE", reason: "Missing execution", execution: { command: "test", testPaths: null } }] }))
    .mockResolvedValueOnce(JSON.stringify({ links: [link], unresolved: [] }));
  const result = await proposeCoverageReconciliation(model, run);
  expect(run).toHaveBeenCalledTimes(2);
  expect(run.mock.calls[1]![0]).toContain("unresolved[0].execution.testPaths");
  expect(run.mock.calls[1]![0]).toContain("Same evidence");
  expect(result.proposal.links).toEqual([link]);
});

it("bounds invalid-response correction and reports the field instead of echoing untrusted values", async () => {
  const run = vi.fn(async () => JSON.stringify({ links: [], unresolved: [{ sourceId: "AC-SAVE", reason: "Missing execution", execution: { command: "secret-command-token", testPaths: "secret-path-token" } }] }));
  await expect(proposeCoverageReconciliation(model, run)).rejects.toThrow("unresolved[0].execution.testPaths");
  expect(run).toHaveBeenCalledTimes(3);
  expect(run.mock.calls[1]![0]).not.toContain("secret-path-token");
  expect(run.mock.calls[1]![0]).not.toContain("secret-command-token");
});

it.each([
  ["not JSON", "$"],
  ["null", "$"],
  [JSON.stringify({ links: [{ ...link, sourceId: "UNKNOWN-PRIVATE-ID" }], unresolved: [] }), "links[0].sourceId"],
])("corrects malformed envelopes and unknown references generically: %s", async (response, field) => {
  const run = vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce(JSON.stringify({ links: [link], unresolved: [] }));
  expect((await proposeCoverageReconciliation(model, run)).proposal.links).toEqual([link]);
  expect(run).toHaveBeenCalledTimes(2);
  expect(run.mock.calls[1]![0]).toContain(field);
  expect(run.mock.calls[1]![0]).not.toContain("UNKNOWN-PRIVATE-ID");
});
