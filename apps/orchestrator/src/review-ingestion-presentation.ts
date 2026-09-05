/**
 * FEAT-065 safe presentation boundary for immutable V1 review evidence.
 *
 * This module accepts only a runtime-validated, committed/read-back persisted
 * read model. It deliberately does not accept canonical JSON, raw agent output,
 * Markdown, filesystem paths, or a store handle. Its outputs are inspection
 * projections only; they never determine a gate or authorize a transition.
 *
 * Compatibility Decision: BREAKING CHANGE PERMITTED. This is the current
 * internal V1 read contract; no legacy or context-free fallback is allowed.
 */

export type PersistedReviewArtifactKind =
  | "review_manifest"
  | "remediation_response"
  | "verification_receipt"
  | "replan_plan"
  | "debt_observation";

export type PersistedReviewResult = "APPROVED" | "NEEDS_CHANGES" | "BLOCKED" | "PERSISTED";
export type PersistedReviewGateState = "APPROVED" | "REJECTED" | "BLOCKED" | "PENDING";
export type PersistedReviewCycleState =
  | "NO_REMEDIATION_REQUIRED"
  | "REMEDIATION_VERIFIED"
  | "OPEN"
  | "AWAITING_RESPONSE"
  | "AWAITING_RECEIPT"
  | "REVIEW_PENDING"
  | "REPLAN_REQUIRED";
export type PersistedReviewFindingSeverity = "blocker" | "required" | "note" | "info";
export type PersistedReviewReceiptOutcome = "VERIFIED" | "FAILED" | "NOT_VERIFIABLE" | "PASSED" | "NOT_RUN";

export interface PersistedReviewScope {
  readonly projectId: string;
  readonly featureId: string;
  readonly phaseNumber: number;
  readonly reviewGateId: string;
}

/** The minimal, safe subset of an immutable artifact store read. */
export interface PersistedReviewArtifactReadModel {
  readonly artifactId: string;
  readonly artifactKind: PersistedReviewArtifactKind;
  readonly schemaVersion: 1;
  readonly contentHash: string;
  readonly relativePath: string;
  readonly result: PersistedReviewResult;
  readonly ingestedAt: string;
}

export interface PersistedReviewGateReadModel {
  /** Exact scope copied from the immutable persisted gate-decision row. */
  readonly scope: PersistedReviewScope;
  readonly gateDecisionId: number;
  readonly triggerArtifactHash: string;
  readonly basisManifestHash: string;
  readonly cycleId: string | null;
  readonly gateState: PersistedReviewGateState;
  readonly reasonCode:
    | "approved_terminal_review"
    | "review_needs_changes"
    | "review_blocked"
    | "enforcement_disabled"
    | "terminal_remediation_required";
  readonly evidenceHashes: readonly string[];
  readonly decidedAt: string;
}

export interface PersistedReviewFindingSummary {
  readonly findingId: string;
  /** Exact persisted target required for a later provider-bound scope action. */
  readonly findingObservationId: string;
  /** Safe persisted class identity; it never derives recurrence or authority. */
  readonly defectClass: string;
  readonly disposition: "IN_SCOPE_BLOCKER" | "SCOPE_EXPANSION" | "ARCHITECTURE_DEBT" | "OBSERVATION";
  readonly severity: PersistedReviewFindingSeverity;
  readonly summary: string;
}

export interface PersistedReviewReceiptSummary {
  readonly findingId: string;
  readonly subjectKind: "remediation_item" | "test";
  readonly subjectId: string;
  readonly outcome: PersistedReviewReceiptOutcome;
}

/**
 * The only supported V1 presentation input. Phase 6 constructs it only after
 * a successful immutable-store commit and exact database/file read-back.
 */
