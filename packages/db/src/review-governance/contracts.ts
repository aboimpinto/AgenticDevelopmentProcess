/**
 * Stable review-governance persistence contracts.
 *
 * This module owns record shapes and finite persisted value sets only. It
 * contains no SQLite, filesystem, validation, or workflow behavior.
 */

/** V1 artifact kind values that the store accepts. */
export type ReviewStoreArtifactKind =
  | "review_manifest"
  | "remediation_response"
  | "verification_receipt"
  | "replan_plan"
  | "debt_observation";

/** The set of allowed artifact kind strings for runtime validation. */
export const ALLOWED_ARTIFACT_KINDS: readonly string[] = [
  "review_manifest",
  "remediation_response",
  "verification_receipt",
  "replan_plan",
  "debt_observation",
];

/** V1 source mode for ingress. */
export type ReviewStoreSourceMode = "v1_validated_ingress";

/** V1 cycle-state values — Phase 3 owns terminal-state semantics. */
export type ReviewStoreCycleState =
  | "NO_REMEDIATION_REQUIRED"
  | "REMEDIATION_VERIFIED"
  | "OPEN"
  | "AWAITING_RESPONSE"
  | "AWAITING_RECEIPT"
  | "REVIEW_PENDING"
  | "REPLAN_REQUIRED";

/** The set of allowed cycle-state strings for runtime validation. */
export const ALLOWED_CYCLE_STATES: readonly string[] = [
  "NO_REMEDIATION_REQUIRED",
  "REMEDIATION_VERIFIED",
  "OPEN",
  "AWAITING_RESPONSE",
  "AWAITING_RECEIPT",
  "REVIEW_PENDING",
  "REPLAN_REQUIRED",
];

/** V1 gate-state values — Phase 3 owns gate derivation. */
export type ReviewStoreGateState =
  | "APPROVED"
  | "REJECTED"
  | "BLOCKED"
  | "PENDING";

/** The set of allowed gate-state strings for runtime validation. */
export const ALLOWED_GATE_STATES: readonly string[] = [
  "APPROVED",
  "REJECTED",
  "BLOCKED",
  "PENDING",
];

/** Validated artifact lineage input. */
export interface ReviewArtifactReferenceInput {
  readonly artifactKind: ReviewStoreArtifactKind;
  readonly artifactId: string;
  readonly contentHash: string;
  readonly relativePath: string;
}
/** Canonical lineage is derived from the validated artifact; callers supply no hash-only lane. */
export interface ReviewLineageInput {
  readonly predecessorHashes?: readonly string[];
  readonly supersedesHash?: string;
  readonly predecessorReferences?: readonly ReviewArtifactReferenceInput[];
  readonly supersedesReference?: ReviewArtifactReferenceInput;
}

/** A finding observation row input. */
export interface ReviewFindingObservationInput {
  readonly observationId: string;
  readonly findingId: string;
  readonly surfaceJson: string;
  readonly remediationItemsJson: string;
  readonly testMatrixJson: string;
  readonly rootCause?: string;
  readonly scopeRationale?: string;
  readonly createdAt: string;
}

/** A remediation cycle input. */
export interface ReviewRemediationCycleInput {
  readonly cycleId: string;
  readonly basisManifestHash: string;
  readonly predecessorCycleId?: string;
  readonly cycleState: ReviewStoreCycleState;
  readonly reasonCode?: string;
  readonly createdAt: string;
}

/** A remediation item event input. */
export interface ReviewRemediationItemInput {
  readonly itemEventId: string;
  readonly cycleId: string;
  readonly reviewRunId: string;
  readonly findingId: string;
  readonly remediationItemId: string;
  readonly eventKind: string;
  readonly responseHash?: string;
  readonly decision?: string;
  readonly outcomeSummary?: string;
  readonly createdAt: string;
}

/** A verification receipt event input. */
export interface ReviewVerificationReceiptInput {
  readonly receiptEventId: string;
  readonly cycleId: string;
  readonly receiptHash: string;
  readonly reviewRunId: string;
  readonly findingId: string;
  readonly subjectKind: string;
  readonly subjectId: string;
  readonly outcome: string;
  readonly evidenceSummary?: string;
  readonly createdAt: string;
}

