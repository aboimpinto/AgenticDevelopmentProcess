import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { ManualTestDeliveryModel } from "../src/manual-test-verification/delivery-model.js";
import { proposeCoverageReconciliation } from "../src/manual-test-verification/coverage-reconciliation-prompt.js";

// Synthetic contracts deliberately use different names and report layouts from any client.
function fixture() {
  const report = (id: string, aspect: string) => ({ id, title: aspect, status: "executed-passed", command: "test", sourcePath: `${id}.json`,
    detail: "800 tests passed; revision abcdef012345", executionIdentities: Array.from({ length: 800 }, (_, i) => `${aspect}: ${"shared setup ".repeat(20)} ${i}`) });
  return { manifestEntries: [{ sourceId: "AC-ROUNDTRIP", criterionPreview: "Validate then persist input; complementary tests are permitted" },
    { sourceId: "AC-BROWSER", criterionPreview: "Browser renders persisted input" }],
  coverageMap: [{ sourceId: "AC-ROUNDTRIP", coverageStatus: "uncovered" }, { sourceId: "AC-BROWSER", coverageStatus: "uncovered" }], tests: [],
  automatedEvidence: [report("VALIDATION", "validates input"), report("STORAGE", "persists input")],
  recoveryContext: { manualResults: [{ testId: "HUMAN-CHECK", result: "PASS" }] } } as unknown as ManualTestDeliveryModel;
}
function documents() {
  return ["# Contract\nQUALIFICATION: AC-ROUNDTRIP may combine separate validation and persistence tests.",
    ...Array.from({ length: 3600 }, (_, i) => `Unrelated history ${createHash("sha256").update(`synthetic-${i}`).digest("hex")}`),
    "QUALIFICATION: AC-BROWSER requires actual browser execution, not discovery or server-only execution."].join("\n");
}
type SourcePage = { passages: { id: number; text: string }[] };
function sourcePage(prompt: string): SourcePage | undefined {
  const line = prompt.split("\n").find(line => line.startsWith("Source page: "));
  return line ? JSON.parse(line.slice("Source page: ".length)) : undefined;
}
function selection(page: SourcePage) {
  return JSON.stringify({ complete: true, inspectedCount: page.passages.length, accountedSourceIds: ["AC-ROUNDTRIP", "AC-BROWSER"],
    facts: page.passages.flatMap(p => p.text.split("\n").filter(line => line.startsWith("QUALIFICATION:")).map(quote => ({
      sourceIds: [quote.includes("AC-ROUNDTRIP") ? "AC-ROUNDTRIP" : "AC-BROWSER"], passageId: p.id, quote }))) });
}

it.each([100_000, 200_000, 1_000_000])("progressive compaction uses a %i-token model and reports completion before assessment", async contextWindow => {
  const activity: { state: string; level: string; beforeTokens: number; afterTokens?: number }[] = [];
  const result = await proposeCoverageReconciliation(fixture(), async prompt => {
    const page = sourcePage(prompt);
    if (page) { expect(activity.at(-1)?.state).toBe("running"); return selection(page); }
    expect(activity.at(-1)?.state).toBe(contextWindow === 1_000_000 ? undefined : "completed");
    return JSON.stringify({ links: [], unresolved: ["AC-ROUNDTRIP", "AC-BROWSER"].map(sourceId => ({ sourceId, reason: "Needs review; no invented pass." })) });
  }, documents(), undefined, { model: { contextWindow, maxTokens: 16_000, reasoning: true }, onCompaction: value => activity.push(value) });
  expect(activity.map(a => `${a.level}:${a.state}`)).toEqual(contextWindow === 1_000_000 ? [] : ["light:running", "strong:running", "strong:completed"]);
  if (activity.length) expect(activity.at(-1)!.afterTokens).toBeLessThan(activity[0]!.beforeTokens);
  expect(result.unresolved).toHaveLength(2); expect(result.proposal.links).toEqual([]);
});

