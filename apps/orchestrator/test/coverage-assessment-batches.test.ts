import { expect, it } from "vitest";
import { COVERAGE_PROMPT_LIMIT, coveragePromptSize, executionAssessmentPages } from "../src/manual-test-verification/coverage-assessment-batches.js";
import { proposeCoverageReconciliation } from "../src/manual-test-verification/coverage-reconciliation-prompt.js";
import type { ManualTestDeliveryModel } from "../src/manual-test-verification/delivery-model.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { compactIdentities, compactCoverageContext, compactSourceDocuments, expandIdentities } from "../src/manual-test-verification/coverage-context-compaction.js";

it("shares duplicate identity text without transferring report membership or losing source occurrences", () => {
  const model = largeModel();
  const identities = Array.from({ length: 100 }, (_, index) => `${index}: ${createHash("sha256").update(String(index)).digest("hex")}`);
  const compact = compactCoverageContext({ ...model, automatedEvidence: [
    { ...model.automatedEvidence[0]!, executionIdentities: identities },
    { ...model.automatedEvidence[0]!, id: "OTHER", executionIdentities: identities.slice(20, 70) },
  ] });
  expect("executionIdentityCatalog" in compact).toBe(true);
  if (!("executionIdentityCatalog" in compact)) throw new Error("Expected shared catalog");
  const catalog = expandIdentities(compact.executionIdentityCatalog);
  for (const [index, expected] of [identities, identities.slice(20, 70)].entries()) {
    const entry = compact.automatedEvidence[index]!;
    if (!("executionIdentityReferences" in entry)) throw new Error("Expected report references");
    expect(entry.executionIdentityReferences.map(reference => catalog[reference])).toEqual(expected);
  }
  const sources = ["# Source A", "Shared requirement and qualification.\n".repeat(200), "# Source B", "Shared requirement and qualification.\n".repeat(200)].join("\n");
  const source = compactSourceDocuments(sources);
  expect(typeof source).toBe("object");
  expect(typeof source === "string" ? source : source.order.map(index => source.lines[index]).join("\n")).toBe(sources);
});

it("losslessly factors ordered identities including empty, duplicate, escaped and Unicode strings", () => {
  const identities = ["", "", 'suite/\"quoted\\path\": café 🐳 first', 'suite/\"quoted\\path\": café 🐳 second', ...largeModel().automatedEvidence[0]!.executionIdentities!];
  const compact = compactIdentities(identities);
  expect(expandIdentities(compact)).toEqual(identities);
  expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(identities).length / 3);
});

it("assesses complete selected identities with large source context without raising the prompt bound", async () => {
  const model = largeModel();
  const sources = "Full source context and qualifications.\n".repeat(2700);
  let finalCalls = 0;
  const result = await proposeCoverageReconciliation(model, async prompt => {
    expect(prompt.length).toBeLessThanOrEqual(COVERAGE_PROMPT_LIMIT);
    const page = extractionPage(prompt);
    if (page) return JSON.stringify({ inspectedCount: page.identities.length, matches: [{ sourceId: "AC-SAVE", evidenceId: page.evidenceId, identityIndexes: page.identities.map(item => item.index) }] });
    finalCalls++;
    const selectedSource = JSON.parse(prompt.split("\n").find(line => line.startsWith("Source documents"))!.split(": ").slice(1).join(": "));
    expect(typeof selectedSource === "string" ? selectedSource : selectedSource.order.map((i: number) => selectedSource.lines[i]).join("\n")).toBe(sources);
    const evidence = JSON.parse(prompt.split("\n").find(line => line.startsWith("Evidence: "))!.slice(10));
    expect(expandIdentities(evidence.automatedEvidence[0].executionIdentityFragments)).toEqual(model.automatedEvidence[0]!.executionIdentities);
    return JSON.stringify({ links: [{ sourceId: "AC-SAVE", kind: "automated", evidenceId: "REPORT", explanation: "All selected assertions and original source qualifications were supplied." }], unresolved: [] });
  }, sources);
  expect(finalCalls).toBe(1);
  expect(result.proposal.links).toHaveLength(1);
});