/** A phase-gate decision input. */
export interface ReviewGateDecisionInput {
  readonly triggerArtifactHash: string;
  readonly basisManifestHash: string;
  readonly cycleId?: string;
  readonly gateState: ReviewStoreGateState;
  readonly reasonCode: string;
  readonly evidenceHashes?: readonly string[];
  readonly decidedAt: string;
}

/** A safe incident input with required scope members. */
/** The only V1 file-publication request. Paths are derived, never supplied. */
export interface PersistReviewArtifactFileInput {
  readonly projectRoot: string;
  readonly featureRootPath: string;
  readonly artifactKind: ReviewStoreArtifactKind;
  readonly contentHash: string;
  readonly canonicalJson: string;
}

/** Publication ownership is required to reconcile an uncommitted final file safely. */
export interface PersistedReviewArtifactFile {
  readonly path: string;
  /** True only when this invocation created the final no-replace link. */
  readonly created: boolean;
}

export interface ReviewSafeIncidentInput {
  readonly incidentId: string;
  readonly projectId: string;
  readonly stage: string;
  readonly incidentCode: string;
  readonly featureId?: string;
  readonly phaseNumber?: number;
  readonly reviewGateId?: string;
  readonly contentHash?: string;
  readonly createdAt: string;
}

/**
 * Full input for one validated review artifact ingestion.
 *
 * Discriminated aggregate: a `review_manifest` artifact creates a run and
 * derived evidence rows; a non-manifest artifact binds to an already
 * persisted manifest/run without creating a synthetic run. Remediation
 * items and verification receipts are inserted only when supplied by the
 * validated artifact and always bind to the correct persisted cycle/run.
 */
export interface ReviewIngestInput {
  readonly contentHash: string;
  readonly artifactId: string;
  readonly artifactKind: ReviewStoreArtifactKind;
  readonly schemaVersion: number;
  readonly canonicalJson: string;

  readonly projectId: string;
  readonly featureId: string;
  readonly phaseNumber: number;
  readonly reviewGateId: string;

  readonly featureRootPath: string;
  readonly artifactRelativePath: string;

  readonly sourceMode: ReviewStoreSourceMode;
  readonly ingestedAt: string;

  /**
   * Retained only for the internal normalized aggregate produced from
   * canonicalJson. Public callers must not supply a hash-only lineage.
   */
  readonly lineage: ReviewLineageInput;


  // Manifest-only fields (ignored for non-manifest artifacts)
  readonly reviewRunId?: string;
  readonly manifestResult?: string;
  readonly workflowRunId?: string;
  readonly agentInvocationId?: string;

  readonly findings?: readonly ReviewStoreFindingInput[];

  readonly cycle?: ReviewRemediationCycleInput;
  readonly gateDecision?: ReviewGateDecisionInput;

  // F2: Required for non-manifest artifacts — exact referenced manifest hash
  readonly basisManifestHash?: string;

  // Non-manifest aggregate fields
  readonly remediationItems?: readonly ReviewRemediationItemInput[];
  readonly verificationReceipts?: readonly ReviewVerificationReceiptInput[];
}

/** A finding within a review run. */
/**
 * Independently resolved authority passed when the store is constructed.
 * This context is deliberately outside each untrusted ingress request: V1
 * canonical bytes may reference only snapshots that exactly match it.
 */
export interface ReviewGovernanceStoreContext {
  readonly currentActiveRuleSnapshots: readonly unknown[];
}

export interface ReviewStoreFindingInput {
  readonly findingId: string;
  readonly disposition: string;
  readonly claimType: string;
  readonly severity: string;
  readonly defectClass: string;
  readonly summary: string;
  readonly ruleReference?: string;
  readonly ruleId?: string;
  readonly ruleVersion?: string;
  readonly ruleHash?: string;
  readonly acSourcePath?: string;
  readonly acSection?: string;

  readonly observation?: ReviewFindingObservationInput;
}

// ---------------------------------------------------------------------------
// Typed Store Read Results
// ---------------------------------------------------------------------------

/**
 * Stored artifact record returned by read APIs.
 */
