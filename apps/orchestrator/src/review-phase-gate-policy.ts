/**
 * FEAT-065: pure authoritative V1 review phase-gate policy.
 *
 * This module has no I/O, clock, environment, persistence, Markdown, Safety
 * Kernel, legacy Markdown, or legacy-fingerprint dependency. Legacy Markdown
 * remains `legacy_unverified` browse-only history at the Phase 4 projection
 * boundary; it cannot supply V1 gate truth here. This policy evaluates only
 * immutable, exact-scope V1 evidence supplied by the ingestion boundary.
 *
 * Compatibility Decision: BREAKING CHANGE PERMITTED. This internal V1 policy
 * has no approved external consumer or legacy-authority requirement.
 */

export interface AuthoritativeReviewScope {
  readonly projectId: string;
  readonly featureId: string;
  readonly phaseNumber: number;
  readonly reviewGateId: string;
}

export type AuthoritativeManifestResult = "APPROVED" | "NEEDS_CHANGES" | "BLOCKED";
export type AuthoritativeGateState = "APPROVED" | "REJECTED" | "BLOCKED" | "PENDING";
/** `UNAVAILABLE` is a non-durable outcome; it is never persisted as a gate row. */
export type AuthoritativeGateOutcomeState = AuthoritativeGateState | "UNAVAILABLE";
export type AuthoritativeCycleState =
  | "NO_REMEDIATION_REQUIRED"
  | "REMEDIATION_VERIFIED"
  | "OPEN"
  | "AWAITING_RESPONSE"
  | "AWAITING_RECEIPT"
  | "REVIEW_PENDING"
  | "REPLAN_REQUIRED";

export type AuthoritativeGateReasonCode =
  | "approved_terminal_review"
  | "review_needs_changes"
  | "review_blocked"
  | "enforcement_disabled"
  | "terminal_remediation_required";

export type AuthoritativeGateRefusalCode =
  | "invalid_input"
  | "scope_mismatch"
  | "invalid_artifact_lineage"
  | "predecessor_unavailable"
  | "store_unavailable";

export interface AuthoritativeReviewFinding {
  readonly findingId: string;
  readonly disposition: "IN_SCOPE_BLOCKER" | "SCOPE_EXPANSION" | "ARCHITECTURE_DEBT" | "OBSERVATION";
  readonly requiredRemediationItemIds: readonly string[];
  readonly requiredTestIds: readonly string[];
}

export interface AuthoritativeManifestEvidence {
  readonly artifactKind: "review_manifest";
  readonly contentHash: string;
  readonly scope: AuthoritativeReviewScope;
  readonly result: AuthoritativeManifestResult;
  readonly findings: readonly AuthoritativeReviewFinding[];
}

/** Immutable lineage from the manifest's canonical V1 artifact. */
export interface AuthoritativeArtifactLineage {
  readonly artifactHash: string;
  readonly predecessorHashes: readonly string[];
}

/**
 * The store resolves every lineage hash before this policy runs. A hash that is
 * absent, foreign, or not a review manifest never becomes implicit lineage.
 */
export interface AuthoritativePredecessorLookup {
  readonly contentHash: string;
  readonly lookup: "found" | "missing" | "wrong_scope" | "wrong_kind";
  readonly artifactKind: "review_manifest" | "other";
  readonly scope: AuthoritativeReviewScope;
}

export interface AuthoritativeRemediationCycle {
  readonly cycleId: string;
  readonly scope: AuthoritativeReviewScope;
  readonly basisManifestHash: string;
  readonly cycleState: AuthoritativeCycleState;
}

export interface AuthoritativeRemediationResponseEvidence {
  /** Canonical hash of the immutable remediation_response artifact. */
  readonly responseHash: string;
  readonly basisManifestHash: string;
  readonly cycleId: string;
  readonly findingId: string;
  readonly remediationItemId: string;
  readonly outcome: "APPLIED" | "NOT_APPLIED" | "NOT_APPLICABLE";
}

