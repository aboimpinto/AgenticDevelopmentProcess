/**
 * FEAT-065 authoritative V1 review-ingestion boundary.
 *
 * This adapter accepts only a result already returned by
 * `validateReviewContractArtifact`. It derives the pure phase-gate proposal
 * before making one call to the append-only store, so a rejected result never
 * reaches persistence and a durable gate is written in the same transaction
 * as its immutable manifest evidence.
 *
 * Compatibility Decision: BREAKING CHANGE PERMITTED. There is no legacy,
 * Markdown, Safety Kernel, fingerprint, or context-free authority fallback.
 */

import {
  computeReviewArtifactHash,
  canonicalizeReviewArtifact,
  isValidArtifactLineage,
  isValidArtifactReference,
  type ReviewArtifact,
  type ReviewManifest,
  type RemediationResponse,
  type VerificationReceipt,
  type ReplanPlan,
  type DebtObservation,
  type ArtifactReference,
} from "./review-contract-types.js";
import {
  hasTrustedReviewContractValidationProvenance,
  type ReviewContractIntegrationResult,
} from "./review-contract-integration-adapter.js";
import {
  evaluateAuthoritativePhaseGate,
  type AuthoritativePhaseGateOutcome,
  type AuthoritativeReviewScope,
} from "./review-phase-gate-policy.js";
import type {
  ReviewGovernanceSqliteStore,
  ReviewIngestInput,
  StoredReviewArtifact,
} from "@hepha/db";
import { isRemediationLifecycleDisposition } from "./review-remediation-lifecycle-policy.js";

const HASH_RE = /^[a-f0-9]{64}$/;

export interface ReviewIngestionStore {
  getArtifactByHash(hash: string): StoredReviewArtifact | null;
  /** Exact-scope persisted records; never a latest-record or hash-only lookup. */
  listArtifactsByScope(scope: AuthoritativeReviewScope): readonly StoredReviewArtifact[];
  ingestValidatedReviewEvidence(input: ReviewIngestInput): string;
}

export interface ReviewIngestionRequest {
  /** Exact active workflow scope, independently constructed by the caller. */
  readonly expectedScope: AuthoritativeReviewScope;
  /** The direct, unmodified result from `validateReviewContractArtifact`. */
  readonly validationResult: ReviewContractIntegrationResult;
  /** Project-relative feature root used only to derive the V1 artifact path. */
  readonly featureRootPath: string;
  /** Explicit UTC workflow timestamp; the service has no clock fallback. */
  readonly ingestedAt: string;
  /** Required store and enforcement availability, never an optional fallback. */
  readonly enforcement: { readonly enabled: boolean; readonly storeAvailable: boolean };
  readonly store: ReviewIngestionStore | ReviewGovernanceSqliteStore;
}

export type ReviewIngestionRefusalCode =
  | "invalid_input"
  | "validation_rejected"
  | "scope_mismatch"
  | "duplicate_artifact"
  | "persistence_failed"
  | "store_unavailable";

export type ReviewIngestionResult =
  | {
    readonly kind: "persisted";
    readonly contentHash: string;
    readonly gate: Extract<AuthoritativePhaseGateOutcome, { kind: "decision" }>;
  }
  | {
    /** Debt evidence is durable but never determines a FEAT-065 gate. */
    readonly kind: "persisted_non_authoritative";
    readonly contentHash: string;
  }
  | {
    readonly kind: "refusal";
    readonly code: ReviewIngestionRefusalCode;
    readonly message: string;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isScope(value: unknown): value is AuthoritativeReviewScope {
  return isRecord(value)
    && hasOnlyKeys(value, ["projectId", "featureId", "phaseNumber", "reviewGateId"])
    && isNonEmptyString(value.projectId)
    && isNonEmptyString(value.featureId)
    && Number.isInteger(value.phaseNumber)
    && (value.phaseNumber as number) >= 0
    && isNonEmptyString(value.reviewGateId);
}

function sameScope(left: AuthoritativeReviewScope, right: AuthoritativeReviewScope): boolean {
  return left.projectId === right.projectId
    && left.featureId === right.featureId
    && left.phaseNumber === right.phaseNumber
    && left.reviewGateId === right.reviewGateId;
}

function isProjectRelativePath(value: unknown): value is string {
  return isNonEmptyString(value)
    && value.length <= 1024
    && !value.includes("\\")
    && !value.includes("\0")
    && !value.startsWith("/")
    && !/^[A-Za-z]:/.test(value)
    && !value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..");
}

function isUtcTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isNonEmptyString(value);
}

function isSurfaceEntry(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ["surfaceId", "relativePath", "symbol", "endpoint", "rationale"])
    && isNonEmptyString(value.surfaceId)
    && isNonEmptyString(value.relativePath)
    && (value.symbol === undefined || isNonEmptyString(value.symbol))
    && (value.endpoint === undefined || isNonEmptyString(value.endpoint))
    && (value.rationale === undefined || isNonEmptyString(value.rationale));
}

function isRuleSnapshot(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ["schemaVersion", "catalogSchemaVersion", "ruleId", "ruleVersion", "category", "scope", "title", "source", "catalogPath", "catalogSourceHash", "ruleHash"])
    && value.schemaVersion === 1
    && value.catalogSchemaVersion === 1
    && isNonEmptyString(value.ruleId)
    && isNonEmptyString(value.ruleVersion)
    && (value.category === "architecture" || value.category === "security" || value.category === "policy" || value.category === "quality")
    && isNonEmptyString(value.scope)
    && isNonEmptyString(value.title)
    && isRecord(value.source)
    && hasOnlyKeys(value.source, ["document", "section"])
    && isNonEmptyString(value.source.document)
    && isNonEmptyString(value.source.section)
    && value.catalogPath === ".hepha/architecture-rules.yaml"
    && typeof value.catalogSourceHash === "string" && HASH_RE.test(value.catalogSourceHash)
    && typeof value.ruleHash === "string" && HASH_RE.test(value.ruleHash);
}

function isAuthority(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.reference)) return false;
  if (value.kind === "active_rule") {
    return hasOnlyKeys(value, ["kind", "reference", "snapshot"]) && isRuleSnapshot(value.snapshot);
  }
  return value.kind === "acceptance_criterion"
    && hasOnlyKeys(value, ["kind", "reference", "source"])
    && isRecord(value.source)
    && hasOnlyKeys(value.source, ["relativePath", "section"])
    && isNonEmptyString(value.source.relativePath)
    && isNonEmptyString(value.source.section);
}

