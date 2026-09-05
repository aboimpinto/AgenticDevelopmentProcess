const CURSOR_VERSION = "runtime-evidence-cursor/v1" as const;

export interface RuntimeEvidenceCursorPosition {
  readonly startedAt: string;
  readonly mode: "direct_host" | "orchestrated";
  readonly executionId: string;
}

/** Encodes and decodes the opaque mixed-mode phase-history cursor. */
export function encodeRuntimeEvidenceCursor(position: RuntimeEvidenceCursorPosition): string {
  return Buffer.from(JSON.stringify({
    schemaVersion: CURSOR_VERSION,
    startedAt: position.startedAt,
    mode: position.mode,
    executionId: position.executionId,
  }), "utf8").toString("base64url");
}

export function decodeRuntimeEvidenceCursor(value: unknown): RuntimeEvidenceCursorPosition | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!record(parsed) || !exact(parsed, ["schemaVersion", "startedAt", "mode", "executionId"])
      || parsed.schemaVersion !== CURSOR_VERSION || !timestamp(parsed.startedAt)
      || (parsed.mode !== "direct_host" && parsed.mode !== "orchestrated") || !text(parsed.executionId, 512)) return null;
    return { startedAt: parsed.startedAt, mode: parsed.mode, executionId: parsed.executionId };
  } catch {
    return null;
  }
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value); }
function timestamp(value: unknown): value is string { if (typeof value !== "string") return false; const date = new Date(value); return !Number.isNaN(date.getTime()) && date.toISOString() === value; }
