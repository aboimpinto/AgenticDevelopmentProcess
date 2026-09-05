export * from "./safety-kernel-store.js";
export * from "./review-governance-store.js";
export * from "./architecture-debt-store.js";
export * from "./governance-rollout-store.js";
export * from "./runtime-invocation/runtime-invocation-store.js";
export * from "./runtime-invocation/direct-host-runtime-evidence-store.js";

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { DisabledCardMetadataStore } from "./adapters/disabled-card-metadata-store.js";
import { resolveSqliteDatabasePath } from "./configuration/database-configuration.js";
import { SqliteMetadataSchema } from "./sqlite/sqlite-metadata-schema.js";
import { SqliteQueryContext } from "./sqlite/sqlite-query-context.js";
import { SqliteApprovalRepository } from "./sqlite/repositories/sqlite-approval-repository.js";
import { SqliteCardRepository } from "./sqlite/repositories/sqlite-card-repository.js";
import { SqliteDeliveryRepository } from "./sqlite/repositories/sqlite-delivery-repository.js";
import { SqliteFinalVerificationRepository } from "./sqlite/repositories/sqlite-final-verification-repository.js";
import { SqliteManualTestRepository } from "./sqlite/repositories/sqlite-manual-test-repository.js";
import { SqliteReviewEvidenceRepository } from "./sqlite/repositories/sqlite-review-evidence-repository.js";
import { SqliteTelemetryRepository } from "./sqlite/repositories/sqlite-telemetry-repository.js";
import { SqliteWorkflowRunRepository } from "./sqlite/repositories/sqlite-workflow-run-repository.js";

import type {
  AgentInvocationRecord,
  AgentInvocationStatus,
  ApprovalDbStatus,
  CardMetadataStore,
  DeliveryMetadataInput,
  DeliveryMetadataRecord,
  EventFilter,
  FeatureFindingAgentRunRecord,
  FeatureFindingCreateRecord,
  FeatureFindingDetailRecord,
  FeatureFindingEventKind,
  FeatureFindingEventRole,
  FeatureFindingResolveRecord,
  FeatureFindingStatus,
  FeatureHumanReviewRecord,
  FeatureReadinessSourceConfirmationRecord,
  FeatureUiRequirementRecord,
  FeatureWorkflowCommand,
  FeatureWorkflowCompletionRecord,
  FeatureWorkflowRunRecord,
  FinalVerificationCheckRecord,
  FinalVerificationRunRecord,
  HephaDeepDiveRecord,
  ImplementationAgentRunRecord,
  ImplementationPhaseRunRecord,
  ImplementationTaskRunRecord,
  ImplementationTaskRunStatus,
  InvocationFilter,
  ManualTestPackDbState,
  ManualTestResultDbOutcome,
  ManualTestResultRecord,
  ManualTestReviewDbState,
  ManualTestVerificationPackRecord,
  ManualTestVerificationReviewRecord,
  NormalizedEventName,
  NormalizedEventRecord,
  PhaseLifecycleEventRecord,
  ReviewFindingDecisionRecord,
  ReviewFindingLedgerRecord,
  ReviewFingerprintDecisionRecord,
  ReviewRepairAttemptRecord,
  ScannedCardMetadata,
  StartTransitionExceptionRecord,
  StartTransitionRecord,
  StoredAgentInvocation,
  StoredApprovalRequest,
  StoredCardMetadata,
  StoredDeepDiveSession,
  StoredFeatureFinding,
  StoredFeatureFindingEvent,
  StoredImplementationAgentRun,
  StoredImplementationPhaseRun,
  StoredImplementationTaskRun,
  StoredNormalizedEvent,
  StoredPhaseLifecycleEvent,
} from "./contracts/index.js";
export * from "./contracts/index.js";
export * from "./configuration/database-configuration.js";
import {
  mapFeatureFindingRow,
  type StoredFeatureFindingRow,
} from "./sqlite/row-mappers/workflow-row-mappers.js";


type SqliteValue = string | number | null;

export function createCardMetadataStore(
  env: Record<string, string | undefined>,
): CardMetadataStore {
  if (env.HEPHA_DISABLE_METADATA_STORE === "1") {
    return new DisabledCardMetadataStore();
  }

  return new SqliteCardMetadataStore(resolveSqliteDatabasePath(env));
}

