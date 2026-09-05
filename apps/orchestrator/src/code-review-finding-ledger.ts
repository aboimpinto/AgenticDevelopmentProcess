/**
 * FEAT-042: Code Review Finding Ledger Pure Helpers
 *
 * Phase 3: Business Logic — pure deterministic helpers for:
 * - Finding normalization from review report text
 * - Decision classification (blocker, required, note, etc.)
 * - Reconciliation of new findings with prior ledger decisions
 * - Unresolved required-fix detection
 * - Repair-loop decision (approved, rerun, safety-limit, etc.)
 *
 * All functions are deterministic and side-effect free:
 * - No filesystem access
 * - No database writes
 * - No process spawning
 * - No mutable module state
 * - No implicit clock/environment reads
 */

import type { ReviewFindingLedgerRecord } from "@hepha/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Normalized input extracted from one review report finding.
 * I/O adapter extracts these from the report text before calling pure helpers.
 */
export interface NormalizedFindingInput {
  readonly phaseNumber: number;
  readonly phaseTitle: string;
  readonly findingSummary: string;
  readonly findingText: string | null;
  readonly affectedArea: string | null;
  readonly severity: string | null;
}

/**
 * Result of normalizing a set of findings from a review report.
 */
export interface FindingNormalizationResult {
  readonly normalizedInputs: NormalizedFindingInput[];
  readonly fingerprints: string[];
}

/**
 * FEAT-042 decision classification for a finding.
 */
export type FindingDecision =
  | "blocker"
  | "required"
  | "note"
  | "deferred"
  | "accepted_risk"
  | "rebutted"
  | "follow_up";

/**
 * Resolution state of a finding after decision processing.
 */
export type ResolutionState =
  | "unresolved"
  | "resolved"
  | "deferred"
  | "accepted_risk"
  | "rebutted"
  | "informational"
  | "follow_up";

/**
 * A reconciled finding: the intersection of the latest observation
 * (from a review report) with prior ledger decisions.
 */
export interface ReconciledFinding {
  readonly fingerprint: string;
  readonly latestFinding: NormalizedFindingInput;
  readonly priorDecisions: FindingDecision[];
  readonly currentDecision: FindingDecision | null;
  readonly currentResolution: ResolutionState;
  readonly isRequiredFix: boolean;
  readonly blocksAdvancement: boolean;
}

/**
 * Summary of unresolved required-fix findings.
 */
export interface RequiredFixStatus {
  readonly hasUnresolvedRequiredFixes: boolean;
  readonly unresolvedCount: number;
  readonly unresolvedFindings: ReconciledFinding[];
  readonly blockingCount: number;
}

/**
 * Decision from the repair-loop controller.
 */
export type LoopDecision =
  | { readonly decision: "approved"; readonly summary: string }
  | { readonly decision: "rerun_review"; readonly repairContext: string }
  | { readonly decision: "blocked_needs_user"; readonly reason: string }
  | { readonly decision: "safety_limit"; readonly attemptCount: number; readonly reason: string };

// ---------------------------------------------------------------------------
// Fingerprint Derivation
// ---------------------------------------------------------------------------

/**
 * Derive a stable normalized fingerprint from a finding input.
 *
 * The fingerprint is used to match the same finding across review reruns.
 * It combines phase number, affected area (when available), severity
 * (when available), and a normalized version of the finding summary.
 *
 * Pure function: no I/O, no clock, no random values.
 *
 * @param phaseNumber - Implementation phase number.
 * @param affectedArea - File, component, or evidence string (may be null).
 * @param severity - Raw severity string (may be null).
 * @param findingText - Full finding text for normalization.
 * @returns Stable fingerprint string.
 */
export function deriveFindingFingerprint(
  phaseNumber: number,
  affectedArea: string | null,
  severity: string | null,
  findingText: string,
): string {
  const normalizedText = normalizeFindingText(findingText);
  const areaPart = affectedArea?.trim().toLowerCase() ?? "";
  const severityPart = severity?.trim().toLowerCase() ?? "";

  return `${phaseNumber}|${areaPart}|${severityPart}|${normalizedText}`;
}

/**
 * Normalize finding text for fingerprint derivation.
 *
 * Trims whitespace, collapses internal whitespace to single spaces,
 * and lowercases the entire text for case-insensitive matching.
 *
 * Pure function: no I/O, no clock, no random values.
 *
 * @param text - Raw finding text.
 * @returns Normalized text string.
 */
export function normalizeFindingText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a set of raw finding inputs, deriving stable fingerprints
 * for each one.
 *
 * Pure function: no I/O, no clock, no random values.
 *
 * @param inputs - Raw finding inputs extracted from a review report.
 * @returns Normalization result with inputs and fingerprints.
 */
export function normalizeFindings(inputs: NormalizedFindingInput[]): FindingNormalizationResult {
  const fingerprints: string[] = [];

  for (const input of inputs) {
    const findingText = input.findingText ?? input.findingSummary;

    fingerprints.push(
      deriveFindingFingerprint(
        input.phaseNumber,
        input.affectedArea,
        input.severity,
        findingText,
      ),
    );
  }

  return {
    normalizedInputs: inputs,
    fingerprints,
  };
}

