import type { ApprovalDbStatus, StoredApprovalRequest, StoredDeepDiveSession } from "./interactive-contracts.js";
import type { FeatureReadinessSourceConfirmationRecord, FeatureUiRequirementRecord, HephaDeepDiveRecord, ScannedCardMetadata, StoredCardMetadata } from "./card-contracts.js";
import type { DeliveryMetadataInput, DeliveryMetadataRecord, StartTransitionExceptionRecord, StartTransitionRecord } from "./delivery-contracts.js";
import type { ManualTestPackDbState, ManualTestResultRecord, ManualTestVerificationPackRecord, ManualTestVerificationReviewRecord } from "./manual-test-contracts.js";
import type { FinalVerificationCheckRecord, FinalVerificationRunRecord, ReviewFindingDecisionRecord, ReviewFindingLedgerRecord, ReviewFingerprintDecisionRecord, ReviewRepairAttemptRecord } from "./review-contracts.js";
import type { AgentInvocationRecord, EventFilter, InvocationFilter, NormalizedEventRecord, PhaseLifecycleEventRecord, StoredAgentInvocation, StoredNormalizedEvent, StoredPhaseLifecycleEvent } from "./telemetry-contracts.js";
import type { FeatureFindingAgentRunRecord, FeatureFindingCreateRecord, FeatureFindingDetailRecord, FeatureFindingResolveRecord, FeatureHumanReviewRecord, FeatureWorkflowCompletionRecord, FeatureWorkflowRunRecord, ImplementationAgentRunRecord, ImplementationPhaseRunRecord, ImplementationTaskRunRecord, StoredFeatureFinding, StoredImplementationAgentRun, StoredImplementationPhaseRun, StoredImplementationTaskRun } from "./workflow-contracts.js";

export interface CardMetadataStore {
  readonly backend: "disabled" | "sqlite";
  readonly databasePath: string | null;
  readonly enabled: boolean;
  close(): Promise<void>;

  // --- Approval request operations ---
  createApprovalRequest(request: StoredApprovalRequest): Promise<StoredApprovalRequest>;
  getApprovalRequest(requestId: string): Promise<StoredApprovalRequest | null>;
  listApprovalRequests(projectId: string, status?: ApprovalDbStatus | "all", limit?: number): Promise<StoredApprovalRequest[]>;
  listApprovalRequestsByCard(projectId: string, cardKey: string): Promise<StoredApprovalRequest[]>;
  resolveApprovalRequest(requestId: string, status: "approved" | "denied" | "timed_out", resolvedBy: string, resolutionReason: string | null): Promise<StoredApprovalRequest | null>;
  finalizeTimedOutApprovals(clockNow: string): Promise<number>;

  createDeepDiveSession(session: StoredDeepDiveSession): Promise<StoredDeepDiveSession>;
  findOpenDeepDiveSession(projectId: string, cardKey: string): Promise<StoredDeepDiveSession | null>;
  getDeepDiveSession(sessionId: string): Promise<StoredDeepDiveSession | null>;
  getCardMetadata(projectId: string, cardKey: string): Promise<StoredCardMetadata | null>;
  getFeatureFinding(projectId: string, cardKey: string, findingId: string): Promise<StoredFeatureFinding | null>;
  listFeatureFindings(projectId: string, cardKeys: string[]): Promise<Map<string, StoredFeatureFinding[]>>;
  listImplementationPhaseRuns(projectId: string, cardKeys: string[]): Promise<Map<string, StoredImplementationPhaseRun[]>>;
  listImplementationAgentRuns(projectId: string, cardKeys: string[]): Promise<Map<string, StoredImplementationAgentRun[]>>;
  listImplementationTaskRuns(projectId: string, cardKey: string, phaseNumber: number): Promise<StoredImplementationTaskRun[]>;
  createFeatureFinding(record: FeatureFindingCreateRecord): Promise<StoredFeatureFinding>;
  appendFeatureFindingDetail(record: FeatureFindingDetailRecord): Promise<StoredFeatureFinding>;
  closeFeatureFinding(record: FeatureFindingResolveRecord): Promise<StoredFeatureFinding | null>;
  recordImplementationAgentRun(record: ImplementationAgentRunRecord): Promise<void>;
  recordImplementationPhaseRun(record: ImplementationPhaseRunRecord): Promise<void>;
  recordImplementationTaskRun(record: ImplementationTaskRunRecord): Promise<void>;
  recordFeatureFindingAgentRun(record: FeatureFindingAgentRunRecord): Promise<void>;
  recordFeatureUiRequirement(record: FeatureUiRequirementRecord): Promise<void>;
  confirmFeatureReadinessSource(record: FeatureReadinessSourceConfirmationRecord): Promise<void>;
  recordFeatureHumanReview(record: FeatureHumanReviewRecord): Promise<void>;
  recordFeatureWorkflowCompletion(record: FeatureWorkflowCompletionRecord): Promise<void>;
  recordFeatureWorkflowRun(record: FeatureWorkflowRunRecord): Promise<void>;
  recordHephaDeepDive(record: HephaDeepDiveRecord): Promise<void>;
  reconcileScannedCards(cards: ScannedCardMetadata[]): Promise<Map<string, StoredCardMetadata>>;
  updateDeepDiveSession(session: StoredDeepDiveSession): Promise<StoredDeepDiveSession>;