export interface AuthoritativeVerificationReceiptEvidence {
  /** Canonical hash of the immutable verification_receipt artifact. */
  readonly receiptHash: string;
  readonly responseHash: string;
  readonly basisManifestHash: string;
  readonly cycleId: string;
  readonly findingId: string;
  readonly subjectKind: "remediation_item" | "test";
  readonly subjectId: string;
  readonly outcome: "VERIFIED" | "FAILED" | "NOT_VERIFIABLE" | "PASSED" | "NOT_RUN";
}

export interface AuthoritativeRemediationEvidence {
  readonly cycle: AuthoritativeRemediationCycle;
  readonly responses: readonly AuthoritativeRemediationResponseEvidence[];
  readonly receipts: readonly AuthoritativeVerificationReceiptEvidence[];
}

export interface AuthoritativePhaseGateInput {
  /** The current workflow scope, independently constructed by the caller. */
  readonly expectedScope: AuthoritativeReviewScope;
  /** A FEAT-064 validated immutable V1 manifest projection. */
  readonly manifest: AuthoritativeManifestEvidence;
  readonly lineage: AuthoritativeArtifactLineage;
  /** Exact store lookup results for every hash in `lineage.predecessorHashes`. */
  readonly predecessorLookups: readonly AuthoritativePredecessorLookup[];
  /**
   * Canonical persisted manifests resolved from the exact lineage hashes.
   * Only a persisted NEEDS_CHANGES predecessor can create remediation work;
   * findings from the current APPROVED artifact never synthesize obligations.
   */
  readonly predecessorManifests: readonly AuthoritativeManifestEvidence[];
  readonly remediation: AuthoritativeRemediationEvidence;
  readonly enforcement: {
    readonly enabled: boolean;
    readonly storeAvailable: boolean;
  };
}

export interface ProposedAuthoritativePhaseGate {
  readonly kind: "decision";
  /** Explicit durable outcome proposed for the append-only gate event. */
  readonly outcome: AuthoritativeGateState;
  readonly gateState: AuthoritativeGateState;
  readonly reasonCode: AuthoritativeGateReasonCode;
  /** Phase 6 alone may turn this exact persisted proposal into a transition. */
  readonly transition: "requires_authoritative_exit_check" | "forbidden";
}

export interface AuthoritativePhaseGateRefusal {
  readonly kind: "refusal";
  /** Explicit non-durable outcome; it preserves any prior persisted gate. */
  readonly outcome: "UNAVAILABLE";
  readonly code: AuthoritativeGateRefusalCode;
  /** Safe fixed text; it deliberately contains no untrusted input. */
  readonly message: string;
  /** A refusal never authorizes a phase transition. */
  readonly transition: "forbidden";
}

export type AuthoritativePhaseGateOutcome = ProposedAuthoritativePhaseGate | AuthoritativePhaseGateRefusal;