class SqliteCardMetadataStore implements CardMetadataStore {
  readonly backend = "sqlite" as const;
  readonly databasePath: string;
  readonly enabled = true;
  private readonly database: DatabaseSync;
  private readonly schema: SqliteMetadataSchema;
  private readonly query: SqliteQueryContext;
  private readonly approvals: SqliteApprovalRepository;
  private readonly cards: SqliteCardRepository;
  private readonly delivery: SqliteDeliveryRepository;
  private readonly finalVerification: SqliteFinalVerificationRepository;
  private readonly manualTests: SqliteManualTestRepository;
  private readonly reviews: SqliteReviewEvidenceRepository;
  private readonly telemetry: SqliteTelemetryRepository;
  private readonly workflowRuns: SqliteWorkflowRunRepository;

  constructor(databasePath: string) {
    this.databasePath = databasePath;

    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }

    this.database = new DatabaseSync(databasePath);
    this.schema = new SqliteMetadataSchema(this.database);
    this.query = new SqliteQueryContext(this.database, this.schema);
    this.approvals = new SqliteApprovalRepository(this.query);
    this.cards = new SqliteCardRepository(this.query);
    this.delivery = new SqliteDeliveryRepository(this.query);
    this.finalVerification = new SqliteFinalVerificationRepository(this.query);
    this.manualTests = new SqliteManualTestRepository(this.query);
    this.reviews = new SqliteReviewEvidenceRepository(this.query);
    this.telemetry = new SqliteTelemetryRepository(this.query);
    this.workflowRuns = new SqliteWorkflowRunRepository(this.query);
    this.database.exec("pragma foreign_keys = on; pragma busy_timeout = 5000;");

