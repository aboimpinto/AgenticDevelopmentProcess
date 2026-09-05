/**
 * FEAT-065: ReviewGovernanceSqliteStore
 *
 * Additive, append-only SQLite store for immutable review ingestion and
 * authoritative phase-gate decisions. Shares the same SQLite database as
 * existing stores but owns only new `hepha_review_*` tables.
 *
 * Runtime boundary validation: every ingress entry point validates its
 * typed input at runtime before the first property dereference, recomputes
 * SHA-256 from canonical JSON bytes before begin-immediate, and verifies
 * identity again from each persisted row during read-back. The ingress
 * accepts only a validated discriminated V1 aggregate: a review_manifest
 * creates a run and derived evidence; a non-manifest artifact binds to an
 * already persisted exact-scope manifest/run and never creates a synthetic
 * run whose manifest_hash is the non-manifest artifact.
 *
 * Compatibility Decision: BREAKING CHANGE PERMITTED.
 * This is an internal V1 schema with no approved external consumer.
 *
 * @module
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { applyReviewGovernanceMigrations } from "./review-governance/migrations/index.js";
import {
  persistReviewArtifactFileV1,
  type ReviewArtifactPublisher,
} from "./review-governance/artifact-file-store.js";
import { ReviewSafeIncidentRepository } from "./review-governance/safe-incident-repository.js";
import { ReviewArtifactRepository } from "./review-governance/artifact-repository.js";
import { ReviewGateRepository } from "./review-governance/gate-repository.js";
import { ReviewEvidenceRepository } from "./review-governance/evidence-repository.js";
import { ReviewIngestRepository } from "./review-governance/review-ingest-repository.js";
import { ReviewReplanEventRepository } from "./review-governance/replan-event-repository.js";
import { ReviewReplanQueryRepository } from "./review-governance/replan-query-repository.js";
import { resolveCurrentCatalogSnapshots } from "./review-governance/review-ingest-validation.js";
export { computeSha256Hex } from "./review-governance/review-ingest-validation.js";
import {
  type ReviewStoreArtifactKind,
  type ReviewStoreSourceMode,
  type ReviewStoreCycleState,
  type ReviewStoreGateState,
  type ReviewLineageInput,
  type ReviewFindingObservationInput,
  type ReviewRemediationCycleInput,
  type ReviewRemediationItemInput,
  type ReviewVerificationReceiptInput,
  type ReviewGateDecisionInput,
  type PersistReviewArtifactFileInput,
  type PersistedReviewArtifactFile,
  type ReviewSafeIncidentInput,
  type ReviewGovernanceStoreContext,
  type StoredReviewArtifact,
  type StoredReviewGateDecision,
  type StoredReviewSafeIncident,
  type StoredReviewRun,
  type StoredReviewFinding,
  type StoredReviewFindingObservation,
  type StoredReviewArtifactLineage,
  type StoredReviewRemediationCycle,
  type StoredReviewRemediationItemEvent,
  type StoredReviewVerificationReceiptEvent,
  type ReplanGovernanceReviewScope,
  type StoredReviewFindingObservationContext,
  type StoredReplanGovernanceAggregate,
} from "./review-governance/contracts.js";
export type {
  ReviewStoreArtifactKind,
  ReviewStoreSourceMode,
  ReviewStoreCycleState,
  ReviewStoreGateState,
  ReviewArtifactReferenceInput,
  ReviewLineageInput,
  ReviewFindingObservationInput,
  ReviewRemediationCycleInput,
  ReviewRemediationItemInput,
  ReviewVerificationReceiptInput,
  ReviewGateDecisionInput,
  PersistReviewArtifactFileInput,
  PersistedReviewArtifactFile,
  ReviewSafeIncidentInput,
  ReviewIngestInput,
  ReviewGovernanceStoreContext,
  ReviewStoreFindingInput,
  StoredReviewArtifact,
  StoredReviewGateDecision,
  StoredReviewSafeIncident,
  StoredReviewRun,
  StoredReviewFinding,
  StoredReviewFindingObservation,
  StoredReviewArtifactLineage,
  StoredReviewRemediationCycle,
  StoredReviewRemediationItemEvent,
  StoredReviewVerificationReceiptEvent,
  ReplanObservationKind,
  ReplanGovernanceState,
  ReplanDecisionOutcome,
  ReplanDispatchOutcome,
  ReplanGovernanceScope,
  ReplanGovernanceReviewScope,
  StoredReviewFindingObservationContext,
  AppendDefectClassObservationInput,
  AppendReplanRequestInput,
  AppendScopeExpansionDecisionInput,
  AppendReplanDecisionInput,
  AppendReplanTransitionInput,
  AppendReplanDispatchAttemptInput,
  AppendReplanReviewAssessmentInput,
  StoredReplanDefectClassObservation,
  StoredReplanRequest,
  StoredScopeExpansionDecision,
  StoredReplanDecision,
  StoredReplanTransition,
  StoredReplanDispatchAttempt,
  StoredReplanReviewAssessment,
  ReplanGovernanceOperation,
  StoredReplanGovernanceAggregate,
} from "./review-governance/contracts.js";

// ---------------------------------------------------------------------------
// ReviewGovernanceSqliteStore
// ---------------------------------------------------------------------------

/**
 * Additive, append-only SQLite store for FEAT-065 immutable review ingestion
 * and authoritative phase gates.
 *
 * Runtime boundary: every ingress method validates its typed input at runtime
 * before the first property dereference. SHA-256 is recomputed from canonical
 * JSON before begin-immediate and again during read-back.
 *
 * Discriminated aggregate: a review_manifest creates an artifact + run +
 * findings + derived evidence. A non-manifest artifact creates only the
 * artifact + lineage and binds to an already persisted manifest/run; it
 * never creates a synthetic run whose manifest_hash is the non-manifest
 * artifact.
 */