const HASH_RE = /^[a-f0-9]{64}$/;
const DISPOSITIONS = new Set(["IN_SCOPE_BLOCKER", "SCOPE_EXPANSION", "ARCHITECTURE_DEBT", "OBSERVATION"]);
const CYCLE_STATES = new Set([
  "NO_REMEDIATION_REQUIRED",
  "REMEDIATION_VERIFIED",
  "OPEN",
  "AWAITING_RESPONSE",
  "AWAITING_RECEIPT",
  "REVIEW_PENDING",
  "REPLAN_REQUIRED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && HASH_RE.test(value);
}

function isScope(value: unknown): value is AuthoritativeReviewScope {
  if (!isRecord(value) || !hasOnlyKeys(value, ["projectId", "featureId", "phaseNumber", "reviewGateId"])) return false;
  return isNonEmptyString(value.projectId)
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

function refusal(code: AuthoritativeGateRefusalCode): AuthoritativePhaseGateRefusal {
  const message: Record<AuthoritativeGateRefusalCode, string> = {
    invalid_input: "Authoritative review evidence has an invalid structure.",
    scope_mismatch: "Authoritative review evidence does not match the active workflow scope.",
    invalid_artifact_lineage: "Authoritative review artifact lineage is invalid.",
    predecessor_unavailable: "Authoritative review predecessor evidence is unavailable.",
    store_unavailable: "Authoritative review storage is unavailable.",
  };
  return { kind: "refusal", outcome: "UNAVAILABLE", code, message: message[code], transition: "forbidden" };
}

function decision(gateState: AuthoritativeGateState, reasonCode: AuthoritativeGateReasonCode): ProposedAuthoritativePhaseGate {
  return {
    kind: "decision",
    outcome: gateState,
    gateState,
    reasonCode,
    transition: gateState === "APPROVED" ? "requires_authoritative_exit_check" : "forbidden",
  };
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function validateFinding(value: unknown): value is AuthoritativeReviewFinding {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["findingId", "disposition", "requiredRemediationItemIds", "requiredTestIds"])
    || !isNonEmptyString(value.findingId)
    || typeof value.disposition !== "string"
    || !DISPOSITIONS.has(value.disposition)
    || !isStringArray(value.requiredRemediationItemIds)
    || !isStringArray(value.requiredTestIds)) return false;
  return hasUniqueValues(value.requiredRemediationItemIds) && hasUniqueValues(value.requiredTestIds);
}

function validateManifest(value: unknown): value is AuthoritativeManifestEvidence {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["artifactKind", "contentHash", "scope", "result", "findings"])
    || value.artifactKind !== "review_manifest"
    || !isHash(value.contentHash)
    || !isScope(value.scope)
    || (value.result !== "APPROVED" && value.result !== "NEEDS_CHANGES" && value.result !== "BLOCKED")
    || !Array.isArray(value.findings)
    || !value.findings.every(validateFinding)) return false;
  return hasUniqueValues(value.findings.map((finding) => finding.findingId));
}

function validateLineage(value: unknown): value is AuthoritativeArtifactLineage {
  return isRecord(value)
    && hasOnlyKeys(value, ["artifactHash", "predecessorHashes"])
    && isHash(value.artifactHash)
    && Array.isArray(value.predecessorHashes)
    && value.predecessorHashes.every(isHash)
    && hasUniqueValues(value.predecessorHashes);
}

function validatePredecessorLookup(value: unknown): value is AuthoritativePredecessorLookup {
  return isRecord(value)
    && hasOnlyKeys(value, ["contentHash", "lookup", "artifactKind", "scope"])
    && isHash(value.contentHash)
    && (value.lookup === "found" || value.lookup === "missing" || value.lookup === "wrong_scope" || value.lookup === "wrong_kind")
    && (value.artifactKind === "review_manifest" || value.artifactKind === "other")
    && isScope(value.scope);
}

function validateRemediation(value: unknown): value is AuthoritativeRemediationEvidence {
  if (!isRecord(value) || !hasOnlyKeys(value, ["cycle", "responses", "receipts"])
    || !isRecord(value.cycle) || !hasOnlyKeys(value.cycle, ["cycleId", "scope", "basisManifestHash", "cycleState"])
    || !Array.isArray(value.responses) || !Array.isArray(value.receipts)
    || value.responses.length > 128 || value.receipts.length > 128) return false;
  const cycle = value.cycle;
  if (!isNonEmptyString(cycle.cycleId) || !isScope(cycle.scope) || !isHash(cycle.basisManifestHash)
    || typeof cycle.cycleState !== "string" || !CYCLE_STATES.has(cycle.cycleState)) return false;
  const responsesValid = value.responses.every((response) => isRecord(response)
    && hasOnlyKeys(response, ["responseHash", "basisManifestHash", "cycleId", "findingId", "remediationItemId", "outcome"])
    && isHash(response.responseHash) && isHash(response.basisManifestHash) && isNonEmptyString(response.cycleId)
    && isNonEmptyString(response.findingId) && isNonEmptyString(response.remediationItemId)
    && (response.outcome === "APPLIED" || response.outcome === "NOT_APPLIED" || response.outcome === "NOT_APPLICABLE"));
  const receiptsValid = value.receipts.every((receipt) => isRecord(receipt)
    && hasOnlyKeys(receipt, ["receiptHash", "responseHash", "basisManifestHash", "cycleId", "findingId", "subjectKind", "subjectId", "outcome"])
    && isHash(receipt.receiptHash) && isHash(receipt.responseHash) && isHash(receipt.basisManifestHash) && isNonEmptyString(receipt.cycleId)
    && isNonEmptyString(receipt.findingId) && (receipt.subjectKind === "remediation_item" || receipt.subjectKind === "test")
    && isNonEmptyString(receipt.subjectId)
    && (receipt.outcome === "VERIFIED" || receipt.outcome === "FAILED" || receipt.outcome === "NOT_VERIFIABLE" || receipt.outcome === "PASSED" || receipt.outcome === "NOT_RUN"));
  return responsesValid && receiptsValid;
}

