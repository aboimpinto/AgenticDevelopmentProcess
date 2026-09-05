/**
 * FEAT-065 V1 orchestration integration.
 *
 * This is the only bridge from a trusted FEAT-064 validation result to the
 * immutable store, committed-read-back presentation model, and Phase 6 exit
 * guard. Markdown is produced only after the durable read succeeds.
 */

import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  ReviewGovernanceSqliteStore,
  type StoredReviewGateDecision,
} from "@hepha/db";
import {
  canonicalizeReviewArtifact,
  computeReviewArtifactHash,
  isValidProjectRelativePath,
} from "./review-contract-types.js";
import {
  hasTrustedReviewContractValidationProvenance,
  loadStrictCatalogForReview,
  validateReviewContractArtifact,
  type ReviewContractIntegrationResult,
} from "./review-contract-integration-adapter.js";
import type {
  ManifestPredecessorContext,
  ResponsePredecessorContext,
} from "./review-contract-policy.js";
import type {
  ArtifactReference,
  RemediationResponse,
  ReviewManifest,
} from "./review-contract-types.js";
import { resolveStrictActiveRule, type ActiveRuleSnapshotV1 } from "./review-contract-catalog.js";
import {
  ingestValidatedReviewEvidence,
  type ReviewIngestionResult,
} from "./review-ingestion-service.js";
import {
  renderPersistedReviewEvidence,
  type PersistedReviewEvidenceReadModel,
  type RenderPersistedReviewEvidenceResult,
} from "./review-ingestion-presentation.js";
import type { AuthoritativeReviewScope } from "./review-phase-gate-policy.js";
import type { ReviewRemediationFindingIdentity } from "./review-remediation-lifecycle-policy.js";

export interface AuthoritativeReviewIntegrationInput {
  readonly projectRoot: string;
  readonly databasePath: string;
  readonly featureRootPath: string;
  readonly expectedScope: AuthoritativeReviewScope;
  readonly validationResult: ReviewContractIntegrationResult & { readonly valid: true };
  readonly ingestedAt: string;
  readonly enforcementEnabled: boolean;
}

const AUTHORITATIVE_REVIEW_INPUT_KEYS = [
  "projectRoot",
  "databasePath",
  "featureRootPath",
  "expectedScope",
  "validationResult",
  "ingestedAt",
  "enforcementEnabled",
] as const;

const AUTHORITATIVE_SCOPE_MEMBER_MAX_LENGTH = 64;

/**
 * Acquire a no-replace, same-directory lease after the publisher has proved
 * the directory chain safe. Every process uses the derived content-addressed
 * lock path, so another same-hash ingress cannot commit in the cleanup
 * check-to-unlink interval. A stale or colliding lock fails closed.
 */
function acquireContentAddressedIngressLease(publicationPath: string, contentHash: string): (() => void) | undefined {
  const leasePath = resolve(dirname(publicationPath), `.${contentHash}.ingress.lock`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(leasePath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    closeSync(descriptor);
    descriptor = undefined;
    return () => {
      try { unlinkSync(leasePath); } catch { /* A stale lease fails closed on the next ingress. */ }
    };
  } catch {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Best effort before fail-closed return. */ }
      try { unlinkSync(leasePath); } catch { /* No authority is derived from a lease file. */ }
    }
    return undefined;
  }
}

/** Test-only deterministic interleaving seam; production leaves it unset. */
let cleanupAfterAbsenceHookForTest: (() => void) | undefined;
/** Test-only restart-read interleaving seam; production leaves it unset. */
let restartReadAfterLstatHookForTest: (() => void) | undefined;

export function setAuthoritativeReviewCleanupHookForTest(hook: (() => void) | undefined): void {
  cleanupAfterAbsenceHookForTest = hook;
}

