import { CoverageAssessmentIncomplete, coveragePromptSize } from "./coverage-assessment-batches.js";

export interface SourceHeading { offset: number; text: string }
export interface SourcePassage { id: number; offset: number; text: string; context: SourceHeading[] }
export interface SourceFact { sourceIds: string[]; passageId: number; quote: string; occurrence?: number }
export const SOURCE_FACT_CONTEXT_LIMIT = 24_000;
export const SOURCE_FACT_PAGE_LIMIT = 12_000;
export class SourceFactBudgetExceeded extends CoverageAssessmentIncomplete {}

function quoteOffset(text: string, quote: string, occurrence = 0): number {
  let offset = -1;
  for (let i = 0; i <= occurrence; i++) { offset = text.indexOf(quote, offset + 1); if (offset < 0) break; }
  return offset;
}

function scopeAtQuote(passage: SourcePassage, index: number): string[] {
  const scope = new Map<number, string>();
  const add = (text: string) => {
    const level = text.match(/^#+/)?.[0].length ?? 0;
    for (const key of scope.keys()) if (key >= level) scope.delete(key);
    scope.set(level, text);
  };
  passage.context.forEach(heading => add(heading.text));
  // A passage may cross a document/section boundary: bind the quote's scope,
  // not the scope at the beginning of that passage.
  for (const heading of passage.text.slice(0, index).matchAll(/^(?:#{1,6} .+|[^\n]+\.md(?::\d+)?)$/gm)) add(heading[0]);
  return [...scope.values()];
}

/** Source narrative is context, not a validated execution receipt or a coverage decision. */
export function validateSourceFacts(response: string, passages: readonly SourcePassage[], requested: ReadonlySet<string>): SourceFact[] {
  let value: { complete: boolean; inspectedCount: number; accountedSourceIds: string[]; facts: SourceFact[] };
  try { value = JSON.parse(response.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")); }
  catch { throw new CoverageAssessmentIncomplete("Source fact extraction returned invalid JSON."); }
  if (!value || value.complete !== true || value.inspectedCount !== passages.length
    || !Array.isArray(value.accountedSourceIds) || value.accountedSourceIds.length !== requested.size
    || new Set(value.accountedSourceIds).size !== requested.size || !value.accountedSourceIds.every(id => requested.has(id))) {
    throw new CoverageAssessmentIncomplete("Source facts did not completely account for every passage and criterion; no missing-test inference is permitted.");
  }
  if (!Array.isArray(value.facts)) throw new CoverageAssessmentIncomplete("Source fact extraction facts must be an array.");
  const factBytes = coveragePromptSize(JSON.stringify(value.facts));
  if (value.facts.length > 100 || factBytes > SOURCE_FACT_PAGE_LIMIT) {
    throw new SourceFactBudgetExceeded(`Source fact extraction exceeded its bounded fact budget: facts=${value.facts.length}/100; serializedBytes=${factBytes}/${SOURCE_FACT_PAGE_LIMIT}.`);
  }
  const byId = new Map(passages.map(p => [p.id, p]));
  for (const fact of value.facts) {
    if (!fact || !Array.isArray(fact.sourceIds) || !fact.sourceIds.length || new Set(fact.sourceIds).size !== fact.sourceIds.length
      || !fact.sourceIds.every(id => requested.has(id)) || !Number.isSafeInteger(fact.passageId) || !byId.has(fact.passageId)
      || typeof fact.quote !== "string" || !fact.quote.trim() || fact.quote.length > 1200 || !byId.get(fact.passageId)!.text.includes(fact.quote)) {
      throw new CoverageAssessmentIncomplete("Source fact cites an unknown criterion/passage, an invented quote, or an oversized clause.");
    }
    const text = byId.get(fact.passageId)!.text;
    if ((fact.occurrence !== undefined && (!Number.isSafeInteger(fact.occurrence) || fact.occurrence < 0 || fact.occurrence > text.length))
      || (fact.occurrence === undefined && text.indexOf(fact.quote) !== text.lastIndexOf(fact.quote))
      || quoteOffset(text, fact.quote, fact.occurrence) < 0) throw new CoverageAssessmentIncomplete("Source quote occurrence is ambiguous or outside the supplied passage; scope cannot be inferred.");
  }
  return value.facts.map(fact => ({ sourceIds: [...fact.sourceIds], passageId: fact.passageId, quote: fact.quote, ...(fact.occurrence !== undefined ? { occurrence: fact.occurrence } : {}) }));
}

/** Deduplicate only exact quote AND scope matches; a similar statement under a different
 * authority or boundary is not interchangeable. Keep every contributing citation. */
export function aggregateSourceFacts(facts: readonly SourceFact[], passages: readonly SourcePassage[], sourceHash: string, pages: number) {
  const byId = new Map(passages.map(p => [p.id, p]));
  const groups = new Map<string, { quote: string; scope: string[]; sourceIds: Set<string>; citations: Map<number, { passageId: number; offset: number }> }>();
  for (const fact of facts) {
    const passage = byId.get(fact.passageId)!;
    const relativeOffset = quoteOffset(passage.text, fact.quote, fact.occurrence);
    const scope = scopeAtQuote(passage, relativeOffset), key = JSON.stringify([fact.quote, scope]);
    const group = groups.get(key) ?? { quote: fact.quote, scope, sourceIds: new Set<string>(), citations: new Map() };
    fact.sourceIds.forEach(id => group.sourceIds.add(id));
    const offset = passage.offset + relativeOffset;
    group.citations.set(offset, { passageId: passage.id, offset });
    groups.set(key, group);
  }
  return {
    forCriteria(sourceIds: readonly string[]) {
      const requested = new Set(sourceIds), scopes: string[] = [], scopeIds = new Map<string, number>();
      const facts = [...groups.values()].filter(f => [...f.sourceIds].some(id => requested.has(id))).map(f => ({
        quote: f.quote, sourceIds: [...f.sourceIds].filter(id => requested.has(id)),
        scopeIds: f.scope.map(scope => { if (!scopeIds.has(scope)) { scopeIds.set(scope, scopes.length); scopes.push(scope); } return scopeIds.get(scope)!; }),
        citations: [...f.citations.values()],
      }));
      const base = { version: "source-facts/v2", sourceHash, inspectedPassages: passages.length, inspectedPages: pages,
        note: "Exact additional source clauses with original scope and offsets, not execution receipts or a coverage verdict. Criteria remain authoritative. Combine complementary evidence; preserve conditions, negative evidence and required boundaries. Source claims or discovery never prove execution. Unknown or omitted context cannot prove missing implementation or waive a requirement.",
        scopes, facts };
      const quotes = [...new Set(facts.map(fact => fact.quote))], quoteIds = new Map(quotes.map((quote, i) => [quote, i]));
      const encoded = { ...base, note: `${base.note} sourceQuoteCatalog stores exact literal quotes; each fact's quoteRef selects its zero-based quote. Scope IDs index scopes. Membership and citations remain fact-specific.`,
        sourceQuoteCatalog: quotes, facts: facts.map(({ quote, ...fact }) => ({ ...fact, quoteRef: quoteIds.get(quote)! })) };
      return coveragePromptSize(JSON.stringify(encoded)) + 256 < coveragePromptSize(JSON.stringify(base)) ? encoded : base;
    },
  };
}