it("keeps small requests unchanged, uses light compaction for repetition, and clears busy state on extraction failure", async () => {
  const small = { ...fixture(), automatedEvidence: [] }, levels: string[] = [];
  const options = { model: { contextWindow: 100_000, maxTokens: 16_000, reasoning: true },
    onCompaction: (a: { state: string; level: string }) => levels.push(`${a.level}:${a.state}`) };
  const verdict = async () => JSON.stringify({ links: [], unresolved: ["AC-ROUNDTRIP", "AC-BROWSER"].map(sourceId => ({ sourceId, reason: "Unknown" })) });
  await proposeCoverageReconciliation(small, verdict, "", undefined, options);
  expect(levels).toEqual([]);
  await proposeCoverageReconciliation(small, verdict, "Repeated contextual note.\n".repeat(10000), undefined, options);
  expect(levels).toEqual(["light:running", "light:completed"]);
  levels.length = 0;
  await expect(proposeCoverageReconciliation(small, async () => { throw new Error("Unavailable extraction"); }, documents(), undefined, options)).rejects.toThrow("Unavailable extraction");
  expect(levels.at(-1)).toBe("strong:failed");
});

it("CA09: does not mistake the 75 percent post-compaction target for the 80 percent trigger", async () => {
  const model = { ...fixture(), automatedEvidence: [] };
  const run = vi.fn(async () => JSON.stringify({ links: [], unresolved: ["AC-ROUNDTRIP", "AC-BROWSER"].map(sourceId => ({ sourceId, reason: "Unknown" })) }));
  const activity: string[] = [];
  // Injected counter isolates the policy boundary: 60000 + 2048 wrapper tokens
  // occupy 77.65% of this synthetic model's 79904 available input tokens.
  await proposeCoverageReconciliation(model, run, "", undefined, {
    model: { contextWindow: 100_000, maxTokens: 16_000, reasoning: true },
    counter: { encoding: "test-counter", count: () => 60_000 },
    onCompaction: value => activity.push(`${value.level}:${value.state}`),
  });
  expect(run).toHaveBeenCalledOnce();
  expect(activity).toEqual(["light:running", "light:completed"]);
});

it("CA01: pages oversized sources once, combines exact cross-page qualifications and complementary reports within budget", async () => {
  const model = fixture(), original = JSON.stringify(model), source = documents();
  let pages = 0, finals = 0, totalInput = 0;
  const seen: string[] = [];
  const result = await proposeCoverageReconciliation(model, async prompt => {
    totalInput += prompt.length;
    expect(prompt.length).toBeLessThanOrEqual(96_000);
    const page = sourcePage(prompt);
    if (page) { pages++; seen.push(...page.passages.map(p => p.text)); return selection(page); }
    // Compression must precede expensive raw identity retrieval.
    expect(prompt).not.toContain("Extraction page ");
    finals++;
    expect(prompt).toContain("may combine separate validation and persistence tests");
    expect(prompt).toContain("requires actual browser execution, not discovery");
    expect(prompt).toContain("HUMAN-CHECK");
    return JSON.stringify({ links: ["VALIDATION", "STORAGE"].map(evidenceId => ({ sourceId: "AC-ROUNDTRIP", kind: "automated", evidenceId,
      explanation: `${evidenceId} contributes one required aspect of the combined contract.` })),
    unresolved: [{ sourceId: "AC-BROWSER", reason: "No executed browser evidence supplied; server reports cannot prove this boundary." }] });
  }, source);
  expect(seen.join("")).toBe(source);
  expect(pages).toBeGreaterThan(2); expect(finals).toBe(1);
  expect(totalInput).toBeLessThan(source.length * 1.8);
  expect(result.proposal.links.map(link => link.evidenceId)).toEqual(["VALIDATION", "STORAGE"]);
  expect(result.unresolved.map(entry => entry.sourceId)).toEqual(["AC-BROWSER"]);
  expect(JSON.stringify(model)).toBe(original);
});