export function setAuthoritativeReviewRestartReadHookForTest(hook: (() => void) | undefined): void {
  restartReadAfterLstatHookForTest = hook;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isUtcTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function isAuthoritativeScope(value: unknown): value is AuthoritativeReviewScope {
  if (!isRecord(value)) return false;
  const projectId = value.projectId;
  const featureId = value.featureId;
  const reviewGateId = value.reviewGateId;
  return hasOnlyKeys(value, ["projectId", "featureId", "phaseNumber", "reviewGateId"])
    && typeof projectId === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(projectId)
    && projectId.length <= AUTHORITATIVE_SCOPE_MEMBER_MAX_LENGTH
    && typeof featureId === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(featureId)
    && featureId.length <= AUTHORITATIVE_SCOPE_MEMBER_MAX_LENGTH
    && Number.isInteger(value.phaseNumber) && (value.phaseNumber as number) >= 0
    && typeof reviewGateId === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(reviewGateId)
    && reviewGateId.length <= AUTHORITATIVE_SCOPE_MEMBER_MAX_LENGTH;
}

/**
 * The direct integration boundary admits only the exact opaque validator
 * success for the exact workflow scope. This runs before hashing, file
 * publication, database opening, or store access, so a forged or cross-scope
 * request cannot leave immutable orphan evidence behind.
 */
function admitAuthoritativeReviewInput(rawInput: unknown): AuthoritativeReviewIntegrationInput | undefined {
  if (!isRecord(rawInput) || !hasOnlyKeys(rawInput, AUTHORITATIVE_REVIEW_INPUT_KEYS)) return undefined;
  const projectRoot = rawInput.projectRoot;
  const databasePath = rawInput.databasePath;
  const featureRootPath = rawInput.featureRootPath;
  const expectedScope = rawInput.expectedScope;
  const validationResult = rawInput.validationResult;
  const ingestedAt = rawInput.ingestedAt;
  const enforcementEnabled = rawInput.enforcementEnabled;
  if (typeof projectRoot !== "string" || projectRoot.length === 0 || projectRoot.includes("\0") || !isAbsolute(projectRoot)
    || typeof databasePath !== "string" || databasePath.length === 0 || databasePath.includes("\0")
    || typeof featureRootPath !== "string" || featureRootPath.length > 1024 || !isValidProjectRelativePath(featureRootPath)
    || !isAuthoritativeScope(expectedScope)
    || typeof ingestedAt !== "string" || !isUtcTimestamp(ingestedAt)
    || typeof enforcementEnabled !== "boolean"
    || !hasTrustedReviewContractValidationProvenance(validationResult)) return undefined;

  const artifact = validationResult.artifact;
  const projection = validationResult.projection;
  if (!sameScope(expectedScope, artifact.scope) || !sameScope(expectedScope, projection.scope)) return undefined;
  return {
    projectRoot,
    databasePath,
    featureRootPath,
    expectedScope,
    validationResult,
    ingestedAt,
    enforcementEnabled,
  };
}

export type AuthoritativeReviewIntegrationResult =
  | {
    readonly kind: "persisted";
    readonly ingestion: Extract<ReviewIngestionResult, { kind: "persisted" }>;
    readonly readModel: PersistedReviewEvidenceReadModel;
    readonly rendered: Extract<RenderPersistedReviewEvidenceResult, { kind: "rendered" }>;
  }
  | {
    /** Debt evidence is committed and inspectable but cannot authorize an exit. */
    readonly kind: "persisted_non_authoritative";
    readonly ingestion: Extract<ReviewIngestionResult, { kind: "persisted_non_authoritative" }>;
    readonly readModel: PersistedReviewEvidenceReadModel;
    readonly rendered: Extract<RenderPersistedReviewEvidenceResult, { kind: "rendered" }>;
  }
  | { readonly kind: "refusal"; readonly code: "invalid_input" | "duplicate_artifact" | "store_unavailable" | "persistence_failed" | "presentation_failed"; readonly message: string };

/**
 * Exact immutable predecessor data that a review rerun must copy into its
 * manifest. A model must never infer a hash, artifact ID, or artifact path.
 */
export type AuthoritativeReviewRerunLineageContext =
  | { readonly kind: "not_required" }
  | {
    readonly kind: "required";
    readonly predecessor: ArtifactReference;
    readonly findings: readonly ReviewRemediationFindingIdentity[];
  }
  | { readonly kind: "unavailable" };

/**
 * Raw successor input is intentionally resolved against immutable V1 rows
 * before validation. Callers cannot supply an in-memory predecessor context.
 */
export interface AuthoritativeReviewSuccessorIntegrationInput {
  readonly projectRoot: string;
  readonly databasePath: string;
  readonly featureRootPath: string;
  readonly expectedScope: AuthoritativeReviewScope;
  readonly rawPayload: string;
  readonly ingestedAt: string;
  readonly enforcementEnabled: boolean;
}

function refusal(
  code: Extract<AuthoritativeReviewIntegrationResult, { kind: "refusal" }> ["code"],
  diagnostic?: string,
): Extract<AuthoritativeReviewIntegrationResult, { kind: "refusal" }> {
  const messages = {
    invalid_input: "Authoritative review integration input is invalid.",
    duplicate_artifact: "Authoritative review artifact was already ingested.",
    store_unavailable: "Authoritative review storage is unavailable.",
    persistence_failed: "Authoritative review evidence could not be persisted.",
    presentation_failed: "Persisted review evidence could not be rendered safely.",
  } as const;
  return { kind: "refusal", code, message: diagnostic ?? messages[code] };
}

function sameScope(scope: AuthoritativeReviewScope, record: { projectId: string; featureId: string; phaseNumber: number; reviewGateId: string }): boolean {
  return scope.projectId === record.projectId
    && scope.featureId === record.featureId
    && scope.phaseNumber === record.phaseNumber
    && scope.reviewGateId === record.reviewGateId;
}

function hashUtf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// The immutable V1 artifact retains the full validator-approved finding
// summary. The presentation read model is deliberately narrower: it is a
// bounded, safe display projection rather than another authority source.
// Keep its limit aligned with review-ingestion-presentation.ts so a valid
// review cannot be persisted successfully and then fail only while rendering.
// The bound is large enough to retain a concise rerun progress comparison and
// residual acceptance scope instead of reducing the report to "Repeated
// finding" with the useful distinction truncated away.
const PRESENTATION_FINDING_SUMMARY_MAX_LENGTH = 1_024;
const PRESENTATION_FINDING_SUMMARY_TRUNCATION = "... [truncated; full finding remains in immutable artifact]";

function presentationFindingSummary(summary: string): string {
  if (summary.length <= PRESENTATION_FINDING_SUMMARY_MAX_LENGTH) return summary;
  return `${summary.slice(0, PRESENTATION_FINDING_SUMMARY_MAX_LENGTH - PRESENTATION_FINDING_SUMMARY_TRUNCATION.length)}${PRESENTATION_FINDING_SUMMARY_TRUNCATION}`;
}

function activeCatalogSnapshots(projectRoot: string): readonly unknown[] | undefined {
  const catalog = loadStrictCatalogForReview(projectRoot);
  if (!("rules" in catalog)) return undefined;
  const snapshots = catalog.rules
    .filter((rule) => rule.status === "active")
    .map((rule) => resolveStrictActiveRule(catalog, rule.id))
    .filter((snapshot): snapshot is ActiveRuleSnapshotV1 => snapshot !== undefined);
  return snapshots.length > 0 ? snapshots : undefined;
}

function sameFileIdentity(left: { dev: number; ino: number }, right: { dev: number; ino: number }): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

/**
 * Read only a regular file reached through a symlink-free component chain.
 * The descriptor identity is checked before and after reading so a swap cannot
 * convert a rejected object into authoritative evidence.
 */
function readVerifiedArtifactFile(projectRoot: string, relativePath: string, expectedBytes: string, contentHash: string): string | undefined {
  try {
    const canonicalRoot = realpathSync(resolve(projectRoot));
    const artifactPath = resolve(canonicalRoot, relativePath);
    const pathWithinProject = relative(canonicalRoot, artifactPath);
    if (pathWithinProject === "" || pathWithinProject.startsWith("..") || resolve(canonicalRoot, pathWithinProject) !== artifactPath) return undefined;

    const segments = relativePath.split("/");
    let componentPath = canonicalRoot;
    for (const segment of segments.slice(0, -1)) {
      componentPath = resolve(componentPath, segment);
      const component = lstatSync(componentPath);
      if (!component.isDirectory() || component.isSymbolicLink()) return undefined;
    }
    const before = lstatSync(artifactPath);
    if (!before.isFile() || before.isSymbolicLink()) return undefined;
    restartReadAfterLstatHookForTest?.();

    const descriptor = openSync(artifactPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = fstatSync(descriptor);
      if (!opened.isFile() || !sameFileIdentity(before, opened)) return undefined;
      const fileBytes = readFileSync(descriptor, "utf8");
      const after = fstatSync(descriptor);
      const pathAfter = lstatSync(artifactPath);
      if (!sameFileIdentity(opened, after) || !sameFileIdentity(before, pathAfter)
        || pathAfter.isSymbolicLink() || realpathSync(artifactPath) !== artifactPath
        || fileBytes !== expectedBytes || hashUtf8(fileBytes) !== contentHash) return undefined;
      return fileBytes;
    } finally {
      closeSync(descriptor);
    }
  } catch {
    return undefined;
  }
}

function isDebtArtifactBoundToGate(canonicalJson: string, gate: StoredReviewGateDecision): boolean {
  try {
    const artifact: unknown = JSON.parse(canonicalJson);
    if (!isRecord(artifact) || artifact.artifactKind !== "debt_observation" || !isRecord(artifact.manifestReference)) return false;
    return artifact.manifestReference.contentHash === gate.basisManifestHash;
  } catch {
    return false;
  }
}

function readModel(
  store: ReviewGovernanceSqliteStore,
  projectRoot: string,
  scope: AuthoritativeReviewScope,
  contentHash: string,
): PersistedReviewEvidenceReadModel | undefined {
  const artifact = store.getArtifactByHash(contentHash);
  const gate = store.getCurrentAuthoritativeReviewGate(scope);
  const isDebt = artifact?.artifactKind === "debt_observation";
  if (!artifact || !gate || !sameScope(scope, artifact) || !sameScope(scope, gate)
    || hashUtf8(artifact.canonicalJson) !== contentHash
    || (isDebt
      ? gate.triggerArtifactHash === contentHash || !isDebtArtifactBoundToGate(artifact.canonicalJson, gate)
      : gate.triggerArtifactHash !== contentHash)) return undefined;

  const expectedPath = `${artifact.featureRootPath}/code-reviews/artifacts/${artifact.artifactKind}/${contentHash}.json`;
  if (artifact.artifactRelativePath !== expectedPath) return undefined;
  const fileBytes = readVerifiedArtifactFile(projectRoot, artifact.artifactRelativePath, artifact.canonicalJson, contentHash);
  if (fileBytes === undefined) return undefined;

  const cycles = store.listRemediationCyclesByScope(scope);
  const cycle = gate.cycleId === null ? undefined : cycles.find((candidate) => candidate.cycleId === gate.cycleId);
  if (!cycle || !sameScope(scope, cycle)) return undefined;

  const run = store.getReviewRunByManifestHash(gate.basisManifestHash);
  if (!run || !sameScope(scope, run)) return undefined;
  const findings = store.listFindingsByRun(run.reviewRunId);
  const observationsByFinding = new Map(
    store.listFindingObservationsByRun(run.reviewRunId).map((observation) => [observation.findingId, observation]),
  );
  if (findings.some((finding) => !observationsByFinding.has(finding.findingId))) return undefined;
  // Receipt subject identities are unique within one remediation cycle, not
  // across the lifetime of a review manifest. Successive reviewer/fixer loops
  // deliberately reuse the same finding, remediation-item, and test IDs.
  // Present only the gate-bound cycle or an older valid cycle will make every
  // later read model look corrupt through false duplicate identities.
  const receipts = store.listVerificationReceiptEventsByRun(run.reviewRunId)
    .filter((receipt) => receipt.cycleId === gate.cycleId);
  const lineage = store.listArtifactLineageByArtifactHash(contentHash);
  const evidenceHashes = JSON.parse(gate.evidenceHashesJson) as unknown;
  if (!Array.isArray(evidenceHashes) || !evidenceHashes.every((hash) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash))
    || (isDebt && (!evidenceHashes.includes(gate.triggerArtifactHash) || !evidenceHashes.includes(gate.basisManifestHash)))) return undefined;

  return {
    scope,
    reviewRun: {
      reviewRunId: run.reviewRunId,
      manifestHash: run.manifestHash,
      manifestResult: run.manifestResult as "APPROVED" | "NEEDS_CHANGES" | "BLOCKED",
      createdAt: run.createdAt,
    },
    artifact: {
      artifactId: artifact.artifactId,
      artifactKind: artifact.artifactKind,
      schemaVersion: 1,
      contentHash: artifact.contentHash,
      relativePath: artifact.artifactRelativePath,
      result: artifact.artifactKind === "review_manifest" ? run.manifestResult as "APPROVED" | "NEEDS_CHANGES" | "BLOCKED" : "PERSISTED",
      ingestedAt: artifact.ingestedAt,
    },
    persistence: {
      state: "COMMITTED_READ_BACK_VERIFIED",
      artifactReadBackHash: contentHash,
      fileReadBackHash: hashUtf8(fileBytes),
      committedAt: gate.decidedAt,
    },
    gate: mapGate(gate),
    // A receipt is the immutable transition evidence that the response is
    // ready for independent review. The cycle row is append-only and records
    // its response-time AWAITING_RECEIPT state, so derive REVIEW_PENDING from
    // the gate-bound receipt rather than pretending the response is still
    // waiting for verification.
    cycleState: artifact.artifactKind === "verification_receipt"
      ? "REVIEW_PENDING"
      : cycle.cycleState,
    findings: findings.map((finding) => ({
      findingId: finding.findingId,
      findingObservationId: observationsByFinding.get(finding.findingId)!.observationId,
      defectClass: finding.defectClass,
      disposition: finding.disposition as "IN_SCOPE_BLOCKER" | "SCOPE_EXPANSION" | "ARCHITECTURE_DEBT" | "OBSERVATION",
      severity: finding.severity as "blocker" | "required" | "note" | "info",
      summary: presentationFindingSummary(finding.summary),
    })),
    receipts: receipts.map((receipt) => ({
      findingId: receipt.findingId,
      subjectKind: receipt.subjectKind,
      subjectId: receipt.subjectId,
      outcome: receipt.outcome as "VERIFIED" | "FAILED" | "NOT_VERIFIABLE" | "PASSED" | "NOT_RUN",
    })),
    lineageHashes: [...new Set([...lineage.map((entry) => entry.predecessorHash), ...evidenceHashes])].filter((hash) => hash !== contentHash),
  };
}