export interface PersistedReviewEvidenceReadModel {
  readonly scope: PersistedReviewScope;
  /** Bound immutable review-run metadata, never substituted from a later trigger artifact. */
  readonly reviewRun: Readonly<{
    reviewRunId: string;
    manifestHash: string;
    manifestResult: "APPROVED" | "NEEDS_CHANGES" | "BLOCKED";
    createdAt: string;
  }>;
  readonly artifact: PersistedReviewArtifactReadModel;
  readonly persistence: {
    readonly state: "COMMITTED_READ_BACK_VERIFIED";
    readonly artifactReadBackHash: string;
    readonly fileReadBackHash: string;
    readonly committedAt: string;
  };
  readonly gate: PersistedReviewGateReadModel;
  readonly cycleState: PersistedReviewCycleState;
  readonly findings: readonly PersistedReviewFindingSummary[];
  readonly receipts: readonly PersistedReviewReceiptSummary[];
  readonly lineageHashes: readonly string[];
}

export interface PersistedReviewEvidenceProjection {
  readonly kind: "persisted_review_evidence";
  readonly authority: "presentation_only";
  readonly scope: PersistedReviewScope;
  readonly reviewRun: PersistedReviewEvidenceReadModel["reviewRun"];
  readonly artifact: PersistedReviewArtifactReadModel;
  readonly gate: Pick<PersistedReviewGateReadModel, "gateState" | "reasonCode" | "basisManifestHash" | "cycleId" | "decidedAt">;
  readonly cycleState: PersistedReviewCycleState;
  readonly findings: readonly PersistedReviewFindingSummary[];
  readonly receipts: readonly PersistedReviewReceiptSummary[];
  readonly lineageHashes: readonly string[];
}

export interface LegacyReviewHistoryProjection {
  readonly kind: "legacy_review_history";
  readonly authority: "non_authoritative";
  readonly status: "legacy_unverified";
  readonly access: "browse_only";
  readonly relativePath: string;
  readonly summary: string;
}

export interface ReviewPresentationRefusal {
  readonly kind: "presentation_refusal";
  readonly code: "invalid_persisted_read_model" | "invalid_legacy_history";
  readonly message: string;
}

export type PersistedReviewPresentationResult = PersistedReviewEvidenceProjection | ReviewPresentationRefusal;
export type LegacyReviewPresentationResult = LegacyReviewHistoryProjection | ReviewPresentationRefusal;
export type RenderPersistedReviewEvidenceResult =
  | { readonly kind: "rendered"; readonly markdown: string; readonly projection: PersistedReviewEvidenceProjection }
  | ReviewPresentationRefusal;

const HASH_RE = /^[a-f0-9]{64}$/;
const KEBAB_IDENTIFIER_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const URI_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const CREDENTIAL_ASSIGNMENT_RE = /(?:^|[^A-Za-z0-9_-])(?:api[ _-]?key|authorization|bearer|password|secret|token)\s*[:=]/i;
const PRIVATE_KEY_PEM_RE = /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/i;
const OPENAI_CREDENTIAL_RE = /(?:^|[^A-Za-z0-9_-])sk-[A-Za-z0-9_-]{12,}(?:$|[^A-Za-z0-9_-])/;
const RAW_HTML_RE = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/;
const ACTIVE_MARKDOWN_URI_RE = /(?:!?\[[^\]]*\]\(\s*|<\s*)(?:javascript|data|vbscript)\s*:/i;
const ARTIFACT_KINDS = new Set<string>(["review_manifest", "remediation_response", "verification_receipt", "replan_plan", "debt_observation"]);
const RESULTS = new Set<string>(["APPROVED", "NEEDS_CHANGES", "BLOCKED", "PERSISTED"]);
const GATE_STATES = new Set<string>(["APPROVED", "REJECTED", "BLOCKED", "PENDING"]);
const CYCLE_STATES = new Set<string>(["NO_REMEDIATION_REQUIRED", "REMEDIATION_VERIFIED", "OPEN", "AWAITING_RESPONSE", "AWAITING_RECEIPT", "REVIEW_PENDING", "REPLAN_REQUIRED"]);
const DISPOSITIONS = new Set<string>(["IN_SCOPE_BLOCKER", "SCOPE_EXPANSION", "ARCHITECTURE_DEBT", "OBSERVATION"]);
const GATE_REASONS = new Set<string>(["approved_terminal_review", "review_needs_changes", "review_blocked", "enforcement_disabled", "terminal_remediation_required"]);
const TERMINAL_CYCLE_STATES = new Set<string>(["NO_REMEDIATION_REQUIRED", "REMEDIATION_VERIFIED"]);
const PRESENTATION_FINDING_SUMMARY_MAX_LENGTH = 1_024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isSafeText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximumLength
    && !value.includes("\0")
    && !CREDENTIAL_ASSIGNMENT_RE.test(value)
    && !PRIVATE_KEY_PEM_RE.test(value)
    && !OPENAI_CREDENTIAL_RE.test(value)
    && !RAW_HTML_RE.test(value)
    && !ACTIVE_MARKDOWN_URI_RE.test(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && HASH_RE.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && TIMESTAMP_RE.test(value) && Number.isFinite(Date.parse(value));
}