it("CA05: dense cross-referenced sources retain exact qualifications without forwarding whole related passages", async () => {
  const positive = "Validation and persistence may be established by complementary executed tests.";
  const negative = "Browser discovery is not browser execution; a real browser run is required.";
  const late = "A stale callback must not overwrite the current identity, even after reopening.";
  const source = Array.from({ length: 1000 }, (_, i) => `### Shared journey discussion ${createHash("sha256").update(`section-${i}`).digest("hex")}\nAC-ROUNDTRIP and AC-BROWSER share this workflow.\n${positive}\n${negative}\n`).join("\n") + late;
  let sourceCalls = 0, finalCalls = 0, input = 0;
  const run = vi.fn(async (prompt: string) => {
    input += prompt.length;
    const page = sourcePage(prompt);
    if (page) {
      sourceCalls++;
      // The legacy selector legitimately finds every passage related; the new contract
      // must retain the additional facts, not duplicate these entire discussions.
      if (!prompt.includes("source-facts/v2")) return JSON.stringify({ inspectedCount: page.passages.length,
        selections: ["AC-ROUNDTRIP", "AC-BROWSER"].map(sourceId => ({ sourceId, passageIds: page.passages.map(p => p.id) })) });
      const facts = [positive, negative, late].flatMap(quote => {
        const passage = page.passages.find(p => p.text.includes(quote));
        return passage ? [{ sourceIds: ["AC-ROUNDTRIP", "AC-BROWSER"], passageId: passage.id, quote, occurrence: 0 }] : [];
      });
      return JSON.stringify({ complete: true, inspectedCount: page.passages.length, accountedSourceIds: ["AC-ROUNDTRIP", "AC-BROWSER"], facts });
    }
    expect(prompt).not.toContain("Extraction page ");
    expect(prompt.length).toBeLessThan(50_000);
    expect(prompt).toContain(positive); expect(prompt).toContain(negative); expect(prompt).toContain(late);
    expect(prompt).not.toContain("AC-ROUNDTRIP and AC-BROWSER share this workflow.");
    finalCalls++;
    return JSON.stringify({ links: ["VALIDATION", "STORAGE"].map(evidenceId => ({ sourceId: "AC-ROUNDTRIP", evidenceId, kind: "automated", explanation: "Complementary executed aspects." })),
      unresolved: [{ sourceId: "AC-BROWSER", reason: negative }] });
  });
  const result = await proposeCoverageReconciliation(fixture(), run, source);
  expect(sourceCalls).toBeGreaterThan(2); expect(finalCalls).toBe(1);
  expect(input).toBeLessThan(source.length * 1.8);
  expect(result.proposal.links).toHaveLength(2); expect(result.unresolved).toHaveLength(1);
});

it("CA06: rejects irreducible non-identity context before spending input on futile identity retrieval", async () => {
  const model = { ...fixture(), recoveryContext: { executionDiagnostics: Array.from({ length: 2400 }, (_, i) => createHash("sha256").update(`diagnostic-${i}`).digest("hex")) } };
  const run = vi.fn();
  await expect(proposeCoverageReconciliation(model, run)).rejects.toThrow("non-identity context");
  expect(run).not.toHaveBeenCalled();
});

it.each(["unknown-passage", "omitted-criterion", "partial-inspection"])("CA02: rejects %s before any final verdict", async failure => {
  let finals = 0;
  await expect(proposeCoverageReconciliation(fixture(), async prompt => {
    const page = sourcePage(prompt);
    if (!page) { finals++; throw new Error("Unexpected final verdict"); }
    const response = JSON.parse(selection(page));
    if (failure === "unknown-passage") response.facts[0].passageId = 9999999;
    if (failure === "omitted-criterion") response.accountedSourceIds.pop();
    if (failure === "partial-inspection") response.inspectedCount = 0;
    return JSON.stringify(response);
  }, documents())).rejects.toThrow("Coverage assessment incomplete");
  expect(finals).toBe(0);
});

it("CA03: resumes checked source pages after final failure; changed source cannot reuse an old verdict", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coverage-source-aggregation-"));
  const checkpoint = { directory, fingerprint: "synthetic-authority" };
  let pages = 0, finals = 0;
  const run = async (prompt: string) => {
    const page = sourcePage(prompt);
    if (page) { pages++; return selection(page); }
    finals++; throw new Error("Final provider unavailable");
  };
  try {
    await expect(proposeCoverageReconciliation(fixture(), run, documents(), checkpoint)).rejects.toThrow("Final provider unavailable");
    const first = pages; expect(first).toBeGreaterThan(0);
    await expect(proposeCoverageReconciliation(fixture(), run, documents(), checkpoint)).rejects.toThrow("Final provider unavailable");
    expect(pages).toBe(first); expect(finals).toBe(2);
    await expect(proposeCoverageReconciliation(fixture(), run, `${documents()}\nChanged qualification`, checkpoint)).rejects.toThrow("Final provider unavailable");
    expect(pages).toBeGreaterThan(first);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
