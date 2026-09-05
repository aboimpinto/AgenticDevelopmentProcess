import { createHash } from "node:crypto";
import { assertProjectRelativePosixPath, deriveArtifactPath } from "./artifact-path-policy.js";
import { scanSafeContent, scanSafeParsedStringValues } from "./content-safety.js";
import {
  ALLOWED_ARTIFACT_KINDS,
  ALLOWED_CYCLE_STATES,
  ALLOWED_GATE_STATES,
  type ReviewArtifactReferenceInput,
  type ReviewFindingObservationInput,
  type ReviewIngestInput,
  type ReviewLineageInput,
  type ReviewStoreArtifactKind,
  type ReviewStoreFindingInput,
} from "./contracts.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHA256_HEX_RE = /^[a-f0-9]{64}$/;

/** Maximum UTF-8 bytes for canonical JSON payload. */
const MAX_CANONICAL_JSON_BYTES = 256 * 1024;

/** Maximum findings and cited rule snapshots per manifest. */
const MAX_FINDINGS = 64;

/** Maximum independently resolved active rule snapshots at store construction. */
const MAX_CURRENT_ACTIVE_RULE_SNAPSHOTS = 256;

/** Maximum predecessor hashes in one lineage. */
const MAX_PREDECESSOR_HASHES = 64;

/** Maximum remediation items per ingestion request. */
const MAX_REMEDIATION_ITEMS = 128;

/** Current-V1 limits for per-finding obligations and nested collections. */
const MAX_ITEMS_PER_FINDING = 64;
const MAX_COLLECTION_ENTRIES = 128;

/** Maximum verification receipts per ingestion request. */
const MAX_VERIFICATION_RECEIPTS = 128;

const MAX_REASON_CODE_LENGTH = 128;
const MAX_IDENTIFIER_LENGTH = 256;

/**
 * Current V1 contract limits.  These deliberately mirror the artifact
 * validator rather than the shorter database identifier limit: a
 * schema-valid artifact must not pass validation only to fail while its
 * canonical findings are projected into immutable storage.
 */
const MAX_V1_TEXT_LENGTH = 4_096;
const MAX_V1_SERIALIZED_DERIVATIVE_LENGTH = MAX_CANONICAL_JSON_BYTES;

// ---------------------------------------------------------------------------
// SHA-256 helpers
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 hex digest from UTF-8 canonical JSON bytes.
 */
export function computeSha256Hex(canonicalJson: string): string {
  return createHash("sha256").update(canonicalJson, "utf8").digest("hex");
}

/** Matches the FEAT-064 canonical V1 JSON representation without importing
 * an orchestrator package into the database package. */
export function canonicalizeJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) rejectInput();
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) !== null
    && Object.getPrototypeOf(value) !== Object.prototype) rejectInput();
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`).join(",")}}`;
  }
  rejectInput();
}

function assertSafeIdentifier(value: unknown): asserts value is string {
  assertNonEmptyString(value);
  if (value.length > MAX_IDENTIFIER_LENGTH) rejectInput();
  try {
    scanSafeContent(value);
  } catch {
    rejectInput();
  }
}

/**
 * F1: Sanitized validation helpers that never embed caller values, hashes,
 * paths, or system errors in the refusal message. All input-validation
 * failures throw the same deterministic INVALID_INPUT error.
 */

export function rejectInput(): never {
  throw new Error("INVALID_INPUT");
}

function assertNonNullObject(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    rejectInput();
  }
}

function assertNonEmptyString(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    rejectInput();
  }
}

function assertNonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    rejectInput();
  }
  return value;
}

export function assertValidHash(value: unknown): string {
  if (typeof value !== "string" || !SHA256_HEX_RE.test(value)) {
    rejectInput();
  }
  return value;
}

function assertValidScopeMembers(obj: Record<string, unknown>): void {
  assertExactKeys(obj, ["projectId", "featureId", "phaseNumber", "reviewGateId"]);
  assertRequiredKeys(obj, ["projectId", "featureId", "phaseNumber", "reviewGateId"]);
  assertSafeIdentifier(obj.projectId);
  assertSafeIdentifier(obj.featureId);
  assertNonNegativeInteger(obj.phaseNumber);
  assertSafeIdentifier(obj.reviewGateId);
}

function assertSafeRunIdentifier(value: unknown): asserts value is string {
  assertSafeIdentifier(value);
}

function assertOptionalSafeBoundedMember(obj: Record<string, unknown>, key: string, maxLength = MAX_IDENTIFIER_LENGTH): void {
  if (!(key in obj) || obj[key] === undefined) return;
  if (obj[key] === null) rejectInput();
  assertSafeBoundedString(obj[key], maxLength);
}

function assertStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    rejectInput();
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string") {
      rejectInput();
    }
  }
  return value as string[];
}

function assertHashArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    rejectInput();
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string" || !SHA256_HEX_RE.test(value[i] as string)) {
      rejectInput();
    }
  }
  return value as string[];
}

function assertV3AssessmentIds(value: unknown, maximum: number): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) rejectInput();
  const seen = new Set<string>();
  for (const id of value) {
    assertKebabIdentifier(id);
    if (seen.has(id)) rejectInput();
    seen.add(id);
  }
}

function assertAllowedValue<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    rejectInput();
  }
  return value as T;
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) rejectInput();
}

function assertRequiredKeys(value: Record<string, unknown>, required: readonly string[]): void {
  if (required.some((key) => !(key in value))) rejectInput();
}

function assertExactShape(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  assertNonNullObject(value);
  const record = value as Record<string, unknown>;
  assertExactKeys(record, [...required, ...optional]);
  assertRequiredKeys(record, required);
  return record;
}

function assertArtifactReferenceShape(value: unknown, expectedKind?: string): Record<string, unknown> {
  const reference = assertExactShape(value, ["artifactKind", "artifactId", "contentHash", "relativePath"]);
  assertAllowedValue(reference.artifactKind, ALLOWED_ARTIFACT_KINDS);
  if (expectedKind !== undefined && reference.artifactKind !== expectedKind) rejectInput();
  assertKebabIdentifier(reference.artifactId);
  assertValidHash(reference.contentHash);
  assertProjectRelativePosixPath(reference.relativePath);
  return reference;
}