function isIdentifier(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.length <= maximumLength && KEBAB_IDENTIFIER_RE.test(value);
}

function isSafeRelativePath(value: unknown, maximumLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximumLength
    && !value.includes("\\")
    && !value.includes("\0")
    && !value.startsWith("/")
    && !URI_SCHEME_RE.test(value)
    && !value.endsWith("/")
    && !value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..");
}

function isScope(value: unknown): value is PersistedReviewScope {
  return isRecord(value)
    && hasOnlyKeys(value, ["projectId", "featureId", "phaseNumber", "reviewGateId"])
    && isIdentifier(value.projectId, 64)
    && isIdentifier(value.featureId, 64)
    && Number.isInteger(value.phaseNumber)
    && (value.phaseNumber as number) >= 0
    && isIdentifier(value.reviewGateId, 64);
}

function sameScope(left: PersistedReviewScope, right: PersistedReviewScope): boolean {
  return left.projectId === right.projectId
    && left.featureId === right.featureId
    && left.phaseNumber === right.phaseNumber
    && left.reviewGateId === right.reviewGateId;
}

function isArtifact(value: unknown): value is PersistedReviewArtifactReadModel {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["artifactId", "artifactKind", "schemaVersion", "contentHash", "relativePath", "result", "ingestedAt"])
    || !isIdentifier(value.artifactId, 128)
    || typeof value.artifactKind !== "string" || !ARTIFACT_KINDS.has(value.artifactKind)
    || value.schemaVersion !== 1
    || !isHash(value.contentHash)
    || !isSafeRelativePath(value.relativePath, 512)
    || typeof value.result !== "string" || !RESULTS.has(value.result)
    || !isTimestamp(value.ingestedAt)) return false;
  const expectedSuffix = `code-reviews/artifacts/${value.artifactKind}/${value.contentHash}.json`;
  return value.relativePath.endsWith(expectedSuffix)
    && ((value.artifactKind === "review_manifest") !== (value.result === "PERSISTED"));
}

function isPersistence(value: unknown, artifactHash: string): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ["state", "artifactReadBackHash", "fileReadBackHash", "committedAt"])
    && value.state === "COMMITTED_READ_BACK_VERIFIED"
    && value.artifactReadBackHash === artifactHash
    && value.fileReadBackHash === artifactHash
    && isTimestamp(value.committedAt);
}

function hasBoundCycle(value: Record<string, unknown>, evidenceHashes: readonly string[]): boolean {
  return value.cycleId === null
    || (typeof value.cycleId === "string"
      && /^cycle-([a-f0-9]{64})$/.test(value.cycleId)
      && evidenceHashes.includes(value.cycleId.slice("cycle-".length)));
}

function isClosedGateStateReason(value: Record<string, unknown>): boolean {
  return (value.gateState === "APPROVED" && value.reasonCode === "approved_terminal_review")
    || (value.gateState === "REJECTED" && value.reasonCode === "review_needs_changes")
    || (value.gateState === "BLOCKED" && (value.reasonCode === "review_blocked" || value.reasonCode === "enforcement_disabled"))
    || (value.gateState === "PENDING" && value.reasonCode === "terminal_remediation_required");
}