function isReviewFinding(value: unknown): boolean {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["findingId", "disposition", "claimType", "authority", "defectClass", "severity", "summary", "surface", "rootCause", "scopeExpansionRationale", "remediationItems", "testMatrix", "exhaustivenessDecision", "compatibilityDecision", "compatibilityApprovalSource", "compatibilityJustification", "debtImpact", "debtObservationReference"])
    || !isNonEmptyString(value.findingId)
    || !isNonEmptyString(value.claimType)
    || !isNonEmptyString(value.severity)
    || !isNonEmptyString(value.defectClass)
    || !isNonEmptyString(value.summary)
    || (value.disposition !== "IN_SCOPE_BLOCKER" && value.disposition !== "SCOPE_EXPANSION"
      && value.disposition !== "ARCHITECTURE_DEBT" && value.disposition !== "OBSERVATION")
    || !isRecord(value.surface)
    || !Array.isArray(value.surface.inspected)
    || !Array.isArray(value.surface.affected)
    || !Array.isArray(value.surface.confirmedUnaffected)
    || !hasOnlyKeys(value.surface, ["inspected", "affected", "confirmedUnaffected"])
    || !value.surface.inspected.every(isSurfaceEntry)
    || !value.surface.affected.every(isSurfaceEntry)
    || !value.surface.confirmedUnaffected.every(isSurfaceEntry)
    || !isOptionalString(value.rootCause)
    || !isOptionalString(value.scopeExpansionRationale)
    || !isOptionalString(value.compatibilityApprovalSource)
    || !isOptionalString(value.compatibilityJustification)
    || (value.exhaustivenessDecision !== undefined && value.exhaustivenessDecision !== "local_only" && value.exhaustivenessDecision !== "cross_cutting_complete" && value.exhaustivenessDecision !== "replan_required")
    || (value.compatibilityDecision !== undefined && value.compatibilityDecision !== "breaking_change_permitted" && value.compatibilityDecision !== "backward_compatibility_required")
    || (value.debtImpact !== undefined && value.debtImpact !== "untouched_non_blocking")
    || (value.debtObservationReference !== undefined && !isValidArtifactReference(value.debtObservationReference))) return false;

  const authorityRequired = value.disposition !== "OBSERVATION";
  if ((authorityRequired && !isAuthority(value.authority))
    || (!authorityRequired && value.authority !== undefined && !isAuthority(value.authority))) return false;
  // Architecture debt is governed by the active-rule catalog only. An
  // acceptance criterion is valid for feature correctness, not debt intake.
  if (value.disposition === "ARCHITECTURE_DEBT" && (!isRecord(value.authority) || value.authority.kind !== "active_rule")) return false;

  if (value.remediationItems !== undefined && (!Array.isArray(value.remediationItems)
    || value.remediationItems.length > 64 || !value.remediationItems.every((item) => isRecord(item)
      && hasOnlyKeys(item, ["remediationItemId", "instruction", "targetSurfaceIds"])
      && isNonEmptyString(item.remediationItemId)
      && isNonEmptyString(item.instruction)
      && isStringArray(item.targetSurfaceIds)))) return false;
  return value.testMatrix === undefined || (Array.isArray(value.testMatrix)
    && value.testMatrix.length <= 64 && value.testMatrix.every((item) => isRecord(item)
      && hasOnlyKeys(item, ["testId", "requirement", "targetSurfaceIds"])
      && isNonEmptyString(item.testId)
      && isNonEmptyString(item.requirement)
      && isStringArray(item.targetSurfaceIds)));
}

/**
 * Runtime guard for the public post-validation boundary. This deliberately
 * checks every member the service dereferences or iterates; full V1 semantic
 * validation remains the upstream adapter's responsibility.
 */
function isReviewManifest(value: unknown): value is ReviewManifest {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["schemaVersion", "artifactKind", "artifactId", "scope", "lineage", "result", "blockerReason", "ruleSnapshots", "findings"])
    || value.artifactKind !== "review_manifest"
    || value.schemaVersion !== 1
    || !isNonEmptyString(value.artifactId)
    || !isScope(value.scope)
    || (value.result !== "APPROVED" && value.result !== "NEEDS_CHANGES" && value.result !== "BLOCKED")
    || !Array.isArray(value.findings)
    || value.findings.length > 64
    || !Array.isArray(value.ruleSnapshots)
    || !value.ruleSnapshots.every(isRuleSnapshot)
    || !value.findings.every(isReviewFinding)
    || (value.blockerReason !== undefined && !isNonEmptyString(value.blockerReason))) return false;

  if (value.lineage !== undefined && !isValidArtifactLineage(
    value.lineage,
    value.artifactId,
    "review_manifest",
    value.scope,
  )) return false;
  return true;
}

function refusal(code: ReviewIngestionRefusalCode): Extract<ReviewIngestionResult, { kind: "refusal" }> {
  const message: Record<ReviewIngestionRefusalCode, string> = {
    invalid_input: "Authoritative review ingestion input has an invalid structure.",
    validation_rejected: "Review artifact validation rejected the input.",
    scope_mismatch: "Review artifact scope does not match the active workflow.",
    duplicate_artifact: "Review artifact was already ingested.",
    persistence_failed: "Authoritative review evidence could not be persisted.",
    store_unavailable: "Authoritative review storage is unavailable.",
  };
  return { kind: "refusal", code, message: message[code] };
}

function artifactReferences(artifact: ReviewArtifact): readonly { readonly contentHash: string; readonly kind: "predecessor" | "supersedes" }[] {
  return [
    ...(artifact.lineage?.predecessors ?? []).map((reference) => ({ contentHash: reference.contentHash, kind: "predecessor" as const })),
    ...(artifact.lineage?.supersedes ? [{ contentHash: artifact.lineage.supersedes.contentHash, kind: "supersedes" as const }] : []),
  ];
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isRemediationItem(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["remediationItemId", "instruction", "targetSurfaceIds"])
    && isNonEmptyString(value.remediationItemId) && isNonEmptyString(value.instruction)
    && isStringArray(value.targetSurfaceIds) && value.targetSurfaceIds.length > 0 && value.targetSurfaceIds.length <= 128;
}

