import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const MANUAL_TEST_OBLIGATIONS_FILE = "ManualTestObligations.json";
export const MANUAL_TEST_OBLIGATIONS_SCHEMA = "hepha-manual-test-obligations/v1" as const;
export const MANUAL_TEST_DEFERRAL_SCHEMA = "hepha-manual-test-deferral/v1" as const;
export const MANUAL_TEST_DEFERRAL_MARKER = "HEPHA_MANUAL_TEST_DEFERRAL_V1 ";
export const MANUAL_TEST_SKIP_REASON = "This test cannot be automated and the user needs to test it manually.";

export interface ManualTestObligation {
  readonly id: string;
  readonly title: string;
  readonly reason: string;
  readonly phaseNumber: number;
  readonly taskId: string;
  readonly preconditions: readonly string[];
  readonly steps: readonly string[];
  readonly expectedResult: string;
  readonly evidenceRequirements: readonly string[];
  readonly status: "PENDING";
}

export interface ManualTestDeferralV1 extends Omit<ManualTestObligation, "status"> {
  readonly schemaVersion: typeof MANUAL_TEST_DEFERRAL_SCHEMA;
}

export interface ManualTestObligationsV1 {
  readonly schemaVersion: typeof MANUAL_TEST_OBLIGATIONS_SCHEMA;
  readonly featureId: string;
  readonly obligations: readonly ManualTestObligation[];
}

/** Parses fail-closed, one-line task deferral receipts emitted by a phase worker. */
export function parseManualTestDeferrals(output: string): readonly ManualTestDeferralV1[] {
  return Object.freeze(output.split(/\r?\n/).flatMap((line) => {
    const markerIndex = line.indexOf(MANUAL_TEST_DEFERRAL_MARKER);
    if (markerIndex < 0) return [];
    const raw = line.slice(markerIndex + MANUAL_TEST_DEFERRAL_MARKER.length).trim();
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("MANUAL_TEST_DEFERRAL_INVALID: receipt must contain one-line valid JSON.");
    }
    return [toDeferral(value)];
  }));
}

export function encodeManualTestDeferralSummary(deferral: ManualTestDeferralV1): string {
  return `${MANUAL_TEST_DEFERRAL_MARKER}${JSON.stringify(deferral)}`;
}

export function readManualTestObligations(featureFolderPath: string): ManualTestObligationsV1 | null {
  const path = resolve(featureFolderPath, MANUAL_TEST_OBLIGATIONS_FILE);
  if (!existsSync(path)) return null;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${MANUAL_TEST_OBLIGATIONS_FILE} must contain valid JSON.`);
  }
  return toObligations(value);
}

/** HEPHA-owned durable projection used by Refine and implementation recovery. */
export function persistManualTestObligation(
  featureFolderPath: string,
  featureId: string,
  deferral: ManualTestDeferralV1,
): ManualTestObligationsV1 {
  const current = readManualTestObligations(featureFolderPath);
  if (current && current.featureId !== featureId) {
    throw new Error(`${MANUAL_TEST_OBLIGATIONS_FILE} featureId does not match ${featureId}.`);
  }
  const obligation = Object.freeze({
    id: deferral.id,
    title: deferral.title,
    reason: deferral.reason,
    phaseNumber: deferral.phaseNumber,
    taskId: deferral.taskId,
    preconditions: deferral.preconditions,
    steps: deferral.steps,
    expectedResult: deferral.expectedResult,
    evidenceRequirements: deferral.evidenceRequirements,
    status: "PENDING" as const,
  });
  const byId = new Map((current?.obligations ?? []).map((item) => [item.id, item]));
  byId.set(obligation.id, obligation);
  const document = Object.freeze({
    schemaVersion: MANUAL_TEST_OBLIGATIONS_SCHEMA,
    featureId,
    obligations: Object.freeze([...byId.values()].sort((a, b) => a.id.localeCompare(b.id))),
  });
  writeFileSync(
    resolve(featureFolderPath, MANUAL_TEST_OBLIGATIONS_FILE),
    `${JSON.stringify(document, null, 2)}\n`,
    "utf8",
  );
  return document;
}

function toDeferral(value: unknown): ManualTestDeferralV1 {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "id", "title", "reason", "phaseNumber", "taskId",
    "preconditions", "steps", "expectedResult", "evidenceRequirements",
  ]) || value.schemaVersion !== MANUAL_TEST_DEFERRAL_SCHEMA || !isIdentifier(value.id)
    || !isText(value.title) || value.reason !== MANUAL_TEST_SKIP_REASON || !Number.isInteger(value.phaseNumber)
    || (value.phaseNumber as number) < 0 || !isIdentifier(value.taskId)
    || !isTextArray(value.preconditions) || !isTextArray(value.steps)
    || value.steps.length === 0 || !isText(value.expectedResult)
    || !isTextArray(value.evidenceRequirements) || value.evidenceRequirements.length === 0) {
    throw new Error("MANUAL_TEST_DEFERRAL_INVALID: receipt fields are missing, unknown, or invalid.");
  }
  return Object.freeze({
    schemaVersion: MANUAL_TEST_DEFERRAL_SCHEMA,
    id: value.id,
    title: value.title,
    reason: value.reason,
    phaseNumber: value.phaseNumber,
    taskId: value.taskId,
    preconditions: Object.freeze([...value.preconditions]),
    steps: Object.freeze([...value.steps]),
    expectedResult: value.expectedResult,
    evidenceRequirements: Object.freeze([...value.evidenceRequirements]),
  });
}

function toObligations(value: unknown): ManualTestObligationsV1 {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "featureId", "obligations"])
    || value.schemaVersion !== MANUAL_TEST_OBLIGATIONS_SCHEMA || !isIdentifier(value.featureId)
    || !Array.isArray(value.obligations)) {
    throw new Error(`${MANUAL_TEST_OBLIGATIONS_FILE} has an invalid contract.`);
  }
  const obligations = value.obligations.map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, [
      "id", "title", "reason", "phaseNumber", "taskId", "preconditions",
      "steps", "expectedResult", "evidenceRequirements", "status",
    ]) || item.status !== "PENDING") {
      throw new Error(`${MANUAL_TEST_OBLIGATIONS_FILE} contains an invalid obligation.`);
    }
    const deferral = toDeferral({
      schemaVersion: MANUAL_TEST_DEFERRAL_SCHEMA,
      id: item.id,
      title: item.title,
      reason: item.reason,
      phaseNumber: item.phaseNumber,
      taskId: item.taskId,
      preconditions: item.preconditions,
      steps: item.steps,
      expectedResult: item.expectedResult,
      evidenceRequirements: item.evidenceRequirements,
    });
    return Object.freeze({
      id: deferral.id,
      title: deferral.title,
      reason: deferral.reason,
      phaseNumber: deferral.phaseNumber,
      taskId: deferral.taskId,
      preconditions: deferral.preconditions,
      steps: deferral.steps,
      expectedResult: deferral.expectedResult,
      evidenceRequirements: deferral.evidenceRequirements,
      status: "PENDING" as const,
    });
  });
  return Object.freeze({
    schemaVersion: MANUAL_TEST_OBLIGATIONS_SCHEMA,
    featureId: value.featureId,
    obligations: Object.freeze(obligations),
  });
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}
function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 4_000;
}
function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
}
function isTextArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 && value.every(isText);
}
