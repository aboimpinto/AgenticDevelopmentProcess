import type { DatabaseSync } from "node:sqlite";
import type { ReviewSafeIncidentInput } from "./contracts.js";
import { scanSafeContent } from "./content-safety.js";

const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_INCIDENT_LABEL_LENGTH = 128;
const ALLOWED_KEYS = [
  "incidentId",
  "projectId",
  "stage",
  "incidentCode",
  "createdAt",
  "featureId",
  "phaseNumber",
  "reviewGateId",
  "contentHash",
] as const;
const REQUIRED_KEYS = ["incidentId", "projectId", "stage", "incidentCode", "createdAt"] as const;

function rejectInput(): never {
  throw new Error("INVALID_INPUT");
}

function assertSafeIdentifier(value: unknown, maximum = MAX_IDENTIFIER_LENGTH): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) rejectInput();
  try {
    scanSafeContent(value);
  } catch {
    rejectInput();
  }
}

function assertUtcTimestamp(value: unknown): asserts value is string {
  if (typeof value !== "string") rejectInput();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]00:00)$/.exec(value);
  if (!match) rejectInput();
  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const second = Number(rawSecond);
  if (year < 2000 || year > 2099 || month < 1 || month > 12) rejectInput();
  const days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const maximumDay = month === 2 && leap ? 29 : days[month];
  if (day < 1 || day > maximumDay || hour > 23 || minute > 59 || second > 59) rejectInput();
}

export function validateSafeIncidentInput(input: unknown): ReviewSafeIncidentInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) rejectInput();
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_KEYS.includes(key as typeof ALLOWED_KEYS[number]))) {
    rejectInput();
  }
  if (REQUIRED_KEYS.some((key) => !(key in record))) rejectInput();

  assertSafeIdentifier(record.incidentId);
  assertSafeIdentifier(record.projectId);
  assertSafeIdentifier(record.stage, MAX_INCIDENT_LABEL_LENGTH);
  assertSafeIdentifier(record.incidentCode, MAX_INCIDENT_LABEL_LENGTH);
  assertUtcTimestamp(record.createdAt);

  if ("featureId" in record) assertSafeIdentifier(record.featureId);
  if ("phaseNumber" in record) {
    if (typeof record.phaseNumber !== "number" || !Number.isInteger(record.phaseNumber) || record.phaseNumber < 0) {
      rejectInput();
    }
  }
  if ("reviewGateId" in record) assertSafeIdentifier(record.reviewGateId);
  if ("contentHash" in record && (typeof record.contentHash !== "string" || !SHA256_HEX_RE.test(record.contentHash))) {
    rejectInput();
  }
  return input as ReviewSafeIncidentInput;
}

/** Append-only persistence for secret-safe incident metadata. */
export class ReviewSafeIncidentRepository {
  constructor(private readonly database: DatabaseSync) {}

  record(rawInput: unknown): void {
    const input = validateSafeIncidentInput(rawInput);
    try {
      this.database.prepare(
        `insert into hepha_review_safe_incidents
         (incident_id, project_id, feature_id, phase_number, review_gate_id,
          stage, incident_code, content_hash, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.incidentId,
        input.projectId,
        input.featureId ?? null,
        input.phaseNumber ?? null,
        input.reviewGateId ?? null,
        input.stage,
        input.incidentCode,
        input.contentHash ?? null,
        input.createdAt,
      );
    } catch {
      throw new Error("PERSISTENCE_FAILED");
    }
  }
}