export class ReviewGovernanceSqliteStore {
  private readonly database: DatabaseSync;
  private readonly artifactRepository: ReviewArtifactRepository;
  private readonly evidenceRepository: ReviewEvidenceRepository;
  private readonly gateRepository: ReviewGateRepository;
  private readonly ingestRepository: ReviewIngestRepository;
  private readonly replanEventRepository: ReviewReplanEventRepository;
  private readonly replanQueryRepository: ReviewReplanQueryRepository;
  private readonly safeIncidentRepository: ReviewSafeIncidentRepository;
  private schemaReady = false;

  constructor(databasePath: string, context: ReviewGovernanceStoreContext) {
    // The authority context must be independently resolved before ingress;
    // it is not optional and is never read from a review request.
    const currentCatalogSnapshots = resolveCurrentCatalogSnapshots(context?.currentActiveRuleSnapshots);
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(
      "pragma foreign_keys = on; pragma journal_mode = wal; pragma busy_timeout = 5000;",
    );
    this.artifactRepository = new ReviewArtifactRepository(this.database);
    this.evidenceRepository = new ReviewEvidenceRepository(this.database);
    this.gateRepository = new ReviewGateRepository(this.database);
    this.ingestRepository = new ReviewIngestRepository(
      this.database,
      this.artifactRepository,
      this.evidenceRepository,
      this.gateRepository,
      currentCatalogSnapshots,
    );
    this.replanQueryRepository = new ReviewReplanQueryRepository(this.database);
    this.replanEventRepository = new ReviewReplanEventRepository(
      this.database,
      this.artifactRepository,
      this.replanQueryRepository,
    );
    this.safeIncidentRepository = new ReviewSafeIncidentRepository(this.database);
    this.ensureSchema();
  }

  close(): void {
    this.database.close();
  }

  // -----------------------------------------------------------------------
  // Schema / Migration
  // -----------------------------------------------------------------------

  /**
   * Idempotent schema creation. Applies V1 through V3 migrations if absent.
   * Safe to call multiple times; safe on empty, existing, and legacy databases.
   */
  ensureSchema(): void {
    if (this.schemaReady) return;
    applyReviewGovernanceMigrations(this.database);
    this.schemaReady = true;
  }

  /**
   * Re-run schema setup for tests or re-initialization.
   * Safe to call after construction; idempotent.
   */
  ensureSchemaForTest(): void {
    this.schemaReady = false;
    this.ensureSchema();
  }

  // -----------------------------------------------------------------------
  /** Validate and atomically persist one immutable review aggregate. */
  ingestValidatedReviewEvidence(rawInput: unknown): string {
    return this.ingestRepository.ingestValidatedReviewEvidence(rawInput);
  }

  // -----------------------------------------------------------------------
  // Public Read APIs
  // -----------------------------------------------------------------------

  /**
   * Read a stored artifact by its content hash.
   */
  getArtifactByHash(hash: string): StoredReviewArtifact | null {
    return this.artifactRepository.getByHash(hash);
  }

  /**
   * Get the current (greatest gate_decision_id) authoritative phase-gate
   * decision for the given exact scope.
   *
   * Returns null when no row exists for that scope.
   */
  getCurrentAuthoritativeReviewGate(scope: {
    projectId: string;
    featureId: string;
    phaseNumber: number;
    reviewGateId: string;
  }): StoredReviewGateDecision | null {
    return this.gateRepository.getCurrent(scope);
  }

  /**
   * List all gate decisions for a scope, ordered by descending gate_decision_id.
   */
  listGateDecisions(scope: {
    projectId: string;
    featureId: string;
    phaseNumber: number;
    reviewGateId: string;
  }): StoredReviewGateDecision[] {
    return this.gateRepository.listDecisions(scope);
  }