function assertSurfaceShape(value: unknown): Record<string, unknown> {
  const surface = assertExactShape(value, ["inspected", "affected", "confirmedUnaffected"]);
  const affectedIds = new Set<string>();
  const confirmedUnaffectedIds = new Set<string>();
  for (const member of ["inspected", "affected", "confirmedUnaffected"] as const) {
    const entries = surface[member];
    if (!Array.isArray(entries) || entries.length > MAX_COLLECTION_ENTRIES) rejectInput();
    const seenInCollection = new Set<string>();
    for (const entryValue of entries) {
      const entry = assertExactShape(entryValue, ["surfaceId", "relativePath"], ["symbol", "endpoint", "rationale"]);
      assertKebabIdentifier(entry.surfaceId);
      assertProjectRelativePosixPath(entry.relativePath);
      for (const key of ["symbol", "endpoint", "rationale"] as const) {
        if (key in entry) assertSafeBoundedString(entry[key]);
      }
      const surfaceId = entry.surfaceId as string;
      if (seenInCollection.has(surfaceId)) rejectInput();
      seenInCollection.add(surfaceId);
      if (member === "affected") affectedIds.add(surfaceId);
      if (member === "confirmedUnaffected") confirmedUnaffectedIds.add(surfaceId);
    }
  }
  for (const surfaceId of affectedIds) {
    if (confirmedUnaffectedIds.has(surfaceId)) rejectInput();
  }
  return surface;
}

function assertActiveRuleSnapshotShape(value: unknown): Record<string, unknown> {
  const snapshot = assertExactShape(value, [
    "schemaVersion", "catalogSchemaVersion", "ruleId", "ruleVersion", "category", "scope", "title",
    "source", "catalogPath", "catalogSourceHash", "ruleHash",
  ]);
  if (snapshot.schemaVersion !== 1 || snapshot.catalogSchemaVersion !== 1
    || !["architecture", "security", "policy", "quality"].includes(snapshot.category as string)
    || snapshot.catalogPath !== ".hepha/architecture-rules.yaml") rejectInput();
  assertKebabIdentifier(snapshot.ruleId);
  assertSafeBoundedString(snapshot.ruleVersion, 32);
  assertSafeBoundedString(snapshot.scope);
  assertSafeBoundedString(snapshot.title);
  assertValidHash(snapshot.catalogSourceHash);
  assertValidHash(snapshot.ruleHash);
  const source = assertExactShape(snapshot.source, ["document", "section"]);
  assertSafeBoundedString(source.document);
  assertSafeBoundedString(source.section);
  return snapshot;
}

function assertFindingNestedContract(finding: Record<string, unknown>, scopeFeatureId: string): void {
  const surface = assertSurfaceShape(finding.surface);
  const affectedIds = new Set((surface.affected as unknown[]).map((entry) => (entry as Record<string, unknown>).surfaceId));
  const hasAuthority = "authority" in finding;
  let authority: Record<string, unknown> | undefined;
  if (hasAuthority) {
    authority = assertExactShape(finding.authority, ["kind", "reference"], ["snapshot", "source"]);
    if (authority.kind === "active_rule") {
      const snapshot = assertActiveRuleSnapshotShape(authority.snapshot);
      if (typeof authority.reference !== "string" || !/^rule:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(authority.reference)
        || authority.reference !== `rule:${snapshot.ruleId}`) rejectInput();
    } else if (authority.kind === "acceptance_criterion") {
      if (typeof authority.reference !== "string"
        || !new RegExp(`^ac:${scopeFeatureId}:[a-zA-Z0-9_-]+$`).test(authority.reference)) rejectInput();
      const source = assertExactShape(authority.source, ["relativePath", "section"]);
      assertProjectRelativePosixPath(source.relativePath);
      assertSafeBoundedString(source.section);
    } else rejectInput();
  }
  if (!hasAuthority && finding.disposition !== "OBSERVATION") rejectInput();

  const validateObligations = (name: "remediationItems" | "testMatrix", id: string): void => {
    const values = finding[name];
    if (!Array.isArray(values) || values.length === 0 || values.length > MAX_ITEMS_PER_FINDING) rejectInput();
    const ids = new Set<string>();
    for (const value of values) {
      const item = name === "remediationItems"
        ? assertExactShape(value, ["remediationItemId", "instruction", "targetSurfaceIds"])
        : assertExactShape(value, ["testId", "requirement", "targetSurfaceIds"]);
      assertKebabIdentifier(item[id]);
      assertSafeBoundedString(item[name === "remediationItems" ? "instruction" : "requirement"]);
      if (!Array.isArray(item.targetSurfaceIds)
        || item.targetSurfaceIds.length > MAX_COLLECTION_ENTRIES
        || (name === "remediationItems" && item.targetSurfaceIds.length === 0)) rejectInput();
      const targetIds = new Set<string>();
      for (const target of item.targetSurfaceIds) {
        assertKebabIdentifier(target);
        if (targetIds.has(target) || !affectedIds.has(target)) rejectInput();
        targetIds.add(target);
      }
      const itemId = item[id] as string;
      if (ids.has(itemId)) rejectInput();
      ids.add(itemId);
    }
  };

  const disposition = finding.disposition;
  if (disposition === "IN_SCOPE_BLOCKER" || disposition === "SCOPE_EXPANSION") {
    assertSafeBoundedString(finding.rootCause);
    if ((surface.inspected as unknown[]).length === 0 || (surface.affected as unknown[]).length === 0
      || (surface.confirmedUnaffected as unknown[]).length === 0) rejectInput();
    validateObligations("remediationItems", "remediationItemId");
    validateObligations("testMatrix", "testId");
    assertAllowedValue(finding.exhaustivenessDecision, ["local_only", "cross_cutting_complete", "replan_required"] as const);
    assertAllowedValue(finding.compatibilityDecision, ["breaking_change_permitted", "backward_compatibility_required"] as const);
    if (finding.compatibilityDecision === "backward_compatibility_required") {
      assertSafeBoundedString(finding.compatibilityApprovalSource);
      assertSafeBoundedString(finding.compatibilityJustification);
    } else if ("compatibilityApprovalSource" in finding || "compatibilityJustification" in finding) rejectInput();
    if (disposition === "SCOPE_EXPANSION") assertSafeBoundedString(finding.scopeExpansionRationale);
    else if ("scopeExpansionRationale" in finding) rejectInput();
    if ("debtImpact" in finding || "debtObservationReference" in finding) rejectInput();
  } else if (disposition === "ARCHITECTURE_DEBT") {
    if (authority?.kind !== "active_rule" || (surface.inspected as unknown[]).length === 0
      || (surface.affected as unknown[]).length === 0 || finding.debtImpact !== "untouched_non_blocking") rejectInput();
    if ("debtObservationReference" in finding) assertArtifactReferenceShape(finding.debtObservationReference, "debt_observation");
    for (const key of ["rootCause", "scopeExpansionRationale", "remediationItems", "testMatrix", "exhaustivenessDecision", "compatibilityDecision", "compatibilityApprovalSource", "compatibilityJustification"]) if (key in finding) rejectInput();
  } else if (disposition === "OBSERVATION") {
    if ((surface.inspected as unknown[]).length === 0) rejectInput();
    for (const key of ["rootCause", "scopeExpansionRationale", "remediationItems", "testMatrix", "exhaustivenessDecision", "compatibilityDecision", "compatibilityApprovalSource", "compatibilityJustification", "debtImpact", "debtObservationReference"]) if (key in finding) rejectInput();
  } else rejectInput();
}