function isTestMatrixItem(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["testId", "requirement", "targetSurfaceIds"])
    && isNonEmptyString(value.testId) && isNonEmptyString(value.requirement)
    && isStringArray(value.targetSurfaceIds) && value.targetSurfaceIds.length > 0 && value.targetSurfaceIds.length <= 128;
}

function hasValidEnvelope(value: Record<string, unknown>, kind: ReviewArtifact["artifactKind"]): boolean {
  return value.schemaVersion === 1 && value.artifactKind === kind && isNonEmptyString(value.artifactId)
    && isScope(value.scope) && isValidArtifactLineage(value.lineage ?? {}, value.artifactId, kind, value.scope)
    && isValidArtifactReference(value.manifestReference) && value.manifestReference.artifactKind === "review_manifest";
}

function isRemediationResponse(value: unknown): value is RemediationResponse {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["schemaVersion", "artifactKind", "artifactId", "scope", "lineage", "manifestReference", "findingResponses", "suspectedOutOfScopeObservations"])
    || !hasValidEnvelope(value, "remediation_response") || !Array.isArray(value.findingResponses)
    || value.findingResponses.length === 0 || value.findingResponses.length > 64) return false;
  const findingIds: string[] = [];
  let itemCount = 0;
  for (const response of value.findingResponses) {
    if (!isRecord(response) || !hasOnlyKeys(response, ["findingId", "items"])
      || !isNonEmptyString(response.findingId) || !Array.isArray(response.items)
      || response.items.length === 0 || response.items.length > 64) return false;
    findingIds.push(response.findingId);
    const itemIds: string[] = [];
    for (const item of response.items) {
      if (!isRecord(item) || !hasOnlyKeys(item, ["remediationItemId", "decision", "changedSurfaceIds", "rationale"])
        || !isNonEmptyString(item.remediationItemId)
        || (item.decision !== "APPLIED" && item.decision !== "NOT_APPLIED" && item.decision !== "NOT_APPLICABLE")
        || !isStringArray(item.changedSurfaceIds) || !isNonEmptyString(item.rationale)) return false;
      itemIds.push(item.remediationItemId);
      itemCount += 1;
    }
    if (!hasUniqueValues(itemIds)) return false;
  }
  if (!hasUniqueValues(findingIds) || itemCount > 128) return false;
  return value.suspectedOutOfScopeObservations === undefined || (Array.isArray(value.suspectedOutOfScopeObservations)
    && value.suspectedOutOfScopeObservations.length <= 128
    && value.suspectedOutOfScopeObservations.every((observation) => isRecord(observation)
      && hasOnlyKeys(observation, ["relativePath", "rationale"])
      && isProjectRelativePath(observation.relativePath) && isNonEmptyString(observation.rationale)));
}

function isVerificationReceipt(value: unknown): value is VerificationReceipt {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["schemaVersion", "artifactKind", "artifactId", "scope", "lineage", "manifestReference", "responseReference", "itemReceipts", "testReceipts"])
    || !hasValidEnvelope(value, "verification_receipt") || !isValidArtifactReference(value.responseReference)
    || value.responseReference.artifactKind !== "remediation_response"
    || !Array.isArray(value.itemReceipts) || !Array.isArray(value.testReceipts)
    || value.itemReceipts.length + value.testReceipts.length > 128) return false;
  const itemKeys: string[] = [];
  const testKeys: string[] = [];
  for (const receipt of value.itemReceipts) {
    if (!isRecord(receipt) || !hasOnlyKeys(receipt, ["findingId", "remediationItemId", "outcome", "evidence"])
      || !isNonEmptyString(receipt.findingId) || !isNonEmptyString(receipt.remediationItemId)
      || (receipt.outcome !== "VERIFIED" && receipt.outcome !== "FAILED" && receipt.outcome !== "NOT_VERIFIABLE")
      || !isNonEmptyString(receipt.evidence)) return false;
    itemKeys.push(`${receipt.findingId}\u0000${receipt.remediationItemId}`);
  }
  for (const receipt of value.testReceipts) {
    if (!isRecord(receipt) || !hasOnlyKeys(receipt, ["findingId", "testId", "outcome", "evidence"])
      || !isNonEmptyString(receipt.findingId) || !isNonEmptyString(receipt.testId)
      || (receipt.outcome !== "PASSED" && receipt.outcome !== "FAILED" && receipt.outcome !== "NOT_RUN" && receipt.outcome !== "NOT_VERIFIABLE")
      || !isNonEmptyString(receipt.evidence)) return false;
    testKeys.push(`${receipt.findingId}\u0000${receipt.testId}`);
  }
  return hasUniqueValues(itemKeys) && hasUniqueValues(testKeys);
}

function isReplanPlan(value: unknown): value is ReplanPlan {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["schemaVersion", "artifactKind", "artifactId", "scope", "lineage", "manifestReference", "findingIds", "defectClass", "replanReason", "rootCause", "surface", "explicitExclusions", "remediationItems", "testMatrix", "verificationPlan", "closureCriteria"])
    || !hasValidEnvelope(value, "replan_plan") || !Array.isArray(value.findingIds)
    || value.findingIds.length === 0 || value.findingIds.length > 64 || !value.findingIds.every(isNonEmptyString)
    || !hasUniqueValues(value.findingIds) || !isNonEmptyString(value.defectClass)
    || (value.replanReason !== "finding_exhaustiveness" && value.replanReason !== "recurrence_signal")
    || !isNonEmptyString(value.rootCause) || !isRecord(value.surface)
    || !Array.isArray(value.surface.inspected) || !Array.isArray(value.surface.affected) || !Array.isArray(value.surface.confirmedUnaffected)
    || !value.surface.inspected.every(isSurfaceEntry) || !value.surface.affected.every(isSurfaceEntry) || !value.surface.confirmedUnaffected.every(isSurfaceEntry)
    || !Array.isArray(value.explicitExclusions) || value.explicitExclusions.length > 128
    || !value.explicitExclusions.every((entry) => isRecord(entry) && hasOnlyKeys(entry, ["relativePath", "rationale"])
      && isProjectRelativePath(entry.relativePath) && isNonEmptyString(entry.rationale))
    || !Array.isArray(value.remediationItems) || value.remediationItems.length === 0 || value.remediationItems.length > 64
    || !value.remediationItems.every(isRemediationItem) || !hasUniqueValues(value.remediationItems.map((item) => item.remediationItemId))
    || !Array.isArray(value.testMatrix) || value.testMatrix.length === 0 || value.testMatrix.length > 64
    || !value.testMatrix.every(isTestMatrixItem) || !hasUniqueValues(value.testMatrix.map((item) => item.testId))
    || !isNonEmptyString(value.verificationPlan) || !isNonEmptyString(value.closureCriteria)) return false;
  const plan = value as unknown as ReplanPlan;
  const affected = new Set(plan.surface.affected.map((entry) => entry.surfaceId));
  return plan.remediationItems.every((item) => item.targetSurfaceIds.every((id: string) => affected.has(id)))
    && plan.testMatrix.every((item) => item.targetSurfaceIds.every((id: string) => affected.has(id)));
}

