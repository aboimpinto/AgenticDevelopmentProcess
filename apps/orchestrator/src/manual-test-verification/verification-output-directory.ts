import { isAbsolute } from "node:path";

/** HEPHA's reserved output-directory placeholder, never arbitrary environment
 * expansion. Quote the host value as a single shell word in its original context.
 * Escaped dollars remain literal. No shell or model is invoked. */
export function bindVerificationOutputDirectory(command: string, directory: string): string {
  if (!isAbsolute(directory) || /[\0\r\n]/.test(directory)) throw new Error("Verification output directory must be an absolute single-line path.");
  let result = "", quote = "";
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (c === "\\" && quote !== "'" && i + 1 < command.length) { result += c + command[++i]; continue; }
    const marker = command.slice(i).match(/^\$(?:\{VERIFICATION_OUTPUT_DIR\}|VERIFICATION_OUTPUT_DIR(?![\w]))/);
    if (marker) {
      result += quote === '"' ? directory.replace(/[\\"$`]/g, "\\$&")
        : quote === "'" ? directory.replaceAll("'", "'\\''")
        : `'${directory.replaceAll("'", "'\\''")}'`;
      i += marker[0].length - 1; continue;
    }
    if (c === quote) quote = "";
    else if (!quote && (c === "'" || c === '"')) quote = c;
    result += c;
  }
  return result;
}