function mapGate(gate: StoredReviewGateDecision): PersistedReviewEvidenceReadModel["gate"] {
  return {
    scope: { projectId: gate.projectId, featureId: gate.featureId, phaseNumber: gate.phaseNumber, reviewGateId: gate.reviewGateId },
    gateDecisionId: gate.gateDecisionId,
    triggerArtifactHash: gate.triggerArtifactHash,
    basisManifestHash: gate.basisManifestHash,
    cycleId: gate.cycleId,
    gateState: gate.gateState,
    reasonCode: gate.reasonCode as PersistedReviewEvidenceReadModel["gate"]["reasonCode"],
    evidenceHashes: JSON.parse(gate.evidenceHashesJson) as string[],
    decidedAt: gate.decidedAt,
  };
}

/** Opens the current V1 store with independently loaded active catalog snapshots. */
export function openAuthoritativeReviewStore(projectRoot: string, databasePath: string): ReviewGovernanceSqliteStore | undefined {
  const snapshots = activeCatalogSnapshots(projectRoot);
  if (!snapshots) return undefined;
  try {
    return new ReviewGovernanceSqliteStore(databasePath, { currentActiveRuleSnapshots: snapshots });
  } catch {
    return undefined;
  }
}

function isScope(value: unknown): value is AuthoritativeReviewScope {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).projectId === "string"
    && typeof (value as Record<string, unknown>).featureId === "string"
    && Number.isInteger((value as Record<string, unknown>).phaseNumber)
    && typeof (value as Record<string, unknown>).reviewGateId === "string";
}

