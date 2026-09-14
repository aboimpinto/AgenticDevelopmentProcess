import { duplicateDecisionKey } from "./duplicate-json-key.js";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";

export interface ExchangeDiagnostic { category: "protocol" | "audit" | "evidence"; path: string; message: string }
export interface JsonExchange<T> {
  schemaVersion: "hepha-exchange/v1";
  kind: string;
  payload: T;
  audit?: Record<string, string | number>;
}
export type ExchangeResult<T> = { valid: true; value: JsonExchange<T>; diagnostics: ExchangeDiagnostic[] }
  | { valid: false; diagnostics: ExchangeDiagnostic[] };

export function readExchangeSchema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`../../../../.hepha/schemas/${name}.schema.json`, import.meta.url), "utf8"));
}

/** One schema supplies both validation and the exact sender contract. Kind-specific
 * semantic validators still own evidence and authority after shape validation. */
export function createJsonExchangeProtocol<T>(kind: string, payloadSchema: Record<string, unknown>) {
  const base = readExchangeSchema("exchange-envelope-v1");
  const { $schema: _version, ...payload } = payloadSchema;
  const schema = { ...base, properties: { ...(base.properties as object), kind: { const: kind }, payload } };
  const validate = new Ajv2020({ allErrors: true, strict: true, ownProperties: true }).compile(schema);
  return {
    schema,
    renderContract: () => JSON.stringify(schema, null, 2),
    decode(raw: string): ExchangeResult<T> {
      if (Buffer.byteLength(raw, "utf8") > 2_000_000) return invalid("", "Message exceeds the protocol size limit.");
      let value: unknown;
      try { value = JSON.parse(raw); } catch { return invalid("", "Expected one JSON object, without prose or Markdown fences."); }
      const duplicate = duplicateDecisionKey(raw);
      if (duplicate !== null) return invalid("", `Duplicate JSON decision key: ${duplicate}`);
      if (!validate(value)) return { valid: false, diagnostics: (validate.errors ?? []).map(error => ({
        category: "protocol", path: error.instancePath, message: `${error.message ?? "Invalid field"} ${JSON.stringify(error.params)}`,
      })) };
      const message = value as JsonExchange<T>;
      const diagnostics: ExchangeDiagnostic[] = [];
      const audit = normalizeAudit(message.audit, diagnostics);
      return { valid: true, value: { schemaVersion: "hepha-exchange/v1", kind, payload: message.payload, ...(audit ? { audit } : {}) }, diagnostics };
    },
    encode(payload: T, audit?: unknown): string {
      const raw = JSON.stringify({ schemaVersion: "hepha-exchange/v1", kind, payload, ...(audit === undefined ? {} : { audit }) });
      const parsed = this.decode(raw);
      if (!parsed.valid) throw new Error(`EXCHANGE_PROTOCOL_INVALID: ${JSON.stringify(parsed.diagnostics)}`);
      return JSON.stringify(parsed.value, null, 2);
    },
  };
}

function invalid(path: string, message: string): ExchangeResult<never> {
  return { valid: false, diagnostics: [{ category: "protocol", path, message }] };
}

function normalizeAudit(value: unknown, diagnostics: ExchangeDiagnostic[]): Record<string, string | number> | undefined {
  if (value === undefined || value === null) return undefined;
  const note = (path: string) => diagnostics.push({ category: "audit", path, message: "Unusable optional audit metadata omitted; execution decision unchanged." });
  if (typeof value !== "object" || Array.isArray(value)) { note("/audit"); return undefined; }
  const audit: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (["runId", "model", "summary", "testExecutionTimestamp"].includes(key) && typeof entry === "string" && entry.trim()
      && (key !== "testExecutionTimestamp" || (/^\d{4}-\d{2}-\d{2}T/.test(entry) && Number.isFinite(Date.parse(entry))))) {
      audit[key] = entry;
    } else if (key === "durationMs" && typeof entry === "number" && Number.isFinite(entry) && entry >= 0) audit[key] = entry;
    else note(`/audit/${key}`);
  }
  return Object.keys(audit).length ? audit : undefined;
}