function isGate(
  value: unknown,
  expectedScope: PersistedReviewScope,
  artifact: PersistedReviewArtifactReadModel,
  cycleState: PersistedReviewCycleState,
): value is PersistedReviewGateReadModel {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["scope", "gateDecisionId", "triggerArtifactHash", "basisManifestHash", "cycleId", "gateState", "reasonCode", "evidenceHashes", "decidedAt"])
    || !isScope(value.scope)
    || !sameScope(value.scope, expectedScope)
    || !Number.isInteger(value.gateDecisionId) || (value.gateDecisionId as number) <= 0
    || !isHash(value.triggerArtifactHash) || !isHash(value.basisManifestHash)
    || typeof value.gateState !== "string" || !GATE_STATES.has(value.gateState)
    || typeof value.reasonCode !== "string" || !GATE_REASONS.has(value.reasonCode)
    || !Array.isArray(value.evidenceHashes) || value.evidenceHashes.length === 0 || value.evidenceHashes.length > 128
    || !value.evidenceHashes.every(isHash) || new Set(value.evidenceHashes).size !== value.evidenceHashes.length
    || !hasBoundCycle(value, value.evidenceHashes)
    || !isTimestamp(value.decidedAt)
    || !isClosedGateStateReason(value)) return false;

  const evidenceHashes = value.evidenceHashes;
  if (artifact.artifactKind === "debt_observation") {
    return value.triggerArtifactHash !== artifact.contentHash
      && evidenceHashes.includes(value.triggerArtifactHash)
      && evidenceHashes.includes(value.basisManifestHash);
  }

  if (artifact.artifactKind !== "review_manifest") {
    return value.triggerArtifactHash === artifact.contentHash
      && evidenceHashes.includes(artifact.contentHash)
      && evidenceHashes.includes(value.basisManifestHash);
  }

  if (value.triggerArtifactHash !== artifact.contentHash
    || value.basisManifestHash !== artifact.contentHash
    || value.cycleId !== `cycle-${artifact.contentHash}`
    || !evidenceHashes.includes(artifact.contentHash)) return false;

  if (artifact.result === "APPROVED") {
    return (value.gateState === "APPROVED" && value.reasonCode === "approved_terminal_review" && TERMINAL_CYCLE_STATES.has(cycleState))
      || (value.gateState === "PENDING" && value.reasonCode === "terminal_remediation_required" && !TERMINAL_CYCLE_STATES.has(cycleState))
      || (value.gateState === "BLOCKED" && value.reasonCode === "enforcement_disabled");
  }
  if (artifact.result === "NEEDS_CHANGES") {
    return value.gateState === "REJECTED" && value.reasonCode === "review_needs_changes";
  }
  return artifact.result === "BLOCKED"
    && value.gateState === "BLOCKED"
    && value.reasonCode === "review_blocked";
}

function isFinding(value: unknown): value is PersistedReviewFindingSummary {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["findingId", "findingObservationId", "defectClass", "disposition", "severity", "summary"])
    || !isIdentifier(value.findingId, 128)
    || !isIdentifier(value.findingObservationId, 128)
    || !isIdentifier(value.defectClass, 128)
    || typeof value.disposition !== "string" || !DISPOSITIONS.has(value.disposition)
    || typeof value.severity !== "string"
    || !isSafeText(value.summary, PRESENTATION_FINDING_SUMMARY_MAX_LENGTH)) return false;
  return (value.disposition === "IN_SCOPE_BLOCKER" || value.disposition === "SCOPE_EXPANSION")
    ? (value.severity === "blocker" || value.severity === "required")
    : (value.severity === "note" || value.severity === "info");
}

function isReceipt(value: unknown): value is PersistedReviewReceiptSummary {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["findingId", "subjectKind", "subjectId", "outcome"])
    || !isIdentifier(value.findingId, 128)
    || !isIdentifier(value.subjectId, 128)
    || typeof value.outcome !== "string") return false;
  return (value.subjectKind === "remediation_item" && ["VERIFIED", "FAILED", "NOT_VERIFIABLE"].includes(value.outcome))
    || (value.subjectKind === "test" && ["PASSED", "FAILED", "NOT_RUN", "NOT_VERIFIABLE"].includes(value.outcome));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const member of Object.values(value as Record<string, unknown>)) deepFreeze(member);
    Object.freeze(value);
  }
  return value;
}

