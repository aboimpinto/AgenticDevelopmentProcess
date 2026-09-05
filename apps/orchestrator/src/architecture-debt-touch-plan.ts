import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const ARCHITECTURE_DEBT_TOUCH_PLAN_FILE = "ArchitectureDebtTouchPlan.json";

export interface ArchitectureDebtTouchPlanV1 {
  readonly schemaVersion: "hepha-architecture-debt-touch-plan/v1";
  readonly projectId: string;
  readonly featureId: string;
  readonly paths: readonly string[];
  readonly symbols: readonly { readonly relativePath: string; readonly symbol: string }[];
  readonly ruleTags: readonly string[];
}

export type ArchitectureDebtTouchPlanValidation =
  | { readonly kind: "valid"; readonly plan: ArchitectureDebtTouchPlanV1; readonly touchPlanHash: string }
  | { readonly kind: "refusal"; readonly code: "touch_plan_invalid"; readonly message: string };

export type LoadedArchitectureDebtTouchPlan =
  | ArchitectureDebtTouchPlanValidation
  | { readonly kind: "missing" };

const SECRET_LIKE = [
  /(?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*\S+/i,
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/,
  /sk-[A-Za-z0-9_-]{12,}/,
];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function text(value: unknown, max = 4096): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= max
    && !value.includes("\0")
    && !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)
    && !SECRET_LIKE.some((entry) => entry.test(value));
}

function identifier(value: unknown, max = 256): value is string {
  return text(value, max);
}

function relativePath(value: unknown): value is string {
  return text(value, 1024)
    && !value.includes("\\")
    && !value.startsWith("/")
    && !/^[A-Za-z]:/.test(value)
    && !value.split("/").some((part) => !part || part === "." || part === "..");
}

function sortedUnique(values: readonly string[]): boolean {
  return values.every((entry, index) => index === 0 || values[index - 1] < entry);
}

function stringList(
  value: unknown,
  item: (entry: unknown) => entry is string = (entry): entry is string => text(entry),
): value is readonly string[] {
  return Array.isArray(value)
    && value.length <= 128
    && value.every(item)
    && sortedUnique(value as readonly string[]);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (record(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function refusal(): Extract<ArchitectureDebtTouchPlanValidation, { kind: "refusal" }> {
  return {
    kind: "refusal",
    code: "touch_plan_invalid",
    message: "ArchitectureDebtTouchPlan.json is not a valid V1 structured touch plan.",
  };
}

function validPlan(value: unknown): value is ArchitectureDebtTouchPlanV1 {
  if (!record(value)
    || !exactKeys(value, ["schemaVersion", "projectId", "featureId", "paths", "symbols", "ruleTags"])
    || value.schemaVersion !== "hepha-architecture-debt-touch-plan/v1"
    || !identifier(value.projectId)
    || !identifier(value.featureId)
    || !stringList(value.paths, relativePath)
    || !stringList(value.ruleTags)) {
    return false;
  }

  if (!Array.isArray(value.symbols) || value.symbols.length > 128) return false;
  const pairs: string[] = [];
  for (const entry of value.symbols) {
    if (!record(entry)
      || !exactKeys(entry, ["relativePath", "symbol"])
      || !relativePath(entry.relativePath)
      || !identifier(entry.symbol)) {
      return false;
    }
    pairs.push(`${entry.relativePath}\0${entry.symbol}`);
  }

  return value.paths.length + value.symbols.length + value.ruleTags.length > 0 && sortedUnique(pairs);
}

/** Validate the canonical refinement-time touch plan and return its stable hash. */
export function validateArchitectureDebtTouchPlan(rawInput: unknown): ArchitectureDebtTouchPlanValidation {
  if (!validPlan(rawInput)) return refusal();
  return {
    kind: "valid",
    plan: rawInput,
    touchPlanHash: createHash("sha256").update(canonicalJson(rawInput), "utf8").digest("hex"),
  };
}

/** Load only the canonical direct-child plan file from a resolved FEAT folder. */
export function loadArchitectureDebtTouchPlan(featureFolderPath: unknown): LoadedArchitectureDebtTouchPlan {
  if (!identifier(featureFolderPath, 4096)) return { kind: "missing" };
  const planPath = resolve(featureFolderPath, ARCHITECTURE_DEBT_TOUCH_PLAN_FILE);
  if (!existsSync(planPath)) return { kind: "missing" };
  try {
    const raw = JSON.parse(
      readFileSync(planPath, "utf8"),
    ) as unknown;
    return validateArchitectureDebtTouchPlan(raw);
  } catch {
    return refusal();
  }
}