function assertKebabIdentifier(value: unknown, maxLength = 128): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength
    || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)) rejectInput();
}

function assertSafeBoundedString(value: unknown, maxLength = 4096): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) rejectInput();
  try { scanSafeContent(value); } catch { rejectInput(); }
}

function assertUtcTimestamp(value: unknown): void {
  if (typeof value !== "string") rejectInput();
  // Require ISO 8601 UTC format with 'Z' suffix or '+00:00' offset
  const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]00:00)$/;
  if (!isoRe.test(value as string)) {
    rejectInput();
  }
  // F4: Reject impossible timestamps — bound the year to a real range
  const year = parseInt((value as string).substring(0, 4), 10);
  if (year < 2000 || year > 2099) {
    rejectInput();
  }
  // Reject impossible month, day, hour, minute
  const month = parseInt((value as string).substring(5, 7), 10);
  if (month < 1 || month > 12) rejectInput();
  const day = parseInt((value as string).substring(8, 10), 10);
  if (day < 1 || day > 31) rejectInput();
  // F4: Calendar-aware day validation — reject impossible dates like Feb 30
  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const maxDay = (month === 2 && isLeap) ? 29 : daysInMonth[month as number];
  if (day > maxDay) rejectInput();
  const hour = parseInt((value as string).substring(11, 13), 10);
  if (hour < 0 || hour > 23) rejectInput();
  const minute = parseInt((value as string).substring(14, 16), 10);
  if (minute < 0 || minute > 59) rejectInput();
  const second = parseInt((value as string).substring(17, 19), 10);
  if (second < 0 || second > 59) rejectInput();
}

/**
 * F1: Runtime boundary validation — validates the entire ingest input
 * shape before any property is dereferenced. Recomputes SHA-256 from
 * canonicalJson and rejects mismatch before the store begins its
 * transaction.
 *
 * All validation failures return the same deterministic INVALID_INPUT
 * refusal without embedding caller values, hashes, paths, or system
 * errors in the message.
 */
/**
 * Structural current-V1 verification kept in the database package so that
 * persistence never relies on TypeScript types or an upstream assertion.
 * Catalog membership is intentionally resolved by FEAT-064 before this
 * boundary; this verifier rejects non-V1 shape, unknown members, malformed
 * snapshots/findings, and mismatches with the normalized persistence input.
 */
function deriveCanonicalLineage(value: unknown): ReviewLineageInput {
  if (value === undefined) return {};
  const lineage = assertExactShape(value, [], ["predecessors", "supersedes"]);
  const predecessorReferences: ReviewArtifactReferenceInput[] = [];
  if ("predecessors" in lineage) {
    if (!Array.isArray(lineage.predecessors) || lineage.predecessors.length === 0
      || lineage.predecessors.length > MAX_PREDECESSOR_HASHES) rejectInput();
    const seen = new Set<string>();
    for (const value of lineage.predecessors) {
      const reference = assertArtifactReferenceShape(value);
      const hash = reference.contentHash as string;
      if (seen.has(hash)) rejectInput();
      seen.add(hash);
      predecessorReferences.push({
        artifactKind: reference.artifactKind as ReviewStoreArtifactKind,
        artifactId: reference.artifactId as string,
        contentHash: hash,
        relativePath: reference.relativePath as string,
      });
    }
  }
  let supersedesReference: ReviewArtifactReferenceInput | undefined;
  if ("supersedes" in lineage) {
    const reference = assertArtifactReferenceShape(lineage.supersedes);
    if (predecessorReferences.some((item) => item.contentHash === reference.contentHash)) rejectInput();
    supersedesReference = {
      artifactKind: reference.artifactKind as ReviewStoreArtifactKind,
      artifactId: reference.artifactId as string,
      contentHash: reference.contentHash as string,
      relativePath: reference.relativePath as string,
    };
  }
  return {
    predecessorHashes: predecessorReferences.map((item) => item.contentHash),
    supersedesHash: supersedesReference?.contentHash,
    predecessorReferences,
    supersedesReference,
  };
}

