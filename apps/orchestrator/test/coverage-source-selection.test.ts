import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { coverageSourcePassages, selectCoverageSourceContext } from "../src/manual-test-verification/coverage-source-selection.js";
import { COVERAGE_WORKING_PROMPT_LIMIT, coveragePromptSize } from "../src/manual-test-verification/coverage-assessment-batches.js";
import type { ManualTestDeliveryModel } from "../src/manual-test-verification/delivery-model.js";
import { aggregateSourceFacts, validateSourceFacts } from "../src/manual-test-verification/coverage-source-facts.js";

const model = { manifestEntries: [{ sourceId: "AC-A", criterionPreview: "A" }, { sourceId: "AC-B", criterionPreview: "B" }],
  coverageMap: [{ sourceId: "AC-A" }, { sourceId: "AC-B" }], automatedEvidence: [], tests: [] } as unknown as ManualTestDeliveryModel;

it("recovers oversized fact responses by subdividing, retaining every passage and negative clause", async () => {
  const source = Array.from({ length: 8 }, (_, i) => `# Boundary ${i}\nExecution is required, unless explicitly delegated.\n${"discussion ".repeat(150)}\n`).join("");
  const inspected = new Set<number>(); let calls = 0;
  const result = await selectCoverageSourceContext(model, source, async prompt => {
    calls++;
    const page = JSON.parse(prompt.split("Source page: ")[1]!);
    const complete = { complete: true, inspectedCount: page.passages.length, accountedSourceIds: ["AC-A", "AC-B"] };
    if (page.passages.length > 2) return JSON.stringify({ ...complete, facts: Array.from({ length: 101 }, () => ({ sourceIds: ["AC-A"], passageId: page.passages[0].id, quote: "Execution is required, unless explicitly delegated." })) });
    return JSON.stringify({ ...complete, facts: page.passages.flatMap((p: { id: number; text: string }) => {
      inspected.add(p.id);
      return p.text.includes("Execution is required, unless explicitly delegated.") ? [{ sourceIds: ["AC-A"], passageId: p.id, quote: "Execution is required, unless explicitly delegated.", occurrence: 0 }] : [];
    }) });
  });
  expect(calls).toBeGreaterThan(1); expect(calls).toBeLessThan(20);
  expect(inspected.size).toBe(coverageSourcePassages(source).length);
  expect(JSON.stringify(result.forCriteria(["AC-A"]))).toContain("unless explicitly delegated");
});

it("stops an irreducible oversized response without retrying the same input or inferring missing tests", async () => {
  const run = vi.fn(async () => JSON.stringify({ complete: true, inspectedCount: 1, accountedSourceIds: ["AC-A", "AC-B"],
    facts: Array.from({ length: 101 }, () => ({ sourceIds: ["AC-A"], passageId: 0, quote: "Required." })) }));
  await expect(selectCoverageSourceContext(model, "Required.", run)).rejects.toThrow("facts=101/100");
  expect(run).toHaveBeenCalledTimes(1);
});

