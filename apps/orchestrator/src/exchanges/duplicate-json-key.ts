/** Call only after JSON.parse established valid syntax. Reject ambiguous decision
 * keys; duplicate optional audit fields cannot change decision authority. */
export function duplicateDecisionKey(raw: string): string | null {
  const frames: Array<{ kind: string; keys: Set<string>; audit: boolean; pendingKey: string | null }> = [];
  for (const token of raw.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]]/g)) {
    const text = token[0];
    const parent = frames.at(-1);
    if (text === "{" || text === "[") {
      frames.push({ kind: text, keys: new Set(), audit: parent?.audit === true || (frames.length === 1 && parent?.pendingKey === "audit"), pendingKey: null });
    } else if (text === "}" || text === "]") frames.pop();
    else if (parent?.kind === "{" && /^\s*:/.test(raw.slice(token.index! + text.length))) {
      const key = JSON.parse(text) as string;
      if (!parent.audit && parent.keys.has(key)) return key;
      parent.keys.add(key);
      parent.pendingKey = key;
    }
  }
  return null;
}