function validateActiveCatalogSnapshots(
  snapshots: ReadonlyMap<string, Record<string, unknown>>,
  currentCatalogSnapshots: ReadonlyMap<string, Record<string, unknown>>,
): void {
  // The catalog is resolved outside the request at store construction. A
  // manifest may cite a subset of the active catalog, but every cited rule
  // must exactly equal the independently resolved current snapshot.
  for (const [ruleId, snapshot] of snapshots) {
    const current = currentCatalogSnapshots.get(ruleId);
    if (!current || canonicalizeJson(current) !== canonicalizeJson(snapshot)) rejectInput();
  }
}

export function resolveCurrentCatalogSnapshots(value: unknown): ReadonlyMap<string, Record<string, unknown>> {
  // Construction-time authority is the complete independently resolved V1
  // catalog, not the bounded subset a single manifest may cite.
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CURRENT_ACTIVE_RULE_SNAPSHOTS) rejectInput();
  const snapshots = new Map<string, Record<string, unknown>>();
  for (const entry of value) {
    const snapshot = assertActiveRuleSnapshotShape(entry);
    const ruleId = snapshot.ruleId as string;
    if (snapshots.has(ruleId)) rejectInput();
    snapshots.set(ruleId, snapshot);
  }
  return snapshots;
}

function deriveCanonicalObservationId(
  scope: Record<string, unknown>,
  contentHash: string,
  artifactId: string,
  findingId: string,
): string {
  // This is a database-wide immutable identity, not a display label. The
  // fixed prefix plus SHA-256 keeps it safe, stable, and well below the
  // store's 256-character identifier limit while binding every scope member.
  return `observation-${computeSha256Hex(canonicalizeJson({
    projectId: scope.projectId,
    featureId: scope.featureId,
    phaseNumber: scope.phaseNumber,
    reviewGateId: scope.reviewGateId,
    contentHash,
    artifactId,
    findingId,
  }))}`;
}

function deriveCanonicalFinding(
  scope: Record<string, unknown>,
  contentHash: string,
  artifactId: string,
  finding: Record<string, unknown>,
  ingestedAt: unknown,
): ReviewStoreFindingInput {
  const authority = finding.authority as Record<string, unknown> | undefined;
  const snapshot = authority?.snapshot as Record<string, unknown> | undefined;
  const findingId = finding.findingId as string;
  const observation: ReviewFindingObservationInput = {
    observationId: deriveCanonicalObservationId(scope, contentHash, artifactId, findingId),
    findingId,
    surfaceJson: canonicalizeJson(finding.surface),
    remediationItemsJson: canonicalizeJson(finding.remediationItems ?? []),
    testMatrixJson: canonicalizeJson(finding.testMatrix ?? []),
    ...(typeof finding.rootCause === "string" ? { rootCause: finding.rootCause } : {}),
    ...(typeof finding.scopeExpansionRationale === "string" ? { scopeRationale: finding.scopeExpansionRationale } : {}),
    createdAt: ingestedAt as string,
  };
  return {
    findingId,
    disposition: finding.disposition as string,
    claimType: finding.claimType as string,
    severity: finding.severity as string,
    defectClass: finding.defectClass as string,
    summary: finding.summary as string,
    observation,
    ...(authority?.kind === "active_rule"
      ? {
        ruleReference: authority.reference as string,
        ruleId: snapshot?.ruleId as string,
        ruleVersion: snapshot?.ruleVersion as string,
        ruleHash: snapshot?.ruleHash as string,
      }
      : authority?.kind === "acceptance_criterion"
        ? {
          acSourcePath: (authority.source as Record<string, unknown>).relativePath as string,
          acSection: (authority.source as Record<string, unknown>).section as string,
        }
        : {}),
  };
}