function isReference(value: unknown, expectedKind: ArtifactReference["artifactKind"]): value is ArtifactReference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const reference = value as Record<string, unknown>;
  return reference.artifactKind === expectedKind
    && typeof reference.artifactId === "string" && reference.artifactId.length > 0
    && typeof reference.contentHash === "string" && /^[a-f0-9]{64}$/.test(reference.contentHash)
    && typeof reference.relativePath === "string" && reference.relativePath.length > 0;
}

function exactPersistedReference(
  store: ReviewGovernanceSqliteStore,
  scope: AuthoritativeReviewScope,
  reference: ArtifactReference,
  expectedKind: ArtifactReference["artifactKind"],
): ReturnType<ReviewGovernanceSqliteStore["getArtifactByHash"]> {
  const stored = store.getArtifactByHash(reference.contentHash);
  return stored
    && stored.artifactKind === expectedKind
    && stored.artifactId === reference.artifactId
    && stored.artifactRelativePath === reference.relativePath
    && sameScope(scope, stored)
    ? stored
    : null;
}

function resolvePersistedManifestContext(
  store: ReviewGovernanceSqliteStore,
  input: AuthoritativeReviewSuccessorIntegrationInput,
  reference: ArtifactReference,
): ManifestPredecessorContext | undefined {
  const stored = exactPersistedReference(store, input.expectedScope, reference, "review_manifest");
  if (!stored || hashUtf8(stored.canonicalJson) !== stored.contentHash) return undefined;
  const validated = validateReviewContractArtifact(stored.canonicalJson, {
    projectRoot: input.projectRoot,
    featurePath: input.featureRootPath,
    expectedManifestScope: input.expectedScope,
  });
  return validated.valid && validated.artifact.artifactKind === "review_manifest"
    && computeReviewArtifactHash(validated.artifact) === stored.contentHash
    ? { manifest: validated.artifact as ReviewManifest, reference, scope: input.expectedScope }
    : undefined;
}