export interface StoredReviewArtifact {
  readonly contentHash: string;
  readonly artifactId: string;
  readonly artifactKind: ReviewStoreArtifactKind;
  readonly schemaVersion: number;
  readonly projectId: string;
  readonly featureId: string;
  readonly phaseNumber: number;
  readonly reviewGateId: string;
  readonly featureRootPath: string;
  readonly artifactRelativePath: string;
  readonly canonicalJson: string;
  readonly sourceMode: string;
  readonly ingestedAt: string;
}

/**
 * Stored gate-decision record.
 */
export interface StoredReviewGateDecision {
  readonly gateDecisionId: number;
  readonly projectId: string;
  readonly featureId: string;
  readonly phaseNumber: number;
  readonly reviewGateId: string;
  readonly triggerArtifactHash: string;
  readonly basisManifestHash: string;
  readonly cycleId: string | null;
  readonly gateState: ReviewStoreGateState;
  readonly reasonCode: string;
  readonly evidenceHashesJson: string;
  readonly decidedAt: string;
}

/**
 * Stored safe incident record.
 */
export interface StoredReviewSafeIncident {
  readonly incidentId: string;
  readonly projectId: string;
  readonly featureId: string | null;
  readonly phaseNumber: number | null;
  readonly reviewGateId: string | null;
  readonly stage: string;
  readonly incidentCode: string;
  readonly contentHash: string | null;
  readonly createdAt: string;
}

/**
 * Stored review run record.
 */
export interface StoredReviewRun {
  readonly reviewRunId: string;
  readonly manifestHash: string;
  readonly projectId: string;
  readonly featureId: string;
  readonly phaseNumber: number;
  readonly reviewGateId: string;
  readonly manifestResult: string;
  readonly workflowRunId: string | null;
  readonly agentInvocationId: string | null;
  readonly createdAt: string;
}

/**
 * Stored review finding record.
 */
export interface StoredReviewFinding {
  readonly reviewRunId: string;
  readonly findingId: string;
  readonly projectId: string;
  readonly featureId: string;
  readonly phaseNumber: number;
  readonly reviewGateId: string;
  readonly disposition: string;
  readonly claimType: string;
  readonly severity: string;
  readonly defectClass: string;
  readonly summary: string;
  readonly ruleReference: string | null;
  readonly ruleId: string | null;
  readonly ruleVersion: string | null;
  readonly ruleHash: string | null;
  readonly acSourcePath: string | null;
  readonly acSection: string | null;
}

/**
 * Stored review finding observation record.
 */
export interface StoredReviewFindingObservation {
  readonly observationId: string;
  readonly reviewRunId: string;
  readonly findingId: string;
  readonly surfaceJson: string;
  readonly remediationItemsJson: string;
  readonly testMatrixJson: string;
  readonly rootCause: string | null;
  readonly scopeRationale: string | null;
  readonly createdAt: string;
}

export interface StoredReviewArtifactLineage {
  readonly artifactHash: string;
  readonly predecessorHash: string;
  readonly relationKind: "predecessor" | "supersedes";
}

export interface StoredReviewRemediationCycle {
  readonly cycleId: string;
  readonly projectId: string;
  readonly featureId: string;
  readonly phaseNumber: number;
  readonly reviewGateId: string;
  readonly basisManifestHash: string;
  readonly predecessorCycleId: string | null;
  readonly cycleState: ReviewStoreCycleState;
  readonly reasonCode: string | null;
  readonly createdAt: string;
}

export interface StoredReviewRemediationItemEvent {
  readonly itemEventId: string;
  readonly cycleId: string;
  readonly reviewRunId: string;
  readonly findingId: string;
  readonly remediationItemId: string;
  readonly eventKind: string;
  readonly responseHash: string | null;
  readonly decision: string | null;
  readonly outcomeSummary: string | null;
  readonly createdAt: string;
}

