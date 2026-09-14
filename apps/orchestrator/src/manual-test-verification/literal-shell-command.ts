/** Conservative POSIX/Bash literal syntax comparison. No shell is executed and
 * no expansion is guessed. Unsupported syntax retains exact-text comparison. */
export interface LiteralShellToken {
  kind: "word" | "operator";
  value: string;
  assignment?: boolean;
}

export function literalWordAt(source: string, start: number): { value: string; end: number } | null {
  let value = "", quote = "", i = start, present = false;
  for (; i < source.length; i++) {
    const c = source[i]!;
    if (/[\r\n\0]/.test(c)) return null;
    if (quote === "'") { if (c === "'") quote = ""; else value += c; continue; }
    if (c === "\\" && source[i + 1] === "\n") { i++; continue; }
    if (quote === '"') {
      if (c === '"') quote = "";
      else if (c === "$" || c === "`") return null;
      else if (c === "\\" && /["$`\\]/.test(source[i + 1] ?? "")) value += source[++i];
      else value += c;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; present = true; continue; }
    if (c === "\\") {
      const next = source[++i]; if (!next || /[\r\n\0]/.test(next)) return null;
      value += next; present = true; continue;
    }
    if (/[\t ;&|<>()]/.test(c)) break;
    if (/[$`*?\[\]{}~#]/.test(c)) return null;
    value += c; present = true;
  }
  return quote || !present ? null : { value, end: i };
}

export function literalCommandTokens(source: string): LiteralShellToken[] | null {
  const tokens: LiteralShellToken[] = [];
  let i = 0, commandStart = true, redirectTarget = false;
  while (i < source.length) {
    if (/[\t ]/.test(source[i]!)) { i++; continue; }
    if (source.slice(i, i + 2) === "\\\n") { i += 2; continue; }
    // Preserve descriptor adjacency: `2>file` redirects stderr; `2 >file`
    // instead passes an argument and redirects stdout. Heredocs are unsupported.
    const operator = source.slice(i).match(/^(?:\d*(?:>>|>\||>&|<&|>|<(?!<))|&&|\|\||&>>|&>|\|&|;;&|;;|;&|\(\(|\)\)|[;|&()])/);
    if (operator) {
      const value = operator[0];
      if (["((", "))", ";;", ";&", ";;&"].includes(value)) return null;
      tokens.push({ kind: "operator", value });
      redirectTarget = /^(?:\d*[<>]|&>)/.test(value);
      if (!redirectTarget) commandStart = value !== ")";
      i += value.length; continue;
    }
    const word = literalWordAt(source, i);
    if (!word) return null;
    // Reserved words and shell grammar are not ordinary argv. Quoting these
    // can change syntax; do not claim equivalence for compound shell programs.
    if (/^(?:if|then|else|elif|fi|do|done|case|esac|while|until|for|in|function|select|time|coproc|!)$/.test(word.value)) return null;
    // NAME=value is special only before the executable, not in a filter or
    // another argument. Quoting the entire leading assignment makes it argv.
    const assignment = commandStart && !redirectTarget && /^[A-Za-z_][A-Za-z_\d]*\+?=/.test(source.slice(i, word.end));
    tokens.push({ kind: "word", value: word.value, assignment });
    if (!redirectTarget && !assignment) commandStart = false;
    redirectTarget = false;
    i = word.end;
  }
  return tokens.length ? tokens : null;
}

export function sameLiteralTokens(left: LiteralShellToken[], right: LiteralShellToken[]): boolean {
  return left.length === right.length && left.every((t, i) => t.kind === right[i]!.kind && t.value === right[i]!.value && t.assignment === right[i]!.assignment);
}

export function literalCommandsMatch(left: string, right: string): boolean {
  if (left === right) return true;
  const a = literalCommandTokens(left), b = literalCommandTokens(right);
  return !!a && !!b && sameLiteralTokens(a, b);
}