function resolvePersistedResponseContext(
  store: ReviewGovernanceSqliteStore,
  input: AuthoritativeReviewSuccessorIntegrationInput,
  reference: ArtifactReference,
  manifestContext: ManifestPredecessorContext,
): ResponsePredecessorContext | undefined {
  const stored = exactPersistedReference(store, input.expectedScope, reference, "remediation_response");
  if (!stored || hashUtf8(stored.canonicalJson) !== stored.contentHash) return undefined;
  const validated = validateReviewContractArtifact(stored.canonicalJson, {
    featurePath: input.featureRootPath,
    manifestContext,
  });
  return validated.valid && validated.artifact.artifactKind === "remediation_response"
    && computeReviewArtifactHash(validated.artifact) === stored.contentHash
    ? { response: validated.artifact as RemediationResponse, reference, scope: input.expectedScope }
    : undefined;
}

function reconcileUnacceptedPublication(
  store: ReviewGovernanceSqliteStore,
  projectRoot: string,
  publication: { readonly path: string; readonly created: boolean },
  canonicalJson: string,
  contentHash: string,
): void {
  // Only an invocation-owned no-replace publication is eligible. Reused,
  // collision, ambiguous, or committed files are immutable/non-authoritative
  // history and must never be unlinked by a refusal path.
  if (!publication.created) return;
  try {
    if (store.getArtifactByHash(contentHash)) return;
    cleanupAfterAbsenceHookForTest?.();
    const before = lstatSync(publication.path);
    if (!before.isFile() || before.isSymbolicLink()) return;
    const bytes = readFileSync(publication.path, "utf8");
    const after = lstatSync(publication.path);
    if (!sameFileIdentity(before, after) || after.isSymbolicLink()
      || bytes !== canonicalJson || hashUtf8(bytes) !== contentHash) return;
    // Recheck immediately before unlinking so a committed concurrent ingest
    // keeps its artifact. A failed proof deliberately leaves a fail-closed
    // non-authoritative orphan rather than deleting an unproved object.
    if (store.getArtifactByHash(contentHash)) return;
    unlinkSync(publication.path);
  } catch {
    // Cleanup evidence is intentionally sanitized and non-authoritative.
  }
}