function isDebtObservation(value: unknown): value is DebtObservation {
  return isRecord(value)
    && hasOnlyKeys(value, ["schemaVersion", "artifactKind", "artifactId", "scope", "lineage", "manifestReference", "findingId", "authority", "historicalSurface", "evidence", "riskRationale", "currentFeatureImpact"])
    && hasValidEnvelope(value, "debt_observation") && isNonEmptyString(value.findingId)
    && isRecord(value.authority) && value.authority.kind === "active_rule" && isAuthority(value.authority)
    && Array.isArray(value.historicalSurface) && value.historicalSurface.length > 0 && value.historicalSurface.length <= 128
    && value.historicalSurface.every(isSurfaceEntry)
    && hasUniqueValues(value.historicalSurface.map((entry) => entry.surfaceId))
    && isNonEmptyString(value.evidence) && isNonEmptyString(value.riskRationale)
    && value.currentFeatureImpact === "untouched_non_blocking";
}

function isReviewArtifact(value: unknown): value is ReviewArtifact {
  return isReviewManifest(value) || isRemediationResponse(value) || isVerificationReceipt(value)
    || isReplanPlan(value) || isDebtObservation(value);
}

function findingProjection(manifest: ReviewManifest) {
  return manifest.findings.map((finding) => ({
    findingId: finding.findingId,
    disposition: finding.disposition,
    requiredRemediationItemIds: (finding.remediationItems ?? []).map((item) => item.remediationItemId),
    requiredTestIds: (finding.testMatrix ?? []).map((test) => test.testId),
  }));
}

function manifestEvidence(manifest: ReviewManifest, contentHash: string) {
  return { artifactKind: "review_manifest" as const, contentHash, scope: manifest.scope, result: manifest.result, findings: findingProjection(manifest) };
}

