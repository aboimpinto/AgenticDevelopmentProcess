function splitShellCommandSegments(command: string) {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  const pushSegment = () => {
    segments.push(current);
    current = "";
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? "";
    const next = command[index + 1] ?? "";

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === "\r" || char === "\n" || char === ";") {
      pushSegment();
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      continue;
    }

    if ((char === "&" && next === "&") || (char === "|" && next === "|")) {
      pushSegment();
      index += 1;
      continue;
    }

    if (char === "|") {
      pushSegment();
      continue;
    }

    current += char;
  }

  pushSegment();
  return segments;
}

function tokenizeShellWords(segment: string) {
  const tokens: string[] = [];
  const pattern = /"[^"]*"|'[^']*'|[^\s]+/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(segment)) !== null) {
    tokens.push(match[0]);
  }

  return tokens;
}

function normalizeShellToken(token: string) {
  const trimmed = token.trim().replace(/^[({]+/, "").replace(/[)}]+$/, "");
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  const normalized = unquoted.replace(/\\ /g, " ");
  const parts = normalized.split(/[\\/]/);

  return parts[parts.length - 1] ?? normalized;
}

function isShellAssignment(token: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function skipOptionTokens(tokens: string[], startIndex: number) {
  let index = startIndex;

  while (index < tokens.length && tokens[index]?.startsWith("-")) {
    index += 1;
  }

  return index;
}

function extractShellCommandExecutable(segment: string) {
  const tokens = tokenizeShellWords(segment);
  let index = 0;

  while (index < tokens.length && isShellAssignment(tokens[index] ?? "")) {
    index += 1;
  }

  while (index < tokens.length) {
    const executable = normalizeShellToken(tokens[index] ?? "").toLowerCase();

    if (executable === "command" || executable === "builtin" || executable === "time") {
      index += 1;
      index = skipOptionTokens(tokens, index);
    } else if (executable === "env") {
      index += 1;
      index = skipOptionTokens(tokens, index);
      while (index < tokens.length && isShellAssignment(tokens[index] ?? "")) {
        index += 1;
      }
    } else if (executable === "timeout") {
      index += 1;
      index = skipOptionTokens(tokens, index);
      if (index < tokens.length) {
        index += 1;
      }
    } else {
      return executable;
    }

    while (index < tokens.length && isShellAssignment(tokens[index] ?? "")) {
      index += 1;
    }
  }

  return "";
}

export function countCargoInvocations(command: string) {
  return splitShellCommandSegments(command).reduce((count, segment) => {
    const executable = extractShellCommandExecutable(segment);

    return /^cargo(?:\.exe)?$/i.test(executable) ? count + 1 : count;
  }, 0);
}

/** Detects Cargo placed in a shell background job (`&`), excluding redirections such as `2>&1`. */
export function hasBackgroundedCargoInvocation(command: string): boolean {
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? "";
    const previous = command[index - 1] ?? "";
    const next = command[index + 1] ?? "";

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === "&" && next === "&") {
      current += "&&";
      index += 1;
      continue;
    }

    const isBackgroundOperator = char === "&" && previous !== ">";
    if (isBackgroundOperator) {
      if (countCargoInvocations(current) > 0) return true;
      current = "";
      continue;
    }

    current += char;
  }

  return false;
}
