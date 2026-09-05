import type {
  CardMetadataStore,
  DeliveryMetadataInput,
  DeliveryMetadataRecord,
  FeatureFindingCreateRecord,
  FeatureFindingDetailRecord,
  FinalVerificationCheckRecord,
  FinalVerificationRunRecord,
  ManualTestResultRecord,
  ManualTestVerificationPackRecord,
  ManualTestVerificationReviewRecord,
  ReviewFindingDecisionRecord,
  ReviewFindingLedgerRecord,
  ReviewFingerprintDecisionRecord,
  ReviewRepairAttemptRecord,
  StartTransitionRecord,
  StoredAgentInvocation,
  StoredApprovalRequest,
  StoredCardMetadata,
  StoredDeepDiveSession,
  StoredFeatureFinding,
  StoredFeatureFindingEvent,
  StoredImplementationAgentRun,
  StoredImplementationPhaseRun,
  StoredNormalizedEvent,
  StoredPhaseLifecycleEvent,
} from "../contracts/index.js";

export class DisabledCardMetadataStore implements CardMetadataStore {
  readonly backend = "disabled" as const;
  readonly databasePath = null;
  readonly enabled = false;

  async close() {
    // Nothing to close.
  }

  // Approval storage
  async createApprovalRequest(request: StoredApprovalRequest): Promise<StoredApprovalRequest> {
    return request;
  }

  async getApprovalRequest(): Promise<null> {
    return null;
  }

  async listApprovalRequests(): Promise<StoredApprovalRequest[]> {
    return [];
  }

  async listApprovalRequestsByCard(): Promise<StoredApprovalRequest[]> {
    return [];
  }

  async resolveApprovalRequest(): Promise<null> {
    return null;
  }

  async finalizeTimedOutApprovals(): Promise<number> {
    return 0;
  }

  async reconcileScannedCards() {
    return new Map<string, StoredCardMetadata>();
  }

  async createDeepDiveSession(session: StoredDeepDiveSession) {
    return session;
  }

  async findOpenDeepDiveSession() {
    return null;
  }

  async getDeepDiveSession() {
    return null;
  }

  async getCardMetadata(): Promise<StoredCardMetadata | null> {
    return null;
  }

  async getFeatureFinding() {
    return null;
  }

  async listFeatureFindings() {
    return new Map<string, StoredFeatureFinding[]>();
  }

  async listImplementationPhaseRuns() {
    return new Map<string, StoredImplementationPhaseRun[]>();
  }

  async listImplementationAgentRuns() {
    return new Map<string, StoredImplementationAgentRun[]>();
  }

  async listImplementationTaskRuns() {
    return [];
  }

  async createFeatureFinding(record: FeatureFindingCreateRecord) {
    const now = new Date().toISOString();
    const event: StoredFeatureFindingEvent = {
      content: record.content,
      createdAt: now,
      id: record.eventId,
      kind: "finding",
      role: "user",
    };

    return {
      cardKey: record.cardKey,
      closedAt: null,
      createdAt: now,
      currentStep: null,
      error: null,
      events: [event],
      id: record.findingId,
      projectId: record.projectId,
      runId: null,
      status: "open",
      summary: null,
      title: record.title,
      updatedAt: now,
    } satisfies StoredFeatureFinding;
  }

  async appendFeatureFindingDetail(record: FeatureFindingDetailRecord) {
    const now = new Date().toISOString();
    const event: StoredFeatureFindingEvent = {
      content: record.content,
      createdAt: now,
      id: record.eventId,
      kind: "follow_up",
      role: "user",
    };

    return {
      cardKey: record.cardKey,
      closedAt: null,
      createdAt: now,
      currentStep: null,
      error: null,
      events: [event],
      id: record.findingId,
      projectId: record.projectId,
      runId: null,
      status: "open",
      summary: null,
      title: "Finding unavailable",
      updatedAt: now,
    } satisfies StoredFeatureFinding;
  }

  async closeFeatureFinding() {
    return null;
  }

  async recordImplementationAgentRun() {
    // Metadata persistence is disabled.
  }

  async recordImplementationPhaseRun() {
    // Metadata persistence is disabled.
  }

  async recordImplementationTaskRun() {
    // Metadata persistence is disabled.
  }

  async recordFeatureFindingAgentRun() {
    // Metadata persistence is disabled.
  }

  async recordHephaDeepDive() {
    // Metadata persistence is disabled.
  }

  async recordFeatureUiRequirement() {
    // Metadata persistence is disabled.
  }

  async confirmFeatureReadinessSource() {
    // Metadata persistence is disabled.
  }

  async recordFeatureHumanReview() {
    // Metadata persistence is disabled.
  }

  async recordFeatureWorkflowCompletion() {
    // Metadata persistence is disabled.
  }

  async recordFeatureWorkflowRun() {
    // Metadata persistence is disabled.
  }

  async updateDeepDiveSession(session: StoredDeepDiveSession) {
    return session;
  }

  // Timeline storage
  async recordAgentInvocation() {
    // Timeline persistence is disabled.
  }

  async recordNormalizedEvent() {
    // Timeline persistence is disabled.
  }

  async queryAgentInvocations(): Promise<StoredAgentInvocation[]> {
    return [];
  }

