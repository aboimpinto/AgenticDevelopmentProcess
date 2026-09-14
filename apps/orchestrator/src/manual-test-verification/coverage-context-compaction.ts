import type { ManualTestDeliveryModel } from "./delivery-model.js";

export type IdentityFragment = string | { prefix: string; suffix: string; items: IdentityFragment[] };

/** Lossless, ordered prefix/suffix factoring. No model, ranking, truncation or new evidence. */
export function compactIdentities(identities: readonly string[]): IdentityFragment[] {
  if (identities.length < 2) return [...identities];
  const first = identities[0]!;
  let start = 0, end = 0;
  while (start < first.length && identities.every(value => value[start] === first[start])) start++;
  while (end < first.length - start && identities.every(value => value.length - start > end && value[value.length - 1 - end] === first[first.length - 1 - end])) end++;
  const middles = identities.map(value => value.slice(start, end ? -end : undefined));
  const groups: string[][] = [];
  for (const value of middles) {
    const last = groups.at(-1);
    if (last && last[0]?.[0] === value[0]) last.push(value);
    else groups.push([value]);
  }
  const items = groups.length > 1 ? groups.flatMap(group => compactIdentities(group)) : middles;
  const factored = [{ prefix: first.slice(0, start), suffix: end ? first.slice(-end) : "", items }];
  return JSON.stringify(factored).length < JSON.stringify(identities).length ? factored : [...identities];
}

export function expandIdentities(fragments: readonly IdentityFragment[]): string[] {
  return fragments.flatMap(fragment => typeof fragment === "string" ? [fragment]
    : expandIdentities(fragment.items).map(value => fragment.prefix + value + fragment.suffix));
}

/** Prompt-only encoding; the canonical model and link validation retain exact original identities. */
export function compactCoverageContext(model: ManualTestDeliveryModel) {
  const view = compactDiagnostics(model);
  const factored = { ...view, automatedEvidence: model.automatedEvidence.map(entry => {
    if (!entry.executionIdentities?.length) return entry;
    const fragments = compactIdentities(entry.executionIdentities);
    if (JSON.stringify(fragments).length >= JSON.stringify(entry.executionIdentities).length) return entry;
    const { executionIdentities, ...metadata } = entry;
    return { ...metadata, executionIdentityCount: executionIdentities.length, executionIdentityFragments: fragments };
  }) };
  // Overlapping focused/full-suite receipts often repeat the exact same identities.
  // Share their text, but retain each report's complete ordered binding and provenance.
  const catalog: string[] = [], indexes = new Map<string, number>();
  const shared = { ...view, automatedEvidence: model.automatedEvidence.map(entry => {
    if (!entry.executionIdentities?.length) return entry;
    const references = entry.executionIdentities.map(identity => {
      let index = indexes.get(identity);
      if (index === undefined) { index = catalog.length; catalog.push(identity); indexes.set(identity, index); }
      return index;
    });
    const { executionIdentities, ...metadata } = entry;
    return { ...metadata, executionIdentityCount: executionIdentities.length, executionIdentityReferences: references };
  }), executionIdentityCatalog: [] as IdentityFragment[] };
  shared.executionIdentityCatalog = compactIdentities(catalog);
  // Catalogue order is an encoding detail, not report execution order. Adjacent
  // related identities factor better; remap every report reference to preserve
  // its original ordered membership (including duplicates) without transferring proof.
  const sortedCatalog = [...catalog].sort();
  const sortedIndexes = new Map(sortedCatalog.map((identity, index) => [identity, index]));
  const sorted = { ...shared, executionIdentityCatalog: compactIdentities(sortedCatalog),
    automatedEvidence: shared.automatedEvidence.map(entry => "executionIdentityReferences" in entry
      ? { ...entry, executionIdentityReferences: entry.executionIdentityReferences.map(index => sortedIndexes.get(catalog[index]!)!) } : entry),
  };
  const smallestCatalog = JSON.stringify(sorted).length < JSON.stringify(shared).length ? sorted : shared;
  return JSON.stringify(smallestCatalog).length < JSON.stringify(factored).length ? smallestCatalog : factored;
}

/** Diagnostics often repeat the same exclusion reason for many receipts. Preserve every
 * original string in order, but store origins and reasons once. This never classifies them. */
function compactDiagnostics(model: ManualTestDeliveryModel) {
  const context = (model as ManualTestDeliveryModel & { recoveryContext?: Record<string, unknown> }).recoveryContext;
  const values = context?.executionDiagnostics;
  if (!Array.isArray(values) || !values.length || !values.every(value => typeof value === "string")) return model;
  const origins: string[] = [], reasons: string[] = [], originIds = new Map<string, number>(), reasonIds = new Map<string, number>();
  const intern = (text: string, values: string[], ids: Map<string, number>) => {
    if (!ids.has(text)) { ids.set(text, values.length); values.push(text); } return ids.get(text)!;
  };
  const entries = values.map(value => {
    const split = value.indexOf(": "), origin = split < 0 ? "" : value.slice(0, split + 2), reason = split < 0 ? value : value.slice(split + 2);
    return [intern(origin, origins, originIds), intern(reason, reasons, reasonIds)];
  });
  const encoded = { origins: compactIdentities(origins), reasons: compactIdentities(reasons), entries };
  if (JSON.stringify(encoded).length + 128 >= JSON.stringify(values).length) return model;
  const { executionDiagnostics: _original, ...rest } = context!;
  return { ...model, recoveryContext: { ...rest, executionDiagnosticCatalog: encoded } };
}

export function compactSourceDocuments(source: string) {
  const lines: string[] = [], indexes = new Map<string, number>();
  const order = source.split("\n").map(line => {
    let index = indexes.get(line);
    if (index === undefined) { index = lines.length; lines.push(line); indexes.set(line, index); }
    return index;
  });
  const encoded = { encoding: "ordered-lines/v1", lines, order };
  return JSON.stringify(encoded).length < JSON.stringify(source).length ? encoded : source;
}

export const COMPACT_IDENTITY_INSTRUCTIONS = "executionIdentityFragments is lossless text factoring, not a summary: each string is literal; for each object, expand every items child then concatenate prefix + expanded child + suffix. Recursively expand all children in order. If executionIdentityCatalog is supplied, expand it with the same rules into a zero-based identity list; each report's executionIdentityReferences selects exact identities from that list in order, without transferring evidence between reports. The resulting executionIdentityCount identities are the executed tests. Apply the same coverage rules as executionIdentities; counts alone are not proof. executionDiagnosticCatalog is also lossless: expand origins and reasons using those fragment rules, then reconstruct every entries pair [a,b] as origins[a] + reasons[b], in order. These are excluded-receipt diagnostics, never execution proof. Source documents using ordered-lines/v1 are also lossless: reconstruct order.map(index => lines[index]).join(newline). All qualifications, source boundaries and repeated occurrences remain applicable.";