function validateCurrentV1Artifact(
  artifact: Record<string, unknown>,
  input: Record<string, unknown>,
  currentCatalogSnapshots: ReadonlyMap<string, Record<string, unknown>>,
): readonly ReviewStoreFindingInput[] | undefined {
  const commonRequired = ["schemaVersion", "artifactKind", "artifactId", "scope"];
  const shapes: Record<string, { required: readonly string[]; optional: readonly string[] }> = {
    review_manifest: { required: [...commonRequired, "result", "ruleSnapshots", "findings"], optional: ["lineage", "blockerReason"] },
    remediation_response: { required: [...commonRequired, "manifestReference", "findingResponses"], optional: ["lineage", "suspectedOutOfScopeObservations"] },
    verification_receipt: { required: [...commonRequired, "manifestReference", "responseReference", "itemReceipts", "testReceipts"], optional: ["lineage"] },
    replan_plan: { required: [...commonRequired, "manifestReference", "findingIds", "defectClass", "replanReason", "rootCause", "surface", "explicitExclusions", "remediationItems", "testMatrix", "verificationPlan", "closureCriteria"], optional: ["lineage"] },
    debt_observation: { required: [...commonRequired, "manifestReference", "findingId", "authority", "historicalSurface", "evidence", "riskRationale", "currentFeatureImpact"], optional: ["lineage"] },
  };
  const shape = shapes[artifact.artifactKind as string];
  if (!shape) rejectInput();
  assertExactKeys(artifact, [...shape.required, ...shape.optional]);
  assertRequiredKeys(artifact, shape.required);
  if (artifact.schemaVersion !== 1 || artifact.artifactKind !== input.artifactKind
    || artifact.artifactId !== input.artifactId) rejectInput();
  assertKebabIdentifier(artifact.artifactId);
  assertNonNullObject(artifact.scope);
  const scope = artifact.scope as Record<string, unknown>;
  assertExactKeys(scope, ["projectId", "featureId", "phaseNumber", "reviewGateId"]);
  assertKebabIdentifier(scope.projectId, 64);
  assertKebabIdentifier(scope.featureId, 64);
  assertNonNegativeInteger(scope.phaseNumber);
  assertKebabIdentifier(scope.reviewGateId, 64);
  if (scope.projectId !== input.projectId || scope.featureId !== input.featureId
    || scope.phaseNumber !== input.phaseNumber || scope.reviewGateId !== input.reviewGateId) rejectInput();

  if (artifact.artifactKind !== "review_manifest") {
    const manifestReference = artifact.manifestReference;
    assertNonNullObject(manifestReference);
    const reference = manifestReference as Record<string, unknown>;
    assertExactKeys(reference, ["artifactKind", "artifactId", "contentHash", "relativePath"]);
    if (reference.artifactKind !== "review_manifest" || reference.contentHash !== input.basisManifestHash) rejectInput();
    assertKebabIdentifier(reference.artifactId);
    assertValidHash(reference.contentHash);
    assertProjectRelativePosixPath(reference.relativePath);
    if (artifact.artifactKind === "remediation_response") {
      if (!Array.isArray(artifact.findingResponses) || artifact.findingResponses.length === 0) rejectInput();
      const findingIds = new Set<string>();
      for (const responseValue of artifact.findingResponses) {
        const response = assertExactShape(responseValue, ["findingId", "items"]);
        assertKebabIdentifier(response.findingId);
        if (findingIds.has(response.findingId)) rejectInput();
        findingIds.add(response.findingId);
        if (!Array.isArray(response.items) || response.items.length === 0) rejectInput();
        const itemIds = new Set<string>();
        for (const itemValue of response.items) {
          const item = assertExactShape(itemValue, ["remediationItemId", "decision", "changedSurfaceIds", "rationale"]);
          assertKebabIdentifier(item.remediationItemId);
          assertAllowedValue(item.decision, ["APPLIED", "NOT_APPLIED", "NOT_APPLICABLE"] as const);
          if (!Array.isArray(item.changedSurfaceIds)) rejectInput();
          for (const surfaceId of item.changedSurfaceIds) assertKebabIdentifier(surfaceId);
          assertSafeBoundedString(item.rationale);
          if (itemIds.has(item.remediationItemId)) rejectInput();
          itemIds.add(item.remediationItemId);
        }
      }
      if ("suspectedOutOfScopeObservations" in artifact) {
        if (!Array.isArray(artifact.suspectedOutOfScopeObservations)) rejectInput();
        for (const observationValue of artifact.suspectedOutOfScopeObservations) {
          const observation = assertExactShape(observationValue, ["relativePath", "rationale"]);
          assertProjectRelativePosixPath(observation.relativePath);
          assertSafeBoundedString(observation.rationale);
        }
      }
    } else if (artifact.artifactKind === "verification_receipt") {
      assertArtifactReferenceShape(artifact.responseReference, "remediation_response");
      for (const [key, id, outcomes] of [
        ["itemReceipts", "remediationItemId", ["VERIFIED", "FAILED", "NOT_VERIFIABLE"]],
        ["testReceipts", "testId", ["PASSED", "FAILED", "NOT_RUN", "NOT_VERIFIABLE"]],
      ] as const) {
        if (!Array.isArray(artifact[key])) rejectInput();
        for (const receiptValue of artifact[key] as unknown[]) {
          const receipt = assertExactShape(receiptValue, ["findingId", id, "outcome", "evidence"]);
          assertKebabIdentifier(receipt.findingId);
          assertKebabIdentifier(receipt[id]);
          assertAllowedValue(receipt.outcome, outcomes);
          assertSafeBoundedString(receipt.evidence);
        }
      }
    } else if (artifact.artifactKind === "replan_plan") {
      if (!Array.isArray(artifact.findingIds) || artifact.findingIds.length === 0) rejectInput();
      for (const findingId of artifact.findingIds) assertKebabIdentifier(findingId);
      assertKebabIdentifier(artifact.defectClass);
      assertAllowedValue(artifact.replanReason, ["finding_exhaustiveness", "recurrence_signal"] as const);
      assertSafeBoundedString(artifact.rootCause);
      assertSurfaceShape(artifact.surface);
      if (!Array.isArray(artifact.explicitExclusions) || !Array.isArray(artifact.remediationItems) || !Array.isArray(artifact.testMatrix)) rejectInput();
      assertSafeBoundedString(artifact.verificationPlan);
      assertSafeBoundedString(artifact.closureCriteria);
    } else if (artifact.artifactKind === "debt_observation") {
      assertKebabIdentifier(artifact.findingId);
      const authority = assertExactShape(artifact.authority, ["kind", "reference", "snapshot"]);
      if (authority.kind !== "active_rule" || typeof authority.reference !== "string" || !authority.reference.startsWith("rule:")) rejectInput();
      assertActiveRuleSnapshotShape(authority.snapshot);
      if (!Array.isArray(artifact.historicalSurface)) rejectInput();
      for (const entry of artifact.historicalSurface) assertSurfaceShape({ inspected: [entry], affected: [], confirmedUnaffected: [] });
      assertSafeBoundedString(artifact.evidence);
      assertSafeBoundedString(artifact.riskRationale);
      if (artifact.currentFeatureImpact !== "untouched_non_blocking") rejectInput();
    }
    return undefined;
  }
  if (artifact.result !== input.manifestResult
    || !["APPROVED", "NEEDS_CHANGES", "BLOCKED"].includes(artifact.result as string)) rejectInput();
  if (artifact.result === "BLOCKED") assertSafeBoundedString(artifact.blockerReason);
  if (artifact.blockerReason !== undefined && artifact.result !== "BLOCKED") assertSafeBoundedString(artifact.blockerReason);
  if (!Array.isArray(artifact.ruleSnapshots) || artifact.ruleSnapshots.length > MAX_FINDINGS
    || !Array.isArray(artifact.findings) || artifact.findings.length === 0
    || artifact.findings.length > MAX_FINDINGS) rejectInput();

  const snapshots = new Map<string, Record<string, unknown>>();
  for (const value of artifact.ruleSnapshots) {
    assertNonNullObject(value);
    const snapshot = value as Record<string, unknown>;
    assertActiveRuleSnapshotShape(snapshot);
    if (snapshots.has(snapshot.ruleId as string)) rejectInput();
    snapshots.set(snapshot.ruleId as string, snapshot);
  }

  validateActiveCatalogSnapshots(snapshots, currentCatalogSnapshots);
  const derivedFindings: ReviewStoreFindingInput[] = [];
  const findingIds = new Set<string>();
  let hasBlockerOrExpansion = false;
  for (const value of artifact.findings) {
    assertNonNullObject(value);
    const finding = value as Record<string, unknown>;
    const allowedFindingKeys = ["findingId", "disposition", "claimType", "authority", "defectClass", "severity", "summary", "surface", "rootCause", "scopeExpansionRationale", "remediationItems", "testMatrix", "exhaustivenessDecision", "compatibilityDecision", "compatibilityApprovalSource", "compatibilityJustification", "debtImpact", "debtObservationReference"];
    assertExactKeys(finding, allowedFindingKeys);
    assertRequiredKeys(finding, ["findingId", "disposition", "claimType", "defectClass", "severity", "summary", "surface"]);
    assertKebabIdentifier(finding.findingId);
    if (findingIds.has(finding.findingId as string)) rejectInput();
    findingIds.add(finding.findingId as string);
    if (!['IN_SCOPE_BLOCKER', 'SCOPE_EXPANSION', 'ARCHITECTURE_DEBT', 'OBSERVATION'].includes(finding.disposition as string)
      || !['architecture', 'security', 'policy', 'quality', 'feature_correctness'].includes(finding.claimType as string)
      || !['blocker', 'required', 'note', 'info'].includes(finding.severity as string)) rejectInput();
    if ((finding.disposition === "IN_SCOPE_BLOCKER" || finding.disposition === "SCOPE_EXPANSION")
      && finding.severity !== "blocker" && finding.severity !== "required") rejectInput();
    if ((finding.disposition === "ARCHITECTURE_DEBT" || finding.disposition === "OBSERVATION")
      && finding.severity !== "note" && finding.severity !== "info") rejectInput();
    assertKebabIdentifier(finding.defectClass);
    assertSafeBoundedString(finding.summary);
    assertFindingNestedContract(finding, scope.featureId as string);
    const authority = finding.authority as Record<string, unknown> | undefined;
    const authoritySnapshot = authority?.snapshot as Record<string, unknown> | undefined;
    if (finding.disposition !== "OBSERVATION" && !authority) rejectInput();
    if (authority) {
      if (finding.claimType === "feature_correctness") {
        if (authority.kind !== "acceptance_criterion") rejectInput();
      } else if (authority.kind !== "active_rule") {
        rejectInput();
      }
      if (authority.kind === "active_rule") {
        if (!authoritySnapshot || !snapshots.has(authoritySnapshot.ruleId as string)
          || canonicalizeJson(authoritySnapshot) !== canonicalizeJson(snapshots.get(authoritySnapshot.ruleId as string))
          || canonicalizeJson(authoritySnapshot) !== canonicalizeJson(currentCatalogSnapshots.get(authoritySnapshot.ruleId as string))) rejectInput();
      }
    }
    if (finding.disposition === "IN_SCOPE_BLOCKER" || finding.disposition === "SCOPE_EXPANSION") {
      hasBlockerOrExpansion = true;
    }
    derivedFindings.push(deriveCanonicalFinding(
      scope,
      input.contentHash as string,
      artifact.artifactId as string,
      finding,
      input.ingestedAt,
    ));
  }
  const citedRuleIds = new Set<string>();
  for (const finding of artifact.findings as Record<string, unknown>[]) {
    const authority = finding.authority as Record<string, unknown> | undefined;
    if (authority?.kind === "active_rule") {
      citedRuleIds.add((authority.snapshot as Record<string, unknown>).ruleId as string);
    }
  }
  if (citedRuleIds.size !== snapshots.size) rejectInput();
  for (const ruleId of citedRuleIds) if (!snapshots.has(ruleId)) rejectInput();
  if ((artifact.result === "APPROVED" && hasBlockerOrExpansion)
    || (artifact.result === "NEEDS_CHANGES" && !hasBlockerOrExpansion)) rejectInput();
  return derivedFindings;
}