export interface StoredReviewVerificationReceiptEvent {
  readonly receiptEventId: string;
  readonly cycleId: string;
  readonly receiptHash: string;
  readonly reviewRunId: string;
  readonly findingId: string;
  readonly subjectKind: "remediation_item" | "test";
  readonly subjectId: string;
  readonly outcome: string;
  readonly evidenceSummary: string | null;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// FEAT-066 V3 immutable replan governance records
// ---------------------------------------------------------------------------

export type ReplanObservationKind = "POST_FIX_MANIFESTATION" | "SCOPE_EXPANSION_ACCEPTED" | "FINDING_EXHAUSTIVENESS";
export type ReplanGovernanceState = "NORMAL_REMEDIATION" | "REMEDIATION_REPLAN_REQUIRED" | "REPLAN_PENDING_APPROVAL" | "REPLAN_APPROVED" | "REPLAN_REJECTED" | "BOUNDED_REMEDIATION_DISPATCHED" | "REVIEW_PENDING";
export type ReplanDecisionOutcome = "APPROVE" | "REJECT";
export type ReplanDispatchOutcome = "STARTED" | "START_FAILED";

export interface ReplanGovernanceScope {
  readonly projectId: string;
  readonly featureId: string;
  readonly phaseNumber: number;
  readonly reviewGateId: string;
  readonly defectClass: string;
}

/** Exact V1 review scope used to enumerate persisted V3 aggregates. */
export interface ReplanGovernanceReviewScope {
  readonly projectId: string;
  readonly featureId: string;
  readonly phaseNumber: number;
  readonly reviewGateId: string;
}

/** Typed immutable provenance for an accepted scope-expansion decision. */
export interface StoredReviewFindingObservationContext extends ReplanGovernanceReviewScope {
  readonly observationId: string;
  readonly defectClass: string;
  readonly disposition: string;
  readonly manifestHash: string;
}

export interface AppendDefectClassObservationInput extends ReplanGovernanceScope {
  readonly aggregateId: string;
  readonly observationEventId: string;
  readonly observationKind: ReplanObservationKind;
  readonly triggerManifestHash: string;
  readonly basisManifestHash: string;
  readonly findingObservationId?: string;
  readonly remediationCycleId?: string;
  readonly decisionId?: string;
  readonly createdAt: string;
}

export interface AppendReplanRequestInput extends ReplanGovernanceScope {
  readonly aggregateId: string;
  readonly requestId: string;
  readonly triggerEventId: string;
  readonly planHash: string;
  readonly planVersion: number;
  readonly proposalAuthorActor: string;
  readonly producerInvocationId: string;
  readonly policyId: "replan-governance-v1";
  readonly policyVersion: 1;
  readonly requestedAt: string;
}

export interface AppendScopeExpansionDecisionInput extends ReplanGovernanceScope {
  readonly aggregateId: string;
  readonly decisionId: string;
  readonly findingObservationId: string;
  readonly outcome: "ACCEPT" | "REJECT";
  readonly actorId: string;
  readonly policyId: "replan-governance-v1";
  readonly policyVersion: 1;
  readonly reason: string;
  readonly expectedVersion: number;
  readonly resultingVersion: number;
  readonly decidedAt: string;
}

export interface AppendReplanDecisionInput extends ReplanGovernanceScope {
  readonly aggregateId: string;
  readonly decisionId: string;
  readonly requestId: string;
  readonly planHash: string;
  readonly planVersion: number;
  readonly outcome: ReplanDecisionOutcome;
  readonly actorId: string;
  readonly policyId: "replan-governance-v1";
  readonly policyVersion: 1;
  readonly reason: string;
  readonly expectedVersion: number;
  readonly resultingVersion: number;
  readonly decidedAt: string;
}

export interface AppendReplanTransitionInput extends ReplanGovernanceScope {
  readonly aggregateId: string;
  readonly transitionId: string;
  readonly fromState: ReplanGovernanceState;
  readonly toState: ReplanGovernanceState;
  readonly reasonCode: string;
  readonly triggerRecordId: string;
  readonly triggerHash?: string;
  readonly expectedVersion: number;
  readonly resultingVersion: number;
  readonly transitionedAt: string;
}

export interface AppendReplanDispatchAttemptInput extends ReplanGovernanceScope {
  readonly aggregateId: string;
  readonly attemptEventId: string;
  readonly dispatchId: string;
  readonly requestId: string;
  readonly planHash: string;
  readonly planVersion: number;
  readonly approvalDecisionId: string;
  readonly approvalEventVersion: number;
  readonly outcome: ReplanDispatchOutcome;
  readonly reasonCode?: string;
  readonly workflowRunId: string;
  readonly attemptedAt: string;
}

export interface AppendReplanReviewAssessmentInput extends ReplanGovernanceScope {
  readonly aggregateId: string;
  readonly assessmentId: string;
  readonly dispatchId: string;
  readonly reviewManifestHash: string;
  readonly reviewRunId: string;
  readonly planHash: string;
  readonly planVersion: number;
  readonly outcome: string;
  readonly assessedSurfaceIds: readonly string[];
  readonly assessedRemediationItemIds: readonly string[];
  readonly assessedTestIds: readonly string[];
  readonly createdAt: string;
}

export interface StoredReplanDefectClassObservation extends AppendDefectClassObservationInput {}

export interface StoredReplanRequest extends AppendReplanRequestInput {
  readonly eligibleRoles: readonly ["ARCHITECTURE_STEWARD"];
}

export interface StoredScopeExpansionDecision extends AppendScopeExpansionDecisionInput {
  readonly authorizedRole: "FEATURE_OWNER";
}
export interface StoredReplanDecision extends AppendReplanDecisionInput {
  readonly authorizedRole: "ARCHITECTURE_STEWARD";
}
export interface StoredReplanTransition extends AppendReplanTransitionInput {}
export interface StoredReplanDispatchAttempt extends AppendReplanDispatchAttemptInput {}
export interface StoredReplanReviewAssessment extends AppendReplanReviewAssessmentInput {}

/**
 * Restart-safe, typed reconstruction of one immutable exact-scope aggregate.
 * Consumers receive no raw SQLite rows or canonical plan JSON.
 */
export type ReplanGovernanceOperation =
  | { readonly kind: "OBSERVATION"; readonly records: { readonly observation: AppendDefectClassObservationInput } }
  | { readonly kind: "THRESHOLD_MANIFESTATION"; readonly records: { readonly observation: AppendDefectClassObservationInput; readonly transition: AppendReplanTransitionInput } }
  | { readonly kind: "SCOPE_EXPANSION_ACCEPTED"; readonly records: { readonly decision: AppendScopeExpansionDecisionInput; readonly observation: AppendDefectClassObservationInput; readonly transition: AppendReplanTransitionInput } }
  | { readonly kind: "SCOPE_EXPANSION_ACCEPTED_NO_THRESHOLD"; readonly records: { readonly decision: AppendScopeExpansionDecisionInput; readonly transition: AppendReplanTransitionInput } }
  | { readonly kind: "SCOPE_EXPANSION_REJECTED"; readonly records: { readonly decision: AppendScopeExpansionDecisionInput; readonly transition: AppendReplanTransitionInput } }
  | { readonly kind: "PLAN_REQUEST"; readonly records: { readonly request: AppendReplanRequestInput; readonly transition: AppendReplanTransitionInput } }
  | { readonly kind: "REPLAN_DECISION"; readonly records: { readonly decision: AppendReplanDecisionInput; readonly transition: AppendReplanTransitionInput } }
  | { readonly kind: "DISPATCH_STARTED"; readonly records: { readonly dispatch: AppendReplanDispatchAttemptInput; readonly transition: AppendReplanTransitionInput } }
  | { readonly kind: "DISPATCH_FAILED"; readonly records: { readonly dispatch: AppendReplanDispatchAttemptInput } }
  | { readonly kind: "REVIEW_ASSESSMENT"; readonly records: { readonly assessment: AppendReplanReviewAssessmentInput; readonly transition: AppendReplanTransitionInput } };

export interface StoredReplanGovernanceAggregate {
  readonly scope: ReplanGovernanceScope;
  readonly aggregateId: string;
  readonly eventVersion: number;
  readonly state: ReplanGovernanceState;
  readonly observations: readonly StoredReplanDefectClassObservation[];
  readonly requests: readonly StoredReplanRequest[];
  readonly scopeExpansionDecisions: readonly StoredScopeExpansionDecision[];
  readonly decisions: readonly StoredReplanDecision[];
  readonly transitions: readonly StoredReplanTransition[];
  readonly dispatchAttempts: readonly StoredReplanDispatchAttempt[];
  readonly reviewAssessments: readonly StoredReplanReviewAssessment[];
}
