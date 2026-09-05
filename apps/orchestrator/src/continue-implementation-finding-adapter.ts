/**
 * FEAT-042 Phase 6: Integration Adapter
 *
 * Wraps the ledger persistence, pure decision helpers, repair context,
 * and timeline summaries into cohesive adapters that can be called
 * from the orchestrator's code-review flow.
 *
 * These adapters are the bridge between the existing orchestrator code
 * and the new FEAT-042 persistence/helper modules. They are designed to
 * be:
 * - Deterministic when given the same inputs
 * - Testable with temporary database fixtures
 * - Safe to call from existing workflow code (non-breaking)
 */

import type { CardMetadataStore, ReviewFindingLedgerRecord } from "@hepha/db";
import { randomUUID } from "node:crypto";

import {
  normalizeFindings,
  classifyFindingSeverity,
  defaultResolutionForDecision,
  deriveFindingFingerprint,
  reconcileFindings,
  detectRequiredFixes,
  decideRepairLoop,
  type NormalizedFindingInput,
} from "./code-review-finding-ledger.js";

import {
  buildRepairContext,
  summarizeLedgerEntries,
  type RepairContext,
  type LedgerSummary,
  type ReviewFindingTimelineEntry,
} from "./continue-implementation-presentation-ext.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default maximum repair attempts before safety-limit escalation. */
const DEFAULT_MAX_REPAIR_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Finding Persistence
// ---------------------------------------------------------------------------

/**
 * Persist review findings from a code-review report into the ledger.
 *
 * To be called after `writeCodeReviewReport` and `parseReviewResult` in
 * the orchestrator's code-review flow.
 *
 * @param store - The card metadata store (may be disabled).
 * @param projectId - Project identifier.
 * @param cardKey - Feature card key.
 * @param phaseNumber - Phase number.
 * @param phaseTitle - Phase title.
 * @param workflowRunId - Workflow run identifier (may be null).
 * @param reviewReportPath - Path to the review report file (may be null).
 * @param agentInvocationId - Agent invocation identifier (may be null).
 * @param findings - Normalized findings extracted from the report.
 * @returns The persisted ledger entries.
 */
