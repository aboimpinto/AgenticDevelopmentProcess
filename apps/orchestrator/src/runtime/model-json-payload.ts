/** Decode one complete JSON value. Presentation is not authority: callers must
 * validate its schema and semantics. Never salvage a nested object from broken
 * JSON or choose between competing payloads. Braces in JSON strings are data. */
export function modelJsonPayload(output: string): unknown {
  const source = output;
  const fail = (code: string, position: number, detail: string): never => {
    const prefix = source.slice(0, position), line = prefix.split("\n").length;
    const column = position - prefix.lastIndexOf("\n");
    throw new Error(`${code} at line ${line}, column ${column}: ${detail}`);
  };
  try { return JSON.parse(source); } catch { /* Inspect presentation wrappers. */ }
  const stack: string[] = [];
  let start = -1, quoted = false, escaped = false;
  const candidates: unknown[] = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (start < 0) {
      const inlineEnd = c === "`" ? inlineCodeEnd(source, i) : i;
      if (inlineEnd > i) { i = inlineEnd; continue; }
      if (c === "}" || c === "]") fail("JSON_DELIMITER", i, `Unexpected closing ${c}; remove the extra delimiter from the complete payload.`);
      if (c !== "{" && c !== "[") continue;
      start = i;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") {
      const opening = stack.pop();
      if (opening !== (c === "}" ? "{" : "[")) fail("JSON_DELIMITER", i, `Mismatched delimiter; expected ${opening === "{" ? "}" : "]"}, not ${c}. Correct the container without changing its fields.`);
      if (!stack.length) {
        try { candidates.push(JSON.parse(source.slice(start, i + 1))); }
        catch (error) {
          // Native error strings may contain source excerpts: expose location and
          // syntax guidance only, never echo arbitrary model content in diagnostics.
          const message = (error as Error).message;
          const offset = Number(message.match(/position (\d+)/)?.[1] ?? 0);
          const guidance = /property name/i.test(message) ? "Object keys must be double-quoted; check for an unquoted key or trailing comma."
            : /Expected ','/i.test(message) ? "Check the missing comma or container terminator."
            : "Correct invalid JSON syntax at this location; nested fragments cannot substitute for the complete payload.";
          fail("JSON_SYNTAX", start + offset, guidance);
        }
        if (candidates.length > 1) fail("JSON_AMBIGUOUS", start, "Competing JSON payloads; return exactly one intended plan, not alternatives. Do not guess between different plans.");
        start = -1;
      }
    }
  }
  if (start >= 0) fail("JSON_INCOMPLETE", source.length, `Incomplete JSON; expected ${quoted ? 'a closing double quote' : stack.at(-1) === "{" ? "}" : "]"}. Restore the full response; do not discard unfinished fields.`);
  if (candidates.length !== 1) fail("JSON_MISSING", 0, "No JSON object or array found. Return the completed template using inspected configuration.");
  return candidates[0];
}

/** Ignore inline prose examples such as glob patterns, not JSON alternatives.
 * Triple-backtick blocks remain payload-bearing and are scanned normally. */
function inlineCodeEnd(source: string, start: number) {
  let width = 1;
  while (source[start + width] === "`") width++;
  if (width >= 3 || source[start - 1] === "`") return start;
  let cursor = start + width;
  while (cursor < source.length && source[cursor] !== "\n") {
    if (source[cursor] !== "`") { cursor++; continue; }
    let end = cursor + 1;
    while (source[end] === "`") end++;
    if (end - cursor === width) {
      const content = source.slice(start + width, cursor).trim();
      return content.startsWith("{") || content.startsWith("[") ? start : end - 1;
    }
    cursor = end;
  }
  return start;
}