  async queryNormalizedEvents(): Promise<StoredNormalizedEvent[]> {
    return [];
  }

  // Live activity storage
  async recordPhaseLifecycleEvent() {
    // Live activity persistence is disabled.
  }

  async queryPhaseLifecycleEventsAfterCursor(): Promise<StoredPhaseLifecycleEvent[]> {
    return [];
  }

  // Start-transition storage
  async recordStartTransition(): Promise<void> {
    // Start transition persistence is disabled.
  }

  async getStartTransition(): Promise<StartTransitionRecord | null> {
    return null;
  }

  async listStartTransitions(): Promise<StartTransitionRecord[]> {
    return [];
  }

  async recordStartTransitionException(): Promise<void> {
    // Start transition exception persistence is disabled.
  }

  // Delivery metadata
  async upsertDeliveryMetadata(input: DeliveryMetadataInput, clockNow: string): Promise<DeliveryMetadataRecord> {
    return {
      projectId: input.projectId,
      cardKey: input.cardKey,
      deliveryMode: input.deliveryMode,
      targetBranch: input.targetBranch,
      githubIssue: input.githubIssue,
      issueRole: input.issueRole,
      issueUpdateMode: input.issueUpdateMode,
      pullRequest: input.pullRequest,
      deliveryStatus: input.deliveryStatus,
      deliveryError: input.deliveryError,
      createdAt: clockNow,
      updatedAt: clockNow,
    };
  }

  async getDeliveryMetadata(): Promise<DeliveryMetadataRecord | null> {
    return null;
  }

  async listDeliveryMetadata(): Promise<DeliveryMetadataRecord[]> {
    return [];
  }

  // Code-review finding ledger
  async createReviewFindingLedgerEntry(record: ReviewFindingLedgerRecord): Promise<ReviewFindingLedgerRecord> {
    return record;
  }

  async listReviewFindingLedgerEntries(): Promise<ReviewFindingLedgerRecord[]> {
    return [];
  }

  async listReviewFindingLedgerEntriesByReport(): Promise<ReviewFindingLedgerRecord[]> {
    return [];
  }

  async updateReviewFindingLedgerDecision(): Promise<ReviewFindingLedgerRecord | null> {
    return null;
  }

  async createReviewFindingDecision(record: ReviewFindingDecisionRecord): Promise<ReviewFindingDecisionRecord> {
    return record;
  }

  async listReviewFindingDecisions(): Promise<ReviewFindingDecisionRecord[]> {
    return [];
  }

  async createReviewRepairAttempt(record: ReviewRepairAttemptRecord): Promise<ReviewRepairAttemptRecord> {
    return record;
  }

  async listReviewRepairAttempts(): Promise<ReviewRepairAttemptRecord[]> {
    return [];
  }

  async updateReviewRepairAttemptAfterRerun(): Promise<ReviewRepairAttemptRecord | null> {
    return null;
  }

  // Fingerprint recovery decision evidence
  async createReviewFingerprintDecision(record: ReviewFingerprintDecisionRecord): Promise<ReviewFingerprintDecisionRecord> {
    return record;
  }

  async getLatestReviewFingerprintDecision(): Promise<ReviewFingerprintDecisionRecord | null> {
    return null;
  }

  async listReviewFingerprintDecisions(): Promise<ReviewFingerprintDecisionRecord[]> {
    return [];
  }

  // Final-verification evidence
  async recordFinalVerificationRun(record: FinalVerificationRunRecord): Promise<FinalVerificationRunRecord> {
    return record;
  }

  async recordFinalVerificationCheck(record: FinalVerificationCheckRecord): Promise<FinalVerificationCheckRecord> {
    return record;
  }

  async listFinalVerificationRuns(): Promise<FinalVerificationRunRecord[]> {
    return [];
  }

  async listFinalVerificationChecks(): Promise<FinalVerificationCheckRecord[]> {
    return [];
  }

  // Manual-test verification
  async recordManualTestPack(): Promise<void> {
    // Manual-test pack persistence is disabled.
  }

  async getCurrentManualTestPack(): Promise<ManualTestVerificationPackRecord | null> {
    return null;
  }

  async getManualTestPack(): Promise<ManualTestVerificationPackRecord | null> {
    return null;
  }

  async listManualTestPacks(): Promise<ManualTestVerificationPackRecord[]> {
    return [];
  }

  async markManualTestPackSuperseded(): Promise<void> {
    // Manual-test pack supersede is disabled.
  }

  async setManualTestPackState(): Promise<void> {
    // Manual-test pack state update is disabled.
  }

  async recordManualTestReview(record: ManualTestVerificationReviewRecord): Promise<ManualTestVerificationReviewRecord> {
    return record;
  }

  async getCurrentManualTestReview(): Promise<ManualTestVerificationReviewRecord | null> {
    return null;
  }

  async invalidateManualTestReview(): Promise<void> {
    // Manual-test review invalidation is disabled.
  }

  async recordManualTestResult(): Promise<void> {
    // Manual-test result persistence is disabled.
  }

  async listManualTestResults(): Promise<ManualTestResultRecord[]> {
    return [];
  }

  async listAllManualTestResults(): Promise<ManualTestResultRecord[]> {
    return [];
  }
}