it("losslessly partitions empty, escaped and astral source text with exact offsets and enclosing context", () => {
  expect(coverageSourcePassages("")).toEqual([]);
  const source = `Phase-Verification.md\n# External boundary\n${'Unicode 🐳 \\"\n'.repeat(1800)}## Negative qualification\nNo execution recorded.`;
  const passages = coverageSourcePassages(source);
  expect(passages.map(p => p.text).join("")).toBe(source);
  for (const passage of passages) {
    expect(source.slice(passage.offset, passage.offset + passage.text.length)).toBe(passage.text);
    expect(passage.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    for (const heading of passage.context) expect(source.slice(heading.offset, heading.offset + heading.text.length)).toBe(heading.text);
  }
  expect(passages.at(-1)!.context.map(h => h.text)).toContain("Phase-Verification.md");
  expect(passages.at(-1)!.context.map(h => h.text)).toContain("# External boundary");
});

it("deduplicates exact clauses only within the same scope and binds headings at the quote, not passage start", () => {
  const source = "Browser.md\n# Required boundary\nExecution required.\nNative.md\n# Required boundary\nExecution required.";
  const passages = coverageSourcePassages(source);
  // Extracting an ambiguous repeated quote from one passage must not invent its later offset.
  const facts = validateSourceFacts(JSON.stringify({ complete: true, inspectedCount: 1, accountedSourceIds: ["AC-A"], facts: [
    { sourceIds: ["AC-A"], passageId: 0, quote: "Execution required.", occurrence: 0 },
    { sourceIds: ["AC-A"], passageId: 0, quote: "Execution required.", occurrence: 0 },
    { sourceIds: ["AC-A"], passageId: 0, quote: "Native.md\n# Required boundary\nExecution required." },
  ] }), passages, new Set(["AC-A"]));
  const selected = aggregateSourceFacts(facts, passages, "digest", 1).forCriteria(["AC-A"]);
  expect(selected.facts).toHaveLength(2);
  expect(selected.facts[0]!.citations).toHaveLength(1);
  expect(selected.facts[0]!.scopeIds.map(i => selected.scopes[i])).toEqual(["Browser.md", "# Required boundary"]);
});

it("binds a unique quote after an in-passage document change to the new authority", () => {
  const source = "Browser.md\n# Browser scope\nBrowser execution.\nNative.md\n# Native scope\nNative execution required.";
  const passages = coverageSourcePassages(source);
  const selected = aggregateSourceFacts([{ sourceIds: ["AC-B"], passageId: 0, quote: "Native execution required." }], passages, "digest", 1).forCriteria(["AC-B"]);
  expect(selected.facts[0]!.scopeIds.map(i => selected.scopes[i])).toEqual(["Native.md", "# Native scope"]);
});

it("uses explicit occurrence to distinguish identical words under different authorities", () => {
  const source = "Browser.md\nExecution required.\nNative.md\nExecution required.";
  const passages = coverageSourcePassages(source), request = new Set(["AC-A"]);
  const response = (occurrence?: number) => JSON.stringify({ complete: true, inspectedCount: 1, accountedSourceIds: ["AC-A"], facts: [{ sourceIds: ["AC-A"], passageId: 0, quote: "Execution required.", occurrence }] });
  expect(() => validateSourceFacts(response(), passages, request)).toThrow("ambiguous");
  expect(() => validateSourceFacts(response(2), passages, request)).toThrow("ambiguous");
  const facts = validateSourceFacts(response(1), passages, request);
  const context = aggregateSourceFacts(facts, passages, "digest", 1).forCriteria(["AC-A"]);
  expect(context.facts[0]!.scopeIds.map(i => context.scopes[i])).toEqual(["Native.md"]);
  expect(context.facts[0]!.citations[0]!.offset).toBe(source.lastIndexOf("Execution required."));
});

it("shares repeated literal quotes without sharing their scope or criterion membership", () => {
  const quote = "A conditional verification boundary must remain explicit. ".repeat(8);
  const passages = Array.from({ length: 20 }, (_, id) => ({ id, offset: id * 1000, text: quote, context: [{ offset: id * 1000, text: `Scope-${id}.md` }] }));
  const facts = passages.map(p => ({ sourceIds: [p.id % 2 ? "AC-A" : "AC-B"], passageId: p.id, quote }));
  const context = aggregateSourceFacts(facts, passages, "digest", 1).forCriteria(["AC-A", "AC-B"]);
  expect("sourceQuoteCatalog" in context).toBe(true);
  if (!("sourceQuoteCatalog" in context)) throw new Error("Expected shared literal quotes");
  expect(context.sourceQuoteCatalog).toEqual([quote]);
  context.facts.forEach((fact, index) => {
    expect(context.sourceQuoteCatalog[fact.quoteRef]).toBe(quote);
    expect(fact.scopeIds.map(i => context.scopes[i])).toEqual([`Scope-${index}.md`]);
    expect(fact.sourceIds).toEqual([index % 2 ? "AC-A" : "AC-B"]);
    expect(fact.citations[0]!.offset).toBe(index * 1000);
  });
});

it("CA04: scopes exact passages by criterion without losing shared contributions, negative context or provenance", async () => {
  const source = `Contract.md\n# Boundaries\n${"🐳 unrelated section\n".repeat(9000)}Shared requirement and missing execution`;
  const inspected: number[] = [];
  const context = await selectCoverageSourceContext(model, source, async prompt => {
    expect(coveragePromptSize(prompt)).toBeLessThanOrEqual(COVERAGE_WORKING_PROMPT_LIMIT);
    const page = JSON.parse(prompt.split("\n").find(line => line.startsWith("Source page: "))!.slice(13));
    inspected.push(...page.passages.map((p: { id: number }) => p.id));
    return JSON.stringify({ complete: true, inspectedCount: page.passages.length, accountedSourceIds: ["AC-A", "AC-B"],
      facts: page.passages.filter((p: { text: string }) => p.text.includes("missing execution")).map((p: { id: number }) => ({
        sourceIds: ["AC-A", "AC-B"], passageId: p.id, quote: "Shared requirement and missing execution" })) });
  });
  const selected = context.forCriteria(["AC-A", "AC-B"]);
  expect(inspected).toEqual(coverageSourcePassages(source).map(p => p.id));
  expect(selected.sourceHash).toBe(createHash("sha256").update(source).digest("hex"));
  expect(selected.facts).toHaveLength(1); // one copy, exact membership for both criteria
  expect(selected.facts[0]!.sourceIds).toEqual(["AC-A", "AC-B"]);
  expect(context.forCriteria(["AC-A"]).facts[0]!.sourceIds).toEqual(["AC-A"]);
  expect(selected.facts[0]!.quote).toContain("missing execution");
  expect(selected.facts[0]!.scopeIds.map(i => selected.scopes[i])).toEqual(["Contract.md", "# Boundaries"]);
  const citation = selected.facts[0]!.citations[0]!;
  expect(source.slice(citation.offset, citation.offset + selected.facts[0]!.quote.length)).toBe(selected.facts[0]!.quote);
});

it("rejects excessive source pages before dispatch rather than inspecting a prefix", async () => {
  const run = vi.fn();
  await expect(selectCoverageSourceContext(model, "x".repeat(1_600_000), run)).rejects.toThrow("supported bound");
  expect(run).not.toHaveBeenCalled();
});

it.each(["duplicate-criterion", "duplicate-membership", "wrong-type", "invented-quote", "incomplete", "whole-paragraph"])("rejects %s source citations", async failure => {
  await expect(selectCoverageSourceContext(model, "Scope requires a real boundary.", async () => {
    const accountedSourceIds = ["AC-A", "AC-B"], facts = [{ sourceIds: ["AC-A", "AC-B"], passageId: 0, quote: "Scope requires a real boundary." }];
    if (failure === "duplicate-criterion") accountedSourceIds[1] = "AC-A";
    if (failure === "duplicate-membership") facts[0]!.sourceIds.push("AC-A");
    if (failure === "invented-quote") facts[0]!.quote = "All tests passed.";
    if (failure === "whole-paragraph") facts[0]!.quote = "x".repeat(1300);
    return JSON.stringify({ complete: failure !== "incomplete", inspectedCount: failure === "wrong-type" ? "1" : 1, accountedSourceIds, facts });
  })).rejects.toThrow("Coverage assessment incomplete");
});