function persistAndRenderValidatedReview(
  rawInput: unknown,
  store: ReviewGovernanceSqliteStore,
): AuthoritativeReviewIntegrationResult {
  const input = admitAuthoritativeReviewInput(rawInput);
  if (!input) return refusal("invalid_input");
  const artifact = input.validationResult.artifact;
  let publication: { readonly path: string; readonly created: boolean } | undefined;
  let canonicalJson: string | undefined;
  let contentHash: string | undefined;
  let releaseIngressLease: (() => void) | undefined;
  let committed = false;
  try {
    canonicalJson = canonicalizeReviewArtifact(artifact);
    contentHash = computeReviewArtifactHash(artifact);
    // Detect the immutable duplicate before file publication. A duplicate is a
    // refusal, never an idempotent retry, new gate, or transition candidate.
    if (store.getArtifactByHash(contentHash)) return refusal("duplicate_artifact");
    publication = ReviewGovernanceSqliteStore.persistArtifactFileV1({
      projectRoot: input.projectRoot,
      featureRootPath: input.featureRootPath,
      artifactKind: artifact.artifactKind,
      contentHash,
      canonicalJson,
    });
    releaseIngressLease = acquireContentAddressedIngressLease(publication.path, contentHash);
    if (!releaseIngressLease) return refusal("persistence_failed");
    const ingestion = ingestValidatedReviewEvidence({
      expectedScope: input.expectedScope,
      validationResult: input.validationResult,
      featureRootPath: input.featureRootPath,
      ingestedAt: input.ingestedAt,
      enforcement: { enabled: input.enforcementEnabled, storeAvailable: true },
      store,
    });
    if (ingestion.kind === "refusal") {
      if (ingestion.code === "duplicate_artifact") return refusal("duplicate_artifact");
      if (ingestion.code === "store_unavailable") return refusal("store_unavailable");
      // Preserve a contract/lineage refusal. Calling it a persistence failure
      // sends recovery down the wrong path and conceals a deterministic input
      // error from the reviewer workflow.
      if (ingestion.code === "invalid_input") return refusal("invalid_input");
      return refusal("persistence_failed");
    }
    committed = true;
    const readBack = readModel(store, input.projectRoot, input.expectedScope, ingestion.contentHash);
    if (!readBack) return refusal("persistence_failed");
    const rendered = renderPersistedReviewEvidence(readBack);
    if (rendered.kind !== "rendered") return refusal("presentation_failed");
    return ingestion.kind === "persisted"
      ? { kind: "persisted", ingestion, readModel: readBack, rendered }
      : { kind: "persisted_non_authoritative", ingestion, readModel: readBack, rendered };
  } catch {
    return refusal("persistence_failed");
  } finally {
    if (publication && canonicalJson && contentHash && !committed && releaseIngressLease) {
      reconcileUnacceptedPublication(store, input.projectRoot, publication, canonicalJson, contentHash);
    }
    releaseIngressLease?.();
  }
}

