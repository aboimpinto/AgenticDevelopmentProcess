/**
 * Display-only text normalization.
 *
 * Some persisted logs and workflow errors contain literal escape sequences rather
 * than whitespace. Deliberately decode only CRLF, LF, CR, and tab escapes: this
 * is not JSON parsing and leaves all other escapes and the original raw value
 * unchanged for copy/export actions.
 */
export function normalizeDisplayWhitespace(value: string): string {
  return value.replace(/\\r\\n|\\n|\\r|\\t/g, (escape) => {
    switch (escape) {
      case "\\r\\n":
      case "\\n":
      case "\\r":
        return "\n";
      case "\\t":
        return "\t";
      default:
        return escape;
    }
  });
}
