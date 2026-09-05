export interface ReviewFindingLedgerRecord {
  id: string;
  projectId: string;
  cardKey: string;
  phaseNumber: number;
  phaseTitle: string;
  workflowRunId: string | null;
  reviewReportPath: string | null;
  agentInvocationId: string | null;
  timelineEntryId: string | null;
  findingIndex: number;
  findingSummary: string;
  findingText: string | null;
  affectedArea: string | null;
  severity: string | null;
  fingerprint: string;
  decisionClassification: string | null;
  resolutionState: string;
  decisionRationale: string | null;
  supersededBy: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface ReviewFindingDecisionRecord {
  id: string;
  findingLedgerId: string;
  projectId: string;
  cardKey: string;
  classification: string;
  rationale: string | null;
  decidedBy: string | null;
  workflowRunId: string | null;
  createdAt: string;
  supersededAt: string | null;
}

export interface ReviewRepairAttemptRecord {
  id: string;
  projectId: string;
  cardKey: string;
  phaseNumber: number;
  repairGeneratedAt: string | null;
  repairContextText: string | null;
  repairWorkflowRunId: string | null;
  rerunReviewReportPath: string | null;
  rerunResult: string | null;
  unresolvedBeforeCount: number;
  unresolvedAfterCount: number;
  escalated: number;
  escalationReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------

/**
 * FEAT-043: Fingerprint recovery decision evidence recorded per phase per review gate.
 *
 * This is an additive metadata entry that stores the fingerprint-based
 * recovery decision so that the decision is restart-survivable and
 * auditable through workflow history.
 *
 * Persistence is non-blocking: if the store is disabled or the write
 * fails, the fingerprint policy still works from the current-ledger
 * comparison for that single run.
 */
export interface ReviewFingerprintDecisionRecord {
  id: string;
  projectId: string;
  cardKey: string;
  phaseNumber: number;
  reviewGateId: string;
  decisionClassification: string;
  shouldContinue: number;
  unresolvedFingerprintsJson: string;
  priorSameGateFingerprintsJson: string | null;
  sameFingerprintRepeatCount: number;
  absoluteRecoveryAttemptCount: number;
  currentUnresolvedCount: number;
  priorUnresolvedCount: number;
  addedFingerprintCount: number;
  removedFingerprintCount: number;
  unchangedFingerprintCount: number;
  reasonText: string;
  latestReportPath: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------

export interface FinalVerificationRunRecord {
  id: string;
  projectId: string;
  cardKey: string;
  workflowRunId: string;
  executionRoot: string;
  aggregateStatus: string;
  blockedReason: string | null;
  persistenceWarning: string | null;
  duration: number;
  startedAt: string;
  completedAt: string;
}

export interface FinalVerificationCheckRecord {
  id: string;
  runId: string;
  projectId: string;
  cardKey: string;
  checkId: string;
  intent: string;
  description: string;
  command: string;
  workingDirectory: string;
  outcome: string;
  duration: number;
  exitCode: number | null;
  startedAt: string;
  outputSummary: string;
  required: boolean;
}

// -------------------------------------------------------------------------
// FEAT-045: Manual Test Verification Pack — store record types
// -------------------------------------------------------------------------