    if (databasePath !== ":memory:") {
      this.database.exec("pragma journal_mode = WAL;");
    }
  }

  async close() {
    this.database.close();
  }

  async createDeepDiveSession(session: StoredDeepDiveSession) {
    return this.cards.createDeepDiveSession(session);
  }

  async findOpenDeepDiveSession(projectId: string, cardKey: string) {
    return this.cards.findOpenDeepDiveSession(projectId, cardKey);
  }

  async getDeepDiveSession(sessionId: string) {
    return this.cards.getDeepDiveSession(sessionId);
  }

  async getCardMetadata(projectId: string, cardKey: string) {
    return this.cards.getCardMetadata(projectId, cardKey);
  }


  async getFeatureFinding(projectId: string, cardKey: string, findingId: string) {
    this.schema.ensure();

    const row = this.get<StoredFeatureFindingRow>(
      `
      select *
      from hepha_feature_findings
      where project_id = ?
        and card_key = ?
        and id = ?
      `,
      [projectId, cardKey, findingId],
    );

    return row ? mapFeatureFindingRow(row) : null;
  }

  async listFeatureFindings(projectId: string, cardKeys: string[]) {
    this.schema.ensure();

    if (cardKeys.length === 0) {
      return new Map<string, StoredFeatureFinding[]>();
    }

    const rows = this.all<StoredFeatureFindingRow>(
      `
      select *
      from hepha_feature_findings
      where project_id = ?
        and card_key in (${placeholders(cardKeys.length)})
      order by created_at asc, id asc
      `,
      [projectId, ...cardKeys],
    );
    const findingsByCardKey = new Map<string, StoredFeatureFinding[]>();

    for (const row of rows) {
      const finding = mapFeatureFindingRow(row);
      const findings = findingsByCardKey.get(finding.cardKey) ?? [];

      findings.push(finding);
      findingsByCardKey.set(finding.cardKey, findings);
    }

    return findingsByCardKey;
  }

  async createFeatureFinding(record: FeatureFindingCreateRecord) {
    this.schema.ensure();

    const now = nowIso();
    const event: StoredFeatureFindingEvent = {
      content: record.content,
      createdAt: now,
      id: record.eventId,
      kind: "finding",
      role: "user",
    };

    this.run(
      `
      insert into hepha_feature_findings (
        id,
        project_id,
        card_key,
        status,
        title,
        events,
        created_at,
        updated_at
      )
      values (?, ?, ?, 'open', ?, ?, ?, ?)
      `,
      [
        record.findingId,
        record.projectId,
        record.cardKey,
        record.title,
        JSON.stringify([event]),
        now,
        now,
      ],
    );

    const finding = await this.getFeatureFinding(record.projectId, record.cardKey, record.findingId);

    if (!finding) {
      throw new Error(`Could not read feature finding after create: ${record.findingId}`);
    }

    return finding;
  }

  async appendFeatureFindingDetail(record: FeatureFindingDetailRecord) {
    this.schema.ensure();

    const finding = await this.getFeatureFinding(record.projectId, record.cardKey, record.findingId);

    if (!finding) {
      throw new Error(`Feature finding not found: ${record.findingId}`);
    }

    const now = nowIso();
    const event: StoredFeatureFindingEvent = {
      content: record.content,
      createdAt: now,
      id: record.eventId,
      kind: "follow_up",
      role: "user",
    };

    this.run(
      `
      update hepha_feature_findings
      set
        status = 'open',
        events = ?,
        closed_at = null,
        current_step = null,
        error = null,
        updated_at = ?
      where project_id = ?
        and card_key = ?
        and id = ?
      `,
      [
        JSON.stringify([...finding.events, event]),
        now,
        record.projectId,
        record.cardKey,
        record.findingId,
      ],
    );

    const updatedFinding = await this.getFeatureFinding(record.projectId, record.cardKey, record.findingId);

    if (!updatedFinding) {
      throw new Error(`Could not read feature finding after update: ${record.findingId}`);
    }

    return updatedFinding;
  }

  async closeFeatureFinding(record: FeatureFindingResolveRecord) {
    this.schema.ensure();

    const finding = await this.getFeatureFinding(record.projectId, record.cardKey, record.findingId);

    if (!finding) {
      return null;
    }

    const now = nowIso();
    const event: StoredFeatureFindingEvent = {
      content: "User marked this finding as solved.",
      createdAt: now,
      id: record.eventId,
      kind: "status",
      role: "user",
    };

    this.run(
      `
      update hepha_feature_findings
      set
        status = 'closed',
        events = ?,
        closed_at = ?,
        current_step = null,
        error = null,
        updated_at = ?
      where project_id = ?
        and card_key = ?
        and id = ?
      `,
      [
        JSON.stringify([...finding.events, event]),
        now,
        now,
        record.projectId,
        record.cardKey,
        record.findingId,
      ],
    );

    return this.getFeatureFinding(record.projectId, record.cardKey, record.findingId);
  }

  async recordHephaDeepDive(record: HephaDeepDiveRecord) {
    return this.cards.recordHephaDeepDive(record);
  }

  async recordFeatureUiRequirement(record: FeatureUiRequirementRecord) {
    return this.cards.recordFeatureUiRequirement(record);
  }

  async confirmFeatureReadinessSource(record: FeatureReadinessSourceConfirmationRecord) {
    return this.cards.confirmFeatureReadinessSource(record);
  }

  async recordFeatureHumanReview(record: FeatureHumanReviewRecord) {
    return this.cards.recordFeatureHumanReview(record);
  }


  async recordFeatureFindingAgentRun(record: FeatureFindingAgentRunRecord) {
    this.schema.ensure();
    const now = nowIso();
    let eventsJson: string | null = null;

    if (record.event) {
      const finding = await this.getFeatureFinding(record.projectId, record.cardKey, record.findingId);
      eventsJson = JSON.stringify([...(finding?.events ?? []), record.event]);
    }

    if (eventsJson) {
      this.run(
        `
        update hepha_feature_findings
        set
          status = ?,
          agent_run_id = ?,
          current_step = ?,
          summary = ?,
          error = ?,
          events = ?,
          updated_at = ?
        where project_id = ?
          and card_key = ?
          and id = ?
        `,
        [
          record.status,
          record.runId ?? null,
          record.currentStep ?? null,
          record.summary ?? null,
          record.error ?? null,
          eventsJson,
          now,
          record.projectId,
          record.cardKey,
          record.findingId,
        ],
      );
      return;
    }

    this.run(
      `
      update hepha_feature_findings
      set
        status = ?,
        agent_run_id = ?,
        current_step = ?,
        summary = ?,
        error = ?,
        updated_at = ?
      where project_id = ?
        and card_key = ?
        and id = ?
      `,
      [
        record.status,
        record.runId ?? null,
        record.currentStep ?? null,
        record.summary ?? null,
        record.error ?? null,
        now,
        record.projectId,
        record.cardKey,
        record.findingId,
      ],
    );
  }

  async recordFeatureWorkflowCompletion(record: FeatureWorkflowCompletionRecord) {
    return this.workflowRuns.recordFeatureWorkflowCompletion(record);
  }

  async recordFeatureWorkflowRun(record: FeatureWorkflowRunRecord) {
    return this.workflowRuns.recordFeatureWorkflowRun(record);
  }

  async recordImplementationPhaseRun(record: ImplementationPhaseRunRecord) {
    return this.workflowRuns.recordImplementationPhaseRun(record);
  }

  async recordImplementationTaskRun(record: ImplementationTaskRunRecord) {
    return this.workflowRuns.recordImplementationTaskRun(record);
  }

  async recordImplementationAgentRun(record: ImplementationAgentRunRecord) {
    return this.workflowRuns.recordImplementationAgentRun(record);
  }

  async listImplementationPhaseRuns(projectId: string, cardKeys: string[]) {
    return this.workflowRuns.listImplementationPhaseRuns(projectId, cardKeys);
  }

  async listImplementationAgentRuns(projectId: string, cardKeys: string[]) {
    return this.workflowRuns.listImplementationAgentRuns(projectId, cardKeys);
  }

  async listImplementationTaskRuns(
    projectId: string,
    cardKey: string,
    phaseNumber: number,
  ) {
    return this.workflowRuns.listImplementationTaskRuns(projectId, cardKey, phaseNumber);
  }


  async updateDeepDiveSession(session: StoredDeepDiveSession) {
    return this.cards.updateDeepDiveSession(session);
  }

  async reconcileScannedCards(cards: ScannedCardMetadata[]) {
    return this.cards.reconcileScannedCards(cards);
  }


  async createApprovalRequest(
    request: StoredApprovalRequest,
  ): Promise<StoredApprovalRequest> {
    return this.approvals.createApprovalRequest(request);
  }

  async getApprovalRequest(
    requestId: string,
  ): Promise<StoredApprovalRequest | null> {
    return this.approvals.getApprovalRequest(requestId);
  }

  async listApprovalRequests(
    projectId: string,
    status: ApprovalDbStatus | "all" = "pending",
    limit: number = 50,
  ): Promise<StoredApprovalRequest[]> {
    return this.approvals.listApprovalRequests(projectId, status, limit);
  }

  async listApprovalRequestsByCard(
    projectId: string,
    cardKey: string,
  ): Promise<StoredApprovalRequest[]> {
    return this.approvals.listApprovalRequestsByCard(projectId, cardKey);
  }

  async resolveApprovalRequest(
    requestId: string,
    status: "approved" | "denied" | "timed_out",
    resolvedBy: string,
    resolutionReason: string | null,
  ): Promise<StoredApprovalRequest | null> {
    return this.approvals.resolveApprovalRequest(
      requestId,
      status,
      resolvedBy,
      resolutionReason,
    );
  }

  async finalizeTimedOutApprovals(clockNow: string): Promise<number> {
    return this.approvals.finalizeTimedOutApprovals(clockNow);
  }


  async recordAgentInvocation(record: AgentInvocationRecord): Promise<void> {
    return this.telemetry.recordAgentInvocation(record);
  }

  async recordNormalizedEvent(record: NormalizedEventRecord): Promise<void> {
    return this.telemetry.recordNormalizedEvent(record);
  }

  async queryAgentInvocations(
    filters: InvocationFilter,
  ): Promise<StoredAgentInvocation[]> {
    return this.telemetry.queryAgentInvocations(filters);
  }

  async queryNormalizedEvents(
    filters: EventFilter,
  ): Promise<StoredNormalizedEvent[]> {
    return this.telemetry.queryNormalizedEvents(filters);
  }

  async recordPhaseLifecycleEvent(
    record: PhaseLifecycleEventRecord,
  ): Promise<void> {
    return this.telemetry.recordPhaseLifecycleEvent(record);
  }

  async queryPhaseLifecycleEventsAfterCursor(
    projectId: string,
    cursorId: string,
  ): Promise<StoredPhaseLifecycleEvent[]> {
    return this.telemetry.queryPhaseLifecycleEventsAfterCursor(projectId, cursorId);
  }



  async recordStartTransition(record: StartTransitionRecord): Promise<void> {
    return this.delivery.recordStartTransition(record);
  }

  async getStartTransition(cardKey: string, projectId: string, runId: string): Promise<StartTransitionRecord | null> {
    return this.delivery.getStartTransition(cardKey, projectId, runId);
  }

  async listStartTransitions(cardKey: string, projectId: string): Promise<StartTransitionRecord[]> {
    return this.delivery.listStartTransitions(cardKey, projectId);
  }

  async recordStartTransitionException(record: StartTransitionExceptionRecord): Promise<void> {
    return this.delivery.recordStartTransitionException(record);
  }

  async upsertDeliveryMetadata(input: DeliveryMetadataInput, clockNow: string): Promise<DeliveryMetadataRecord> {
    return this.delivery.upsertDeliveryMetadata(input, clockNow);
  }

  async getDeliveryMetadata(projectId: string, cardKey: string): Promise<DeliveryMetadataRecord | null> {
    return this.delivery.getDeliveryMetadata(projectId, cardKey);
  }

  async listDeliveryMetadata(projectId: string): Promise<DeliveryMetadataRecord[]> {
    return this.delivery.listDeliveryMetadata(projectId);
  }

  async createReviewFindingLedgerEntry(
    record: ReviewFindingLedgerRecord,
  ): Promise<ReviewFindingLedgerRecord> {
    return this.reviews.createReviewFindingLedgerEntry(record);
  }

  async listReviewFindingLedgerEntries(
    projectId: string,
    cardKey: string,
    phaseNumber?: number,
  ): Promise<ReviewFindingLedgerRecord[]> {
    return this.reviews.listReviewFindingLedgerEntries(projectId, cardKey, phaseNumber);
  }

  async listReviewFindingLedgerEntriesByReport(
    reviewReportPath: string,
  ): Promise<ReviewFindingLedgerRecord[]> {
    return this.reviews.listReviewFindingLedgerEntriesByReport(reviewReportPath);
  }

  async updateReviewFindingLedgerDecision(
    id: string,
    classification: string,
    resolutionState: string,
    rationale: string | null,
    updatedAt: string,
  ): Promise<ReviewFindingLedgerRecord | null> {
    return this.reviews.updateReviewFindingLedgerDecision(
      id,
      classification,
      resolutionState,
      rationale,
      updatedAt,
    );
  }

  async createReviewFindingDecision(
    record: ReviewFindingDecisionRecord,
  ): Promise<ReviewFindingDecisionRecord> {
    return this.reviews.createReviewFindingDecision(record);
  }

  async listReviewFindingDecisions(
    findingLedgerId: string,
  ): Promise<ReviewFindingDecisionRecord[]> {
    return this.reviews.listReviewFindingDecisions(findingLedgerId);
  }

  async createReviewRepairAttempt(
    record: ReviewRepairAttemptRecord,
  ): Promise<ReviewRepairAttemptRecord> {
    return this.reviews.createReviewRepairAttempt(record);
  }

  async listReviewRepairAttempts(
    projectId: string,
    cardKey: string,
    phaseNumber: number,
  ): Promise<ReviewRepairAttemptRecord[]> {
    return this.reviews.listReviewRepairAttempts(projectId, cardKey, phaseNumber);
  }

  async updateReviewRepairAttemptAfterRerun(
    id: string,
    rerunReviewReportPath: string,
    rerunResult: string,
    unresolvedAfterCount: number,
    completedAt: string,
  ): Promise<ReviewRepairAttemptRecord | null> {
    return this.reviews.updateReviewRepairAttemptAfterRerun(
      id,
      rerunReviewReportPath,
      rerunResult,
      unresolvedAfterCount,
      completedAt,
    );
  }

  async createReviewFingerprintDecision(
    record: ReviewFingerprintDecisionRecord,
  ): Promise<ReviewFingerprintDecisionRecord> {
    return this.reviews.createReviewFingerprintDecision(record);
  }

  async getLatestReviewFingerprintDecision(
    projectId: string,
    cardKey: string,
    phaseNumber: number,
    reviewGateId: string,
  ): Promise<ReviewFingerprintDecisionRecord | null> {
    return this.reviews.getLatestReviewFingerprintDecision(
      projectId,
      cardKey,
      phaseNumber,
      reviewGateId,
    );
  }

  async listReviewFingerprintDecisions(
    projectId: string,
    cardKey: string,
    phaseNumber: number,
  ): Promise<ReviewFingerprintDecisionRecord[]> {
    return this.reviews.listReviewFingerprintDecisions(projectId, cardKey, phaseNumber);
  }

  async recordFinalVerificationRun(
    record: FinalVerificationRunRecord,
  ): Promise<FinalVerificationRunRecord> {
    return this.finalVerification.recordFinalVerificationRun(record);
  }

  async recordFinalVerificationCheck(
    record: FinalVerificationCheckRecord,
  ): Promise<FinalVerificationCheckRecord> {
    return this.finalVerification.recordFinalVerificationCheck(record);
  }

  async listFinalVerificationRuns(
    projectId: string,
    cardKey: string,
  ): Promise<FinalVerificationRunRecord[]> {
    return this.finalVerification.listFinalVerificationRuns(projectId, cardKey);
  }

  async listFinalVerificationChecks(
    runId: string,
  ): Promise<FinalVerificationCheckRecord[]> {
    return this.finalVerification.listFinalVerificationChecks(runId);
  }



  async recordManualTestPack(record: ManualTestVerificationPackRecord): Promise<void> {
    return this.manualTests.recordManualTestPack(record);
  }

  async getCurrentManualTestPack(projectId: string, cardKey: string): Promise<ManualTestVerificationPackRecord | null> {
    return this.manualTests.getCurrentManualTestPack(projectId, cardKey);
  }

  async getManualTestPack(projectId: string, cardKey: string, packId: string): Promise<ManualTestVerificationPackRecord | null> {
    return this.manualTests.getManualTestPack(projectId, cardKey, packId);
  }

  async listManualTestPacks(projectId: string, cardKey: string): Promise<ManualTestVerificationPackRecord[]> {
    return this.manualTests.listManualTestPacks(projectId, cardKey);
  }

  async markManualTestPackSuperseded(projectId: string, cardKey: string, packId: string, supersededAt: string): Promise<void> {
    return this.manualTests.markManualTestPackSuperseded(projectId, cardKey, packId, supersededAt);
  }

  async setManualTestPackState(projectId: string, cardKey: string, packId: string, state: ManualTestPackDbState, renderError?: string): Promise<void> {
    return this.manualTests.setManualTestPackState(projectId, cardKey, packId, state, renderError);
  }

  async recordManualTestReview(record: ManualTestVerificationReviewRecord): Promise<ManualTestVerificationReviewRecord> {
    return this.manualTests.recordManualTestReview(record);
  }

  async getCurrentManualTestReview(projectId: string, cardKey: string): Promise<ManualTestVerificationReviewRecord | null> {
    return this.manualTests.getCurrentManualTestReview(projectId, cardKey);
  }

  async invalidateManualTestReview(projectId: string, cardKey: string, reviewId: string, invalidatedAt: string, reason?: string): Promise<void> {
    return this.manualTests.invalidateManualTestReview(projectId, cardKey, reviewId, invalidatedAt, reason);
  }

  async recordManualTestResult(record: ManualTestResultRecord): Promise<void> {
    return this.manualTests.recordManualTestResult(record);
  }

  async listManualTestResults(projectId: string, cardKey: string, packId: string): Promise<ManualTestResultRecord[]> {
    return this.manualTests.listManualTestResults(projectId, cardKey, packId);
  }

  async listAllManualTestResults(projectId: string, cardKey: string): Promise<ManualTestResultRecord[]> {
    return this.manualTests.listAllManualTestResults(projectId, cardKey);
  }

  private get<T>(sql: string, params: SqliteValue[] = []) {
    return (this.database.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  private all<T>(sql: string, params: SqliteValue[] = []) {
    return this.database.prepare(sql).all(...params) as T[];
  }

  private run(sql: string, params: SqliteValue[] = []) {
    this.database.prepare(sql).run(...params);
  }
}


function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

function nowIso() {
  return new Date().toISOString();
}

// FEAT-051: Package Trust Store — re-exports
// -------------------------------------------------------------------------

export type {
  PackageIdentity,
  PackageTrustRecord,
  PackageCapabilityGrant,
  PackageRevocationRecord,
  PackagePolicyStatus,
  PackagePolicyDecision,
  PackageEvidence,
  PackageTrustStore,
} from "./package-trust-types.js";

export {
  validatePackageIdentity,
  validateExactVersion,
} from "./package-trust-types.js";

export { SqlitePackageTrustStore } from "./sqlite-package-trust-store.js";
export { ProviderConnectionStore } from "./provider-connection-store.js";
export { ModelCatalogStore } from "./model-catalog-store.js";
export { CatalogReconciliationStore } from "./catalog-reconciliation-store.js";
export { AgentRoutingStore } from "./agent-routing-store.js";
