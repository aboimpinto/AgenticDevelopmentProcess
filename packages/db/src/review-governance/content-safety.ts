/**
 * Defense-in-depth patterns for secret-like assignments and credential forms.
 * Benign identifier words remain valid unless they carry an assigned value.
 */
const SECRET_LIKE_PATTERNS: readonly RegExp[] = [
  /(?:["']?(?:api[_-]?key|apikey|secret[_-]?key|secretkey|access[_-]?key|password|passwd|pwd|token|auth[_-]?token|bearer|jwt|private[_-]?key)["']?)\s*(?:=|:)\s*(?:["']?\s*)?\S+/i,
  /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH|PGP)\s+PRIVATE\s+KEY-----/i,
  /(?:ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9]{36,}/,
  /sk-[a-zA-Z0-9]{20,}(?:[A-Za-z0-9]{10,})?/,
  /(?:AKIA[0-9A-Z]{16})(?:[A-Za-z0-9+/]{40})/,
];

function scanSafeStringValue(content: string): void {
  if (content.includes("\0")) throw new Error("SECURITY_VIOLATION");

  for (let index = 0; index < content.length; index++) {
    const code = content.charCodeAt(index);
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      throw new Error("SECURITY_VIOLATION");
    }
  }

  for (let index = 0; index < content.length; index++) {
    const code = content.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = content.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("SECURITY_VIOLATION");
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error("SECURITY_VIOLATION");
    }
  }

  if (content.includes("\x1b")) throw new Error("SECURITY_VIOLATION");
  if (SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(content))) {
    throw new Error("SECURITY_VIOLATION");
  }
}

/** Reject unsafe transport text before hashing or persistence. */
export function scanSafeContent(content: string): void {
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("SECURITY_VIOLATION");
  }
  scanSafeStringValue(content);
}

/** Reject unsafe decoded JSON string values, including escaped transport bytes. */
export function scanSafeParsedStringValues(value: unknown): void {
  if (typeof value === "string") {
    scanSafeStringValue(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) scanSafeParsedStringValues(item);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) scanSafeParsedStringValues(item);
  }
}