// ---------------------------------------------------------------------------
// Decision Classification
// ---------------------------------------------------------------------------

/**
 * Classify a finding's severity and text into a FEAT-042 decision category.
 *
 * Rules:
 * - `BLOCKER` severity → `blocker`
 * - `REQUIRED` or `NEEDS_CHANGES` severity → `required`
 * - `WITH_NOTES` context → checks text for blocker/required patterns
 * - `note`, `polish`, `suggestion` severity → `note`
 * - Unknown severity with no contextual clues → `note`
 *
 * Pure function: no I/O, no clock, no random values.
 *
 * @param severity - Raw severity string from the review report (may be null).
 * @param findingText - Full finding text (may be null).
 * @returns Normalized decision classification.
 */
export function classifyFindingSeverity(
  severity: string | null,
  findingText: string | null,
): FindingDecision {
  if (!severity && !findingText) {
    return "note";
  }

  const upperSeverity = severity?.toUpperCase().trim() ?? "";

  // Direct severity-based classification
  if (upperSeverity === "BLOCKER") {
    return "blocker";
  }

  if (upperSeverity === "REQUIRED" || upperSeverity === "NEEDS_CHANGES") {
    return "required";
  }

  // For WITH_NOTES or ambiguous severities, check text for clues
  if (upperSeverity === "WITH_NOTES" && findingText) {
    const upperText = findingText.toUpperCase();

    if (/\bBLOCKER\b/.test(upperText)) {
      return "blocker";
    }

    if (/\bREQUIRED\b|\bMUST\b|\bNEEDS_CHANGES\b/.test(upperText)) {
      return "required";
    }
  }

  // Known non-blocking severities
  if (
    upperSeverity === "NOTE" ||
    upperSeverity === "POLISH" ||
    upperSeverity === "SUGGESTION" ||
    upperSeverity === "NON_BLOCKING" ||
    upperSeverity === "OUT_OF_SCOPE"
  ) {
    return "note";
  }

  // Default for unknown severities or prose findings
  return "note";
}

/**
 * Check whether a decision classification is a required-fix type.
 *
 * Pure function.
 *
 * @param decision - The decision classification.
 * @returns True if the decision represents a required fix.
 */
export function isRequiredFixDecision(decision: FindingDecision | null): boolean {
  return decision === "blocker" || decision === "required";
}

/**
 * Infer the default resolution state from a decision classification.
 *
 * Pure function.
 *
 * @param decision - The decision classification.
 * @returns Default resolution state.
 */