function refusal(code: ReviewPresentationRefusal["code"]): ReviewPresentationRefusal {
  return deepFreeze({
    kind: "presentation_refusal" as const,
    code,
    message: code === "invalid_persisted_read_model"
      ? "Persisted review evidence is unavailable for safe presentation."
      : "Legacy review history is unavailable for safe presentation.",
  });
}

function validatePersistedReadModel(value: unknown): value is PersistedReviewEvidenceReadModel {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["scope", "reviewRun", "artifact", "persistence", "gate", "cycleState", "findings", "receipts", "lineageHashes"])
    || !isScope(value.scope)
    || !isRecord(value.reviewRun)
    || !hasOnlyKeys(value.reviewRun, ["reviewRunId", "manifestHash", "manifestResult", "createdAt"])
    || !isIdentifier(value.reviewRun.reviewRunId, 256)
    || !isHash(value.reviewRun.manifestHash)
    || !["APPROVED", "NEEDS_CHANGES", "BLOCKED"].includes(value.reviewRun.manifestResult as string)
    || !isTimestamp(value.reviewRun.createdAt)
    || !isArtifact(value.artifact)
    || !isPersistence(value.persistence, value.artifact.contentHash)
    || typeof value.cycleState !== "string" || !CYCLE_STATES.has(value.cycleState)
    || !isGate(value.gate, value.scope, value.artifact, value.cycleState as PersistedReviewCycleState)
    || !Array.isArray(value.findings) || value.findings.length > 64 || !value.findings.every(isFinding)
    || !Array.isArray(value.receipts) || value.receipts.length > 128 || !value.receipts.every(isReceipt)
    || !Array.isArray(value.lineageHashes) || value.lineageHashes.length > 64 || !value.lineageHashes.every(isHash)) return false;
  return new Set(value.findings.map((finding) => finding.findingId)).size === value.findings.length
    && new Set(value.receipts.map((receipt) => `${receipt.findingId}\0${receipt.subjectKind}\0${receipt.subjectId}`)).size === value.receipts.length
    && new Set(value.lineageHashes).size === value.lineageHashes.length;
}

function copyScope(scope: PersistedReviewScope): PersistedReviewScope {
  return { projectId: scope.projectId, featureId: scope.featureId, phaseNumber: scope.phaseNumber, reviewGateId: scope.reviewGateId };
}

function copyArtifact(artifact: PersistedReviewArtifactReadModel): PersistedReviewArtifactReadModel {
  return {
    artifactId: artifact.artifactId,
    artifactKind: artifact.artifactKind,
    schemaVersion: artifact.schemaVersion,
    contentHash: artifact.contentHash,
    relativePath: artifact.relativePath,
    result: artifact.result,
    ingestedAt: artifact.ingestedAt,
  };
}

/**
 * Project a committed V1 store read into the sole safe inspection model.
 * Invalid values have one deterministic sanitized refusal path; they are never
 * rendered, treated as empty evidence, or replaced with legacy Markdown.
 */
export function projectPersistedReviewEvidence(input: unknown): PersistedReviewPresentationResult {
  if (!validatePersistedReadModel(input)) return refusal("invalid_persisted_read_model");
  return deepFreeze({
    kind: "persisted_review_evidence" as const,
    authority: "presentation_only" as const,
    scope: copyScope(input.scope),
    reviewRun: {
      reviewRunId: input.reviewRun.reviewRunId,
      manifestHash: input.reviewRun.manifestHash,
      manifestResult: input.reviewRun.manifestResult,
      createdAt: input.reviewRun.createdAt,
    },
    artifact: copyArtifact(input.artifact),
    gate: {
      gateState: input.gate.gateState,
      reasonCode: input.gate.reasonCode,
      basisManifestHash: input.gate.basisManifestHash,
      cycleId: input.gate.cycleId,
      decidedAt: input.gate.decidedAt,
    },
    cycleState: input.cycleState,
    findings: input.findings.map((finding) => ({
      findingId: finding.findingId,
      findingObservationId: finding.findingObservationId,
      defectClass: finding.defectClass,
      disposition: finding.disposition,
      severity: finding.severity,
      summary: finding.summary,
    })),
    receipts: input.receipts.map((receipt) => ({
      findingId: receipt.findingId,
      subjectKind: receipt.subjectKind,
      subjectId: receipt.subjectId,
      outcome: receipt.outcome,
    })),
    lineageHashes: [...input.lineageHashes],
  });
}

