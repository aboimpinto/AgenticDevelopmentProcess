import { literalCommandsMatch, literalWordAt } from "./literal-shell-command.js";
import { additionalConsoleCapture, type ConsoleCaptureBinding } from "./receipt-console-capture.js";
/** Compare equivalent cwd presentation and separately bound console capture.
 * Never executes shell text or changes selected tests/native report destinations. */
export function receiptCommandMatches(actual: unknown, planned: string, cwd: string, capture?: ConsoleCaptureBinding): boolean {
  if (typeof actual !== "string") return false;
  const recorded = withoutCwdPrefix(actual.trim(), cwd), expected = withoutCwdPrefix(planned.trim(), cwd);
  return literalCommandsMatch(recorded, expected) || !!capture && additionalConsoleCapture(recorded, expected, cwd, capture);
}

function withoutCwdPrefix(command: string, cwd: string): string {
  const prefix = command.match(/^cd[\t ]+(?:--[\t ]+)?/);
  if (!prefix) return command;
  const word = literalWordAt(command, prefix[0].length);
  if (!word || word.value !== cwd) return command;
  const separator = command.slice(word.end).match(/^[\t ]*&&[\t ]*/);
  return separator ? command.slice(word.end + separator[0].length) : command;
}