export function defaultResolutionForDecision(decision: FindingDecision | null): ResolutionState {
  switch (decision) {
    case "blocker":
    case "required":
      return "unresolved";
    case "note":
      return "informational";
    case "deferred":
      return "deferred";
    case "accepted_risk":
      return "accepted_risk";
    case "rebutted":
      return "rebutted";
    case "follow_up":
      return "follow_up";
    default:
      return "informational";
  }
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * Reconcile the latest batch of findings from a review report against
 * prior ledger entries, using stable fingerprints.
 *
 * Pure function: no I/O, no clock, no random values.
 *
 * @param latestFindings - Findings from the most recent review report.
 * @param priorLedgerEntries - Prior persisted ledger entries (from DB).
 * @returns Array of reconciled findings with resolution state.
 */
export function reconcileFindings(
  latestFindings: NormalizedFindingInput[],
  priorLedgerEntries: Pick<
    ReviewFindingLedgerRecord,
    "fingerprint" | "decisionClassification" | "resolutionState" | "decisionRationale"
  >[],
): ReconciledFinding[] {
  // Build a lookup of prior decisions by fingerprint
  const priorDecisionsByFingerprint = new Map<string, FindingDecision[]>();
  const priorResolutionsByFingerprint = new Map<string, ResolutionState>();

  for (const entry of priorLedgerEntries) {
    const existing = priorDecisionsByFingerprint.get(entry.fingerprint) ?? [];
    const decision = entry.decisionClassification as FindingDecision | null;

    if (decision) {
      existing.push(decision);
      priorDecisionsByFingerprint.set(entry.fingerprint, existing);
    }

    if (entry.resolutionState) {
      priorResolutionsByFingerprint.set(
        entry.fingerprint,
        entry.resolutionState as ResolutionState,
      );
    }
  }

  // Reconcile each latest finding
  const result: ReconciledFinding[] = [];

  for (const finding of latestFindings) {
    const findingText = finding.findingText ?? finding.findingSummary;
    const fingerprint = deriveFindingFingerprint(
      finding.phaseNumber,
      finding.affectedArea,
      finding.severity,
      findingText,
    );

    const priorDecisions = priorDecisionsByFingerprint.get(fingerprint) ?? [];
    const priorResolution = priorResolutionsByFingerprint.get(fingerprint) ?? null;

    // Determine current decision based on latest severity, overridden by explicit prior decisions
    const inferredDecision = classifyFindingSeverity(finding.severity, finding.findingText);
    const latestExplicitDecision = priorDecisions.length > 0
      ? priorDecisions[priorDecisions.length - 1]
      : inferredDecision;

    // Determine resolution state
    let currentResolution: ResolutionState;

    if (priorResolution && priorResolution !== "unresolved" && priorResolution !== "informational") {
      // Prior explicit non-unresolved state persists
      currentResolution = priorResolution;
    } else {
      currentResolution = defaultResolutionForDecision(latestExplicitDecision);
    }

    // If the latest severity is APPROVED, the finding was addressed
    if (
      finding.severity?.toUpperCase() === "RESOLVED" ||
      finding.severity?.toUpperCase() === "FIXED"
    ) {
      currentResolution = "resolved";
    }

    const isRequiredFix = isRequiredFixDecision(latestExplicitDecision);

    result.push({
      fingerprint,
      latestFinding: finding,
      priorDecisions,
      currentDecision: latestExplicitDecision,
      currentResolution,
      isRequiredFix,
      blocksAdvancement: isRequiredFix && currentResolution === "unresolved",
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Unresolved Required-Fix Detection
// ---------------------------------------------------------------------------

/**
 * Detect unresolved required-fix findings from a set of reconciled findings.
 *
 * `blocker` and `required` findings with `unresolved` resolution block
 * phase advancement. `note`, `deferred`, `accepted_risk`, `rebutted`,
 * and `follow_up` do not block.
 *
 * Pure function: no I/O, no clock, no random values.
 *
 * @param reconciledFindings - Array of reconciled findings.
 * @returns Status summary of required-fix findings.
 */
export function detectRequiredFixes(
  reconciledFindings: ReconciledFinding[],
): RequiredFixStatus {
  const unresolvedFindings = reconciledFindings.filter((f) => f.blocksAdvancement);

  return {
    hasUnresolvedRequiredFixes: unresolvedFindings.length > 0,
    unresolvedCount: unresolvedFindings.length,
    unresolvedFindings,
    blockingCount: unresolvedFindings.length,
  };
}

// ---------------------------------------------------------------------------
// Repair-Loop Decision
// ---------------------------------------------------------------------------

/**
 * Decide what the repair loop should do next based on the current
 * required-fix status and repair attempt history.
 *
 * - 0 required fixes → `approved`
 * - Required fixes exist, attempts < max → `rerun_review` with repair context
 * - Required fixes exist, attempts >= max → `safety_limit`
 * - Blocked state from external signal → uses caller judgment
 *
 * Pure function: no I/O, no clock, no random values.
 *
 * @param requiredFixStatus - Current required-fix status.
 * @param repairAttemptCount - Number of repair/review cycles already completed.
 * @param maxAttempts - Maximum allowed repair attempts (default: 3).
 * @returns Loop decision.
 */
export function decideRepairLoop(
  requiredFixStatus: RequiredFixStatus,
  repairAttemptCount: number,
  maxAttempts: number = 3,
): LoopDecision {
  if (!requiredFixStatus.hasUnresolvedRequiredFixes) {
    return {
      decision: "approved",
      summary: `No unresolved required-fix findings remain. Phase advancement is eligible.`,
    };
  }

  if (repairAttemptCount >= maxAttempts) {
    return {
      decision: "safety_limit",
      attemptCount: repairAttemptCount,
      reason: `Repair/review loop reached maximum ${maxAttempts} attempts with ${requiredFixStatus.unresolvedCount} unresolved required-fix finding(s) remaining. Escalating to failed/needs-human state.`,
    };
  }

  // Build a concise repair context summary
  const findingSummaries = requiredFixStatus.unresolvedFindings
    .map(
      (f, i) =>
        `${i + 1}. [${f.currentDecision?.toUpperCase() ?? "UNKNOWN"}] ${f.latestFinding.findingSummary}` +
        (f.latestFinding.affectedArea ? ` (${f.latestFinding.affectedArea})` : ""),
    )
    .join("\n");

  const repairContext =
    `Unresolved required-fix findings (attempt ${repairAttemptCount + 1}/${maxAttempts}):\n${findingSummaries}`;

  return {
    decision: "rerun_review",
    repairContext,
  };
}

// ---------------------------------------------------------------------------
// Finding Input Extraction Helpers
// ---------------------------------------------------------------------------

/**
 * Parse review finding decision items from a code-review report.
 *
 * Extracts severity, summary, affected area (as location), and finding text
 * from structured finding items.
 *
 * Pure function: no I/O, no clock, no random values.
 *
 * @param items - Finding decision items from review report parsing.
 * @returns Normalized finding inputs ready for ledger persistence.
 */
export function extractFindingsFromDecisionItems(
  phaseNumber: number,
  phaseTitle: string,
  items: Array<{
    severity: string;
    summary: string;
    location: string | null;
    requiredChange: string | null;
  }>,
): NormalizedFindingInput[] {
  return items.map((item) => ({
    phaseNumber,
    phaseTitle,
    findingSummary: item.summary,
    findingText: item.requiredChange ?? item.summary,
    affectedArea: item.location,
    severity: item.severity,
  }));
}