function escapeMarkdown(value: string): string {
  return value.replace(/[|\r\n]/g, " ").replace(/\\/g, "\\\\");
}

/**
 * Render a persisted, committed/read-back-verified V1 projection. Markdown is
 * explicitly presentation evidence, never an authority source or write path.
 */
export function renderPersistedReviewEvidence(input: unknown): RenderPersistedReviewEvidenceResult {
  const projected = projectPersistedReviewEvidence(input);
  if (projected.kind === "presentation_refusal") return projected;

  const { artifact, gate, scope } = projected;
  const lines = [
    "## Persisted Review Evidence",
    "",
    "> **Presentation evidence only:** This Markdown is derived after immutable persistence and read-back verification. It is non-authoritative and must not be parsed for a gate decision, phase transition, retry, or mutation.",
    "",
    `- **Artifact ID:** ${escapeMarkdown(artifact.artifactId)}`,
    `- **Content Hash:** \`${artifact.contentHash}\``,
    `- **Schema Version:** ${artifact.schemaVersion}`,
    `- **Artifact Kind:** ${artifact.artifactKind}`,
    `- **Relative Artifact Path:** ${escapeMarkdown(artifact.relativePath)}`,
    `- **Scope:** ${escapeMarkdown(scope.projectId)} / ${escapeMarkdown(scope.featureId)} / Phase ${scope.phaseNumber} / ${escapeMarkdown(scope.reviewGateId)}`,
    `- **Safe Result:** ${artifact.result}`,
    `- **Authoritative Gate State:** ${gate.gateState} (${gate.reasonCode})`,
    `- **Terminal Cycle State:** ${projected.cycleState}`,
    `- **Gate Basis Hash:** \`${gate.basisManifestHash}\``,
    `- **Evidence References:** ${[artifact.contentHash, ...projected.lineageHashes].map((hash) => `\`${hash}\``).join(", ")}`,
  ];
  if (projected.findings.length > 0) {
    lines.push("", "### Finding Summaries", "", "> A repeated finding keeps its stable identity; it does not imply that no remediation progress was accepted. For reader convenience, the summary may state progress and residual scope first; this wording is non-authoritative and is never a gate requirement. Full authoritative details remain in the immutable artifact linked above.", "", "| Finding ID | Disposition | Severity | Progress and summary |", "| --- | --- | --- | --- |");
    for (const finding of projected.findings) {
      lines.push(`| ${escapeMarkdown(finding.findingId)} | ${finding.disposition} | ${escapeMarkdown(finding.severity)} | ${escapeMarkdown(finding.summary)} |`);
    }
  }
  if (projected.receipts.length > 0) {
    lines.push("", "### Receipt References", "", "| Finding ID | Subject | Outcome |", "| --- | --- | --- |");
    for (const receipt of projected.receipts) {
      lines.push(`| ${escapeMarkdown(receipt.findingId)} | ${receipt.subjectKind}: ${escapeMarkdown(receipt.subjectId)} | ${receipt.outcome} |`);
    }
  }
  return deepFreeze({ kind: "rendered" as const, markdown: lines.join("\n"), projection: projected });
}

/**
 * Project retained Markdown history without granting it a V1 identity, gate,
 * receipt, action, or mutation capability. The caller supplies only an already
 * safe bounded location and display summary; report contents are never parsed.
 */
export function projectLegacyReviewHistory(input: unknown): LegacyReviewPresentationResult {
  if (!isRecord(input)
    || !hasOnlyKeys(input, ["relativePath", "summary"])
    || !isSafeRelativePath(input.relativePath, 512)
    || !input.relativePath.endsWith(".md")
    || !isSafeText(input.summary, 240)) return refusal("invalid_legacy_history");
  return deepFreeze({
    kind: "legacy_review_history" as const,
    authority: "non_authoritative" as const,
    status: "legacy_unverified" as const,
    access: "browse_only" as const,
    relativePath: input.relativePath,
    summary: input.summary,
  });
}