  // --- FEAT-033: Run timeline storage ---
  recordAgentInvocation(record: AgentInvocationRecord): Promise<void>;
  recordNormalizedEvent(record: NormalizedEventRecord): Promise<void>;
  queryAgentInvocations(filters: InvocationFilter): Promise<StoredAgentInvocation[]>;
  queryNormalizedEvents(filters: EventFilter): Promise<StoredNormalizedEvent[]>;

  // --- FEAT-034: Live activity stream ---
  recordPhaseLifecycleEvent(record: PhaseLifecycleEventRecord): Promise<void>;
  queryPhaseLifecycleEventsAfterCursor(projectId: string, cursorId: string): Promise<StoredPhaseLifecycleEvent[]>;

  // --- FEAT-039: Start transition metadata ---
  recordStartTransition(record: StartTransitionRecord): Promise<void>;
  getStartTransition(cardKey: string, projectId: string, runId: string): Promise<StartTransitionRecord | null>;
  listStartTransitions(cardKey: string, projectId: string): Promise<StartTransitionRecord[]>;
  recordStartTransitionException(record: StartTransitionExceptionRecord): Promise<void>;

  // --- FEAT-046: Delivery metadata ---
  upsertDeliveryMetadata(record: DeliveryMetadataInput, clockNow: string): Promise<DeliveryMetadataRecord>;
  getDeliveryMetadata(projectId: string, cardKey: string): Promise<DeliveryMetadataRecord | null>;
  listDeliveryMetadata(projectId: string): Promise<DeliveryMetadataRecord[]>;

  // --- FEAT-042: Code-review finding ledger ---
  createReviewFindingLedgerEntry(record: ReviewFindingLedgerRecord): Promise<ReviewFindingLedgerRecord>;
  listReviewFindingLedgerEntries(projectId: string, cardKey: string, phaseNumber?: number): Promise<ReviewFindingLedgerRecord[]>;
  listReviewFindingLedgerEntriesByReport(reviewReportPath: string): Promise<ReviewFindingLedgerRecord[]>;
  updateReviewFindingLedgerDecision(id: string, classification: string, resolutionState: string, rationale: string | null, updatedAt: string): Promise<ReviewFindingLedgerRecord | null>;
  createReviewFindingDecision(record: ReviewFindingDecisionRecord): Promise<ReviewFindingDecisionRecord>;
  listReviewFindingDecisions(findingLedgerId: string): Promise<ReviewFindingDecisionRecord[]>;
  createReviewRepairAttempt(record: ReviewRepairAttemptRecord): Promise<ReviewRepairAttemptRecord>;
  listReviewRepairAttempts(projectId: string, cardKey: string, phaseNumber: number): Promise<ReviewRepairAttemptRecord[]>;
  updateReviewRepairAttemptAfterRerun(id: string, rerunReviewReportPath: string, rerunResult: string, unresolvedAfterCount: number, completedAt: string): Promise<ReviewRepairAttemptRecord | null>;

  // FEAT-043: Fingerprint recovery decision evidence
  createReviewFingerprintDecision(record: ReviewFingerprintDecisionRecord): Promise<ReviewFingerprintDecisionRecord>;
  getLatestReviewFingerprintDecision(projectId: string, cardKey: string, phaseNumber: number, reviewGateId: string): Promise<ReviewFingerprintDecisionRecord | null>;
  listReviewFingerprintDecisions(projectId: string, cardKey: string, phaseNumber: number): Promise<ReviewFingerprintDecisionRecord[]>;

  // --- FEAT-044: Final verification runner evidence ---
  recordFinalVerificationRun(record: FinalVerificationRunRecord): Promise<FinalVerificationRunRecord>;
  recordFinalVerificationCheck(record: FinalVerificationCheckRecord): Promise<FinalVerificationCheckRecord>;
  listFinalVerificationRuns(projectId: string, cardKey: string): Promise<FinalVerificationRunRecord[]>;
  listFinalVerificationChecks(runId: string): Promise<FinalVerificationCheckRecord[]>;

  // --- FEAT-045: Manual Test Verification Pack ---
  recordManualTestPack(record: ManualTestVerificationPackRecord): Promise<void>;
  getCurrentManualTestPack(projectId: string, cardKey: string): Promise<ManualTestVerificationPackRecord | null>;
  getManualTestPack(projectId: string, cardKey: string, packId: string): Promise<ManualTestVerificationPackRecord | null>;
  listManualTestPacks(projectId: string, cardKey: string): Promise<ManualTestVerificationPackRecord[]>;
  markManualTestPackSuperseded(projectId: string, cardKey: string, packId: string, supersededAt: string): Promise<void>;
  setManualTestPackState(projectId: string, cardKey: string, packId: string, state: ManualTestPackDbState, renderError?: string): Promise<void>;

  // --- FEAT-045: Manual Test Pack Review ---
  recordManualTestReview(record: ManualTestVerificationReviewRecord): Promise<ManualTestVerificationReviewRecord>;
  getCurrentManualTestReview(projectId: string, cardKey: string): Promise<ManualTestVerificationReviewRecord | null>;
  invalidateManualTestReview(projectId: string, cardKey: string, reviewId: string, invalidatedAt: string, reason?: string): Promise<void>;

  // --- FEAT-045: Manual Test Results ---
  recordManualTestResult(record: ManualTestResultRecord): Promise<void>;
  listManualTestResults(projectId: string, cardKey: string, packId: string): Promise<ManualTestResultRecord[]>;
  listAllManualTestResults(projectId: string, cardKey: string): Promise<ManualTestResultRecord[]>;
}