  /**
   * List all artifacts for a given scope, ordered by ingested_at descending.
   */
  listArtifactsByScope(scope: {
    projectId: string;
    featureId: string;
    phaseNumber: number;
    reviewGateId: string;
  }): StoredReviewArtifact[] {
    return this.artifactRepository.listByScope(scope);
  }

  /**
   * Enumerate exact immutable review scopes for one project. The caller must
   * still reconstruct each current safe read model through the authoritative
   * provider; this list grants no artifact-content or authority access.
   */
  listReviewGovernanceForProject(rawProjectId: unknown): readonly ReplanGovernanceReviewScope[] {
    return this.gateRepository.listScopesForProject(rawProjectId);
  }

  /**
   * Get the review run associated with a manifest hash.
   */
  getReviewRunByManifestHash(manifestHash: string): StoredReviewRun | null {
    return this.artifactRepository.getRunByManifestHash(manifestHash);
  }

  /**
   * List findings for a review run.
   */
  listFindingsByRun(reviewRunId: string): StoredReviewFinding[] {
    return this.evidenceRepository.listFindingsByRun(reviewRunId);
  }

  /** Immutable lineage for one exact artifact identity, ordered by relation and hash. */
  listArtifactLineageByArtifactHash(artifactHash: unknown): StoredReviewArtifactLineage[] {
    return this.artifactRepository.listLineageByArtifactHash(artifactHash);
  }

  /** Immutable finding observations for one exact persisted review run. */
  listFindingObservationsByRun(reviewRunId: unknown): StoredReviewFindingObservation[] {
    return this.evidenceRepository.listObservationsByRun(reviewRunId);
  }

  /** Immutable cycle events isolated to one exact workflow scope. */
  listRemediationCyclesByScope(scope: unknown): StoredReviewRemediationCycle[] {
    return this.evidenceRepository.listCyclesByScope(scope);
  }

  /** Immutable remediation item events for one exact persisted review run. */
  listRemediationItemEventsByRun(reviewRunId: unknown): StoredReviewRemediationItemEvent[] {
    return this.evidenceRepository.listRemediationItemsByRun(reviewRunId);
  }

  /** Immutable verification receipt events for one exact persisted review run. */
  listVerificationReceiptEventsByRun(reviewRunId: unknown): StoredReviewVerificationReceiptEvent[] {
    return this.evidenceRepository.listVerificationReceiptsByRun(reviewRunId);
  }

  // -----------------------------------------------------------------------
  // FEAT-066 V3 public append-only governance boundary
  // -----------------------------------------------------------------------

  /** Commit one closed V3 operation through the dedicated atomic event repository. */
  commitReplanGovernanceOperation(rawInput: unknown, verifyReadBack?: (aggregate: StoredReplanGovernanceAggregate) => boolean): StoredReplanGovernanceAggregate {
    return this.replanEventRepository.commit(rawInput, verifyReadBack);
  }

  getReplanGovernanceAggregate(rawScope: unknown, rawAggregateId: unknown): StoredReplanGovernanceAggregate {
    return this.replanQueryRepository.getAggregate(rawScope, rawAggregateId);
  }

  /**
   * Enumerate immutable V3 aggregates for one exact review scope. This is the
   * only public aggregate discovery boundary; callers cannot reconstruct a
   * current aggregate from filenames, Markdown, or a caller-selected class.
   */
  listReplanGovernanceAggregates(rawScope: unknown): readonly StoredReplanGovernanceAggregate[] {
    return this.replanQueryRepository.listAggregates(rawScope);
  }

  /**
   * Enumerate all restart-safe V3 replan aggregates for a project. The store
   * derives their exact identities from append-only rows; callers cannot
   * create a class or aggregate identity by supplying one.
   */
  listReplanGovernanceForProject(rawProjectId: unknown): readonly StoredReplanGovernanceAggregate[] {
    return this.replanQueryRepository.listForProject(rawProjectId);
  }

  /** Read the immutable review-run provenance of one finding observation. */
  getReviewFindingObservationContext(rawObservationId: unknown): StoredReviewFindingObservationContext | null {
    return this.evidenceRepository.getObservationContext(rawObservationId);
  }

  /**
   * Record a safe incident (append-only, secret-safe metadata only).
   * Runtime boundary validation (F4) before any property dereference.
   */
  recordSafeIncident(rawInput: unknown): void {
    this.safeIncidentRepository.record(rawInput);
  }

  // -----------------------------------------------------------------------
  // Content-Addressed File Persistence Helpers (F3)
  // -----------------------------------------------------------------------

  /**
   * Publish a V1 artifact at its sole content-addressed path. The public
   * request deliberately has no destination/path field: all locations are
   * derived from the validated feature root, kind, and canonical hash.
   */
  static persistArtifactFileV1(
    rawInput: unknown,
    publisher?: ReviewArtifactPublisher,
  ): PersistedReviewArtifactFile {
    return persistReviewArtifactFileV1(rawInput, publisher);
  }
}
