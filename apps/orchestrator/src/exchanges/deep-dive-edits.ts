import { createJsonExchangeProtocol, readExchangeSchema } from "./json-exchange-protocol.js";

export interface DeepDiveEdits { edits: Array<{ before: string; after: string }> }
export const deepDiveEditsProtocol = createJsonExchangeProtocol<DeepDiveEdits>("deep-dive.edits", readExchangeSchema("deep-dive-edits-payload-v1"));

/** Apply only exact, non-overlapping edits; everything else survives verbatim. */
export function applyDeepDiveEdits(raw: string, source: string): string {
  const result = deepDiveEditsProtocol.decode(raw);
  if (!result.valid) throw new Error("MCP_DEEP_DIVE_EDITS_INVALID: expected the complete versioned edit exchange.");
  const edits = result.value.payload.edits.map(edit => {
    const start = source.indexOf(edit.before);
    if (start < 0 || source.indexOf(edit.before, start + 1) >= 0) {
      throw new Error("MCP_DEEP_DIVE_EDIT_TARGET_INVALID: each before text must match exactly once in the current target.");
    }
    return { ...edit, start, end: start + edit.before.length };
  }).sort((a, b) => a.start - b.start);
  let previousEnd = 0;
  let untouched = "";
  for (const edit of edits) {
    if (edit.start < previousEnd) throw new Error("MCP_DEEP_DIVE_EDITS_OVERLAP");
    untouched += source.slice(previousEnd, edit.start);
    previousEnd = edit.end;
  }
  untouched += source.slice(previousEnd);
  if (edits.length && !untouched.trim()) throw new Error("MCP_DEEP_DIVE_WHOLE_DOCUMENT_EDIT: use scoped edits that preserve untouched content.");
  let updated = source;
  for (const edit of edits.reverse()) updated = updated.slice(0, edit.start) + edit.after + updated.slice(edit.end);
  if (!updated.trim()) throw new Error("MCP_DEEP_DIVE_DOCUMENT_EMPTY");
  return updated;
}
