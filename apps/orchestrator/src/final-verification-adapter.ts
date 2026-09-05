// FEAT-044: Final Verification Runner — I/O Adapter
//
// Loads the validated profile, resolves the active FEAT execution root,
// applies the command-policy evaluator, launches one check at a time,
// measures duration, records evidence, and returns a structured aggregate result.
//
// This is the I/O boundary. Pure logic lives in final-verification-policy.ts.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { loadVerificationProfile, resolveProfilePath } from "./final-verification-profile-loader.js";
import {
  classifyOutcome,
  detectsZeroTestSelection,
  buildAggregateResult,
  normalizeCoverageOutcome,
  shouldSuppressNextRequiredCheck,
  selectChecksForCheckpoint,
} from "./final-verification-policy.js";
import { buildVerificationPresentation, buildBlockedPresentation } from "./final-verification-presentation.js";
import { safeOutputSummary } from "./final-verification-presentation.js";
import type {
  CheckResult,
  CheckOutcome,
  AggregateVerificationResult,
  VerificationCheckDeclaration,
} from "./final-verification-types.js";
import { evaluateCoverageReport, selectCoverageBaseline } from "./test-coverage-telemetry.js";
import { serializeTestCoverageMeasurement } from "./test-coverage-receipt.js";

import type {
  CardMetadataStore,
  FinalVerificationRunRecord,
  FinalVerificationCheckRecord,
} from "@hepha/db";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Minimum timeout for any check (10 seconds).
 */
const MIN_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Adapter result types
// ---------------------------------------------------------------------------

export interface AdapterRunOptions {
  projectRoot: string;
  projectId: string;
  cardKey: string;
  workflowRunId: string;
  store: CardMetadataStore;
  checkpointKind?: "phase" | "final_checkpoint";
}

export interface AdapterResult {
  aggregate: AggregateVerificationResult;
  summaryLine: string;
  persistenceWarning: string | null;
}