export async function persistReviewFindings(
  store: CardMetadataStore,
  projectId: string,
  cardKey: string,
  phaseNumber: number,
  phaseTitle: string,
  workflowRunId: string | null,
  reviewReportPath: string | null,
  agentInvocationId: string | null,
  findings: NormalizedFindingInput[],
): Promise<ReviewFindingLedgerRecord[]> {
  if (!store.enabled) {
    return [];
  }

  const { normalizedInputs, fingerprints } = normalizeFindings(findings);
  const now = new Date().toISOString();
  const entries: ReviewFindingLedgerRecord[] = [];

  for (let i = 0; i < normalizedInputs.length; i++) {
    const input = normalizedInputs[i]!;
    const fingerprint = fingerprints[i] ?? "";
    const initialDecision = classifyFindingSeverity(input.severity, input.findingText);

    const record: ReviewFindingLedgerRecord = {
      id: randomUUID(),
      projectId,
      cardKey,
      phaseNumber,
      phaseTitle,
      workflowRunId,
      reviewReportPath,
      agentInvocationId,
      timelineEntryId: null,
      findingIndex: i,
      findingSummary: input.findingSummary,
      findingText: input.findingText,
      affectedArea: input.affectedArea,
      severity: input.severity,
      fingerprint,
      decisionClassification: initialDecision,
      resolutionState: defaultResolutionForDecision(initialDecision),
      decisionRationale: null,
      supersededBy: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };

    await store.createReviewFindingLedgerEntry(record);
    entries.push(record);
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Required-Fix Check
// ---------------------------------------------------------------------------

/**
 * Check whether the code-review flow should block phase advancement
 * based on unresolved required-fix findings.
 *
 * To be called after persisting review findings, before throwing a
 * blocking error.
 *
 * @param store - The card metadata store.
 * @param projectId - Project identifier.
 * @param cardKey - Feature card key.
 * @param phaseNumber - Phase number.
 * @param repairAttemptCount - Number of repair attempts so far.
 * @returns Object with decision and repair context.
 */
export async function checkRequiredFixes(
  store: CardMetadataStore,
  projectId: string,
  cardKey: string,
  phaseNumber: number,
  phaseTitle: string,
  reviewReportPath: string | null,
  workflowRunId: string | null,
  repairAttemptCount: number,
): Promise<{
  blocksAdvancement: boolean;
  requiredFixStatus: ReturnType<typeof detectRequiredFixes>;
  repairContext: RepairContext | null;
  loopDecision: ReturnType<typeof decideRepairLoop>;
}> {
  // Load ledger entries for this phase
  const ledgerEntries = await store.listReviewFindingLedgerEntries(
    projectId,
    cardKey,
    phaseNumber,
  );

  // Convert to reconciliation input
  const findingInputs: NormalizedFindingInput[] = ledgerEntries.map((entry) => ({
    phaseNumber: entry.phaseNumber,
    phaseTitle: entry.phaseTitle,
    findingSummary: entry.findingSummary,
    findingText: entry.findingText,
    affectedArea: entry.affectedArea,
    severity: entry.severity,
  }));

  // Reconcile findings
  const reconciled = reconcileFindings(findingInputs, ledgerEntries);
  const requiredFixStatus = detectRequiredFixes(reconciled);
  const loopDecision = decideRepairLoop(
    requiredFixStatus,
    repairAttemptCount,
    DEFAULT_MAX_REPAIR_ATTEMPTS,
  );

  // Build repair context if needed
  let repairContext: RepairContext | null = null;

  if (requiredFixStatus.hasUnresolvedRequiredFixes) {
    repairContext = buildRepairContext(
      phaseNumber,
      phaseTitle,
      requiredFixStatus.unresolvedFindings,
      reviewReportPath,
      workflowRunId,
      repairAttemptCount + 1,
      DEFAULT_MAX_REPAIR_ATTEMPTS,
    );
  }

  return {
    blocksAdvancement:
      requiredFixStatus.hasUnresolvedRequiredFixes &&
      loopDecision.decision !== "safety_limit",
    requiredFixStatus,
    repairContext,
    loopDecision,
  };
}

// ---------------------------------------------------------------------------
// Repair Attempt Recording
// ---------------------------------------------------------------------------

/**
 * Record a repair attempt in the ledger.
 *
 * @param store - The card metadata store.
 * @param projectId - Project identifier.
 * @param cardKey - Feature card key.
 * @param phaseNumber - Phase number.
 * @param unresolvedBeforeCount - Number of unresolved required-fix findings before repair.
 * @param repairContext - The repair context that was generated.
 * @param repairWorkflowRunId - Workflow run that will perform the repair.
 * @returns The created repair attempt record.
 */
export async function recordRepairAttempt(
  store: CardMetadataStore,
  projectId: string,
  cardKey: string,
  phaseNumber: number,
  unresolvedBeforeCount: number,
  repairContext: RepairContext,
  repairWorkflowRunId: string | null,
) {
  if (!store.enabled) {
    return null;
  }

  const now = new Date().toISOString();

  return store.createReviewRepairAttempt({
    id: randomUUID(),
    projectId,
    cardKey,
    phaseNumber,
    repairGeneratedAt: now,
    repairContextText: repairContext.summary,
    repairWorkflowRunId,
    rerunReviewReportPath: null,
    rerunResult: null,
    unresolvedBeforeCount,
    unresolvedAfterCount: 0,
    escalated: 0,
    escalationReason: null,
    createdAt: now,
    completedAt: null,
  });
}

// ---------------------------------------------------------------------------
// Rerun Result Recording
// ---------------------------------------------------------------------------

/**
 * Record the result of a review rerun after repair.
 *
 * @param store - The card metadata store.
 * @param repairAttemptId - The repair attempt record ID.
 * @param rerunReviewReportPath - Path to the rerun review report.
 * @param rerunResult - Result string (e.g., "approved", "needs_changes").
 * @param unresolvedAfterCount - Number of unresolved required-fix findings after rerun.
 * @returns Updated repair attempt record.
 */
export async function recordRerunResult(
  store: CardMetadataStore,
  repairAttemptId: string,
  rerunReviewReportPath: string,
  rerunResult: string,
  unresolvedAfterCount: number,
) {
  if (!store.enabled) {
    return null;
  }

  const now = new Date().toISOString();

  return store.updateReviewRepairAttemptAfterRerun(
    repairAttemptId,
    rerunReviewReportPath,
    rerunResult,
    unresolvedAfterCount,
    now,
  );
}

// ---------------------------------------------------------------------------
// Ledger Summary (Read-Model Query)
// ---------------------------------------------------------------------------

/**
 * Build a ledger summary for a specific phase.
 *
 * @param store - The card metadata store.
 * @param projectId - Project identifier.
 * @param cardKey - Feature card key.
 * @param phaseNumber - Phase number.
 * @returns Ledger summary.
 */
export async function getPhaseLedgerSummary(
  store: CardMetadataStore,
  projectId: string,
  cardKey: string,
  phaseNumber: number,
): Promise<LedgerSummary | null> {
  if (!store.enabled) {
    return null;
  }

  const entries = await store.listReviewFindingLedgerEntries(
    projectId,
    cardKey,
    phaseNumber,
  );

  if (entries.length === 0) {
    return null;
  }

  return summarizeLedgerEntries(entries);
}

// ---------------------------------------------------------------------------
// Repair Attempt History
// ---------------------------------------------------------------------------

/**
 * Load repair attempt history for a phase.
 *
 * @param store - The card metadata store.
 * @param projectId - Project identifier.
 * @param cardKey - Feature card key.
 * @param phaseNumber - Phase number.
 * @returns Array of repair attempt records.
 */
export async function getRepairAttemptHistory(
  store: CardMetadataStore,
  projectId: string,
  cardKey: string,
  phaseNumber: number,
) {
  if (!store.enabled) {
    return [];
  }

  return store.listReviewRepairAttempts(projectId, cardKey, phaseNumber);
}