it("resumes validated extraction after a restart and retries only the failed final assessment", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coverage-checkpoints-"));
  const checkpoint = { directory, fingerprint: "current-pack-source-results" };
  let extractionCalls = 0;
  const run = async (prompt: string) => {
    const page = extractionPage(prompt);
    if (page) {
      extractionCalls++;
      return JSON.stringify({ inspectedCount: page.identities.length, matches: [] });
    }
    throw new Error("Final provider unavailable");
  };
  try {
    await expect(proposeCoverageReconciliation(retrievalModel(), run, "", checkpoint)).rejects.toThrow("Final provider unavailable");
    const completed = extractionCalls;
    expect(completed).toBeGreaterThan(1);
    await expect(proposeCoverageReconciliation(retrievalModel(), run, "", { ...checkpoint })).rejects.toThrow("Final provider unavailable");
    expect(extractionCalls).toBe(completed);
    await expect(proposeCoverageReconciliation(retrievalModel(), run, "", { ...checkpoint, fingerprint: "changed-results" })).rejects.toThrow("Final provider unavailable");
    expect(extractionCalls).toBe(completed * 2);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

function largeModel() {
  const identities = Array.from({ length: 1600 }, (_, index) => `suite.test.ts: Baseline ${index} ${"unrelated baseline case ".repeat(7)}`);
  identities[1] = "suite.test.ts: AC-SAVE validates the input";
  identities[1599] = "suite.test.ts: AC-SAVE persists the validated input";
  return { manifestEntries: [{ sourceId: "AC-SAVE", criterionPreview: "Validate and persist the submitted input" }], coverageMap: [{ sourceId: "AC-SAVE", coverageStatus: "uncovered" }],
    tests: [], automatedEvidence: [{ id: "REPORT", title: "Executed tests", status: "executed-passed", command: "vitest run", sourcePath: "report.json", detail: "1600 tests passed; revision abcde123456", executionIdentities: identities }] } as unknown as ManualTestDeliveryModel;
}
function extractionPage(prompt: string) {
  const line = prompt.split("\n").find(line => line.startsWith("Extraction page "));
  return line ? JSON.parse(line.slice(line.indexOf(": ") + 2)) as { evidenceId: string; identities: { index: number; identity: string }[] } : null;
}

// Retrieval is necessary only when lossless compaction cannot already fit the index.
function retrievalModel() {
  const model = largeModel();
  return { ...model, automatedEvidence: [{ ...model.automatedEvidence[0]!, executionIdentities: model.automatedEvidence[0]!.executionIdentities!.map((identity, i) =>
    identity.includes("AC-SAVE") ? identity : createHash("sha256").update(`unique-${i}`).digest("hex")) }] };
}

it("inspects every identity in bounded pages and consolidates cross-page evidence before proposing coverage", async () => {
  const model = retrievalModel(), inspected: number[] = [], prompts: string[] = [];
  let finalCalls = 0;
  const result = await proposeCoverageReconciliation(model, async prompt => {
    prompts.push(prompt);
    const page = extractionPage(prompt);
    if (page) {
      inspected.push(...page.identities.map(identity => identity.index));
      const indexes = page.identities.filter(identity => identity.identity.includes("AC-SAVE")).map(identity => identity.index);
      return JSON.stringify({ inspectedCount: page.identities.length, matches: indexes.length ? [{ sourceId: "AC-SAVE", evidenceId: page.evidenceId, identityIndexes: indexes }] : [] });
    }
    finalCalls++;
    const evidence = JSON.parse(prompt.split("\n").find(line => line.startsWith("Evidence: "))!.slice(10));
    expect(evidence.automatedEvidence[0].executionIdentities).toEqual([model.automatedEvidence[0]!.executionIdentities![1], model.automatedEvidence[0]!.executionIdentities![1599]]);
    expect(evidence.executionAssessment.complete).toBe(true);
    expect(evidence.executionAssessment.pages.reduce((sum: number, page: { inspected: number }) => sum + page.inspected, 0)).toBe(1600);
    return JSON.stringify({ links: [{ sourceId: "AC-SAVE", kind: "automated", evidenceId: "REPORT", explanation: "Both executed assertions establish validation and persistence." }], unresolved: [] });
  });
  expect(inspected).toEqual(Array.from({ length: 1600 }, (_, index) => index));
  expect(prompts.length).toBeGreaterThan(2);
  expect(prompts.every(prompt => prompt.length <= COVERAGE_PROMPT_LIMIT)).toBe(true);
  expect(finalCalls).toBe(1);
  expect(result.proposal.links).toHaveLength(1);
  expect(model.automatedEvidence[0]!.executionIdentities).toHaveLength(1600);
});

it.each(["failed-page", "invented-index", "partial-inspection"])("does not classify missing tests or publish partial proposals after %s", async failure => {
  let calls = 0;
  await expect(proposeCoverageReconciliation(retrievalModel(), async prompt => {
    const page = extractionPage(prompt);
    expect(page).not.toBeNull(); // the final classifier must never run
    calls++;
    if (failure === "failed-page" && calls === 2) throw new Error("Provider timed out");
    return JSON.stringify({ inspectedCount: failure === "partial-inspection" ? 0 : page!.identities.length,
      matches: failure === "invented-index" ? [{ sourceId: "AC-SAVE", evidenceId: "REPORT", identityIndexes: [999999] }] : [] });
  })).rejects.toThrow("Coverage assessment incomplete");
  expect(calls).toBe(failure === "failed-page" ? 2 : 1);
});

it("reports selected-evidence overflow instead of silently cutting the final context", async () => {
  const model = largeModel();
  const incompressible = { ...model, automatedEvidence: [{ ...model.automatedEvidence[0]!, executionIdentities: Array.from({ length: 1600 }, (_, index) => Array.from({ length: 4 }, (_, part) => createHash("sha256").update(`${index}-${part}`).digest("hex")).join("")) }] };
  await expect(proposeCoverageReconciliation(incompressible, async prompt => {
    const page = extractionPage(prompt);
    expect(page).not.toBeNull();
    return JSON.stringify({ inspectedCount: page!.identities.length, matches: [{ sourceId: "AC-SAVE", evidenceId: page!.evidenceId, identityIndexes: page!.identities.map(identity => identity.index) }] });
  })).rejects.toThrow("complete selected evidence exceeds");
});

it("splits a large final union by criterion without losing cross-page evidence or repeating extraction", async () => {
  const base = retrievalModel();
  const model = { ...base, manifestEntries: [{ sourceId: "AC-FIRST", criterionPreview: "First contract" }, { sourceId: "AC-SECOND", criterionPreview: "Second contract" }],
    coverageMap: [{ sourceId: "AC-FIRST", coverageStatus: "uncovered" }, { sourceId: "AC-SECOND", coverageStatus: "uncovered" }] } as unknown as ManualTestDeliveryModel;
  let inspected = 0, finalCalls = 0;
  const result = await proposeCoverageReconciliation(model, async prompt => {
    expect(prompt.length).toBeLessThanOrEqual(COVERAGE_PROMPT_LIMIT);
    const page = extractionPage(prompt);
    if (page) {
      inspected += page.identities.length;
      const matches = ["AC-FIRST", "AC-SECOND"].map((sourceId, group) => ({ sourceId, evidenceId: page.evidenceId,
        identityIndexes: page.identities.filter(item => Math.floor(item.index / 800) === group).map(item => item.index) })).filter(match => match.identityIndexes.length);
      return JSON.stringify({ inspectedCount: page.identities.length, matches });
    }
    finalCalls++;
    const evidence = JSON.parse(prompt.split("\n").find(line => line.startsWith("Evidence: "))!.slice(10));
    expect(evidence.coverageMap).toHaveLength(1);
    const sourceId = evidence.coverageMap[0].sourceId, start = sourceId === "AC-FIRST" ? 0 : 800;
    expect(evidence.automatedEvidence[0].executionIdentities).toEqual(base.automatedEvidence[0]!.executionIdentities!.slice(start, start + 800));
    return JSON.stringify({ links: [{ sourceId, kind: "automated", evidenceId: "REPORT", explanation: "Complete selected contract evidence is present." }], unresolved: [] });
  });
  expect(inspected).toBe(1600);
  expect(finalCalls).toBe(2);
  expect(result.proposal.links.map(link => link.sourceId)).toEqual(["AC-FIRST", "AC-SECOND"]);
});

it("rejects excessive extraction page counts before any model dispatch", () => {
  const model = largeModel();
  const huge = { ...model, automatedEvidence: [{ ...model.automatedEvidence[0]!, executionIdentities: Array.from({ length: 2000 }, (_, index) => `${index}: ${"x".repeat(900)}`) }] };
  expect(() => executionAssessmentPages(huge)).toThrow("supported bound");
});

it("losslessly pages escaped strings instead of measuring only their unescaped character count", () => {
  const model = largeModel();
  const identities = Array.from({ length: 600 }, (_, index) => `${index}: ${'"\\\n'.repeat(100)}`);
  const pages = executionAssessmentPages({ ...model, automatedEvidence: [{ ...model.automatedEvidence[0]!, executionIdentities: identities }] });
  expect(pages.flatMap(page => page.identities.map(item => item.identity))).toEqual(identities);
  expect(pages.every(page => JSON.stringify(page).length < 61000)).toBe(true);
});

it("budgets identity pages in serialized UTF-8 bytes, including astral text and JSON escaping", () => {
  const model = largeModel();
  const identities = Array.from({ length: 600 }, (_, index) => `${index}: ${'🐳\"\\\n'.repeat(50)}`);
  const pages = executionAssessmentPages({ ...model, automatedEvidence: [{ ...model.automatedEvidence[0]!, executionIdentities: identities }] });
  expect(pages.flatMap(page => page.identities.map(item => item.identity))).toEqual(identities);
  expect(pages.every(page => coveragePromptSize(JSON.stringify(page)) < 61_000)).toBe(true);
});

it("packs overlapping criterion evidence into fewer complete final assessments", async () => {
  const base = retrievalModel(), sourceIds = ["AC-A", "AC-B", "AC-C"];
  // Leave room for policy instructions: the 1,000-identity overlap must fit,
  // while the complete 1,600-identity union still needs another assessment.
  base.automatedEvidence[0]!.executionIdentities = base.automatedEvidence[0]!.executionIdentities!.map(identity => identity.slice(0, 56));
  const model = { ...base, manifestEntries: sourceIds.map(sourceId => ({ sourceId, criterionPreview: "A complementary contract" })),
    coverageMap: sourceIds.map(sourceId => ({ sourceId, coverageStatus: "uncovered" })) } as unknown as ManualTestDeliveryModel;
  const groups: string[][] = [];
  await proposeCoverageReconciliation(model, async prompt => {
    expect(coveragePromptSize(prompt)).toBeLessThanOrEqual(COVERAGE_PROMPT_LIMIT);
    const page = extractionPage(prompt);
    if (page) return JSON.stringify({ inspectedCount: page.identities.length, matches: sourceIds.map((sourceId, group) => ({ sourceId, evidenceId: page.evidenceId,
      identityIndexes: page.identities.filter(x => group === 0 ? x.index < 800 : group === 1 ? x.index >= 200 && x.index < 1000 : x.index >= 800).map(x => x.index) })).filter(m => m.identityIndexes.length) });
    const evidence = JSON.parse(prompt.split("\n").find(line => line.startsWith("Evidence: "))!.slice(10));
    groups.push(evidence.coverageMap.map((c: { sourceId: string }) => c.sourceId));
    const selected = new Set(groups.at(-1));
    expect(evidence.automatedEvidence[0].executionIdentities).toEqual(base.automatedEvidence[0]!.executionIdentities!.filter((_, index) =>
      (selected.has("AC-A") && index < 800) || (selected.has("AC-B") && index >= 200 && index < 1000) || (selected.has("AC-C") && index >= 800)));
    return JSON.stringify({ links: evidence.coverageMap.map((c: { sourceId: string }) => ({ sourceId: c.sourceId, kind: "automated", evidenceId: "REPORT", explanation: "Complete selected contributions are supplied." })), unresolved: [] });
  });
  expect(groups).toEqual([["AC-A", "AC-B"], ["AC-C"]]);
});
