// FEAT-044: Final Verification Runner — Profile Loader And Schema Validator
//
// Loads and validates the project-owned verification profile YAML from
// `.hepha/safety/final-verification-profile.yaml`. Produces typed declarations
// with deterministic error reporting.

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { parse } from "yaml";
import {
  type VerificationCheckDeclaration,
  type VerificationCheckIntent,
  type VerificationProfile,
  type ProfileValidationIssue,
  type ProfileValidationResult,
  REQUIRED_VERIFICATION_INTENTS,
} from "./final-verification-types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Canonical profile file path relative to the project root. */
export const DEFAULT_PROFILE_RELATIVE_PATH = ".hepha/safety/final-verification-profile.yaml";

/** Minimum allowed timeout in milliseconds (10 seconds). */
const MIN_TIMEOUT_MS = 10_000;

const VALID_INTENTS: readonly string[] = REQUIRED_VERIFICATION_INTENTS;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and validate a verification profile from a resolved filesystem path.
 *
 * @param profilePath - Absolute path to the YAML profile file.
 * @returns A validated `ProfileValidationResult`.
 */
export function loadVerificationProfile(profilePath: string): ProfileValidationResult {
  const issues: ProfileValidationIssue[] = [];

  // --- File existence ---
  if (!existsSync(profilePath)) {
    return {
      valid: false,
      profile: null,
      issues: [{ kind: "missing-file", message: `Verification profile not found at ${profilePath}` }],
    };
  }

  // --- Read and parse YAML ---
  let raw: unknown;

  try {
    const content = readFileSync(profilePath, "utf-8");
    raw = parse(content);
  } catch (error) {
    return {
      valid: false,
      profile: null,
      issues: [{
        kind: "invalid-yaml",
        message: `Failed to parse verification profile: ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
  }

  if (typeof raw !== "object" || raw === null) {
    return {
      valid: false,
      profile: null,
      issues: [{ kind: "invalid-yaml", message: "Verification profile must be a YAML mapping (object)." }],
    };
  }

  const doc = raw as Record<string, unknown>;

  // --- Version ---
  const version = typeof doc.version === "string" ? doc.version : "1.0";

  // --- Description ---
  const description = typeof doc.description === "string" ? doc.description : "";

  // --- Checks array ---
  if (!("checks" in doc)) {
    return {
      valid: false,
      profile: null,
      issues: [{ kind: "missing-checks", message: "Verification profile must contain a 'checks' array." }],
    };
  }

  if (!Array.isArray(doc.checks)) {
    return {
      valid: false,
      profile: null,
      issues: [{ kind: "missing-checks", message: "'checks' must be an array." }],
    };
  }

  if (doc.checks.length === 0) {
    return {
      valid: false,
      profile: null,
      issues: [{ kind: "zero-checks", message: "'checks' array is empty. At least one check is required." }],
    };
  }

  // --- Validate each check ---
  const seenIds = new Set<string>();
  const checks: VerificationCheckDeclaration[] = [];
  const coveredIntents = new Set<VerificationCheckIntent>();

  for (let i = 0; i < doc.checks.length; i++) {
    const entry = doc.checks[i];

    if (typeof entry !== "object" || entry === null) {
      issues.push({ kind: "invalid-yaml", message: `Check at index ${i} is not an object.`, checkId: String(i) });
      continue;
    }

    const check = entry as Record<string, unknown>;

    // --- ID ---
    const id = typeof check.id === "string" && check.id.trim().length > 0 ? check.id.trim() : null;

    if (!id) {
      issues.push({ kind: "invalid-yaml", message: `Check at index ${i} has no 'id' or a blank 'id'.`, checkId: String(i) });
      continue;
    }

    if (seenIds.has(id)) {
      issues.push({ kind: "duplicate-check-id", message: `Duplicate check id '${id}'.`, checkId: id });
      continue;
    }

    seenIds.add(id);

    // --- Description ---
    const checkDescription = typeof check.description === "string" ? check.description : "";

    // --- Intent ---
    const intentRaw = typeof check.intent === "string" ? check.intent.toLowerCase() : null;

    if (!intentRaw || !VALID_INTENTS.includes(intentRaw)) {
      issues.push({
        kind: "invalid-intent",
        message: `Check '${id}' has invalid intent '${String(check.intent)}'. Must be one of: ${VALID_INTENTS.join(", ")}.`,
        checkId: id,
      });
      continue;
    }

    const intent = intentRaw as VerificationCheckIntent;

    // --- Command ---
    if (!Array.isArray(check.command) || check.command.length === 0) {
      issues.push({
        kind: "unsafe-command-type",
        message: `Check '${id}' 'command' must be a non-empty array of strings (argv).`,
        checkId: id,
      });
      continue;
    }

    for (const arg of check.command) {
      if (typeof arg !== "string") {
        issues.push({
          kind: "unsafe-command-type",
          message: `Check '${id}' command argument must be a string.`,
          checkId: id,
        });
        continue;
        // Note: we don't skip the outer loop to collect all issues per check.
      }
    }

    // Check if any arg was not a string - skip this check
    if (check.command.some((arg: unknown) => typeof arg !== "string")) {
      continue;
    }

    const command = check.command as string[];

    // --- Working directory ---
    const workingDirectory = typeof check.workingDirectory === "string"
      ? check.workingDirectory.trim()
      : ".";

    if (isAbsolute(workingDirectory)) {
      issues.push({
        kind: "unsafe-working-directory",
        message: `Check '${id}' 'workingDirectory' must be relative to the execution root, not absolute: '${workingDirectory}'.`,
        checkId: id,
      });
      continue;
    }

    // --- Timeout ---
    const timeout = typeof check.timeout === "number" && Number.isFinite(check.timeout) && check.timeout > 0
      ? check.timeout
      : 120_000; // default 2 minutes

    if (timeout < MIN_TIMEOUT_MS) {
      issues.push({
        kind: "timeout-too-low",
        message: `Check '${id}' timeout (${timeout}ms) is below minimum (${MIN_TIMEOUT_MS}ms).`,
        checkId: id,
      });
      continue;
    }

    // --- Required ---
    const required = check.required === true;

    // --- Execution stage ---
    const runAt = check.runAt === undefined ? "always" : check.runAt;
    if (runAt !== "always" && runAt !== "final_checkpoint") {
      issues.push({
        kind: "invalid-run-stage",
        message: `Check '${id}' runAt must be 'always' or 'final_checkpoint'.`,
        checkId: id,
      });
      continue;
    }

    // --- Coverage report contract ---
    const coverage = intent === "coverage"
      ? readCoverageDeclaration(check.coverage, id, issues)
      : undefined;
    if (intent === "coverage" && !coverage) continue;
    if (intent !== "coverage" && check.coverage !== undefined) {
      issues.push({
        kind: "invalid-coverage-contract",
        message: `Check '${id}' may declare coverage only when intent is 'coverage'.`,
        checkId: id,
      });
      continue;
    }

    const declaration: VerificationCheckDeclaration = {
      id,
      description: checkDescription,
      intent,
      command,
      workingDirectory,
      timeout,
      required,
      runAt,
      ...(coverage ? { coverage } : {}),
    };

    checks.push(declaration);

    if (required) {
      coveredIntents.add(intent);
    }
  }

  // --- Required intent coverage ---
  const missingIntents = REQUIRED_VERIFICATION_INTENTS.filter((i) => !coveredIntents.has(i));

  if (missingIntents.length > 0) {
    issues.push({
      kind: "missing-required-intent",
      message: `Profile is missing required intent(s): ${missingIntents.join(", ")}. At least one 'required: true' check must cover each intent.`,
      missingIntents,
    });
  }

  // --- Final result ---
  if (issues.length > 0) {
    return {
      valid: false,
      profile: null,
      issues,
    };
  }

  return {
    valid: true,
    profile: { version, description, checks },
    issues: [],
  };
}

/**
 * Resolve the full profile path from the project root.
 */
export function resolveProfilePath(projectRoot: string): string {
  return resolve(projectRoot, DEFAULT_PROFILE_RELATIVE_PATH);
}

function readCoverageDeclaration(
  raw: unknown,
  checkId: string,
  issues: ProfileValidationIssue[],
): VerificationCheckDeclaration["coverage"] | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    issues.push({ kind: "invalid-coverage-contract", message: `Coverage check '${checkId}' requires a coverage mapping.`, checkId });
    return null;
  }
  const value = raw as Record<string, unknown>;
  const reportPath = typeof value.reportPath === "string" ? value.reportPath.trim().replaceAll("\\", "/") : "";
  const include = readStringArray(value.include);
  const exclude = value.exclude === undefined ? [] : readStringArray(value.exclude);
  const minimumPercent = value.minimumPercent;
  const targetPercent = value.targetPercent;
  const improvementAttempts = value.improvementAttempts ?? 5;
  const invalid = !reportPath || isAbsolute(reportPath) || reportPath.split("/").includes("..")
    || value.format !== "lcov" || !include || include.length === 0 || !exclude
    || typeof minimumPercent !== "number" || !Number.isFinite(minimumPercent)
    || typeof targetPercent !== "number" || !Number.isFinite(targetPercent)
    || !Number.isInteger(improvementAttempts)
    || (improvementAttempts as number) < 0 || (improvementAttempts as number) > 7
    || minimumPercent < 0 || minimumPercent > 100
    || targetPercent < minimumPercent || targetPercent > 100;
  if (invalid) {
    issues.push({
      kind: "invalid-coverage-contract",
      message: `Coverage check '${checkId}' requires a relative LCOV reportPath, non-empty include globs, optional exclude globs, 0-100 thresholds where targetPercent is not below minimumPercent, and optional 0-7 FEAT-scoped improvementAttempts (default 5).`,
      checkId,
    });
    return null;
  }
  return {
    reportPath,
    format: "lcov",
    include,
    exclude,
    minimumPercent,
    targetPercent,
    improvementAttempts: improvementAttempts as number,
  };
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) return null;
  return value.map((entry) => (entry as string).trim().replaceAll("\\", "/"));
}
