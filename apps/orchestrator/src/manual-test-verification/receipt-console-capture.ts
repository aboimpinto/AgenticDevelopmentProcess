import { literalCommandTokens, sameLiteralTokens } from "./literal-shell-command.js";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface ConsoleCaptureBinding { directory: string; logPath: string; nativePaths: string[]; nonTest?: boolean; nativeStdout?: boolean }

/** Capture changes only the console destination. Compare decoded literal argv
 * and operators, while preserving AND-list capture scope and descriptor order. */
export function additionalConsoleCapture(actual: string, planned: string, cwd: string, binding: ConsoleCaptureBinding): boolean {
  const expected = literalCommandTokens(planned), recorded = literalCommandTokens(actual);
  if (!expected || !recorded) return false;
  let words = 0, commands = 1;
  for (const token of expected) {
    if (token.kind === "word") words++;
    else if (token.value === "&&" && words) { commands++; words = 0; }
    else return false; // No existing redirects, pipes or changed control flow.
  }
  if (!words) return false;
  const grouped = recorded[0]?.kind === "operator" && recorded[0].value === "(";
  const start = grouped ? 1 : 0, end = start + expected.length;
  if (!sameLiteralTokens(recorded.slice(start, end), expected)) return false;
  if (grouped && (recorded[end]?.kind !== "operator" || recorded[end]?.value !== ")")) return false;
  if (!grouped && commands > 1 && !binding.nonTest) return false;
  const suffix = recorded.slice(end + (grouped ? 1 : 0));
  const [redirect, target, stderr, stdout] = suffix;
  if (redirect?.kind !== "operator" || ![">", "1>"].includes(redirect.value) || target?.kind !== "word" || !target.value) return false;
  if (suffix.length !== 2 && !(suffix.length === 4 && stderr?.kind === "operator" && stderr.value === "2>&" && stdout?.kind === "word" && stdout.value === "1")) return false;
  const directory = resolve(binding.directory), log = resolve(directory, binding.logPath);
  const part = relative(directory, log);
  if (!part || isAbsolute(part) || part === ".." || part.startsWith(`..${sep}`) || !/\.(?:log|txt)$/i.test(log)) return false;
  if (resolve(cwd, target.value) !== log) return false;
  if (!binding.nonTest && !binding.nativePaths.length) return false;
  if (!binding.nativeStdout && binding.nativePaths.some(p => resolve(directory, p) === log)) return false;
  return true;
}
