import { expect, it, vi } from "vitest";
import { groupedPartialCoverage, planRoutingContext, routingContextBudget } from "../src/manual-test-verification/verification-routing-context.js";
import type { CoverageContextPolicy } from "../src/manual-test-verification/coverage-reconciliation-prompt.js";

const policy = (contextWindow: number): CoverageContextPolicy => ({ model: { contextWindow, maxTokens: 1000, reasoning: true },
  counter: { encoding: "synthetic-one-token-per-character", count: text => text.length }, onCompaction: vi.fn() });
it("uses the selected capacity: the same request partitions above 80% only on the smaller model", async () => {
  const entries = [{ sourceId: "AC-LEFT", text: "left ".repeat(2200) }, { sourceId: "AC-RIGHT", text: "right".repeat(2200) }];
  const source = "Environment is NOT available. ".repeat(30);
  const build = (values: typeof entries, source: unknown) => JSON.stringify([values, source]);
  for (const capacity of [30000, 1_000_000]) {
    const p = policy(capacity), budget = routingContextBudget(p), run = vi.fn();
    const plans = await planRoutingContext(entries, source, build, budget, run, undefined, [], p);
    expect(plans.flatMap(x => x.entries)).toEqual(entries);
    expect(plans).toHaveLength(capacity === 30000 ? 2 : 1);
    expect(plans.every(x => budget.measure(x.prompt) <= budget.hardLimit)).toBe(true);
    expect(plans.every(x => x.prompt.includes(source))).toBe(true);
    expect(run).not.toHaveBeenCalled();
    if (capacity === 30000) expect(p.onCompaction).toHaveBeenLastCalledWith(expect.objectContaining({ state: "completed", level: "strong" }));
    else expect(p.onCompaction).not.toHaveBeenCalled();
  }
});
it("applies light lossless compaction at 50%, retaining every repeated source occurrence", async () => {
  const p = policy(30000), source = "Fixture unavailable.\n".repeat(750);
  const build = (_: { sourceId: string }[], value: unknown) => JSON.stringify(value);
  const plans = await planRoutingContext([{ sourceId: "AC-A" }], source, build, routingContextBudget(p), vi.fn(), undefined, [], p);
  const encoded = JSON.parse(plans[0]!.prompt);
  expect(encoded.order.map((i: number) => encoded.lines[i]).join("\n")).toBe(source);
  expect(p.onCompaction).toHaveBeenLastCalledWith(expect.objectContaining({ state: "completed", level: "light" }));
});
it("does not buy source extraction when irreducible non-source context already exceeds the token budget", async () => {
  const p = policy(30000), run = vi.fn();
  await expect(planRoutingContext([{ sourceId: "AC-A" }], "Must preserve", () => "x".repeat(30000), routingContextBudget(p), run, undefined, [], p)).rejects.toThrow("no source extraction was dispatched");
  expect(run).not.toHaveBeenCalled();
  expect(p.onCompaction).toHaveBeenLastCalledWith(expect.objectContaining({ state: "failed" }));
});
it("keeps separate criteria, evidence IDs and manual steps separate despite equal prose", () => {
  const base = { sourceId: "AC-A", kind: "manual" as const, evidenceId: "case", stepNumbers: [1], explanation: "Observed" };
  expect(groupedPartialCoverage([base, { ...base }, { ...base, sourceId: "AC-B" }, { ...base, evidenceId: "another" }, { ...base, stepNumbers: [2] }])).toHaveLength(4);
});

it("reuses bounded source extraction when full source cannot fit, preserving the cited negative prerequisite", async () => {
  const p = policy(30000), entries = [{ sourceId: "AC-BOUNDARY" }];
  const clause = "Never execute against a shared environment without explicit fixture authority.";
  const source = "# Verification ownership\n" + Array.from({ length: 800 }, (_, i) => `Background discussion ${i}: historical context without an additional verification obligation.\n`).join("") + clause;
  const run = vi.fn(async (prompt: string) => {
    const line = prompt.split("\n").find(value => value.startsWith("Source page: "))!;
    const page = JSON.parse(line.slice("Source page: ".length));
    return JSON.stringify({ complete: true, inspectedCount: page.passages.length, accountedSourceIds: ["AC-BOUNDARY"],
      facts: page.passages.filter((passage: { text: string }) => passage.text.includes(clause)).map((passage: { id: number }) => ({ sourceIds: ["AC-BOUNDARY"], passageId: passage.id, quote: clause, occurrence: 0 })) });
  });
  const budget = routingContextBudget(p);
  const plans = await planRoutingContext(entries, source, (entries, source) => JSON.stringify({ entries, source }), budget, budget.dispatch(run), undefined,
    [{ sourceId: "AC-BOUNDARY", criterionPreview: "Execute existing verification using an authorized fixture" }], p);
  expect(run).toHaveBeenCalled();
  expect(plans).toHaveLength(1);
  expect(plans[0]!.prompt).toContain(clause);
  expect(plans[0]!.prompt).toContain("sourceHash");
  expect(plans[0]!.entries).toEqual(entries);
  expect(plans[0]!.prompt.length).toBeLessThan(budget.hardLimit);
});