function validateInput(value: unknown): value is AuthoritativePhaseGateInput {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["expectedScope", "manifest", "lineage", "predecessorLookups", "predecessorManifests", "remediation", "enforcement"])
    || !isScope(value.expectedScope)
    || !validateManifest(value.manifest)
    || !validateLineage(value.lineage)
    || !Array.isArray(value.predecessorLookups)
    || !value.predecessorLookups.every(validatePredecessorLookup)
    || !Array.isArray(value.predecessorManifests)
    || value.predecessorManifests.length > 64
    || !value.predecessorManifests.every(validateManifest)
    || !validateRemediation(value.remediation)
    || !isRecord(value.enforcement)
    || !hasOnlyKeys(value.enforcement, ["enabled", "storeAvailable"])
    || typeof value.enforcement.enabled !== "boolean"
    || typeof value.enforcement.storeAvailable !== "boolean") return false;
  return hasUniqueValues(value.predecessorLookups.map((lookup) => lookup.contentHash))
    && hasUniqueValues(value.predecessorManifests.map((manifest) => manifest.contentHash));
}

function lineageIsResolved(input: AuthoritativePhaseGateInput): AuthoritativeGateRefusalCode | undefined {
  if (input.lineage.artifactHash !== input.manifest.contentHash) return "invalid_artifact_lineage";
  const expected = new Set(input.lineage.predecessorHashes);
  const actual = new Map(input.predecessorLookups.map((lookup) => [lookup.contentHash, lookup]));
  if (expected.size !== actual.size || [...expected].some((hash) => !actual.has(hash))) return "invalid_artifact_lineage";

  for (const hash of expected) {
    const lookup = actual.get(hash);
    if (!lookup) return "invalid_artifact_lineage";
    if (lookup.lookup !== "found") return "predecessor_unavailable";
    if (lookup.artifactKind !== "review_manifest" || !sameScope(lookup.scope, input.expectedScope)) {
      return "predecessor_unavailable";
    }
  }
  return undefined;
}

function requiredFindings(findings: readonly AuthoritativeReviewFinding[]): readonly AuthoritativeReviewFinding[] {
  return findings.filter((finding) => finding.disposition === "IN_SCOPE_BLOCKER" || finding.disposition === "SCOPE_EXPANSION");
}