export interface FeatureWorkflowInput {
  project: { rootPath: string; id: string };
  feature: { cardKey: string; externalId: string; title: string };
  runId: string;
  phaseRole?: string;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Run final verification using the configured profile.
 *
 * Steps:
 * 1. Resolve and validate the profile.
 * 2. For each check, validate via command policy and execute.
 * 3. Aggregate results.
 * 4. Persist evidence (best-effort, non-blocking).
 * 5. Return the aggregate result.
 */
export async function runFinalVerification(
  options: AdapterRunOptions,
): Promise<AdapterResult> {
  const { projectRoot } = options;
  const profilePath = resolveProfilePath(projectRoot);
  const startedAt = new Date().toISOString();

  // --- Step 1: Load and validate profile ---
  const validationResult = loadVerificationProfile(profilePath);

  if (!validationResult.valid || !validationResult.profile) {
    const firstIssue = validationResult.issues[0];
    const reason = firstIssue
      ? `${firstIssue.kind}: ${firstIssue.message}`
      : "Unknown profile validation error";

    const presentation = buildBlockedPresentation(reason);

    // Persist a blocked run record
    await persistRunRecord(options, {
      id: randomUUID(),
      projectId: options.projectId,
      cardKey: options.cardKey,
      workflowRunId: options.workflowRunId,
      executionRoot: projectRoot,
      aggregateStatus: "blocked",
      blockedReason: reason,
      persistenceWarning: null,
      duration: 0,
      startedAt,
      completedAt: new Date().toISOString(),
    }).catch(() => {
      // Non-blocking persistence failure
    });

    return {
      aggregate: {
        status: "blocked",
        failedRequiredChecks: [],
        blockedReason: reason,
        persistenceWarning: null,
        checks: [],
        duration: 0,
        startedAt,
      },
      summaryLine: presentation.line,
      persistenceWarning: null,
    };
  }

  const profile = validationResult.profile;
  const checkpointKind = options.checkpointKind ?? "final_checkpoint";
  const checks = selectChecksForCheckpoint(profile.checks, checkpointKind);
  const startTransitions = profile.checks.some((check) => check.intent === "coverage")
    ? await options.store.listStartTransitions(options.cardKey, options.projectId).catch(() => [])
    : [];
  const coverageBaseline = selectCoverageBaseline(startTransitions);

  // --- Step 2: Execute checks serially ---
  const checkResults: CheckResult[] = [];
  let persistWarning: string | null = null;

  for (const check of checks) {
    const checkStartedAt = new Date().toISOString();
    const workingDir = resolve(projectRoot, check.workingDirectory);

    // Verify working directory exists
    if (!existsSync(workingDir)) {
      const unavailableCoverage = check.intent === "coverage";
      const checkResult: CheckResult = {
        checkId: check.id,
        intent: check.intent,
        description: check.description,
        command: check.command,
        workingDirectory: check.workingDirectory,
        outcome: unavailableCoverage ? "coverage-unavailable" : "policy-blocked",
        duration: 0,
        exitCode: null,
        startedAt: checkStartedAt,
        outputSummary: unavailableCoverage
          ? coverageUnavailableRemark(`Working directory does not exist: ${workingDir}`)
          : `Working directory does not exist: ${workingDir}`,
        required: check.required,
      };
      checkResults.push(checkResult);
      if (shouldSuppressNextRequiredCheck(checkResults)) break;
      continue;
    }

    // Execute
    const execStartedAt = Date.now();
    let outcome: CheckOutcome = "skipped";
    let advisoryRepairLimit: number | undefined;
    let exitCode: number | null = null;
    let outputSummary = "";

    const timeoutMs = Math.max(check.timeout, MIN_TIMEOUT_MS);

    try {
      const execution = spawnSync(check.command[0], check.command.slice(1), {
        cwd: workingDir,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        windowsHide: true,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      const combinedOutput = [execution.stdout, execution.stderr].filter(Boolean).join("\n");
      if (execution.error) throw Object.assign(execution.error, {
        killed: execution.signal !== null,
        status: execution.status,
        stderr: execution.stderr,
        stdout: execution.stdout,
      });

      exitCode = execution.status;
      outputSummary = safeOutputSummary(combinedOutput);
      const warningDetected = (check.intent === "build" || check.intent === "lint")
        && containsActionableWarning(combinedOutput);
      outcome = classifyOutcome({
        exitCode: execution.status,
        timedOut: false,
        policyBlocked: false,
        skipped: false,
        zeroSelection: check.intent === "test" && execution.status === 0 && detectsZeroTestSelection(combinedOutput),
      });
      if (warningDetected && outcome === "passed") outcome = "failed";
      if (warningDetected) {
        outputSummary = safeOutputSummary(`Command exited successfully but emitted warnings.\n${combinedOutput}`);
      }
      if (outcome === "passed" && check.intent === "coverage" && check.coverage) {
        const coverage = evaluateCoverageReport({
          baseline: coverageBaseline,
          declaration: check.coverage,
          projectRoot,
          workingDirectory: check.workingDirectory,
        });
        outcome = coverage.kind === "passed"
          ? "passed"
          : coverage.kind === "advisory"
            ? "advisory"
            : "coverage-unavailable";
        advisoryRepairLimit = coverage.kind === "advisory" ? check.coverage.improvementAttempts : undefined;
        outputSummary = safeOutputSummary([
          coverage.measurement ? serializeTestCoverageMeasurement(coverage.measurement) : null,
          coverage.summary,
          combinedOutput,
        ].filter(Boolean).join("\n"));
      }
    } catch (error: unknown) {
      const execError = error as (NodeJS.ErrnoException & { killed?: boolean; status?: number; stderr?: string; stdout?: string });

      if (execError.code === "ETIMEDOUT" || execError.killed) {
        outcome = "timed-out";
        exitCode = null;
        outputSummary = `Check timed out after ${Date.now() - execStartedAt}ms`;
      } else if (execError.code === "ENOENT") {
        outcome = "policy-blocked";
        exitCode = null;
        outputSummary = `Command not found: ${check.command[0]}`;
      } else {
        outcome = "failed";
        exitCode = execError.status ?? 1;
        // Capture stderr or stdout from the error
        const stderr = execError.stderr ?? "";
        const stdout = execError.stdout ?? "";
        outputSummary = safeOutputSummary(stderr || stdout || execError.message);
      }
    }

    const rawOutcome = outcome;
    outcome = normalizeCoverageOutcome(check.intent, outcome);
    if (outcome === "coverage-unavailable" && rawOutcome !== "advisory") {
      outputSummary = coverageUnavailableRemark(outputSummary);
    }

    const execDuration = Date.now() - execStartedAt;

    const checkResult: CheckResult = {
      checkId: check.id,
      intent: check.intent,
      description: check.description,
      command: check.command,
      workingDirectory: check.workingDirectory,
      outcome,
      duration: execDuration,
      exitCode,
      startedAt: checkStartedAt,
      outputSummary,
      required: check.required,
      advisoryRepairLimit,
    };

    checkResults.push(checkResult);

    // Fail-fast only on an authoritative required-check failure. Coverage
    // unavailability is a successful telemetry remark and cannot suppress a
    // later build, lint/typecheck, or test gate.
    if (shouldSuppressNextRequiredCheck(checkResults)) break;
  }

  // --- Step 3: Build aggregate result ---
  const aggregate = buildAggregateResult(checkResults, startedAt, null);

  // --- Step 4: Persist evidence (best-effort, non-blocking) ---
  try {
    const runRecord: FinalVerificationRunRecord = {
      id: randomUUID(),
      projectId: options.projectId,
      cardKey: options.cardKey,
      workflowRunId: options.workflowRunId,
      executionRoot: projectRoot,
      aggregateStatus: aggregate.status,
      blockedReason: aggregate.blockedReason,
      persistenceWarning: null,
      duration: aggregate.duration,
      startedAt,
      completedAt: new Date().toISOString(),
    };

    await options.store.recordFinalVerificationRun(runRecord);

    // Persist each check
    for (const cr of checkResults) {
      const checkRecord: FinalVerificationCheckRecord = {
        id: randomUUID(),
        runId: runRecord.id,
        projectId: options.projectId,
        cardKey: options.cardKey,
        checkId: cr.checkId,
        intent: cr.intent,
        description: cr.description,
        command: cr.command.join(" "),
        workingDirectory: cr.workingDirectory,
        outcome: cr.outcome,
        duration: cr.duration,
        exitCode: cr.exitCode,
        startedAt: cr.startedAt,
        outputSummary: cr.outputSummary,
        required: cr.required,
      };

      await options.store.recordFinalVerificationCheck(checkRecord);
    }
  } catch (error) {
    persistWarning = `Failed to persist audit evidence: ${error instanceof Error ? error.message : String(error)}`;
    // Non-blocking: do not change the primary result
  }

  // --- Step 5: Build presentation ---
  const presentation = buildVerificationPresentation(aggregate);
  const summaryLine = persistWarning
    ? `${presentation.line} (audit persistence warning: ${persistWarning})`
    : presentation.line;

  return {
    aggregate,
    summaryLine,
    persistenceWarning: persistWarning,
  };
}

// ---------------------------------------------------------------------------
// Convenience: run for a specific feature workflow
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper for the existing `runImplementationWorker` final-verification
 * replacement point. Accepts the same project/feature shape used by the workflow.
 */
export async function runFeatureFinalVerification(
  input: FeatureWorkflowInput,
  store: CardMetadataStore,
): Promise<AdapterResult> {
  return runFinalVerification({
    projectRoot: input.project.rootPath,
    projectId: input.project.id,
    cardKey: input.feature.cardKey,
    workflowRunId: input.runId,
    store,
    checkpointKind: input.phaseRole === undefined || input.phaseRole === "final_checkpoint"
      ? "final_checkpoint"
      : "phase",
  });
}

/** Ignores explicit zero/no-warning summaries while detecting emitted warnings. */
export function containsActionableWarning(output: string): boolean {
  return output.split(/\r?\n/).some((line) => {
    const text = line.trim();
    if (!text || /\b(?:0|zero|no)\s+warnings?\b/i.test(text)) return false;
    return /^(?:⚠|warning(?:\s|:)|warn(?:\s|:))/i.test(text)
      || /\bcompiled with warnings?\b/i.test(text);
  });
}

function coverageUnavailableRemark(reason: string): string {
  return safeOutputSummary([
    "Test coverage was not measured. This is a non-blocking code-quality remark; build, lint/typecheck, and test gates remain authoritative.",
    `Reason: ${reason.trim() || "No diagnostic was returned."}`,
  ].join("\n"));
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function persistRunRecord(
  options: AdapterRunOptions,
  record: FinalVerificationRunRecord,
): Promise<void> {
  if (!options.store.enabled) return;

  try {
    await options.store.recordFinalVerificationRun(record);
  } catch {
    // Non-blocking
  }
}