/**
 * Executes validate-result → file publication → one transactional ingress →
 * exact database/file read-back → rendering. It has no legacy authority lane.
 */
export function ingestAndRenderAuthoritativeReview(rawInput: unknown): AuthoritativeReviewIntegrationResult {
  const input = admitAuthoritativeReviewInput(rawInput);
  if (!input) return refusal("invalid_input");
  const store = openAuthoritativeReviewStore(input.projectRoot, input.databasePath);
  if (!store) return refusal("store_unavailable");
  try {
    return persistAndRenderValidatedReview(input, store);
  } finally {
    store.close();
  }
}

/**
 * Load the immutable NEEDS_CHANGES basis for a review rerun. This is a prompt
 * projection only; it grants no transition authority. Returning unavailable
 * is deliberately fail-closed: dispatching a rerun without its exact lineage
 * would create an artifact the V1 ingress must reject.
 */
export function readAuthoritativeReviewRerunLineageContext(input: {
  readonly projectRoot: string;
  readonly databasePath: string;
  readonly expectedScope: AuthoritativeReviewScope;
}): AuthoritativeReviewRerunLineageContext {
  if (!isScope(input.expectedScope)) return { kind: "unavailable" };
  const store = openAuthoritativeReviewStore(input.projectRoot, input.databasePath);
  if (!store) return { kind: "unavailable" };
  try {
    const gate = store.getCurrentAuthoritativeReviewGate(input.expectedScope);
    if (!gate) return { kind: "not_required" };
    const currentBasis = store.getArtifactByHash(gate.basisManifestHash);
    if (!currentBasis) return { kind: "unavailable" };
    const currentManifest = parseStoredReviewManifest(currentBasis.canonicalJson);
    if (!currentManifest) return { kind: "unavailable" };
    const basis = currentManifest.result === "NEEDS_CHANGES"
      ? currentBasis
      : currentManifest.result === "APPROVED"
        && gate.gateState === "PENDING"
        && gate.reasonCode === "terminal_remediation_required"
        ? store.listArtifactLineageByArtifactHash(currentBasis.contentHash)
          .filter((lineage) => lineage.relationKind === "predecessor")
          .map((lineage) => store.getArtifactByHash(lineage.predecessorHash))
          .find((candidate) => candidate
            && parseStoredReviewManifest(candidate.canonicalJson)?.result === "NEEDS_CHANGES")
        : undefined;
    if (!basis) {
      return currentManifest.result === "NEEDS_CHANGES"
        || (currentManifest.result === "APPROVED" && gate.gateState === "PENDING")
        ? { kind: "unavailable" }
        : { kind: "not_required" };
    }
    const manifest = parseStoredReviewManifest(basis.canonicalJson);
    if (!manifest || manifest.result !== "NEEDS_CHANGES") return { kind: "unavailable" };
    const run = store.getReviewRunByManifestHash(basis.contentHash);
    if (!run) return { kind: "unavailable" };
    const findings = store.listFindingsByRun(run.reviewRunId)
      .map((finding): ReviewRemediationFindingIdentity | null => (
        finding.disposition === "IN_SCOPE_BLOCKER"
        || finding.disposition === "SCOPE_EXPANSION"
        || finding.disposition === "ARCHITECTURE_DEBT"
        || finding.disposition === "OBSERVATION"
          ? { findingId: finding.findingId, disposition: finding.disposition }
          : null
      ))
      .filter((finding): finding is ReviewRemediationFindingIdentity => finding !== null);
    if (findings.length !== manifest.findings.length) return { kind: "unavailable" };
    return {
      kind: "required",
      predecessor: {
        artifactKind: "review_manifest",
        artifactId: basis.artifactId,
        contentHash: basis.contentHash,
        relativePath: basis.artifactRelativePath,
      },
      findings,
    };
  } catch {
    return { kind: "unavailable" };
  } finally {
    store.close();
  }
}

function parseStoredReviewManifest(canonicalJson: string): ReviewManifest | null {
  try {
    const manifest: unknown = JSON.parse(canonicalJson);
    return isRecord(manifest) && manifest.artifactKind === "review_manifest"
      && (manifest.result === "APPROVED"
        || manifest.result === "NEEDS_CHANGES"
        || manifest.result === "BLOCKED")
      ? manifest as unknown as ReviewManifest
      : null;
  } catch {
    return null;
  }
}

/**
 * Validate and ingest a remediation response or verification receipt only when
 * its exact predecessor records are already persisted in the same V1 scope.
 * This is an ingestion boundary only: it never dispatches a retry or advances
 * workflow state; callers receive a refusal for missing, mismatched, or
 * duplicate successor input.
 */