function remediationIsComplete(
  findings: readonly AuthoritativeReviewFinding[],
  predecessorHash: string,
  remediation: AuthoritativeRemediationEvidence,
): boolean {
  const requiredItems = findings.flatMap((finding) => finding.requiredRemediationItemIds
    .map((itemId) => `${finding.findingId}\u0000${itemId}`));
  const requiredTests = findings.flatMap((finding) => finding.requiredTestIds
    .map((testId) => `${finding.findingId}\u0000${testId}`));
  const responseKeys = remediation.responses.map((response) => `${response.findingId}\u0000${response.remediationItemId}`);
  if (!hasUniqueValues(responseKeys) || responseKeys.length !== requiredItems.length
    || responseKeys.some((key) => !requiredItems.includes(key))
    || remediation.responses.some((response) => response.outcome !== "APPLIED"
      || response.basisManifestHash !== predecessorHash || response.cycleId !== remediation.cycle.cycleId)) return false;
  const responseHashByKey = new Map(remediation.responses.map((response) => [
    `${response.findingId}\u0000${response.remediationItemId}`, response.responseHash,
  ]));
  const receiptKeys = remediation.receipts.map((receipt) => `${receipt.findingId}\u0000${receipt.subjectKind}\u0000${receipt.subjectId}`);
  const requiredReceiptKeys = [
    ...requiredItems.map((key) => `${key.replace("\u0000", "\u0000remediation_item\u0000")}`),
    ...requiredTests.map((key) => `${key.replace("\u0000", "\u0000test\u0000")}`),
  ];
  return hasUniqueValues(receiptKeys) && receiptKeys.length === requiredReceiptKeys.length
    && receiptKeys.every((key) => requiredReceiptKeys.includes(key))
    && remediation.receipts.every((receipt) => receipt.basisManifestHash === predecessorHash
      && receipt.cycleId === remediation.cycle.cycleId
      && ((receipt.subjectKind === "remediation_item" && receipt.outcome === "VERIFIED"
        && receipt.responseHash === responseHashByKey.get(`${receipt.findingId}\u0000${receipt.subjectId}`))
        || (receipt.subjectKind === "test" && receipt.outcome === "PASSED"
          && remediation.responses.some((response) => response.findingId === receipt.findingId && response.responseHash === receipt.responseHash))));
}

/**
 * Deterministically proposes one explicit outcome: a durable APPROVED,
 * REJECTED, BLOCKED, or PENDING V1 gate event, or a non-durable UNAVAILABLE
 * refusal. It never reads or writes persistence and never authorizes a phase
 * transition itself.
 */
export function evaluateAuthoritativePhaseGate(input: unknown): AuthoritativePhaseGateOutcome {
  if (!validateInput(input)) return refusal("invalid_input");
  if (!sameScope(input.expectedScope, input.manifest.scope)
    || !sameScope(input.expectedScope, input.remediation.cycle.scope)) return refusal("scope_mismatch");

  const lineageFailure = lineageIsResolved(input);
  if (lineageFailure) return refusal(lineageFailure);
  if (!input.enforcement.storeAvailable) return refusal("store_unavailable");

  if (input.manifest.result === "NEEDS_CHANGES") return decision("REJECTED", "review_needs_changes");
  if (input.manifest.result === "BLOCKED") return decision("BLOCKED", "review_blocked");
  if (!input.enforcement.enabled) return decision("BLOCKED", "enforcement_disabled");

  const predecessorByHash = new Map(input.predecessorManifests.map((manifest) => [manifest.contentHash, manifest]));
  if (predecessorByHash.size !== input.lineage.predecessorHashes.length
    || input.lineage.predecessorHashes.some((hash) => {
      const predecessor = predecessorByHash.get(hash);
      return !predecessor || !sameScope(predecessor.scope, input.expectedScope);
    })) return refusal("predecessor_unavailable");

  const requiredPredecessors = input.predecessorManifests.filter((manifest) => manifest.result === "NEEDS_CHANGES");
  if (requiredPredecessors.length > 1) return decision("PENDING", "terminal_remediation_required");
  const requiredPredecessor = requiredPredecessors[0];
  const { cycle } = input.remediation;
  if (!requiredPredecessor) {
    return cycle.basisManifestHash === input.manifest.contentHash
      && cycle.cycleState === "NO_REMEDIATION_REQUIRED"
      && input.remediation.responses.length === 0 && input.remediation.receipts.length === 0
      ? decision("APPROVED", "approved_terminal_review")
      : decision("PENDING", "terminal_remediation_required");
  }
  const required = requiredFindings(requiredPredecessor.findings);
  if (cycle.basisManifestHash !== requiredPredecessor.contentHash || cycle.cycleState !== "REMEDIATION_VERIFIED") {
    return decision("PENDING", "terminal_remediation_required");
  }
  return remediationIsComplete(required, requiredPredecessor.contentHash, input.remediation)
    ? decision("APPROVED", "approved_terminal_review")
    : decision("PENDING", "terminal_remediation_required");
}