export function validateReviewIngestInput(
  input: unknown,
  currentCatalogSnapshots: ReadonlyMap<string, Record<string, unknown>>,
): ReviewIngestInput {
  // ---- Outer value ----
  assertNonNullObject(input);

  const obj = input as Record<string, unknown>;
  const requiredKeys = [
    "contentHash", "artifactId", "artifactKind", "schemaVersion", "canonicalJson",
    "projectId", "featureId", "phaseNumber", "reviewGateId", "featureRootPath",
    "artifactRelativePath", "sourceMode", "ingestedAt", "lineage",
  ];
  const optionalKeys = [
    "reviewRunId", "manifestResult", "workflowRunId", "agentInvocationId", "findings",
    "cycle", "gateDecision", "basisManifestHash", "remediationItems", "verificationReceipts",
  ];
  assertExactKeys(obj, [...requiredKeys, ...optionalKeys]);
  assertRequiredKeys(obj, requiredKeys);

  // ---- Required scalar fields ----
  assertValidHash(obj.contentHash);
  assertSafeIdentifier(obj.artifactId);
  assertAllowedValue(obj.artifactKind, ALLOWED_ARTIFACT_KINDS);
  if (typeof obj.schemaVersion !== "number" || obj.schemaVersion !== 1) {
    rejectInput();
  }
  assertNonEmptyString(obj.canonicalJson);

  // F1: Validate canonicalJson is at least parseable JSON (not an arbitrary
  // hash-matching string).
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(obj.canonicalJson as string);
  } catch {
    rejectInput();
  }

  // Require the exact FEAT-064 canonical representation, not merely JSON
  // which happens to hash correctly. This prevents alternate whitespace/key
  // order representations becoming independent immutable evidence.
  if (canonicalizeJson(parsedJson) !== obj.canonicalJson) rejectInput();
  try {
    scanSafeContent(obj.canonicalJson as string);
    // JSON escapes can conceal invalid UTF-16 from a byte-only scanner.
    // Validate decoded values before hashing, lookup, or transaction start.
    scanSafeParsedStringValues(parsedJson);
  } catch {
    rejectInput();
  }

  // Validate the parsed envelope against the complete store identity before
  // any database work. The upstream adapter remains the semantic validator;
  // this boundary independently proves that persisted bytes bind to it.
  assertNonNullObject(parsedJson);
  const parsed = parsedJson as Record<string, unknown>;
  if (parsed.schemaVersion !== obj.schemaVersion) rejectInput();
  if (parsed.artifactKind !== obj.artifactKind) rejectInput();
  if (parsed.artifactId !== obj.artifactId) rejectInput();
  // Validate scope
  assertNonNullObject(parsed.scope);
  const parsedScope = parsed.scope as Record<string, unknown>;
  if (parsedScope.projectId !== obj.projectId) rejectInput();
  if (parsedScope.featureId !== obj.featureId) rejectInput();
  if (parsedScope.phaseNumber !== obj.phaseNumber) rejectInput();
  if (parsedScope.reviewGateId !== obj.reviewGateId) rejectInput();

  // Schema-valid current V1 bytes are the sole source for normalized
  // persistence derivatives and lineage; typed input cannot author them.
  const canonicalFindings = validateCurrentV1Artifact(parsed, obj, currentCatalogSnapshots);
  const canonicalLineage = deriveCanonicalLineage(parsed.lineage);

  // ---- SHA-256 recompute before begin-immediate (F1) ----
  const computedHash = computeSha256Hex(obj.canonicalJson as string);
  if (computedHash !== (obj.contentHash as string)) {
    rejectInput();
  }

  // ---- Scope ----
  assertValidScopeMembers({
    projectId: obj.projectId,
    featureId: obj.featureId,
    phaseNumber: obj.phaseNumber,
    reviewGateId: obj.reviewGateId,
  });

  // ---- Feature paths ----
  assertProjectRelativePosixPath(obj.featureRootPath);
  assertProjectRelativePosixPath(obj.artifactRelativePath);
  if (obj.artifactRelativePath !== deriveArtifactPath(
    obj.featureRootPath as string,
    obj.artifactKind as string,
    obj.contentHash as string,
  )) rejectInput();

  // ---- Source mode ----
  assertAllowedValue(obj.sourceMode, ["v1_validated_ingress"] as const);
  assertNonEmptyString(obj.ingestedAt);
  // F1: Validate ingestedAt as UTC
  assertUtcTimestamp(obj.ingestedAt);

  // ---- Lineage ----
  const lineageObj = assertExactShape(obj.lineage, [], ["predecessorHashes", "supersedesHash"]);
  if ("predecessorHashes" in lineageObj) {
    const hashes = assertHashArray(lineageObj.predecessorHashes);
    if (hashes.length > MAX_PREDECESSOR_HASHES || new Set(hashes).size !== hashes.length) rejectInput();
  }
  if ("supersedesHash" in lineageObj) {
    assertValidHash(lineageObj.supersedesHash);
    if ((lineageObj.predecessorHashes as readonly string[] | undefined)?.includes(lineageObj.supersedesHash as string)) rejectInput();
  }
  // A supplied compatibility-shaped lineage may only mirror the canonical
  // references; persisted edges are always derived from canonicalJson.
  const suppliedPredecessors = (lineageObj.predecessorHashes ?? []) as readonly string[];
  const canonicalPredecessors = canonicalLineage.predecessorHashes ?? [];
  if (suppliedPredecessors.includes(obj.contentHash as string)
    || lineageObj.supersedesHash === obj.contentHash
    || suppliedPredecessors.length !== canonicalPredecessors.length
    || suppliedPredecessors.some((hash, index) => hash !== canonicalPredecessors[index])
    || lineageObj.supersedesHash !== canonicalLineage.supersedesHash) rejectInput();

  // ---- Manifest-only fields ----
  if (obj.artifactKind === "review_manifest") {
    assertSafeRunIdentifier(obj.reviewRunId);
    assertAllowedValue(obj.manifestResult, ["APPROVED", "NEEDS_CHANGES", "BLOCKED"] as const);
    assertOptionalSafeBoundedMember(obj, "workflowRunId");
    assertOptionalSafeBoundedMember(obj, "agentInvocationId");
    if (!Array.isArray(obj.findings) || obj.findings.length === 0 || obj.findings.length > MAX_FINDINGS) rejectInput();
    for (const value of obj.findings) {
      const finding = assertExactShape(
        value,
        ["findingId", "disposition", "claimType", "severity", "defectClass", "summary"],
        ["observation", "ruleReference", "ruleId", "ruleVersion", "ruleHash", "acSourcePath", "acSection"],
      );
      assertSafeIdentifier(finding.findingId);
      assertSafeIdentifier(finding.disposition);
      assertSafeIdentifier(finding.claimType);
      assertSafeIdentifier(finding.severity);
      assertSafeIdentifier(finding.defectClass);
      assertSafeBoundedString(finding.summary);
      for (const key of ["ruleReference", "ruleId", "ruleVersion", "acSourcePath", "acSection"] as const) assertOptionalSafeBoundedMember(finding, key);
      if ("ruleHash" in finding) assertValidHash(finding.ruleHash);
      if ("observation" in finding) {
        const observation = assertExactShape(finding.observation, ["observationId", "findingId", "surfaceJson", "remediationItemsJson", "testMatrixJson", "createdAt"], ["rootCause", "scopeRationale"]);
        assertSafeIdentifier(observation.observationId);
        assertSafeIdentifier(observation.findingId);
        // These values are canonical JSON projections of current-V1 fields,
        // not identifiers.  A valid collection can legitimately serialize to
        // more than one individual V1 text field, but never more than the
        // validated artifact payload that contains it.
        assertSafeBoundedString(observation.surfaceJson, MAX_V1_SERIALIZED_DERIVATIVE_LENGTH);
        assertSafeBoundedString(observation.remediationItemsJson, MAX_V1_SERIALIZED_DERIVATIVE_LENGTH);
        assertSafeBoundedString(observation.testMatrixJson, MAX_V1_SERIALIZED_DERIVATIVE_LENGTH);
        assertUtcTimestamp(observation.createdAt);
        assertOptionalSafeBoundedMember(observation, "rootCause", MAX_V1_TEXT_LENGTH);
        assertOptionalSafeBoundedMember(observation, "scopeRationale", MAX_V1_TEXT_LENGTH);
      }
    }
  } else {
    if (["reviewRunId", "manifestResult", "workflowRunId", "agentInvocationId", "findings"].some((key) => obj[key] !== undefined)) rejectInput();
    assertValidHash(obj.basisManifestHash);
  }

  // ---- Optional lifecycle structures are exact records before iteration ----
  if (obj.cycle !== undefined) {
    const cycle = assertExactShape(obj.cycle, ["cycleId", "basisManifestHash", "cycleState", "createdAt"], ["predecessorCycleId", "reasonCode"]);
    assertSafeIdentifier(cycle.cycleId);
    assertValidHash(cycle.basisManifestHash);
    assertAllowedValue(cycle.cycleState, ALLOWED_CYCLE_STATES);
    assertUtcTimestamp(cycle.createdAt);
    assertOptionalSafeBoundedMember(cycle, "predecessorCycleId");
    assertOptionalSafeBoundedMember(cycle, "reasonCode");
  }
  if (obj.gateDecision !== undefined) {
    const gate = assertExactShape(obj.gateDecision, ["triggerArtifactHash", "basisManifestHash", "gateState", "reasonCode", "decidedAt"], ["cycleId", "evidenceHashes"]);
    assertValidHash(gate.triggerArtifactHash);
    assertValidHash(gate.basisManifestHash);
    assertAllowedValue(gate.gateState, ALLOWED_GATE_STATES);
    assertSafeBoundedString(gate.reasonCode, MAX_REASON_CODE_LENGTH);
    assertUtcTimestamp(gate.decidedAt);
    assertOptionalSafeBoundedMember(gate, "cycleId");
    if ("evidenceHashes" in gate) {
      const evidenceHashes = assertHashArray(gate.evidenceHashes);
      if (evidenceHashes.length > MAX_VERIFICATION_RECEIPTS || new Set(evidenceHashes).size !== evidenceHashes.length) rejectInput();
    }
  }
  if (obj.remediationItems !== undefined) {
    if (!Array.isArray(obj.remediationItems) || obj.remediationItems.length > MAX_REMEDIATION_ITEMS) rejectInput();
    const eventIds = new Set<string>();
    for (const value of obj.remediationItems) {
      const item = assertExactShape(value, ["itemEventId", "cycleId", "reviewRunId", "findingId", "remediationItemId", "eventKind", "createdAt"], ["responseHash", "decision", "outcomeSummary"]);
      for (const key of ["itemEventId", "cycleId", "reviewRunId", "findingId", "remediationItemId", "eventKind"] as const) assertSafeIdentifier(item[key]);
      if (eventIds.has(item.itemEventId as string)) rejectInput();
      eventIds.add(item.itemEventId as string);
      assertUtcTimestamp(item.createdAt);
      if ("responseHash" in item) assertValidHash(item.responseHash);
      if ("decision" in item) assertAllowedValue(item.decision, ["APPLIED", "NOT_APPLIED", "NOT_APPLICABLE"] as const);
      assertOptionalSafeBoundedMember(item, "outcomeSummary");
    }
  }
  if (obj.verificationReceipts !== undefined) {
    if (!Array.isArray(obj.verificationReceipts) || obj.verificationReceipts.length > MAX_VERIFICATION_RECEIPTS) rejectInput();
    const eventIds = new Set<string>();
    for (const value of obj.verificationReceipts) {
      const receipt = assertExactShape(value, ["receiptEventId", "cycleId", "receiptHash", "reviewRunId", "findingId", "subjectKind", "subjectId", "outcome", "createdAt"], ["evidenceSummary"]);
      for (const key of ["receiptEventId", "cycleId", "reviewRunId", "findingId", "subjectId"] as const) assertSafeIdentifier(receipt[key]);
      if (eventIds.has(receipt.receiptEventId as string)) rejectInput();
      eventIds.add(receipt.receiptEventId as string);
      assertValidHash(receipt.receiptHash);
      const subjectKind = assertAllowedValue(receipt.subjectKind, ["remediation_item", "test"] as const);
      assertAllowedValue(receipt.outcome, subjectKind === "remediation_item"
        ? ["VERIFIED", "FAILED", "NOT_VERIFIABLE"] as const
        : ["PASSED", "FAILED", "NOT_RUN", "NOT_VERIFIABLE"] as const);
      assertUtcTimestamp(receipt.createdAt);
      assertOptionalSafeBoundedMember(receipt, "evidenceSummary", MAX_V1_TEXT_LENGTH);
    }
  }

  // Any normalized derivative supplied by a caller is an assertion only and
  // must exactly equal the canonical derivation; the returned value always
  // uses the derivation, never the caller's object graph.
  if (canonicalFindings) {
    if (!Array.isArray(obj.findings) || canonicalizeJson(obj.findings) !== canonicalizeJson(canonicalFindings)) rejectInput();
  } else if (obj.findings !== undefined) rejectInput();

  // Return canonical-derived members. Callers may provide transport metadata
  // only; V1 lineage/findings are never independently authoritative.
  return {
    ...(input as Record<string, unknown>),
    lineage: canonicalLineage,
    ...(canonicalFindings ? { findings: canonicalFindings } : {}),
  } as unknown as ReviewIngestInput;
}

/**
 * F4: Runtime-validated append-only boundary for safe incidents.
 * Rejects null for both required and optional fields (when present),
 * validates safe content, requires UTC timestamps.
 */
export function assertReadBackFields(row: Record<string, unknown> | undefined, expected: Record<string, unknown>): void {
  if (!row) throw new Error("PERSISTENCE_FAILED");
  for (const [column, value] of Object.entries(expected)) {
    const actual = row[column];
    if (value === undefined || value === null) {
      if (actual !== null) throw new Error("PERSISTENCE_FAILED");
    } else if (actual !== value) {
      throw new Error("PERSISTENCE_FAILED");
    }
  }
}