export function ingestAndRenderAuthoritativeReviewSuccessor(
  rawInput: unknown,
): AuthoritativeReviewIntegrationResult {
  if (typeof rawInput !== "object" || rawInput === null || Array.isArray(rawInput)) return refusal("invalid_input");
  const input = rawInput as AuthoritativeReviewSuccessorIntegrationInput;
  if (typeof input.projectRoot !== "string" || typeof input.databasePath !== "string"
    || typeof input.featureRootPath !== "string" || typeof input.rawPayload !== "string"
    || typeof input.ingestedAt !== "string" || typeof input.enforcementEnabled !== "boolean"
    || !isScope(input.expectedScope)) return refusal("invalid_input");

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(input.rawPayload);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return refusal("invalid_input");
    payload = parsed as Record<string, unknown>;
  } catch {
    return refusal("invalid_input");
  }
  const kind = payload.artifactKind;
  if (kind !== "remediation_response" && kind !== "verification_receipt") return refusal("invalid_input");
  if (!isReference(payload.manifestReference, "review_manifest")) return refusal("invalid_input");
  if (kind === "verification_receipt" && !isReference(payload.responseReference, "remediation_response")) return refusal("invalid_input");

  const store = openAuthoritativeReviewStore(input.projectRoot, input.databasePath);
  if (!store) return refusal("store_unavailable");
  try {
    const manifestContext = resolvePersistedManifestContext(store, input, payload.manifestReference);
    if (!manifestContext) return refusal("invalid_input");
    const responseContext = kind === "verification_receipt"
      ? resolvePersistedResponseContext(store, input, payload.responseReference as ArtifactReference, manifestContext)
      : undefined;
    if (kind === "verification_receipt" && !responseContext) return refusal("invalid_input");
    const validationResult = validateReviewContractArtifact(input.rawPayload, {
      projectRoot: input.projectRoot,
      featurePath: input.featureRootPath,
      manifestContext,
      ...(responseContext ? { responseContext } : {}),
    });
    if (!validationResult.valid) {
      return refusal(
        "invalid_input",
        `Authoritative review successor validation failed (${validationResult.code}): ${validationResult.message}`,
      );
    }
    return persistAndRenderValidatedReview({
      projectRoot: input.projectRoot,
      databasePath: input.databasePath,
      featureRootPath: input.featureRootPath,
      expectedScope: input.expectedScope,
      validationResult,
      ingestedAt: input.ingestedAt,
      enforcementEnabled: input.enforcementEnabled,
    }, store);
  } catch {
    return refusal("persistence_failed");
  } finally {
    store.close();
  }
}

function isDurableEvidenceReadInput(value: unknown, requireHash: boolean): value is {
  readonly projectRoot: string;
  readonly databasePath: string;
  readonly expectedScope: AuthoritativeReviewScope;
  readonly contentHash?: string;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return typeof input.projectRoot === "string" && input.projectRoot.length > 0
    && typeof input.databasePath === "string" && input.databasePath.length > 0
    && isScope(input.expectedScope)
    && (!requireHash || (typeof input.contentHash === "string" && /^[a-f0-9]{64}$/.test(input.contentHash)));
}

/** Read restart-safe inspection evidence for one known immutable artifact. */
export function readAuthoritativeReviewEvidence(input: unknown): PersistedReviewEvidenceReadModel | undefined {
  if (!isDurableEvidenceReadInput(input, true) || !input.contentHash) return undefined;
  let store = openAuthoritativeReviewStore(input.projectRoot, input.databasePath);
  if (!store) return undefined;
  try {
    return readModel(store, input.projectRoot, input.expectedScope, input.contentHash);
  } catch {
    return undefined;
  } finally {
    store.close();
  }
}

/**
 * Reconstruct the current exact-scope inspection model after a process reload.
 * The durable gate selects the artifact; no agent payload, cached projection,
 * Markdown, or caller-provided artifact hash participates in this lookup.
 */
export function readCurrentAuthoritativeReviewEvidence(input: unknown): PersistedReviewEvidenceReadModel | undefined {
  if (!isDurableEvidenceReadInput(input, false)) return undefined;
  const store = openAuthoritativeReviewStore(input.projectRoot, input.databasePath);
  if (!store) return undefined;
  try {
    const gate = store.getCurrentAuthoritativeReviewGate(input.expectedScope);
    if (!gate || !sameScope(input.expectedScope, gate)) return undefined;
    return readModel(store, input.projectRoot, input.expectedScope, gate.triggerArtifactHash);
  } catch {
    return undefined;
  } finally {
    store.close();
  }
}