function parseStoredArtifact(artifact: StoredReviewArtifact): ReviewArtifact | undefined {
  try {
    const parsed: unknown = JSON.parse(artifact.canonicalJson);
    if (!isReviewArtifact(parsed) || computeReviewArtifactHash(parsed) !== artifact.contentHash
      || canonicalizeReviewArtifact(parsed) !== artifact.canonicalJson
      || parsed.artifactId !== artifact.artifactId || parsed.artifactKind !== artifact.artifactKind
      || !sameScope(parsed.scope, { projectId: artifact.projectId, featureId: artifact.featureId, phaseNumber: artifact.phaseNumber, reviewGateId: artifact.reviewGateId })) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function parseStoredManifest(artifact: StoredReviewArtifact): ReviewManifest | undefined {
  const parsed = parseStoredArtifact(artifact);
  return parsed?.artifactKind === "review_manifest" ? parsed : undefined;
}

/**
 * Resolve a V1 reference by all four immutable identity components before any
 * lifecycle mapping. Hash-only/latest-record lookup is deliberately forbidden.
 */
function resolveStoredReference(
  store: ReviewIngestionStore | ReviewGovernanceSqliteStore,
  expectedScope: AuthoritativeReviewScope,
  reference: unknown,
  expectedKind: ReviewArtifact["artifactKind"],
): ReviewArtifact | undefined {
  if (!isValidArtifactReference(reference) || reference.artifactKind !== expectedKind) return undefined;
  const stored = store.getArtifactByHash(reference.contentHash);
  if (!stored || stored.contentHash !== reference.contentHash || stored.artifactKind !== reference.artifactKind
    || stored.artifactId !== reference.artifactId || stored.artifactRelativePath !== reference.relativePath
    || !sameScope(expectedScope, { projectId: stored.projectId, featureId: stored.featureId, phaseNumber: stored.phaseNumber, reviewGateId: stored.reviewGateId })) return undefined;
  const parsed = parseStoredArtifact(stored);
  return parsed?.artifactKind === expectedKind ? parsed : undefined;
}

function resolveManifestLineage(
  store: ReviewIngestionStore | ReviewGovernanceSqliteStore,
  expectedScope: AuthoritativeReviewScope,
  manifest: ReviewManifest,
): readonly ReviewManifest[] | undefined {
  const references = manifest.lineage?.predecessors ?? [];
  const resolved = references.map((reference) => resolveStoredReference(store, expectedScope, reference, "review_manifest"));
  return resolved.every((artifact): artifact is ReviewManifest => artifact?.artifactKind === "review_manifest") ? resolved : undefined;
}

function lifecycleCycleId(contentHash: string): string {
  return `cycle-${contentHash}`;
}

function reviewRunId(contentHash: string): string {
  return `review-run-${contentHash}`;
}

function deriveObservationId(
  scope: AuthoritativeReviewScope,
  contentHash: string,
  artifactId: string,
  findingId: string,
): string {
  return `observation-${computeReviewArtifactHash({
    projectId: scope.projectId,
    featureId: scope.featureId,
    phaseNumber: scope.phaseNumber,
    reviewGateId: scope.reviewGateId,
    contentHash,
    artifactId,
    findingId,
  })}`;
}

function sameReference(left: ArtifactReference, right: ArtifactReference): boolean {
  return left.artifactKind === right.artifactKind && left.artifactId === right.artifactId
    && left.contentHash === right.contentHash && left.relativePath === right.relativePath;
}

function requiredLifecycleFindings(manifest: ReviewManifest) {
  return manifest.findings.filter((finding) => isRemediationLifecycleDisposition(finding.disposition));
}

function requiredLifecycleKeys(manifest: ReviewManifest, property: "remediationItems" | "testMatrix"): readonly string[] {
  if (property === "remediationItems") {
    return requiredLifecycleFindings(manifest).flatMap((finding) => (finding.remediationItems ?? [])
      .map((item) => `${finding.findingId}\u0000${item.remediationItemId}`));
  }
  return requiredLifecycleFindings(manifest).flatMap((finding) => (finding.testMatrix ?? [])
    .map((item) => `${finding.findingId}\u0000${item.testId}`));
}

function isResponseBoundToBasis(response: RemediationResponse, basis: ReviewManifest, basisReference: ArtifactReference): boolean {
  if (basis.result !== "NEEDS_CHANGES" || !sameReference(response.manifestReference, basisReference)) return false;
  const required = requiredLifecycleKeys(basis, "remediationItems");
  const responseKeys = response.findingResponses.flatMap((finding) => finding.items
    .map((item) => `${finding.findingId}\u0000${item.remediationItemId}`));
  return hasUniqueValues(responseKeys) && responseKeys.length === required.length
    && responseKeys.every((key) => required.includes(key));
}

function isReceiptBoundToResponse(
  receipt: VerificationReceipt,
  response: RemediationResponse,
  responseReference: ArtifactReference,
  basis: ReviewManifest,
  basisReference: ArtifactReference,
): boolean {
  if (!sameReference(receipt.manifestReference, basisReference) || !sameReference(receipt.responseReference, responseReference)
    || !isResponseBoundToBasis(response, basis, basisReference)) return false;
  const requiredItems = requiredLifecycleKeys(basis, "remediationItems");
  const requiredTests = requiredLifecycleKeys(basis, "testMatrix");
  const itemKeys = receipt.itemReceipts.map((item) => `${item.findingId}\u0000${item.remediationItemId}`);
  const testKeys = receipt.testReceipts.map((test) => `${test.findingId}\u0000${test.testId}`);
  return hasUniqueValues(itemKeys) && hasUniqueValues(testKeys)
    && itemKeys.length === requiredItems.length && testKeys.length === requiredTests.length
    && itemKeys.every((key) => requiredItems.includes(key)) && testKeys.every((key) => requiredTests.includes(key));
}

function isReplanBoundToBasis(plan: ReplanPlan, basis: ReviewManifest, basisReference: ArtifactReference): boolean {
  if (basis.result !== "NEEDS_CHANGES" || !sameReference(plan.manifestReference, basisReference)) return false;
  const findings = plan.findingIds.map((findingId) => basis.findings.find((finding) => finding.findingId === findingId));
  if (findings.some((finding) => !finding)) return false;
  const resolved = findings as ReviewManifest["findings"];
  return resolved.every((finding) => finding.defectClass === plan.defectClass)
    && (plan.replanReason !== "finding_exhaustiveness" || resolved.every((finding) => finding.exhaustivenessDecision === "replan_required"));
}

function isDebtBoundToBasis(debt: DebtObservation, basis: ReviewManifest, basisReference: ArtifactReference): boolean {
  if (!sameReference(debt.manifestReference, basisReference) || basis.result !== "APPROVED") return false;
  const finding = basis.findings.find((candidate) => candidate.findingId === debt.findingId);
  return finding?.disposition === "ARCHITECTURE_DEBT" && finding.authority?.kind === "active_rule"
    && canonicalizeReviewArtifact(finding.authority) === canonicalizeReviewArtifact(debt.authority)
    && debt.historicalSurface.every((entry) => finding.surface.affected.some((affected) => affected.surfaceId === entry.surfaceId));
}

function artifactReferenceForStored(artifact: StoredReviewArtifact): ArtifactReference | undefined {
  return isReviewArtifact(parseStoredArtifact(artifact)) ? {
    artifactKind: artifact.artifactKind as ReviewArtifact["artifactKind"], artifactId: artifact.artifactId,
    contentHash: artifact.contentHash, relativePath: artifact.artifactRelativePath,
  } : undefined;
}

function deriveLifecycleEvidence(
  basis: ReviewManifest,
  basisReference: ArtifactReference,
  artifacts: readonly StoredReviewArtifact[],
  candidate: ReviewArtifact,
  candidateHash: string,
): { readonly responses: readonly Record<string, unknown>[]; readonly receipts: readonly Record<string, unknown>[] } | undefined {
  const all = [...artifacts, {
    contentHash: candidateHash, artifactKind: candidate.artifactKind, canonicalJson: canonicalizeReviewArtifact(candidate),
  }];
  const responses: Record<string, unknown>[] = [];
  const receipts: Record<string, unknown>[] = [];
  for (const artifact of all) {
    let payload: unknown;
    try { payload = JSON.parse(artifact.canonicalJson); } catch { return undefined; }
    if (!isReviewArtifact(payload) || !isRecord(payload)) return undefined;
    if (payload.artifactKind === "remediation_response" && sameReference(payload.manifestReference, basisReference)) {
      if (!isResponseBoundToBasis(payload, basis, basisReference)) return undefined;
      for (const findingResponse of payload.findingResponses) for (const item of findingResponse.items) {
        responses.push({ responseHash: artifact.contentHash, basisManifestHash: basisReference.contentHash, cycleId: lifecycleCycleId(artifact.contentHash), findingId: findingResponse.findingId, remediationItemId: item.remediationItemId, outcome: item.decision });
      }
    }
    if (payload.artifactKind === "verification_receipt" && sameReference(payload.manifestReference, basisReference)) {
      const referencedResponse = all.find((stored) => stored.contentHash === payload.responseReference.contentHash);
      const responsePayload = referencedResponse && parseStoredArtifact(referencedResponse as StoredReviewArtifact);
      const responseReference = referencedResponse && "artifactRelativePath" in referencedResponse && isReviewArtifact(responsePayload) ? {
        artifactKind: referencedResponse.artifactKind as ReviewArtifact["artifactKind"], artifactId: referencedResponse.artifactId,
        contentHash: referencedResponse.contentHash, relativePath: referencedResponse.artifactRelativePath,
      } : undefined;
      if (!referencedResponse || !responsePayload || responsePayload.artifactKind !== "remediation_response"
        || !responseReference || !isReceiptBoundToResponse(payload, responsePayload, responseReference, basis, basisReference)) return undefined;
      for (const receipt of payload.itemReceipts) receipts.push({ receiptHash: artifact.contentHash, responseHash: payload.responseReference.contentHash, basisManifestHash: basisReference.contentHash, cycleId: lifecycleCycleId(payload.responseReference.contentHash), findingId: receipt.findingId, subjectKind: "remediation_item", subjectId: receipt.remediationItemId, outcome: receipt.outcome });
      for (const receipt of payload.testReceipts) receipts.push({ receiptHash: artifact.contentHash, responseHash: payload.responseReference.contentHash, basisManifestHash: basisReference.contentHash, cycleId: lifecycleCycleId(payload.responseReference.contentHash), findingId: receipt.findingId, subjectKind: "test", subjectId: receipt.testId, outcome: receipt.outcome });
    }
  }
  // Findings, remediation items, and test IDs are stable across successive
  // remediation attempts. They are unique inside a cycle, not across every
  // response ever written for the same manifest. Select the newest complete
  // response/receipt cycle (artifacts arrive newest first) so a reviewer rerun
  // evaluates one bounded fixer proposal rather than a duplicate union of all
  // historical proposals.
  const completedCycleId = receipts.find((receipt) => responses.some((response) => (
    response.cycleId === receipt.cycleId
    && response.responseHash === receipt.responseHash
  )))?.cycleId;
  const selectedCycleId = completedCycleId ?? responses[0]?.cycleId;
  return selectedCycleId
    ? {
      responses: responses.filter((response) => response.cycleId === selectedCycleId),
      receipts: receipts.filter((receipt) => receipt.cycleId === selectedCycleId),
    }
    : { responses: [], receipts: [] };
}

function toStoreInput(
  artifact: ReviewArtifact,
  contentHash: string,
  request: ReviewIngestionRequest,
  gate: Extract<AuthoritativePhaseGateOutcome, { kind: "decision" }>,
  basisManifest?: { readonly artifact: ReviewManifest; readonly contentHash: string },
): ReviewIngestInput {
  const references = artifactReferences(artifact);
  const base = {
    contentHash, artifactId: artifact.artifactId, artifactKind: artifact.artifactKind, schemaVersion: 1,
    canonicalJson: canonicalizeReviewArtifact(artifact), projectId: artifact.scope.projectId, featureId: artifact.scope.featureId,
    phaseNumber: artifact.scope.phaseNumber, reviewGateId: artifact.scope.reviewGateId, featureRootPath: request.featureRootPath,
    artifactRelativePath: `${request.featureRootPath}/code-reviews/artifacts/${artifact.artifactKind}/${contentHash}.json`,
    sourceMode: "v1_validated_ingress" as const, ingestedAt: request.ingestedAt,
    lineage: {
      predecessorHashes: references.filter((reference) => reference.kind === "predecessor").map((reference) => reference.contentHash),
      ...(references.find((reference) => reference.kind === "supersedes")?.contentHash
        ? { supersedesHash: references.find((reference) => reference.kind === "supersedes")!.contentHash }
        : {}),
    },
  };
  if (artifact.artifactKind === "review_manifest") {
    const manifest = artifact;
    const needsPriorCycle = basisManifest !== undefined && basisManifest.contentHash !== contentHash;
    // A successor APPROVED manifest is only terminal after the authoritative
    // gate has accepted the complete remediation lifecycle.  Persisting it as
    // REMEDIATION_VERIFIED while its gate is still PENDING creates a
    // self-contradictory read model that safe presentation must reject.
    const terminalApproval = gate.gateState === "APPROVED"
      && gate.reasonCode === "approved_terminal_review";
    const cycleState = manifest.result === "APPROVED"
      ? terminalApproval
        ? (needsPriorCycle ? "REMEDIATION_VERIFIED" as const : "NO_REMEDIATION_REQUIRED" as const)
        : "OPEN" as const
      : manifest.result === "NEEDS_CHANGES"
        ? "OPEN" as const
        : "REVIEW_PENDING" as const;
    const findings = manifest.findings.map((finding) => {
      const authority = finding.authority;
      const observationId = deriveObservationId(manifest.scope, contentHash, manifest.artifactId, finding.findingId);
      return {
        findingId: finding.findingId, disposition: finding.disposition, claimType: finding.claimType, severity: finding.severity, defectClass: finding.defectClass, summary: finding.summary,
        ...(authority?.kind === "active_rule" ? { ruleReference: authority.reference, ruleId: authority.snapshot.ruleId, ruleVersion: authority.snapshot.ruleVersion, ruleHash: authority.snapshot.ruleHash } : authority?.kind === "acceptance_criterion" ? { acSourcePath: authority.source.relativePath, acSection: authority.source.section } : {}),
        observation: { observationId, findingId: finding.findingId, surfaceJson: canonicalizeReviewArtifact(finding.surface), remediationItemsJson: canonicalizeReviewArtifact(finding.remediationItems ?? []), testMatrixJson: canonicalizeReviewArtifact(finding.testMatrix ?? []), ...(finding.rootCause ? { rootCause: finding.rootCause } : {}), ...(finding.scopeExpansionRationale ? { scopeRationale: finding.scopeExpansionRationale } : {}), createdAt: request.ingestedAt },
      };
    });
    // The successor manifest is the immutable gate basis; the pure policy
    // binds its predecessor lifecycle before this new gate event is proposed.
    const gateBasisHash = contentHash;
    const cycleId = lifecycleCycleId(contentHash);
    return {
      ...base, reviewRunId: reviewRunId(contentHash), manifestResult: manifest.result, findings,
      cycle: {
        cycleId,
        basisManifestHash: contentHash,
        cycleState,
        createdAt: request.ingestedAt,
      },
      gateDecision: { triggerArtifactHash: contentHash, basisManifestHash: gateBasisHash, cycleId, gateState: gate.gateState, reasonCode: gate.reasonCode, evidenceHashes: [contentHash, gateBasisHash, ...references.map((reference) => reference.contentHash)].filter((hash, index, values) => values.indexOf(hash) === index), decidedAt: request.ingestedAt },
    } as ReviewIngestInput;
  }
  const basis = basisManifest!;
  const basisCycleId = lifecycleCycleId(basis.contentHash);
  if (artifact.artifactKind === "debt_observation") {
    return { ...base, basisManifestHash: basis.contentHash } as ReviewIngestInput;
  }
  if (artifact.artifactKind === "remediation_response") {
    const cycleId = lifecycleCycleId(contentHash);
    const pendingGate = { triggerArtifactHash: contentHash, basisManifestHash: basis.contentHash, cycleId, gateState: gate.gateState, reasonCode: gate.reasonCode, evidenceHashes: [contentHash, basis.contentHash], decidedAt: request.ingestedAt };
    const remediationItems = artifact.findingResponses.flatMap((response, index) => response.items.map((item, itemIndex) => ({ itemEventId: `item-${contentHash.slice(0, 32)}-${index}-${itemIndex}`, cycleId, reviewRunId: reviewRunId(basis.contentHash), findingId: response.findingId, remediationItemId: item.remediationItemId, eventKind: "response_evidence", responseHash: contentHash, decision: item.decision, createdAt: request.ingestedAt })));
    return { ...base, basisManifestHash: basis.contentHash, cycle: { cycleId, basisManifestHash: basis.contentHash, predecessorCycleId: basisCycleId, cycleState: "AWAITING_RECEIPT", createdAt: request.ingestedAt }, remediationItems, gateDecision: pendingGate } as ReviewIngestInput;
  }
  if (artifact.artifactKind === "verification_receipt") {
    const cycleId = lifecycleCycleId(artifact.responseReference.contentHash);
    const pendingGate = { triggerArtifactHash: contentHash, basisManifestHash: basis.contentHash, cycleId, gateState: gate.gateState, reasonCode: gate.reasonCode, evidenceHashes: [contentHash, basis.contentHash, artifact.responseReference.contentHash], decidedAt: request.ingestedAt };
    const verificationReceipts = [
      ...artifact.itemReceipts.map((receipt, index) => ({ receiptEventId: `receipt-${contentHash.slice(0, 32)}-item-${index}`, cycleId, receiptHash: contentHash, reviewRunId: reviewRunId(basis.contentHash), findingId: receipt.findingId, subjectKind: "remediation_item", subjectId: receipt.remediationItemId, outcome: receipt.outcome, evidenceSummary: receipt.evidence, createdAt: request.ingestedAt })),
      ...artifact.testReceipts.map((receipt, index) => ({ receiptEventId: `receipt-${contentHash.slice(0, 32)}-test-${index}`, cycleId, receiptHash: contentHash, reviewRunId: reviewRunId(basis.contentHash), findingId: receipt.findingId, subjectKind: "test", subjectId: receipt.testId, outcome: receipt.outcome, evidenceSummary: receipt.evidence, createdAt: request.ingestedAt })),
    ];
    return { ...base, basisManifestHash: basis.contentHash, verificationReceipts, gateDecision: pendingGate } as ReviewIngestInput;
  }
  const cycleId = lifecycleCycleId(contentHash);
  const pendingGate = { triggerArtifactHash: contentHash, basisManifestHash: basis.contentHash, cycleId, gateState: gate.gateState, reasonCode: gate.reasonCode, evidenceHashes: [contentHash, basis.contentHash], decidedAt: request.ingestedAt };
  return { ...base, basisManifestHash: basis.contentHash, cycle: { cycleId, basisManifestHash: basis.contentHash, predecessorCycleId: basisCycleId, cycleState: "REPLAN_REQUIRED", createdAt: request.ingestedAt }, gateDecision: pendingGate } as ReviewIngestInput;
}

/**
 * Ingest every FEAT-064 validated V1 artifact through one immutable-store call.
 * Compatibility Decision: BREAKING CHANGE PERMITTED. The service rejects any
 * unbound reference, malformed lifecycle record, or legacy authority source.
 */
export function ingestValidatedReviewEvidence(rawRequest: unknown): ReviewIngestionResult {
  if (!isRecord(rawRequest) || !hasOnlyKeys(rawRequest, ["expectedScope", "validationResult", "featureRootPath", "ingestedAt", "enforcement", "store"])
    || !isScope(rawRequest.expectedScope) || !isProjectRelativePath(rawRequest.featureRootPath) || !isUtcTimestamp(rawRequest.ingestedAt)
    || !isRecord(rawRequest.enforcement) || typeof rawRequest.enforcement.enabled !== "boolean" || typeof rawRequest.enforcement.storeAvailable !== "boolean"
    || !isRecord(rawRequest.store) || typeof rawRequest.store.ingestValidatedReviewEvidence !== "function" || typeof rawRequest.store.getArtifactByHash !== "function" || typeof rawRequest.store.listArtifactsByScope !== "function" || !isRecord(rawRequest.validationResult)) return refusal("invalid_input");
  const request = rawRequest as unknown as ReviewIngestionRequest;
  if (request.validationResult.valid === false) return refusal("validation_rejected");
  // A shaped `valid: true` result is not an ingress credential. The adapter's
  // module-private provenance binds this exact result identity, artifact,
  // projection, canonical hash, kind, ID, schema, and scope. It fails for a
  // fabricated/cloned wrapper and for any post-validation mutation before a
  // lookup, policy evaluation, store-input mapping, or store call.
  if (!hasTrustedReviewContractValidationProvenance(request.validationResult)
    || !isReviewArtifact(request.validationResult.artifact)) return refusal("invalid_input");
  const artifact = request.validationResult.artifact;
  if (!sameScope(request.expectedScope, artifact.scope)) return refusal("scope_mismatch");
  if (!request.enforcement.storeAvailable) return refusal("store_unavailable");
  let canonicalJson: string;
  let contentHash: string;
  let storedArtifacts: readonly StoredReviewArtifact[];
  try {
    canonicalJson = canonicalizeReviewArtifact(artifact);
    contentHash = computeReviewArtifactHash(artifact);
    storedArtifacts = request.store.listArtifactsByScope(request.expectedScope);
  } catch { return refusal("persistence_failed"); }
  if (!HASH_RE.test(contentHash) || canonicalJson.length === 0 || storedArtifacts.some((stored) => !sameScope(request.expectedScope, { projectId: stored.projectId, featureId: stored.featureId, phaseNumber: stored.phaseNumber, reviewGateId: stored.reviewGateId }))) return refusal("invalid_input");
  // Artifact IDs are immutable identities within one exact review scope. Check
  // them before publication/transaction so an accidental replay is reported
  // as a duplicate, never disguised as an infrastructure persistence failure.
  if (storedArtifacts.some((stored) => (
    stored.artifactKind === artifact.artifactKind
    && stored.artifactId === artifact.artifactId
  ))) return refusal("duplicate_artifact");
  try {
    if (request.store.getArtifactByHash(contentHash)) return refusal("duplicate_artifact");
  } catch {
    return refusal("persistence_failed");
  }

  const references = artifactReferences(artifact);
  const predecessorLookups = [] as { contentHash: string; lookup: "found" | "missing"; artifactKind: "review_manifest" | "other"; scope: AuthoritativeReviewScope }[];
  const predecessorManifests = [] as ReturnType<typeof manifestEvidence>[];
  const predecessorArtifacts = [] as ReviewManifest[];
  let basis: { artifact: ReviewManifest; contentHash: string } | undefined;
  try {
    if (artifact.artifactKind === "review_manifest") {
      // Every declared manifest predecessor is resolved using its complete
      // persisted identity, not its hash alone.
      const resolved = resolveManifestLineage(request.store, request.expectedScope, artifact);
      if (!resolved) return refusal("invalid_input");
      for (const reference of artifact.lineage?.predecessors ?? []) {
        const stored = request.store.getArtifactByHash(reference.contentHash);
        const manifest = stored && parseStoredManifest(stored);
        if (!stored || !manifest) return refusal("invalid_input");
        predecessorLookups.push({ contentHash: reference.contentHash, lookup: "found", artifactKind: "review_manifest", scope: manifest.scope });
        predecessorManifests.push(manifestEvidence(manifest, stored.contentHash));
        predecessorArtifacts.push(manifest);
      }
    } else {
      const resolvedManifest = resolveStoredReference(request.store, request.expectedScope, artifact.manifestReference, "review_manifest");
      if (!resolvedManifest || resolvedManifest.artifactKind !== "review_manifest") return refusal("invalid_input");
      const manifestHash = artifact.manifestReference.contentHash;
      if (artifact.artifactKind === "remediation_response"
        && !isResponseBoundToBasis(artifact, resolvedManifest, artifact.manifestReference)) return refusal("invalid_input");
      if (artifact.artifactKind === "verification_receipt") {
        const response = resolveStoredReference(request.store, request.expectedScope, artifact.responseReference, "remediation_response");
        if (!response || response.artifactKind !== "remediation_response"
          || !isReceiptBoundToResponse(artifact, response, artifact.responseReference, resolvedManifest, artifact.manifestReference)) return refusal("invalid_input");
      }
      if (artifact.artifactKind === "replan_plan"
        && !isReplanBoundToBasis(artifact, resolvedManifest, artifact.manifestReference)) return refusal("invalid_input");
      if (artifact.artifactKind === "debt_observation"
        && !isDebtBoundToBasis(artifact, resolvedManifest, artifact.manifestReference)) return refusal("invalid_input");
      basis = { artifact: resolvedManifest, contentHash: manifestHash };
    }
  } catch { return refusal("persistence_failed"); }

  if (artifact.artifactKind === "debt_observation") {
    // Debt is immutable evidence for FEAT-067. It is deliberately excluded
    // from the V1 phase-gate policy and writes no cycle or gate event.
    const nonAuthoritativeGate = { kind: "decision", outcome: "PENDING", gateState: "PENDING", reasonCode: "terminal_remediation_required", transition: "forbidden" } as const;
    try {
      const persistedHash = request.store.ingestValidatedReviewEvidence(toStoreInput(artifact, contentHash, request, nonAuthoritativeGate, basis));
      return persistedHash === contentHash ? { kind: "persisted_non_authoritative", contentHash } : refusal("persistence_failed");
    } catch {
      return refusal("persistence_failed");
    }
  }

  let gate: Extract<AuthoritativePhaseGateOutcome, { kind: "decision" }>;
  if (artifact.artifactKind === "review_manifest") {
    const requiredPredecessor = predecessorManifests.find((manifest) => manifest.result === "NEEDS_CHANGES");
    const lifecycleBasis = requiredPredecessor ? {
      artifact: predecessorArtifacts.find((manifest) => computeReviewArtifactHash(manifest) === requiredPredecessor.contentHash)!,
      contentHash: requiredPredecessor.contentHash,
    } : undefined;
    const lifecycleBasisReference = lifecycleBasis ? (artifact.lineage?.predecessors ?? []).find(
      (reference) => reference.contentHash === lifecycleBasis.contentHash,
    ) : undefined;
    if (lifecycleBasis && !lifecycleBasisReference) return refusal("invalid_input");
    const lifecycle = lifecycleBasis && lifecycleBasisReference
      ? deriveLifecycleEvidence(lifecycleBasis.artifact, lifecycleBasisReference, storedArtifacts, artifact, contentHash)
      : { responses: [], receipts: [] };
    if (!lifecycle) return refusal("invalid_input");
    const cycleBasis = lifecycleBasis?.contentHash ?? contentHash;
    const cycleState = lifecycleBasis ? "REMEDIATION_VERIFIED" as const : "NO_REMEDIATION_REQUIRED" as const;
    const outcome = evaluateAuthoritativePhaseGate({ expectedScope: request.expectedScope, manifest: manifestEvidence(artifact, contentHash), lineage: { artifactHash: contentHash, predecessorHashes: references.filter((entry) => entry.kind === "predecessor").map((entry) => entry.contentHash) }, predecessorLookups, predecessorManifests, remediation: { cycle: { cycleId: lifecycle.responses[0]?.cycleId ?? (lifecycleBasis ? lifecycleCycleId(lifecycleBasis.contentHash) : lifecycleCycleId(contentHash)), scope: request.expectedScope, basisManifestHash: cycleBasis, cycleState }, responses: lifecycle.responses, receipts: lifecycle.receipts }, enforcement: request.enforcement });
    if (outcome.kind === "refusal") return outcome.code === "store_unavailable" ? refusal("store_unavailable") : refusal("invalid_input");
    gate = outcome;
    basis = lifecycleBasis;
  } else {
    gate = { kind: "decision", outcome: "PENDING", gateState: "PENDING", reasonCode: "terminal_remediation_required", transition: "forbidden" };
  }
  try {
    const persistedHash = request.store.ingestValidatedReviewEvidence(toStoreInput(artifact, contentHash, request, gate, basis));
    return persistedHash === contentHash ? { kind: "persisted", contentHash, gate } : refusal("persistence_failed");
  } catch (error) {
    return error instanceof Error && (error.message === "FILE_COLLISION" || error.message === "DUPLICATE_ARTIFACT") ? refusal("duplicate_artifact") : refusal("persistence_failed");
  }
}
