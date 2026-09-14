import { resolve } from "node:path";
import type { PiJsonEvent } from "../runtime/pi/pi-event-parser.js";
type Check = { id: string; kind?: string; cwd: string; command: string };
export type ExecutionActivity = { stage: "testing" | "checking" | "waiting"; label: string; checkId?: string };

/** Observe tool lifecycles, never infer passes from activity. Literal wrapper recognition is display-only;
 * it never evaluates shell text or establishes a passing result. */
export class VerificationExecutionActivity {
  private readonly active = new Map<string, Check>();
  readonly completedCheckIds = new Set<string>();
  constructor(private readonly checks: readonly Check[], private readonly cwd: string) {}
  observe(event: PiJsonEvent): ExecutionActivity | null {
    if (event.toolName !== "bash" || typeof event.toolCallId !== "string") return null;
    if (event.type === "tool_execution_start") {
      const command = (event.args as { command?: unknown } | undefined)?.command;
      if (typeof command !== "string") return null;
      const matching = this.checks.filter(check => matchesInvocation(command, check, this.cwd));
      if (matching.length !== 1) return null;
      this.active.set(event.toolCallId, matching[0]!);
    } else if (event.type === "tool_execution_end") {
      const check = this.active.get(event.toolCallId);
      if (!check) return null;
      this.active.delete(event.toolCallId);
      this.completedCheckIds.add(check.id); // completed attempt, NOT a pass
    } else return null;
    const checks = [...this.active.values()];
    const check = checks.find(c => !c.kind || c.kind === "test") ?? checks[0];
    if (!check) return { stage: "waiting", label: "Preparing next verification check" };
    const testing = !check.kind || check.kind === "test";
    return { stage: testing ? "testing" : "checking", label: testing ? "Running relevant tests" : "Running supporting checks", checkId: check.id };
  }
}

function matchesInvocation(actual: string, check: Check, initialCwd: string) {
  let remaining = actual.trim(), cwd = resolve(initialCwd);
  const planned = check.command.trim();
  const variables = new Map<string, string>();
  const expand = (text: string) => text.replace(/\$\{([A-Za-z_]\w*)\}|\$([A-Za-z_]\w*)/g, (whole, braced, plain) => variables.get(braced ?? plain) ?? whole);
  for (let i = 0; i < 16; i++) {
    if (cwd === resolve(check.cwd) && remaining.startsWith(planned)
      && (remaining.length === planned.length || /^[\t ]*[;\n]/.test(remaining.slice(planned.length)))) return true;
    const first = firstStatement(remaining);
    if (!first) return false;
    const assignment = first.text.match(/^(?:export\s+)?([A-Za-z_]\w*)=(?:"([^"$`]+)"|'([^']+)'|([^\s"'$`]+))$/);
    if (assignment && [";", "\n"].includes(first.operator)) variables.set(assignment[1]!, assignment[2] ?? assignment[3] ?? assignment[4]!);
    else if (first.operator === "&&" && /^cd\s+/.test(first.text)) {
      const path = expand(first.text).match(/^cd\s+(?:"([^"$`]+)"|'([^']+)'|([^\s"'$`]+))$/);
      if (!path) return false;
      cwd = resolve(cwd, path[1] ?? path[2] ?? path[3]!);
    } else if (![";", "\n"].includes(first.operator) || !/^(?:date|echo|printf|mkdir\s+-p)(?:\s|$)/.test(first.text)
      || /\$\(|`/.test(first.text)) return false;
    remaining = expand(first.rest.trim());
  }
  return false;
}

function firstStatement(command: string) {
  let quote = "", escaped = false;
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (escaped) { escaped = false; continue; }
    if (c === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) { if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (";\n&|".includes(c)) {
      const operator = command.slice(i, i + 2) === "&&" ? "&&" : c;
      return { text: command.slice(0, i).trim(), operator, rest: command.slice(i + operator.length) };
    }
  }
  return null;
}
