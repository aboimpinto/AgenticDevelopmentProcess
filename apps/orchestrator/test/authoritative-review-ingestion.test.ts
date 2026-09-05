// Behavior suite: authoritative review ingestion.
import { describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import {
  ingestValidatedReviewEvidence,
  type ReviewIngestionRequest,
  type ReviewIngestionStore,
} from "../src/review-ingestion-service.js";
import {
  ingestAndRenderAuthoritativeReview,
  ingestAndRenderAuthoritativeReviewSuccessor,
  openAuthoritativeReviewStore,
  readAuthoritativeReviewRerunLineageContext,
  readAuthoritativeReviewEvidence,
  readCurrentAuthoritativeReviewEvidence,
  setAuthoritativeReviewCleanupHookForTest,
  setAuthoritativeReviewRestartReadHookForTest,
} from "../src/authoritative-review-integration.js";
import { assessAuthoritativeReviewPhaseExit } from "../src/phase-exit-checkpoint.js";
import {
  buildValidDebtObservation,
  buildValidFinding,
  buildValidManifest,
  buildValidRemediationResponse,
  buildValidReplanPlan,
  buildValidVerificationReceipt,
  canonicalizeReviewArtifact,
  computeReviewArtifactHash,
  REVIEW_ARTIFACT_MAX_STRING_LENGTH,
  type RemediationResponse,
  type ReviewManifest,
} from "../src/review-contract-types.js";
import {
  loadStrictCatalogForReview,
  resolveStrictActiveRule,
  validateReviewContractArtifact,
  type ReviewContractIntegrationResult,
} from "../src/review-contract-integration-adapter.js";
import type { StrictActiveRuleCatalog } from "../src/review-contract-catalog.js";
import { ReviewGovernanceSqliteStore, type ReviewIngestInput, type StoredReviewArtifact, type StoredReviewGateDecision } from "@hepha/db";

const scope = {
  projectId: "hepha",
  featureId: "feat-065",
  phaseNumber: 3,
  reviewGateId: "code-review",
} as const;
const featureRootPath = "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha";
const ingestedAt = "2026-07-15T00:00:00.000Z";

function expectRestartReadersAndExitDenied(projectRoot: string, databasePath: string, contentHash: string): void {
  const known = readAuthoritativeReviewEvidence({ projectRoot, databasePath, expectedScope: scope, contentHash });
  const current = readCurrentAuthoritativeReviewEvidence({ projectRoot, databasePath, expectedScope: scope });
  expect(known).toBeUndefined();
  expect(current).toBeUndefined();
  const store = openAuthoritativeReviewStore(projectRoot, databasePath);
  if (!store) throw new Error("Restart-denial store must reopen.");
  try {
    expect(assessAuthoritativeReviewPhaseExit({
      scope,
      freshTriggerArtifactHash: contentHash,
      persistenceReadBackVerified: known !== undefined && current !== undefined,
      store: store as never,
      genericCheckpoint: { allowed: true, reason: "Generic checkpoint passes.", missingGates: [] },
    })).toMatchObject({ allowed: false });
  } finally {
    store.close();
  }
}

function approvedManifest(): ReviewManifest {
  return buildValidManifest({
    artifactId: "manifest-approved-ingest",
    scope,
    result: "APPROVED",
    findings: [{
      ...buildValidFinding(),
      disposition: "OBSERVATION",
      severity: "note",
    }],
  });
}

const validatedManifestContexts = new Map<string, { manifest: ReviewManifest; reference: { artifactKind: "review_manifest"; artifactId: string; contentHash: string; relativePath: string }; scope: typeof scope }>();
const validatedResponseContexts = new Map<string, { response: RemediationResponse; reference: { artifactKind: "remediation_response"; artifactId: string; contentHash: string; relativePath: string }; scope: typeof scope }>();

function trustedCatalog(): StrictActiveRuleCatalog {
  const result = loadStrictCatalogForReview(process.cwd());
  if ("valid" in result && result.valid === false) throw new Error(result.message);
  return result as StrictActiveRuleCatalog;
}

function hydrateActiveRuleSnapshots<T extends Record<string, unknown>>(artifact: T): T {
  if (artifact.artifactKind !== "review_manifest") return artifact;
  const snapshot = resolveStrictActiveRule(trustedCatalog(), "secret-safe-governance-artifacts");
  if (!snapshot) throw new Error("Required active rule is unavailable.");
  const findings = Array.isArray(artifact.findings) ? artifact.findings.map((finding) => {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) return finding;
    const record = finding as Record<string, unknown>;
    const authority = record.authority;
    const withSnapshot = authority && typeof authority === "object" && !Array.isArray(authority)
      && (authority as Record<string, unknown>).kind === "active_rule"
      ? { ...record, authority: { ...(authority as Record<string, unknown>), snapshot } }
      : record;
    // The fixture builder starts with blocker-only members. Valid direct
    // controls must remove members forbidden for these dispositions.
    if (withSnapshot.disposition === "OBSERVATION") {
      const { rootCause: _rootCause, scopeExpansionRationale: _scopeExpansionRationale, remediationItems: _remediationItems, testMatrix: _testMatrix, exhaustivenessDecision: _exhaustivenessDecision, compatibilityDecision: _compatibilityDecision, compatibilityApprovalSource: _compatibilityApprovalSource, compatibilityJustification: _compatibilityJustification, debtImpact: _debtImpact, debtObservationReference: _debtObservationReference, ...observation } = withSnapshot;
      return observation;
    }
    if (withSnapshot.disposition === "ARCHITECTURE_DEBT") {
      const { rootCause: _rootCause, scopeExpansionRationale: _scopeExpansionRationale, remediationItems: _remediationItems, testMatrix: _testMatrix, exhaustivenessDecision: _exhaustivenessDecision, compatibilityDecision: _compatibilityDecision, compatibilityApprovalSource: _compatibilityApprovalSource, compatibilityJustification: _compatibilityJustification, ...debt } = withSnapshot;
      return debt;
    }
    return withSnapshot;
  }) : artifact.findings;
  const needsSnapshot = Array.isArray(findings) && findings.some((finding) => finding && typeof finding === "object"
    && !Array.isArray(finding) && (finding as { authority?: { kind?: unknown } }).authority?.kind === "active_rule");
  return { ...artifact, ruleSnapshots: needsSnapshot ? [snapshot] : [], findings } as T;
}

/** Direct FEAT-064 validation for positive controls; invalid fixtures remain
 * intentionally forged wrappers so the public ingress proves it refuses them. */
function validated<T extends ReviewManifest | Record<string, unknown>>(artifact: T): ReviewContractIntegrationResult {
  let candidate = hydrateActiveRuleSnapshots(artifact as Record<string, unknown>);
  if (candidate.artifactKind === "debt_observation" && candidate.authority && typeof candidate.authority === "object") {
    const snapshot = resolveStrictActiveRule(trustedCatalog(), "secret-safe-governance-artifacts");
    candidate = { ...candidate, authority: { ...(candidate.authority as Record<string, unknown>), snapshot } };
  }
  const kind = candidate.artifactKind;
  let result: ReviewContractIntegrationResult;
  if (kind === "review_manifest") {
    result = validateReviewContractArtifact(JSON.stringify(candidate), { catalog: trustedCatalog(), featurePath: featureRootPath });
  } else {
    const reference = candidate.manifestReference as { contentHash?: string } | undefined;
    const manifestContext = reference?.contentHash ? validatedManifestContexts.get(reference.contentHash) : undefined;
    if (kind === "verification_receipt") {
      const responseReference = candidate.responseReference as { contentHash?: string } | undefined;
      const responseContext = responseReference?.contentHash ? validatedResponseContexts.get(responseReference.contentHash) : undefined;
      result = validateReviewContractArtifact(JSON.stringify(candidate), { featurePath: featureRootPath, manifestContext, responseContext });
    } else {
      result = validateReviewContractArtifact(JSON.stringify(candidate), { catalog: trustedCatalog(), featurePath: featureRootPath, manifestContext });
    }
  }
  if (!result.valid) {
    // This deliberately lacks adapter provenance and represents hostile
    // post-validation input, not an upstream validator refusal.
    const unsafe = candidate as ReviewManifest;
    let contentHash = "";
    try { contentHash = computeReviewArtifactHash(unsafe); } catch { /* no projection is trusted. */ }
    return { valid: true, artifact: unsafe, projection: { artifactKind: unsafe.artifactKind, artifactId: unsafe.artifactId, schemaVersion: 1, contentHash, scope: unsafe.scope } };
  }
  const contentHash = computeReviewArtifactHash(result.artifact);
  const reference = {
    artifactKind: result.artifact.artifactKind,
    artifactId: result.artifact.artifactId,
    contentHash,
    relativePath: `${featureRootPath}/code-reviews/artifacts/${result.artifact.artifactKind}/${contentHash}.json`,
  };
  if (result.artifact.artifactKind === "review_manifest") {
    validatedManifestContexts.set(contentHash, { manifest: result.artifact, reference: reference as never, scope });
  } else if (result.artifact.artifactKind === "remediation_response") {
    validatedResponseContexts.set(contentHash, { response: result.artifact, reference: reference as never, scope });
  }
  return result;
}

class RecordingStore implements ReviewIngestionStore {
  readonly calls: ReviewIngestInput[] = [];
  readonly artifacts = new Map<string, StoredReviewArtifact>();
  currentGate: StoredReviewGateDecision | null = null;
  nextError: Error | undefined;
  readFailure: "get" | "list" | undefined;
  getCallCount = 0;
  throwGetAt: number | undefined;

  getArtifactByHash(hash: string): StoredReviewArtifact | null {
    this.getCallCount += 1;
    if (this.readFailure === "get" || this.throwGetAt === this.getCallCount) throw new Error("SENSITIVE_STORE_READ_FAILURE");
    return this.artifacts.get(hash) ?? null;
  }

  listArtifactsByScope(_scope: typeof scope): readonly StoredReviewArtifact[] {
    if (this.readFailure === "list") throw new Error("SENSITIVE_STORE_READ_FAILURE");
    return [...this.artifacts.values()];
  }

  ingestValidatedReviewEvidence(input: ReviewIngestInput): string {
    this.calls.push(input);
    if (this.nextError) throw this.nextError;
    this.artifacts.set(input.contentHash, {
      contentHash: input.contentHash, artifactId: input.artifactId, artifactKind: input.artifactKind,
      schemaVersion: input.schemaVersion, projectId: input.projectId, featureId: input.featureId,
      phaseNumber: input.phaseNumber, reviewGateId: input.reviewGateId, featureRootPath: input.featureRootPath,
      artifactRelativePath: input.artifactRelativePath, canonicalJson: input.canonicalJson,
      sourceMode: input.sourceMode, ingestedAt: input.ingestedAt,
    });
    if (input.gateDecision) {
      this.currentGate = {
        gateDecisionId: 2,
        projectId: input.projectId,
        featureId: input.featureId,
        phaseNumber: input.phaseNumber,
        reviewGateId: input.reviewGateId,
        triggerArtifactHash: input.contentHash,
        basisManifestHash: input.gateDecision.basisManifestHash,
        cycleId: input.gateDecision.cycleId ?? null,
        gateState: input.gateDecision.gateState,
        reasonCode: input.gateDecision.reasonCode,
        evidenceHashesJson: JSON.stringify(input.gateDecision.evidenceHashes),
        decidedAt: input.ingestedAt,
      };
    }
    return input.contentHash;
  }
}

function request(
  store: ReviewIngestionStore,
  validationResult: ReviewContractIntegrationResult = validated(approvedManifest()),
  expectedScope: ReviewIngestionRequest["expectedScope"] = scope,
): ReviewIngestionRequest {
  return {
    expectedScope,
    validationResult,
    featureRootPath,
    ingestedAt,
    enforcement: { enabled: true, storeAvailable: true },
    store,
  };
}

function createSqliteStore(): { store: ReviewGovernanceSqliteStore; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), "feat-065-ingestion-"));
  const snapshot = resolveStrictActiveRule(trustedCatalog(), "secret-safe-governance-artifacts");
  if (!snapshot) throw new Error("Required active rule is unavailable.");
  const store = new ReviewGovernanceSqliteStore(join(directory, "hepha.sqlite"), { currentActiveRuleSnapshots: [snapshot] });
  return { store, cleanup: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

describe("E013-IR-005: ingestValidatedReviewEvidence", () => {
  it("rejects malformed, forged, and cross-scope direct integration input before database or artifact publication", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-065-integration-preflight-"));
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const candidate = hydrateActiveRuleSnapshots(approvedManifest());
      const validation = validateReviewContractArtifact(JSON.stringify(candidate), {
        projectRoot,
        featurePath: featureRootPath,
        expectedManifestScope: scope,
      });
      if (!validation.valid) throw new Error(`${validation.code}: ${validation.message}`);
      const contentHash = computeReviewArtifactHash(validation.artifact);
      const artifactPath = join(projectRoot, featureRootPath, "code-reviews", "artifacts", "review_manifest", `${contentHash}.json`);
      const validInput = {
        projectRoot,
        databasePath,
        featureRootPath,
        expectedScope: scope,
        validationResult: validation,
        ingestedAt,
        enforcementEnabled: true,
      };
      const forgedValidation = {
        valid: true,
        artifact: validation.artifact,
        projection: validation.projection,
      };
      const invalidInputs: readonly unknown[] = [
        undefined,
        null,
        "raw output",
        [],
        { ...validInput, unexpected: true },
        { ...validInput, featureRootPath: "../escape" },
        { ...validInput, ingestedAt: "not-a-timestamp" },
        { ...validInput, validationResult: forgedValidation },
        { ...validInput, expectedScope: { ...scope, phaseNumber: scope.phaseNumber + 1 } },
      ];

      for (const invalidInput of invalidInputs) {
        expect(() => ingestAndRenderAuthoritativeReview(invalidInput)).not.toThrow();
        expect(ingestAndRenderAuthoritativeReview(invalidInput)).toMatchObject({ kind: "refusal", code: "invalid_input" });
        expect(existsSync(databasePath)).toBe(false);
        expect(existsSync(artifactPath)).toBe(false);
      }

      const persisted = ingestAndRenderAuthoritativeReview(validInput);
      expect(persisted).toMatchObject({ kind: "persisted" });
      expect(existsSync(databasePath)).toBe(true);
      expect(existsSync(artifactPath)).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("V1 contract-projection conformance: an artifact accepted by the public validator persists and renders at maximum field bounds", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-065-v1-projection-boundary-"));
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));

      const candidate = hydrateActiveRuleSnapshots(buildValidManifest({
        artifactId: "manifest-v1-projection-boundary",
        scope,
        result: "NEEDS_CHANGES",
      }));
      const finding = candidate.findings[0] as Record<string, unknown>;
      const maximumV1Text = "x".repeat(REVIEW_ARTIFACT_MAX_STRING_LENGTH);
      finding.rootCause = maximumV1Text;
      ((finding.remediationItems as Record<string, unknown>[])[0]!).instruction = maximumV1Text;
      ((finding.testMatrix as Record<string, unknown>[])[0]!).requirement = maximumV1Text;
      const scopeExpansionFinding = JSON.parse(JSON.stringify(finding)) as Record<string, unknown>;
      scopeExpansionFinding.findingId = "finding-002";
      scopeExpansionFinding.disposition = "SCOPE_EXPANSION";
      scopeExpansionFinding.scopeExpansionRationale = maximumV1Text;
      candidate.findings.push(scopeExpansionFinding as never);

      const validation = validateReviewContractArtifact(JSON.stringify(candidate), {
        projectRoot,
        featurePath: featureRootPath,
        expectedManifestScope: scope,
      });
      expect(validation).toMatchObject({ valid: true });
      if (!validation.valid) throw new Error(`${validation.code}: ${validation.message}`);

      const result = ingestAndRenderAuthoritativeReview({
        projectRoot,
        databasePath: join(projectRoot, ".hepha", "hepha.sqlite"),
        featureRootPath,
        expectedScope: scope,
        validationResult: validation,
        ingestedAt,
        enforcementEnabled: true,
      });

      expect(result).toMatchObject({ kind: "persisted" });
      if (result.kind !== "persisted") throw new Error("A V1-valid artifact must persist through the public boundary.");
      expect(result.rendered.markdown).toContain("Presentation evidence only");
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("projects the exact immutable NEEDS_CHANGES predecessor for a review rerun", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-065-rerun-lineage-"));
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const candidate = hydrateActiveRuleSnapshots(buildValidManifest({
        artifactId: "manifest-rerun-lineage-basis",
        scope,
        result: "NEEDS_CHANGES",
      }));
      const validation = validateReviewContractArtifact(JSON.stringify(candidate), {
        projectRoot,
        featurePath: featureRootPath,
        expectedManifestScope: scope,
      });
      if (!validation.valid) throw new Error(`${validation.code}: ${validation.message}`);
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const persisted = ingestAndRenderAuthoritativeReview({
        projectRoot,
        databasePath,
        featureRootPath,
        expectedScope: scope,
        validationResult: validation,
        ingestedAt,
        enforcementEnabled: true,
      });
      if (persisted.kind !== "persisted") throw new Error("The NEEDS_CHANGES basis must persist.");

      expect(readAuthoritativeReviewRerunLineageContext({ projectRoot, databasePath, expectedScope: scope })).toEqual({
        kind: "required",
        predecessor: {
          artifactKind: "review_manifest",
          artifactId: candidate.artifactId,
          contentHash: persisted.ingestion.contentHash,
          relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${persisted.ingestion.contentHash}.json`,
        },
        findings: [{ findingId: "finding-001", disposition: "IN_SCOPE_BLOCKER" }],
      });
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("validate-ingest-render-gate-exit-order reloads current V1 evidence from durable state without agent output", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-065-authoritative-review-"));
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const candidate = hydrateActiveRuleSnapshots(approvedManifest());
      const validation = validateReviewContractArtifact(JSON.stringify(candidate), {
        projectRoot,
        featurePath: featureRootPath,
        expectedManifestScope: scope,
      });
      if (!validation.valid) throw new Error(`${validation.code}: ${validation.message}`);
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const result = ingestAndRenderAuthoritativeReview({
        projectRoot,
        databasePath,
        featureRootPath,
        expectedScope: scope,
        validationResult: validation,
        ingestedAt,
        enforcementEnabled: true,
      });

      expect(result).toMatchObject({ kind: "persisted", ingestion: { gate: { gateState: "APPROVED" } } });
      if (result.kind !== "persisted") throw new Error("Authoritative integration must persist the control.");
      expect(result.rendered.markdown).toContain("Presentation evidence only");
      // A reloaded process provides only the durable scope. It supplies no
      // agent output, cached projection, Markdown, or artifact hash selector.
      expect(readCurrentAuthoritativeReviewEvidence({
        projectRoot,
        databasePath,
        expectedScope: scope,
      })).toMatchObject({
        artifact: { contentHash: result.ingestion.contentHash },
        gate: { gateState: "APPROVED" },
        persistence: { state: "COMMITTED_READ_BACK_VERIFIED" },
      });
      for (const malformedRead of [undefined, null, "raw agent output", [], { projectRoot, databasePath, expectedScope: null }]) {
        expect(() => readCurrentAuthoritativeReviewEvidence(malformedRead)).not.toThrow();
        expect(readCurrentAuthoritativeReviewEvidence(malformedRead)).toBeUndefined();
      }
      // The known-artifact reader remains a narrower inspection API and must
      // resolve the same committed evidence after the integration store closes.
      expect(readAuthoritativeReviewEvidence({
        projectRoot,
        databasePath,
        expectedScope: scope,
        contentHash: result.ingestion.contentHash,
      })).toMatchObject({
        artifact: { contentHash: result.ingestion.contentHash },
      });
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("removes only an invocation-created unaccepted file after a transaction failure", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-065-owned-cleanup-"));
    const originalIngest = ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence;
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const basis = hydrateActiveRuleSnapshots(approvedManifest());
      const basisValidation = validateReviewContractArtifact(JSON.stringify(basis), { projectRoot, featurePath: featureRootPath, expectedManifestScope: scope });
      if (!basisValidation.valid) throw new Error("Cleanup basis must validate.");
      const basisResult = ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: basisValidation, ingestedAt, enforcementEnabled: true });
      if (basisResult.kind !== "persisted") throw new Error("Cleanup basis must commit.");
      const beforeStore = openAuthoritativeReviewStore(projectRoot, databasePath);
      if (!beforeStore) throw new Error("Cleanup store must reopen.");
      const priorGate = beforeStore.getCurrentAuthoritativeReviewGate(scope);
      beforeStore.close();
      const candidate = hydrateActiveRuleSnapshots(buildValidManifest({ artifactId: "manifest-cleanup-failure", scope, result: "APPROVED", findings: [{ ...buildValidFinding(), disposition: "OBSERVATION", severity: "note" }] }));
      const validation = validateReviewContractArtifact(JSON.stringify(candidate), { projectRoot, featurePath: featureRootPath, expectedManifestScope: scope });
      if (!validation.valid) throw new Error("Failure candidate must validate.");
      const contentHash = computeReviewArtifactHash(validation.artifact);
      const artifactPath = join(projectRoot, featureRootPath, "code-reviews", "artifacts", "review_manifest", `${contentHash}.json`);
      ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence = (() => { throw new Error("injected transaction failure"); }) as typeof originalIngest;
      expect(ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: validation, ingestedAt, enforcementEnabled: true }))
        .toMatchObject({ kind: "refusal", code: "persistence_failed" });
      expect(existsSync(artifactPath)).toBe(false);
      ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence = originalIngest;
      const afterStore = openAuthoritativeReviewStore(projectRoot, databasePath);
      if (!afterStore) throw new Error("Cleanup store must reopen after refusal.");
      expect(afterStore.getArtifactByHash(contentHash)).toBeNull();
      expect(afterStore.getCurrentAuthoritativeReviewGate(scope)).toEqual(priorGate);
      afterStore.close();
    } finally {
      ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence = originalIngest;
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("serializes a competing same-hash ingress before refusal cleanup can unlink", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-065-cleanup-lease-"));
    const originalIngest = ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence;
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const candidate = hydrateActiveRuleSnapshots(buildValidManifest({ artifactId: "manifest-cleanup-lease", scope, result: "APPROVED", findings: [{ ...buildValidFinding(), disposition: "OBSERVATION", severity: "note" }] }));
      const validation = validateReviewContractArtifact(JSON.stringify(candidate), { projectRoot, featurePath: featureRootPath, expectedManifestScope: scope });
      if (!validation.valid) throw new Error("Lease candidate must validate.");
      const contentHash = computeReviewArtifactHash(validation.artifact);
      const artifactPath = join(projectRoot, featureRootPath, "code-reviews", "artifacts", "review_manifest", `${contentHash}.json`);
      let competing: ReturnType<typeof ingestAndRenderAuthoritativeReview> | undefined;
      let secondCompeting: ReturnType<typeof ingestAndRenderAuthoritativeReview> | undefined;
      let ingressAttempts = 0;
      setAuthoritativeReviewCleanupHookForTest(() => {
        setAuthoritativeReviewCleanupHookForTest(undefined);
        competing = ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: validation, ingestedAt, enforcementEnabled: true });
        secondCompeting = ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: validation, ingestedAt, enforcementEnabled: true });
      });
      ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence = (() => {
        ingressAttempts += 1;
        throw new Error("injected transaction failure");
      }) as typeof originalIngest;
      expect(ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: validation, ingestedAt, enforcementEnabled: true }))
        .toMatchObject({ kind: "refusal", code: "persistence_failed" });
      expect(competing).toMatchObject({ kind: "refusal", code: "persistence_failed" });
      expect(secondCompeting).toMatchObject({ kind: "refusal", code: "persistence_failed" });
      expect(ingressAttempts).toBe(1);
      expect(existsSync(artifactPath)).toBe(false);
      ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence = originalIngest;
      // The competing public ingress was excluded through the entire cleanup
      // interval. Once cleanup releases that same-hash lease, a new public
      // ingress can commit the file and row together.
      expect(ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: validation, ingestedAt, enforcementEnabled: true }))
        .toMatchObject({ kind: "persisted", ingestion: { contentHash } });
      expect(existsSync(artifactPath)).toBe(true);
      const store = openAuthoritativeReviewStore(projectRoot, databasePath);
      if (!store) throw new Error("Lease store must reopen.");
      expect(store.getArtifactByHash(contentHash)).not.toBeNull();
      store.close();
    } finally {
      setAuthoritativeReviewCleanupHookForTest(undefined);
      ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence = originalIngest;
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("preserves a publication when same-hash lease ownership is ambiguous after publication", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-065-ambiguous-cleanup-"));
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const candidate = hydrateActiveRuleSnapshots(buildValidManifest({ artifactId: "manifest-ambiguous-cleanup", scope, result: "APPROVED", findings: [{ ...buildValidFinding(), disposition: "OBSERVATION", severity: "note" }] }));
      const validation = validateReviewContractArtifact(JSON.stringify(candidate), { projectRoot, featurePath: featureRootPath, expectedManifestScope: scope });
      if (!validation.valid) throw new Error("Ambiguous-ownership candidate must validate.");
      const contentHash = computeReviewArtifactHash(validation.artifact);
      const artifactPath = join(projectRoot, featureRootPath, "code-reviews", "artifacts", "review_manifest", `${contentHash}.json`);
      // This pre-existing derived lease is an explicit ambiguous-ownership
      // condition after the publisher has written the canonical final file.
      // The adapter must refuse and preserve the target rather than infer that
      // it owns cleanup from file existence alone.
      mkdirSync(dirname(artifactPath), { recursive: true });
      writeFileSync(join(dirname(artifactPath), `.${contentHash}.ingress.lock`), "external ingress owns this lease", "utf8");
      expect(ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: validation, ingestedAt, enforcementEnabled: true }))
        .toMatchObject({ kind: "refusal", code: "persistence_failed" });
      expect(existsSync(artifactPath)).toBe(true);
      const store = openAuthoritativeReviewStore(projectRoot, databasePath);
      if (!store) throw new Error("Ambiguous-ownership store must reopen.");
      expect(store.getArtifactByHash(contentHash)).toBeNull();
      store.close();
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("preserves a publication when a concurrent committed row is observed during refusal cleanup", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-065-committed-race-"));
    const originalIngest = ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence;
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const candidate = hydrateActiveRuleSnapshots(buildValidManifest({ artifactId: "manifest-committed-race", scope, result: "APPROVED", findings: [{ ...buildValidFinding(), disposition: "OBSERVATION", severity: "note" }] }));
      const validation = validateReviewContractArtifact(JSON.stringify(candidate), { projectRoot, featurePath: featureRootPath, expectedManifestScope: scope });
      if (!validation.valid) throw new Error("Committed-race candidate must validate.");
      const contentHash = computeReviewArtifactHash(validation.artifact);
      const artifactPath = join(projectRoot, featureRootPath, "code-reviews", "artifacts", "review_manifest", `${contentHash}.json`);
      ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence = function (input) {
        originalIngest.call(this, input);
        throw new Error("injected post-commit refusal");
      } as typeof originalIngest;
      expect(ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: validation, ingestedAt, enforcementEnabled: true }))
        .toMatchObject({ kind: "refusal", code: "persistence_failed" });
      expect(existsSync(artifactPath)).toBe(true);
      ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence = originalIngest;
      const store = openAuthoritativeReviewStore(projectRoot, databasePath);
      if (!store) throw new Error("Committed-race store must reopen.");
      expect(store.getArtifactByHash(contentHash)).not.toBeNull();
      store.close();
    } finally {
      ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence = originalIngest;
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("preserves reused exact and symlink publication targets when ingestion refuses", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-065-unowned-cleanup-"));
    const originalIngest = ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence;
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const candidate = hydrateActiveRuleSnapshots(approvedManifest());
      const validation = validateReviewContractArtifact(JSON.stringify(candidate), { projectRoot, featurePath: featureRootPath, expectedManifestScope: scope });
      if (!validation.valid) throw new Error("Unowned cleanup candidate must validate.");
      const canonicalJson = canonicalizeReviewArtifact(validation.artifact);
      const contentHash = computeReviewArtifactHash(validation.artifact);
      // Use the canonical producer, not the test serialization, for the
      // pre-existing content-addressed file.
      const publication = ReviewGovernanceSqliteStore.persistArtifactFileV1({ projectRoot, featureRootPath, artifactKind: "review_manifest", contentHash, canonicalJson });
      expect(publication.created).toBe(true);
      ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence = (() => { throw new Error("injected transaction failure"); }) as typeof originalIngest;
      expect(ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: validation, ingestedAt, enforcementEnabled: true }))
        .toMatchObject({ kind: "refusal", code: "persistence_failed" });
      expect(existsSync(publication.path)).toBe(true);
      // A final symlink is a collision, never a cleanup candidate.
      rmSync(publication.path, { force: true });
      const outside = join(projectRoot, "outside-identical.json");
      writeFileSync(outside, canonicalJson, "utf8");
      symlinkSync(outside, publication.path);
      expect(ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: validation, ingestedAt, enforcementEnabled: true }))
        .toMatchObject({ kind: "refusal", code: "persistence_failed" });
      expect(existsSync(publication.path)).toBe(true);
      // A mismatched collision and a non-regular final object are never
      // invocation-owned cleanup targets.
      rmSync(publication.path, { force: true });
      writeFileSync(publication.path, `${canonicalJson} `, "utf8");
      expect(ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: validation, ingestedAt, enforcementEnabled: true }))
        .toMatchObject({ kind: "refusal", code: "persistence_failed" });
      expect(readFileSync(publication.path, "utf8")).toBe(`${canonicalJson} `);
      rmSync(publication.path, { force: true });
      mkdirSync(publication.path);
      expect(ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: validation, ingestedAt, enforcementEnabled: true }))
        .toMatchObject({ kind: "refusal", code: "persistence_failed" });
      expect(existsSync(publication.path)).toBe(true);
      // A symlinked parent is also unowned: the public adapter refuses before
      // it can publish or clean any target reached through that component.
      rmSync(join(projectRoot, featureRootPath, "code-reviews"), { recursive: true, force: true });
      const outsideDirectory = join(projectRoot, "outside-parent");
      mkdirSync(join(outsideDirectory, "artifacts", "review_manifest"), { recursive: true });
      symlinkSync(outsideDirectory, join(projectRoot, featureRootPath, "code-reviews"), "dir");
      expect(ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: validation, ingestedAt, enforcementEnabled: true }))
        .toMatchObject({ kind: "refusal", code: "persistence_failed" });
      expect(existsSync(join(projectRoot, featureRootPath, "code-reviews"))).toBe(true);
    } finally {
      ReviewGovernanceSqliteStore.prototype.ingestValidatedReviewEvidence = originalIngest;
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("renders a committed debt observation without changing the current authoritative gate", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-065-debt-integration-"));
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const debtFindingBase = buildValidFinding();
      const snapshot = resolveStrictActiveRule(trustedCatalog(), "secret-safe-governance-artifacts")!;
      const { rootCause: _rootCause, scopeExpansionRationale: _scopeExpansionRationale, remediationItems: _remediationItems, testMatrix: _testMatrix, exhaustivenessDecision: _exhaustivenessDecision, compatibilityDecision: _compatibilityDecision, compatibilityApprovalSource: _compatibilityApprovalSource, compatibilityJustification: _compatibilityJustification, ...debtFields } = debtFindingBase;
      const basis = buildValidManifest({
        artifactId: "manifest-debt-integration-basis", scope, result: "APPROVED", ruleSnapshots: [snapshot],
        findings: [{ ...debtFields, findingId: "finding-debt-integration", disposition: "ARCHITECTURE_DEBT", severity: "note", authority: { ...debtFindingBase.authority, snapshot }, debtImpact: "untouched_non_blocking" }],
      });
      const basisValidation = validated(basis);
      if (!basisValidation.valid) throw new Error("Debt basis validation must succeed.");
      const basisResult = ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: basisValidation, ingestedAt, enforcementEnabled: true });
      if (basisResult.kind !== "persisted") throw new Error("Debt basis must commit authoritatively.");
      const reference = { artifactKind: "review_manifest" as const, artifactId: basis.artifactId, contentHash: basisResult.ingestion.contentHash, relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${basisResult.ingestion.contentHash}.json` };
      const debt = buildValidDebtObservation({ artifactId: "debt-integration-control", scope, manifestReference: reference, findingId: "finding-debt-integration", authority: { ...basis.findings[0]!.authority! }, historicalSurface: [basis.findings[0]!.surface.affected[0]!] });
      const debtValidation = validated(debt);
      if (!debtValidation.valid) throw new Error("Debt control validation must succeed.");
      const debtResult = ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: debtValidation, ingestedAt, enforcementEnabled: true });
      expect(debtResult).toMatchObject({ kind: "persisted_non_authoritative", ingestion: { contentHash: computeReviewArtifactHash(debt) }, readModel: { artifact: { artifactKind: "debt_observation", result: "PERSISTED" } } });
      if (debtResult.kind !== "persisted_non_authoritative") throw new Error("Debt must remain non-authoritative.");
      expect(debtResult.readModel.gate.triggerArtifactHash).toBe(basisResult.ingestion.contentHash);
      expect(debtResult.readModel.gate.triggerArtifactHash).not.toBe(debtResult.ingestion.contentHash);
      const store = openAuthoritativeReviewStore(projectRoot, databasePath);
      if (!store) throw new Error("Store must reopen for debt assertions.");
      expect(store.listGateDecisions(scope)).toHaveLength(1);
      expect(store.listRemediationCyclesByScope(scope)).toHaveLength(1);
      store.close();
      expect(readAuthoritativeReviewEvidence({ projectRoot, databasePath, expectedScope: scope, contentHash: debtResult.ingestion.contentHash }))
        .toMatchObject({ artifact: { contentHash: debtResult.ingestion.contentHash, result: "PERSISTED" }, gate: { triggerArtifactHash: basisResult.ingestion.contentHash } });
      expect(readCurrentAuthoritativeReviewEvidence({ projectRoot, databasePath, expectedScope: scope }))
        .toMatchObject({ artifact: { contentHash: basisResult.ingestion.contentHash } });
      expect(ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: debtValidation, ingestedAt, enforcementEnabled: true }))
        .toMatchObject({ kind: "refusal", code: "duplicate_artifact" });
      const missingDebt = validated({ ...debt, artifactId: "debt-missing-basis", manifestReference: { ...reference, artifactId: "missing-manifest" } });
      expect(ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: missingDebt as never, ingestedAt, enforcementEnabled: true }))
        .toMatchObject({ kind: "refusal", code: "invalid_input" });
      expect(ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: { ...scope, phaseNumber: 4 }, validationResult: debtValidation, ingestedAt, enforcementEnabled: true }))
        .toMatchObject({ kind: "refusal", code: "invalid_input" });
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("rejects final and parent symlinks during restart evidence reconstruction", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-065-restart-symlink-"));
    const outside = mkdtempSync(join(tmpdir(), "feat-065-restart-symlink-outside-"));
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const candidate = hydrateActiveRuleSnapshots(approvedManifest());
      const validation = validateReviewContractArtifact(JSON.stringify(candidate), { projectRoot, featurePath: featureRootPath, expectedManifestScope: scope });
      if (!validation.valid) throw new Error("Restart control must validate.");
      const result = ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: validation, ingestedAt, enforcementEnabled: true });
      if (result.kind !== "persisted") throw new Error("Restart control must persist.");
      const finalPath = join(projectRoot, featureRootPath, "code-reviews", "artifacts", "review_manifest", `${result.ingestion.contentHash}.json`);
      const canonicalBytes = readFileSync(finalPath, "utf8");
      const knownRead = () => readAuthoritativeReviewEvidence({ projectRoot, databasePath, expectedScope: scope, contentHash: result.ingestion.contentHash });
      const currentRead = () => readCurrentAuthoritativeReviewEvidence({ projectRoot, databasePath, expectedScope: scope });
      expect(knownRead()).toMatchObject({ artifact: { contentHash: result.ingestion.contentHash } });
      const inProjectCopy = join(projectRoot, "identical-in-project.json");
      writeFileSync(inProjectCopy, canonicalBytes, "utf8");
      unlinkSync(finalPath);
      symlinkSync(inProjectCopy, finalPath);
      expect(knownRead()).toBeUndefined();
      expect(currentRead()).toBeUndefined();
      unlinkSync(finalPath);
      writeFileSync(finalPath, canonicalBytes, "utf8");
      const outsideCopy = join(outside, "identical-outside.json");
      writeFileSync(outsideCopy, canonicalBytes, "utf8");
      unlinkSync(finalPath);
      symlinkSync(outsideCopy, finalPath);
      expect(knownRead()).toBeUndefined();
      expect(currentRead()).toBeUndefined();
      unlinkSync(finalPath);
      writeFileSync(finalPath, canonicalBytes, "utf8");
      const codeReviews = join(projectRoot, featureRootPath, "code-reviews");
      const outsideCodeReviews = join(outside, "code-reviews");
      mkdirSync(join(outsideCodeReviews, "artifacts", "review_manifest"), { recursive: true });
      writeFileSync(join(outsideCodeReviews, "artifacts", "review_manifest", `${result.ingestion.contentHash}.json`), canonicalBytes, "utf8");
      rmSync(codeReviews, { recursive: true, force: true });
      symlinkSync(outsideCodeReviews, codeReviews, "dir");
      expect(knownRead()).toBeUndefined();
      expect(currentRead()).toBeUndefined();
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects every unsafe restart object through both readers and the composed phase-exit guard", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-065-restart-object-matrix-"));
    const outside = mkdtempSync(join(tmpdir(), "feat-065-restart-object-outside-"));
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const candidate = hydrateActiveRuleSnapshots(approvedManifest());
      const validation = validateReviewContractArtifact(JSON.stringify(candidate), { projectRoot, featurePath: featureRootPath, expectedManifestScope: scope });
      if (!validation.valid) throw new Error("Restart matrix control must validate.");
      const result = ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: validation, ingestedAt, enforcementEnabled: true });
      if (result.kind !== "persisted") throw new Error("Restart matrix control must persist.");
      const contentHash = result.ingestion.contentHash;
      const finalPath = join(projectRoot, featureRootPath, "code-reviews", "artifacts", "review_manifest", `${contentHash}.json`);
      const canonicalBytes = readFileSync(finalPath, "utf8");
      const restoreRegularFile = () => {
        rmSync(finalPath, { recursive: true, force: true });
        mkdirSync(join(projectRoot, featureRootPath, "code-reviews", "artifacts", "review_manifest"), { recursive: true });
        writeFileSync(finalPath, canonicalBytes, "utf8");
      };

      expect(readCurrentAuthoritativeReviewEvidence({ projectRoot, databasePath, expectedScope: scope }))
        .toMatchObject({ artifact: { contentHash } });

      unlinkSync(finalPath);
      expectRestartReadersAndExitDenied(projectRoot, databasePath, contentHash);
      mkdirSync(finalPath);
      expectRestartReadersAndExitDenied(projectRoot, databasePath, contentHash);
      restoreRegularFile();
      // Remove an intermediate component rather than only the final object.
      rmSync(join(projectRoot, featureRootPath, "code-reviews", "artifacts"), { recursive: true, force: true });
      expectRestartReadersAndExitDenied(projectRoot, databasePath, contentHash);
      restoreRegularFile();
      restoreRegularFile();
      writeFileSync(finalPath, `${canonicalBytes} `, "utf8");
      expectRestartReadersAndExitDenied(projectRoot, databasePath, contentHash);

      restoreRegularFile();
      setAuthoritativeReviewRestartReadHookForTest(() => {
        rmSync(finalPath, { force: true });
        writeFileSync(finalPath, `${canonicalBytes} `, "utf8");
      });
      expectRestartReadersAndExitDenied(projectRoot, databasePath, contentHash);
      setAuthoritativeReviewRestartReadHookForTest(undefined);

      restoreRegularFile();
      const inProjectCopy = join(projectRoot, "identical-in-project.json");
      writeFileSync(inProjectCopy, canonicalBytes, "utf8");
      unlinkSync(finalPath);
      symlinkSync(inProjectCopy, finalPath);
      expectRestartReadersAndExitDenied(projectRoot, databasePath, contentHash);
      restoreRegularFile();
      const outsideCopy = join(outside, "identical-outside.json");
      writeFileSync(outsideCopy, canonicalBytes, "utf8");
      unlinkSync(finalPath);
      symlinkSync(outsideCopy, finalPath);
      expectRestartReadersAndExitDenied(projectRoot, databasePath, contentHash);

      restoreRegularFile();
      const codeReviews = join(projectRoot, featureRootPath, "code-reviews");
      const outsideCodeReviews = join(outside, "code-reviews");
      mkdirSync(join(outsideCodeReviews, "artifacts", "review_manifest"), { recursive: true });
      writeFileSync(join(outsideCodeReviews, "artifacts", "review_manifest", `${contentHash}.json`), canonicalBytes, "utf8");
      rmSync(codeReviews, { recursive: true, force: true });
      symlinkSync(outsideCodeReviews, codeReviews, "dir");
      expectRestartReadersAndExitDenied(projectRoot, databasePath, contentHash);

      // Re-execute the untouched regular-file control after the hostile object
      // matrix. Both readers must reconstruct the exact canonical bytes and
      // the composed phase-exit guard must receive valid evidence.
      rmSync(codeReviews, { recursive: true, force: true });
      restoreRegularFile();
      const known = readAuthoritativeReviewEvidence({ projectRoot, databasePath, expectedScope: scope, contentHash });
      const current = readCurrentAuthoritativeReviewEvidence({ projectRoot, databasePath, expectedScope: scope });
      expect(known).toMatchObject({ artifact: { contentHash } });
      expect(current).toMatchObject({ artifact: { contentHash } });
      const store = openAuthoritativeReviewStore(projectRoot, databasePath);
      if (!store) throw new Error("Restart positive-control store must reopen.");
      try {
        expect(assessAuthoritativeReviewPhaseExit({
          scope,
          freshTriggerArtifactHash: contentHash,
          persistenceReadBackVerified: known !== undefined && current !== undefined,
          store: store as never,
          genericCheckpoint: { allowed: true, reason: "Generic checkpoint passes.", missingGates: [] },
        })).toMatchObject({ allowed: true });
      } finally {
        store.close();
      }
    } finally {
      setAuthoritativeReviewRestartReadHookForTest(undefined);
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("renders a bounded presentation projection when a valid manifest finding summary exceeds the display limit", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-065-long-finding-summary-"));
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const longSummary = `Progress since predecessor: REDUCED. Accepted this cycle: production guard. Still outstanding: cursor regression. Reviewer evidence: ${"x".repeat(1_500)}`;
      const candidate = hydrateActiveRuleSnapshots(buildValidManifest({
        artifactId: "manifest-long-summary",
        scope,
        result: "NEEDS_CHANGES",
        findings: [buildValidFinding({ summary: longSummary })],
      }));
      const validation = validateReviewContractArtifact(JSON.stringify(candidate), {
        projectRoot,
        featurePath: featureRootPath,
        expectedManifestScope: scope,
      });
      if (!validation.valid) throw new Error("Long but validator-approved summary must validate.");

      const result = ingestAndRenderAuthoritativeReview({
        projectRoot,
        databasePath: join(projectRoot, ".hepha", "hepha.sqlite"),
        featureRootPath,
        expectedScope: scope,
        validationResult: validation,
        ingestedAt,
        enforcementEnabled: true,
      });

      expect(result).toMatchObject({ kind: "persisted", ingestion: { gate: { gateState: "REJECTED" } } });
      if (result.kind !== "persisted") throw new Error("A valid persisted finding must render a bounded projection.");
      const summary = result.rendered.projection.findings[0]?.summary ?? "";
      const truncation = "... [truncated; full finding remains in immutable artifact]";
      expect(summary).toHaveLength(1_024);
      expect(summary).toBe(`${longSummary.slice(0, 1_024 - truncation.length)}${truncation}`);
      expect(summary).toContain("Progress since predecessor: REDUCED");
      expect(summary).toContain("Still outstanding: cursor regression");
      expect(result.rendered.markdown).toContain("stable identity; it does not imply that no remediation progress was accepted");
      expect(result.rendered.markdown).toContain(summary);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("ingests successor response and receipt only from exact persisted predecessor context", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-065-successor-review-"));
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const predecessor = hydrateActiveRuleSnapshots(buildValidManifest({
        artifactId: "manifest-successor-basis",
        scope,
        result: "NEEDS_CHANGES",
      }));
      const predecessorValidation = validateReviewContractArtifact(JSON.stringify(predecessor), {
        projectRoot,
        featurePath: featureRootPath,
        expectedManifestScope: scope,
      });
      if (!predecessorValidation.valid) throw new Error("Predecessor control must validate.");
      const predecessorResult = ingestAndRenderAuthoritativeReview({
        projectRoot,
        databasePath,
        featureRootPath,
        expectedScope: scope,
        validationResult: predecessorValidation,
        ingestedAt,
        enforcementEnabled: true,
      });
      if (predecessorResult.kind !== "persisted") throw new Error("Predecessor control must persist.");
      const manifestReference = {
        artifactKind: "review_manifest" as const,
        artifactId: predecessor.artifactId,
        contentHash: predecessorResult.ingestion.contentHash,
        relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${predecessorResult.ingestion.contentHash}.json`,
      };
      const malformedResponse = {
        schemaVersion: 1,
        artifactKind: "remediation_response",
        artifactId: "response-successor-malformed",
        scope,
        manifestReference,
        findingResponses: [{
          findingId: "finding-001",
          fixerDecision: "FIX_PROPOSED",
          changedSurfaceIds: ["affected-1"],
          remediatedItemIds: ["fix-001"],
          completedTestIds: ["test-001"],
        }],
      };
      expect(ingestAndRenderAuthoritativeReviewSuccessor({
        projectRoot,
        databasePath,
        featureRootPath,
        expectedScope: scope,
        rawPayload: JSON.stringify(malformedResponse),
        ingestedAt,
        enforcementEnabled: true,
      })).toEqual({
        kind: "refusal",
        code: "invalid_input",
        message: "Authoritative review successor validation failed (invalid_shape): Artifact has an invalid structure.",
      });

      const response = buildValidRemediationResponse({
        artifactId: "response-successor-control",
        scope,
        manifestReference,
      });
      const responseResult = ingestAndRenderAuthoritativeReviewSuccessor({
        projectRoot,
        databasePath,
        featureRootPath,
        expectedScope: scope,
        rawPayload: JSON.stringify(response),
        ingestedAt,
        enforcementEnabled: true,
      });
      expect(responseResult).toMatchObject({ kind: "persisted", ingestion: { gate: { gateState: "PENDING" } } });
      if (responseResult.kind !== "persisted") throw new Error("Response control must persist.");
      const responseReference = {
        artifactKind: "remediation_response" as const,
        artifactId: response.artifactId,
        contentHash: responseResult.ingestion.contentHash,
        relativePath: `${featureRootPath}/code-reviews/artifacts/remediation_response/${responseResult.ingestion.contentHash}.json`,
      };
      const receipt = buildValidVerificationReceipt({
        artifactId: "receipt-successor-control",
        scope,
        manifestReference,
        responseReference,
      });
      const receiptResult = ingestAndRenderAuthoritativeReviewSuccessor({
        projectRoot,
        databasePath,
        featureRootPath,
        expectedScope: scope,
        rawPayload: JSON.stringify(receipt),
        ingestedAt,
        enforcementEnabled: true,
      });
      expect(receiptResult).toMatchObject({ kind: "persisted", ingestion: { gate: { gateState: "PENDING" } } });

      // This is the generic reviewed-phase handoff: a persisted
      // NEEDS_CHANGES manifest plus its exact response and receipt is the
      // only predecessor state that lets the subsequent APPROVED review
      // settle the gate.  No phase number or phase name participates in this
      // transition.
      const approvedSuccessor = hydrateActiveRuleSnapshots(buildValidManifest({
        artifactId: "manifest-successor-approved-control",
        scope,
        result: "APPROVED",
        findings: [{ ...buildValidFinding(), disposition: "OBSERVATION", severity: "note" }],
        lineage: { predecessors: [manifestReference] },
      }));
      const approvedSuccessorValidation = validateReviewContractArtifact(JSON.stringify(approvedSuccessor), {
        projectRoot,
        featurePath: featureRootPath,
        expectedManifestScope: scope,
      });
      if (!approvedSuccessorValidation.valid) throw new Error("Approved successor control must validate.");
      const approvedSuccessorResult = ingestAndRenderAuthoritativeReview({
        projectRoot,
        databasePath,
        featureRootPath,
        expectedScope: scope,
        validationResult: approvedSuccessorValidation,
        ingestedAt,
        enforcementEnabled: true,
      });
      expect(approvedSuccessorResult).toMatchObject({
        kind: "persisted",
        ingestion: { gate: { gateState: "APPROVED", reasonCode: "approved_terminal_review" } },
      });

      const store = openAuthoritativeReviewStore(projectRoot, databasePath);
      if (!store) throw new Error("Store must reopen for successor rejection checks.");
      const beforeArtifacts = store.listArtifactsByScope(scope).map((artifact) => artifact.contentHash);
      const beforeGates = store.listGateDecisions(scope);
      store.close();
      const successorInput = {
        projectRoot,
        databasePath,
        featureRootPath,
        expectedScope: scope,
        ingestedAt,
        enforcementEnabled: true,
      };
      expect(ingestAndRenderAuthoritativeReviewSuccessor({
        ...successorInput,
        rawPayload: JSON.stringify({ ...response, artifactId: "response-missing-basis", manifestReference: { ...manifestReference, artifactId: "wrong-manifest" } }),
      })).toMatchObject({ kind: "refusal", code: "invalid_input" });
      expect(ingestAndRenderAuthoritativeReviewSuccessor({ ...successorInput, rawPayload: JSON.stringify(response) }))
        .toMatchObject({ kind: "refusal", code: "duplicate_artifact" });
      expect(ingestAndRenderAuthoritativeReviewSuccessor({
        ...successorInput,
        rawPayload: JSON.stringify({ ...receipt, artifactId: "receipt-mismatched-response", responseReference: { ...responseReference, artifactId: "wrong-response" } }),
      })).toMatchObject({ kind: "refusal", code: "invalid_input" });

      const afterStore = openAuthoritativeReviewStore(projectRoot, databasePath);
      if (!afterStore) throw new Error("Store must reopen after successor refusals.");
      expect(afterStore.listArtifactsByScope(scope).map((artifact) => artifact.contentHash)).toEqual(beforeArtifacts);
      expect(afterStore.listGateDecisions(scope)).toEqual(beforeGates);
      expect(afterStore.getCurrentAuthoritativeReviewGate(scope)?.gateState).toBe("APPROVED");
      afterStore.close();
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("projects and evaluates only one bounded remediation cycle when identities are reused", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "review-cycle-resume-"));
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const basis = hydrateActiveRuleSnapshots(buildValidManifest({
        artifactId: "manifest-cycle-resume-basis",
        scope,
        result: "NEEDS_CHANGES",
      }));
      const basisValidation = validateReviewContractArtifact(JSON.stringify(basis), {
        projectRoot,
        featurePath: featureRootPath,
        expectedManifestScope: scope,
      });
      if (!basisValidation.valid) throw new Error("Cycle basis must validate.");
      const basisResult = ingestAndRenderAuthoritativeReview({
        projectRoot,
        databasePath,
        featureRootPath,
        expectedScope: scope,
        validationResult: basisValidation,
        ingestedAt,
        enforcementEnabled: true,
      });
      if (basisResult.kind !== "persisted") throw new Error("Cycle basis must persist.");
      const manifestReference = {
        artifactKind: "review_manifest" as const,
        artifactId: basis.artifactId,
        contentHash: basisResult.ingestion.contentHash,
        relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${basisResult.ingestion.contentHash}.json`,
      };

      let latestReceiptHash = "";
      let latestReceiptCount = 0;
      for (const attempt of [1, 2]) {
        const response = buildValidRemediationResponse({
          artifactId: `response-cycle-resume-${attempt}`,
          scope,
          manifestReference,
        });
        const responseResult = ingestAndRenderAuthoritativeReviewSuccessor({
          projectRoot,
          databasePath,
          featureRootPath,
          expectedScope: scope,
          rawPayload: JSON.stringify(response),
          ingestedAt,
          enforcementEnabled: true,
        });
        if (responseResult.kind !== "persisted") throw new Error(`Response ${attempt} must persist.`);
        const responseReference = {
          artifactKind: "remediation_response" as const,
          artifactId: response.artifactId,
          contentHash: responseResult.ingestion.contentHash,
          relativePath: `${featureRootPath}/code-reviews/artifacts/remediation_response/${responseResult.ingestion.contentHash}.json`,
        };
        const receipt = buildValidVerificationReceipt({
          artifactId: `receipt-cycle-resume-${attempt}`,
          scope,
          manifestReference,
          responseReference,
        });
        const receiptResult = ingestAndRenderAuthoritativeReviewSuccessor({
          projectRoot,
          databasePath,
          featureRootPath,
          expectedScope: scope,
          rawPayload: JSON.stringify(receipt),
          ingestedAt,
          enforcementEnabled: true,
        });
        if (receiptResult.kind !== "persisted") throw new Error(`Receipt ${attempt} must persist and render.`);
        latestReceiptHash = receiptResult.ingestion.contentHash;
        latestReceiptCount = receipt.itemReceipts.length + receipt.testReceipts.length;
      }

      const current = readCurrentAuthoritativeReviewEvidence({ projectRoot, databasePath, expectedScope: scope });
      expect(current).toMatchObject({
        artifact: { artifactKind: "verification_receipt", contentHash: latestReceiptHash },
        cycleState: "REVIEW_PENDING",
      });
      expect(current?.receipts).toHaveLength(latestReceiptCount);

      const approval = hydrateActiveRuleSnapshots(buildValidManifest({
        artifactId: "manifest-cycle-resume-approved",
        scope,
        result: "APPROVED",
        findings: [{ ...buildValidFinding(), disposition: "OBSERVATION", severity: "note" }],
        lineage: { predecessors: [manifestReference] },
      }));
      const approvalValidation = validateReviewContractArtifact(JSON.stringify(approval), {
        projectRoot,
        featurePath: featureRootPath,
        expectedManifestScope: scope,
      });
      if (!approvalValidation.valid) throw new Error("Cycle approval must validate.");
      expect(ingestAndRenderAuthoritativeReview({
        projectRoot,
        databasePath,
        featureRootPath,
        expectedScope: scope,
        validationResult: approvalValidation,
        ingestedAt,
        enforcementEnabled: true,
      })).toMatchObject({
        kind: "persisted",
        ingestion: { gate: { gateState: "APPROVED", reasonCode: "approved_terminal_review" } },
      });
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("persists a validated exact-scope manifest and policy-derived approved gate in one store call", () => {
    const store = new RecordingStore();

    const result = ingestValidatedReviewEvidence(request(store));

    expect(result).toMatchObject({ kind: "persisted", gate: { gateState: "APPROVED", reasonCode: "approved_terminal_review" } });
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0]?.gateDecision).toMatchObject({
      triggerArtifactHash: result.kind === "persisted" ? result.contentHash : "",
      basisManifestHash: result.kind === "persisted" ? result.contentHash : "",
      gateState: "APPROVED",
      reasonCode: "approved_terminal_review",
    });
    expect(store.calls[0]?.findings?.[0]).toMatchObject({
      ruleReference: "rule:secret-safe-governance-artifacts",
      ruleId: "secret-safe-governance-artifacts",
      ruleVersion: "1.0.0",
      ruleHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(store.calls[0]?.artifactRelativePath).toBe(`${featureRootPath}/code-reviews/artifacts/review_manifest/${result.kind === "persisted" ? result.contentHash : ""}.json`);
  });

  it("rejects a validator refusal before any store call and preserves the prior gate", () => {
    const store = new RecordingStore();
    const priorGate = {
      gateDecisionId: 1,
      projectId: scope.projectId,
      featureId: scope.featureId,
      phaseNumber: scope.phaseNumber,
      reviewGateId: scope.reviewGateId,
      triggerArtifactHash: "b".repeat(64),
      basisManifestHash: "b".repeat(64),
      cycleId: "cycle-prior",
      gateState: "APPROVED" as const,
      reasonCode: "approved_terminal_review",
      evidenceHashesJson: "[]",
      decidedAt: ingestedAt,
    };
    store.currentGate = priorGate;

    const result = ingestValidatedReviewEvidence(request(store, {
      valid: false,
      code: "unsafe_content",
      message: "Artifact content is unsafe.",
    }));

    expect(result).toMatchObject({ kind: "refusal", code: "validation_rejected" });
    expect(store.calls).toHaveLength(0);
    expect(store.currentGate).toEqual(priorGate);
  });

  it("rejects a wrong-scope validated result before any store call and preserves the prior gate", () => {
    const store = new RecordingStore();
    const priorGate = store.currentGate;
    const manifest = approvedManifest();
    const result = ingestValidatedReviewEvidence(request(store, validated({
      ...manifest,
      scope: { ...scope, phaseNumber: 4 },
    })));

    expect(result).toMatchObject({ kind: "refusal", code: "scope_mismatch" });
    expect(store.calls).toHaveLength(0);
    expect(store.currentGate).toBe(priorGate);
  });

  it("rejects hostile successor context at the public boundary before persistence", () => {
    const manifest = approvedManifest();
    const baseStore = new RecordingStore();
    const base = request(baseStore);
    const malformedFinding = { ...manifest.findings[0]!, surface: { ...manifest.findings[0]!.surface, inspected: [{}] } };
    const matrix: readonly unknown[] = [
      undefined,
      null,
      "not-an-object",
      [],
      { ...base, expectedScope: null },
      { ...base, expectedScope: { ...scope, legacyScope: true } },
      { ...base, validationResult: null },
      { ...base, validationResult: { valid: true, artifact: { ...manifest, findings: undefined }, projection: {} } },
      { ...base, validationResult: { valid: true, artifact: { ...manifest, ruleSnapshots: [{}] }, projection: {} } },
      { ...base, validationResult: { valid: true, artifact: { ...manifest, findings: [{ ...malformedFinding, authority: null }] }, projection: {} } },
      { ...base, validationResult: { valid: true, artifact: { ...manifest, findings: [malformedFinding] }, projection: {} } },
      { ...base, validationResult: { valid: true, artifact: { ...manifest, findings: [{ ...manifest.findings[0]!, remediationItems: [{}] }] }, projection: {} } },
      { ...base, validationResult: { valid: true, artifact: { ...manifest, findings: [{ ...manifest.findings[0]!, testMatrix: [{}] }] }, projection: {} } },
      { ...base, validationResult: { valid: true, artifact: { ...manifest, lineage: { predecessors: {} } }, projection: {} } },
    ];

    for (const hostile of matrix) {
      const store = new RecordingStore();
      const priorGate = store.currentGate;
      const boundRequest = hostile && typeof hostile === "object" && !Array.isArray(hostile)
        ? { ...(hostile as Record<string, unknown>), store }
        : hostile;
      expect(() => ingestValidatedReviewEvidence(boundRequest)).not.toThrow();
      expect(ingestValidatedReviewEvidence(boundRequest)).toMatchObject({ kind: "refusal", code: "invalid_input" });
      expect(store.calls).toHaveLength(0);
      expect(store.currentGate).toBe(priorGate);
    }
  });

  it("rejects legacy Markdown, Safety Kernel, fingerprint, filename, and prose input without invoking an authority fallback", () => {
    const legacyInputs = [
      { legacyMarkdown: "# historical report" },
      { legacyFingerprintDecision: { outcome: "continue" } },
      { safetyKernelResult: { state: "APPROVED" } },
      { artifactFilename: "phase-3-approved.md" },
      { errorProse: "The prior review was approved; continue." },
    ];

    for (const legacyInput of legacyInputs) {
      const store = new RecordingStore();
      const priorGate: StoredReviewGateDecision = {
        gateDecisionId: 1,
        projectId: scope.projectId,
        featureId: scope.featureId,
        phaseNumber: scope.phaseNumber,
        reviewGateId: scope.reviewGateId,
        triggerArtifactHash: "b".repeat(64),
        basisManifestHash: "b".repeat(64),
        cycleId: "cycle-prior",
        gateState: "APPROVED",
        reasonCode: "approved_terminal_review",
        evidenceHashesJson: "[]",
        decidedAt: ingestedAt,
      };
      store.currentGate = priorGate;

      expect(ingestValidatedReviewEvidence({ ...request(store), ...legacyInput })).toMatchObject({
        kind: "refusal",
        code: "invalid_input",
      });
      expect(store.calls).toHaveLength(0);
      expect(store.currentGate).toEqual(priorGate);
    }
  });

  it("accepts a validator-valid authorityless observation and omits authority persistence fields", () => {
    const store = new RecordingStore();
    const catalogResult = loadStrictCatalogForReview(process.cwd());
    expect("valid" in catalogResult && catalogResult.valid === false).toBe(false);
    const catalog = catalogResult as StrictActiveRuleCatalog;
    expect(resolveStrictActiveRule(catalog, "secret-safe-governance-artifacts")).toBeTruthy();
    const observation = { ...buildValidFinding(), disposition: "OBSERVATION" as const, severity: "note" as const } as Record<string, unknown>;
    for (const key of ["authority", "rootCause", "remediationItems", "testMatrix", "exhaustivenessDecision", "compatibilityDecision", "compatibilityApprovalSource", "compatibilityJustification", "scopeExpansionRationale", "debtImpact", "debtObservationReference"]) delete observation[key];
    const manifest = buildValidManifest({ artifactId: "manifest-observation-no-authority", scope, result: "APPROVED", ruleSnapshots: [], findings: [observation as never] });
    const validationResult = validateReviewContractArtifact(JSON.stringify(manifest), { catalog, featurePath: featureRootPath, expectedManifestScope: scope });

    if (!validationResult.valid) throw new Error(`${validationResult.code}: ${validationResult.message}`);
    const result = ingestValidatedReviewEvidence(request(store, validationResult));

    expect(validationResult).toMatchObject({ valid: true });
    expect(result).toMatchObject({ kind: "persisted", gate: { gateState: "APPROVED" } });
    expect(store.calls[0]?.findings?.[0]).toMatchObject({ findingId: "finding-001" });
    expect(store.calls[0]?.findings?.[0]).not.toHaveProperty("ruleReference");
    expect(store.calls[0]?.findings?.[0]).not.toHaveProperty("acSourcePath");
  });

  it("ingests every validated V1 artifact kind once with exact persisted manifest references", () => {
    const store = new RecordingStore();
    const manifest = buildValidManifest({
      artifactId: "manifest-lifecycle",
      scope,
      result: "NEEDS_CHANGES",
      findings: [{ ...buildValidFinding(), exhaustivenessDecision: "replan_required" }],
    });
    const manifestResult = ingestValidatedReviewEvidence(request(store, validated(manifest)));
    expect(manifestResult).toMatchObject({ kind: "persisted", gate: { gateState: "REJECTED" } });
    const manifestHash = (manifestResult as Extract<typeof manifestResult, { kind: "persisted" }>).contentHash;
    const manifestReference = {
      artifactKind: "review_manifest" as const, artifactId: manifest.artifactId, contentHash: manifestHash,
      relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${manifestHash}.json`,
    };
    const response = {
      schemaVersion: 1 as const, artifactKind: "remediation_response" as const, artifactId: "response-lifecycle", scope, manifestReference,
      findingResponses: [{ findingId: "finding-001", items: [{ remediationItemId: "fix-001", decision: "APPLIED" as const, changedSurfaceIds: ["affected-1"], rationale: "Applied bounded remediation." }] }],
    };
    const responseResult = ingestValidatedReviewEvidence(request(store, validated(response as never)));
    expect(responseResult).toMatchObject({ kind: "persisted", gate: { gateState: "PENDING" } });
    const responseHash = (responseResult as Extract<typeof responseResult, { kind: "persisted" }>).contentHash;
    const receipt = {
      schemaVersion: 1 as const, artifactKind: "verification_receipt" as const, artifactId: "receipt-lifecycle", scope, manifestReference,
      responseReference: { artifactKind: "remediation_response" as const, artifactId: response.artifactId, contentHash: responseHash, relativePath: `${featureRootPath}/code-reviews/artifacts/remediation_response/${responseHash}.json` },
      itemReceipts: [{ findingId: "finding-001", remediationItemId: "fix-001", outcome: "VERIFIED", evidence: "Focused test passes." }],
      testReceipts: [{ findingId: "finding-001", testId: "test-001", outcome: "PASSED", evidence: "Focused test passes." }],
    };
    expect(ingestValidatedReviewEvidence(request(store, validated(receipt as never)))).toMatchObject({ kind: "persisted", gate: { gateState: "PENDING" } });
    const replan = buildValidReplanPlan({ artifactId: "replan-lifecycle", scope, manifestReference });
    expect(ingestValidatedReviewEvidence(request(store, validated(replan)))).toMatchObject({ kind: "persisted", gate: { gateState: "PENDING" } });

    // The following direct-validator control covers the debt-observation
    // pair; this lifecycle chain focuses on the manifest/response/receipt/
    // replan references it constructs itself.
    expect(store.calls.map((call) => call.artifactKind)).toEqual(["review_manifest", "remediation_response", "verification_receipt", "replan_plan"]);
  });

  it("accepts direct validator outputs for every V1 artifact kind through the public service", () => {
    const store = new RecordingStore();
    const catalogResult = loadStrictCatalogForReview(process.cwd());
    if ("valid" in catalogResult && catalogResult.valid === false) throw new Error(catalogResult.message);
    const catalog = catalogResult as StrictActiveRuleCatalog;
    const snapshot = resolveStrictActiveRule(catalog, "secret-safe-governance-artifacts");
    if (!snapshot) throw new Error("Required active rule is unavailable.");
    const finding = { ...buildValidFinding(), authority: { ...buildValidFinding().authority, snapshot }, exhaustivenessDecision: "replan_required" as const };
    const rawManifest = buildValidManifest({ artifactId: "manifest-direct-validator", scope, result: "NEEDS_CHANGES", ruleSnapshots: [snapshot], findings: [finding] });
    const manifestResult = validateReviewContractArtifact(JSON.stringify(rawManifest), { catalog, featurePath: featureRootPath, expectedManifestScope: scope });
    expect(manifestResult).toMatchObject({ valid: true });
    if (!manifestResult.valid) throw new Error(manifestResult.message);
    const manifest = manifestResult.artifact as ReviewManifest;
    const persistedManifest = ingestValidatedReviewEvidence(request(store, manifestResult));
    expect(persistedManifest).toMatchObject({ kind: "persisted", gate: { gateState: "REJECTED" } });
    const manifestHash = (persistedManifest as Extract<typeof persistedManifest, { kind: "persisted" }>).contentHash;
    const manifestReference = { artifactKind: "review_manifest" as const, artifactId: manifest.artifactId, contentHash: manifestHash, relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${manifestHash}.json` };
    const manifestContext = { manifest, reference: manifestReference, scope };

    const rawResponse = buildValidRemediationResponse({ artifactId: "response-direct-validator", scope, manifestReference });
    const responseResult = validateReviewContractArtifact(JSON.stringify(rawResponse), { featurePath: featureRootPath, manifestContext });
    expect(responseResult).toMatchObject({ valid: true });
    if (!responseResult.valid) throw new Error(responseResult.message);
    const response = responseResult.artifact as RemediationResponse;
    const persistedResponse = ingestValidatedReviewEvidence(request(store, responseResult));
    expect(persistedResponse).toMatchObject({ kind: "persisted", gate: { gateState: "PENDING" } });
    const responseHash = (persistedResponse as Extract<typeof persistedResponse, { kind: "persisted" }>).contentHash;
    const responseReference = { artifactKind: "remediation_response" as const, artifactId: response.artifactId, contentHash: responseHash, relativePath: `${featureRootPath}/code-reviews/artifacts/remediation_response/${responseHash}.json` };
    const responseContext = { response, reference: responseReference, scope };

    const rawReceipt = buildValidVerificationReceipt({ artifactId: "receipt-direct-validator", scope, manifestReference, responseReference });
    const receiptResult = validateReviewContractArtifact(JSON.stringify(rawReceipt), { featurePath: featureRootPath, manifestContext, responseContext });
    expect(receiptResult).toMatchObject({ valid: true });
    expect(ingestValidatedReviewEvidence(request(store, receiptResult))).toMatchObject({ kind: "persisted", gate: { gateState: "PENDING" } });

    const rawReplan = buildValidReplanPlan({ artifactId: "replan-direct-validator", scope, manifestReference });
    const replanResult = validateReviewContractArtifact(JSON.stringify(rawReplan), { featurePath: featureRootPath, manifestContext });
    expect(replanResult).toMatchObject({ valid: true });
    expect(ingestValidatedReviewEvidence(request(store, replanResult))).toMatchObject({ kind: "persisted", gate: { gateState: "PENDING" } });

    const debtFindingBase = buildValidFinding();
    const { rootCause: _rootCause, scopeExpansionRationale: _scopeExpansionRationale, remediationItems: _remediationItems, testMatrix: _testMatrix, exhaustivenessDecision: _exhaustivenessDecision, compatibilityDecision: _compatibilityDecision, compatibilityApprovalSource: _compatibilityApprovalSource, compatibilityJustification: _compatibilityJustification, ...debtFindingFields } = debtFindingBase;
    const debtFinding = { ...debtFindingFields, findingId: "finding-debt-direct", disposition: "ARCHITECTURE_DEBT" as const, severity: "note" as const, authority: { ...debtFindingBase.authority, snapshot }, debtImpact: "untouched_non_blocking" as const };
    const rawDebtManifest = buildValidManifest({ artifactId: "manifest-debt-direct-validator", scope, result: "APPROVED", ruleSnapshots: [snapshot], findings: [debtFinding] });
    const debtManifestResult = validateReviewContractArtifact(JSON.stringify(rawDebtManifest), { catalog, featurePath: featureRootPath, expectedManifestScope: scope });
    if (!debtManifestResult.valid) throw new Error(debtManifestResult.message);
    const debtManifest = debtManifestResult.artifact as ReviewManifest;
    const persistedDebtManifest = ingestValidatedReviewEvidence(request(store, debtManifestResult));
    const debtManifestHash = (persistedDebtManifest as Extract<typeof persistedDebtManifest, { kind: "persisted" }>).contentHash;
    const debtReference = { artifactKind: "review_manifest" as const, artifactId: debtManifest.artifactId, contentHash: debtManifestHash, relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${debtManifestHash}.json` };
    const rawDebt = buildValidDebtObservation({ artifactId: "debt-direct-validator", scope, manifestReference: debtReference, findingId: "finding-debt-direct", authority: { ...debtFinding.authority }, historicalSurface: [debtFinding.surface.affected[0]!] });
    const debtResult = validateReviewContractArtifact(JSON.stringify(rawDebt), { catalog, featurePath: featureRootPath, manifestContext: { manifest: debtManifest, reference: debtReference, scope } });
    expect(debtResult).toMatchObject({ valid: true });
    expect(ingestValidatedReviewEvidence(request(store, debtResult))).toMatchObject({ kind: "persisted_non_authoritative" });
    expect(store.calls).toHaveLength(6);
  });

  it("refuses fabricated, cloned, and mutated validator successes before lookup or persistence", () => {
    const priorGate: StoredReviewGateDecision = {
      gateDecisionId: 1, projectId: scope.projectId, featureId: scope.featureId, phaseNumber: scope.phaseNumber,
      reviewGateId: scope.reviewGateId, triggerArtifactHash: "b".repeat(64), basisManifestHash: "b".repeat(64),
      cycleId: "cycle-prior", gateState: "APPROVED", reasonCode: "approved_terminal_review", evidenceHashesJson: "[]", decidedAt: ingestedAt,
    };
    const expectUntrustedRefusal = (validationResult: ReviewContractIntegrationResult) => {
      const store = new RecordingStore();
      store.currentGate = priorGate;
      const result = ingestValidatedReviewEvidence(request(store, validationResult));
      expect(result).toMatchObject({ kind: "refusal", code: "invalid_input" });
      expect(store.calls).toHaveLength(0);
      expect(store.currentGate).toEqual(priorGate);
    };

    const direct = validated(approvedManifest());
    expect(direct).toMatchObject({ valid: true });
    if (!direct.valid) throw new Error("Direct validator positive control must succeed.");
    expectUntrustedRefusal({ valid: true, artifact: direct.artifact, projection: direct.projection });
    expectUntrustedRefusal({ ...direct });
    expectUntrustedRefusal(JSON.parse(JSON.stringify(direct)) as ReviewContractIntegrationResult);

    const artifactMutation = validated(approvedManifest());
    if (!artifactMutation.valid) throw new Error("Direct validator positive control must succeed.");
    (artifactMutation.artifact as { artifactId: string }).artifactId = "manifest-mutated-artifact";
    expectUntrustedRefusal(artifactMutation);

    const projectionMutation = validated(approvedManifest());
    if (!projectionMutation.valid) throw new Error("Direct validator positive control must succeed.");
    (projectionMutation.projection as { artifactId: string }).artifactId = "manifest-mutated-projection";
    expectUntrustedRefusal(projectionMutation);

    const matchingMutation = validated(approvedManifest());
    if (!matchingMutation.valid) throw new Error("Direct validator positive control must succeed.");
    (matchingMutation.artifact as { artifactId: string }).artifactId = "manifest-mutated-matching";
    const mutatedHash = computeReviewArtifactHash(matchingMutation.artifact);
    Object.assign(matchingMutation.projection as object, {
      artifactId: matchingMutation.artifact.artifactId,
      contentHash: mutatedHash,
    });
    expectUntrustedRefusal(matchingMutation);

    const upstreamInvalid = buildValidManifest({ artifactId: "manifest-upstream-invalid", scope, result: "APPROVED" });
    expectUntrustedRefusal({
      valid: true,
      artifact: upstreamInvalid,
      projection: {
        artifactKind: upstreamInvalid.artifactKind,
        artifactId: upstreamInvalid.artifactId,
        schemaVersion: 1,
        contentHash: computeReviewArtifactHash(upstreamInvalid),
        scope: upstreamInvalid.scope,
      },
    });
  });

  it("refuses duplicate response identities and incomplete replans before a store call", () => {
    const store = new RecordingStore();
    const manifest = buildValidManifest({ artifactId: "manifest-negative-lifecycle", scope, result: "NEEDS_CHANGES" });
    const manifestResult = ingestValidatedReviewEvidence(request(store, validated(manifest)));
    const manifestHash = (manifestResult as Extract<typeof manifestResult, { kind: "persisted" }>).contentHash;
    const manifestReference = { artifactKind: "review_manifest" as const, artifactId: manifest.artifactId, contentHash: manifestHash, relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${manifestHash}.json` };
    const validResponse = buildValidRemediationResponse({ artifactId: "response-duplicate-negative", scope, manifestReference });
    const duplicateResponse = { ...validResponse, findingResponses: [validResponse.findingResponses[0]!, validResponse.findingResponses[0]!] };
    const incompleteReplan = { schemaVersion: 1, artifactKind: "replan_plan", artifactId: "replan-incomplete-negative", scope, manifestReference };
    const callsBefore = store.calls.length;

    for (const artifact of [duplicateResponse, incompleteReplan]) {
      const result = ingestValidatedReviewEvidence(request(store, validated(artifact)));
      expect(result).toMatchObject({ kind: "refusal", code: "invalid_input" });
      expect(store.calls).toHaveLength(callsBefore);
    }
  });

  it("refuses malformed, partial, duplicate, and contradictory non-manifest evidence before persistence", () => {
    const store = new RecordingStore();
    const basis = buildValidManifest({ artifactId: "manifest-nonmanifest-negative", scope, result: "NEEDS_CHANGES" });
    const basisResult = ingestValidatedReviewEvidence(request(store, validated(basis)));
    const basisHash = (basisResult as Extract<typeof basisResult, { kind: "persisted" }>).contentHash;
    const basisReference = { artifactKind: "review_manifest" as const, artifactId: basis.artifactId, contentHash: basisHash, relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${basisHash}.json` };
    const response = buildValidRemediationResponse({ artifactId: "response-nonmanifest-negative", scope, manifestReference: basisReference });
    const responseHash = computeReviewArtifactHash(response);
    const responseReference = { artifactKind: "remediation_response" as const, artifactId: response.artifactId, contentHash: responseHash, relativePath: `${featureRootPath}/code-reviews/artifacts/remediation_response/${responseHash}.json` };
    const receipt = buildValidVerificationReceipt({ artifactId: "receipt-nonmanifest-negative", scope, manifestReference: basisReference, responseReference });
    const replan = buildValidReplanPlan({ artifactId: "replan-nonmanifest-negative", scope, manifestReference: basisReference });
    const callsBefore = store.calls.length;
    const malformedArtifacts = [
      { ...response, manifestReference: undefined },
      { ...response, findingResponses: [{ findingId: "finding-001", items: [{ ...response.findingResponses[0]!.items[0]!, remediationItemId: "foreign-item" }] }] },
      { ...receipt, responseReference: undefined },
      { ...receipt, itemReceipts: [receipt.itemReceipts[0]!, receipt.itemReceipts[0]!] },
      { ...receipt, testReceipts: [] },
      { ...replan, findingIds: [] },
      { ...replan, remediationItems: [{ ...replan.remediationItems[0]!, remediationItemId: "duplicate-plan" }, { ...replan.remediationItems[0]!, remediationItemId: "duplicate-plan" }] },
      { schemaVersion: 1, artifactKind: "debt_observation", artifactId: "debt-incomplete-negative", scope, manifestReference: basisReference },
    ];
    for (const artifact of malformedArtifacts) {
      const result = ingestValidatedReviewEvidence(request(store, validated(artifact)));
      expect(result).toMatchObject({ kind: "refusal", code: "invalid_input" });
      expect(store.calls).toHaveLength(callsBefore);
    }
  });

  it("requires the exact immutable NEEDS_CHANGES lifecycle before a successor can approve", () => {
    const store = new RecordingStore();
    const predecessor = buildValidManifest({ artifactId: "manifest-required-predecessor", scope, result: "NEEDS_CHANGES" });
    const predecessorResult = ingestValidatedReviewEvidence(request(store, validated(predecessor)));
    const predecessorHash = (predecessorResult as Extract<typeof predecessorResult, { kind: "persisted" }>).contentHash;
    const manifestReference = { artifactKind: "review_manifest" as const, artifactId: predecessor.artifactId, contentHash: predecessorHash, relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${predecessorHash}.json` };
    const response = { schemaVersion: 1 as const, artifactKind: "remediation_response" as const, artifactId: "response-required-predecessor", scope, manifestReference, findingResponses: [{ findingId: "finding-001", items: [{ remediationItemId: "fix-001", decision: "APPLIED" as const, changedSurfaceIds: ["affected-1"], rationale: "Applied bounded remediation." }] }] };
    const responseResult = ingestValidatedReviewEvidence(request(store, validated(response as never)));
    const responseHash = (responseResult as Extract<typeof responseResult, { kind: "persisted" }>).contentHash;
    const receipt = { schemaVersion: 1 as const, artifactKind: "verification_receipt" as const, artifactId: "receipt-required-predecessor", scope, manifestReference, responseReference: { artifactKind: "remediation_response" as const, artifactId: response.artifactId, contentHash: responseHash, relativePath: `${featureRootPath}/code-reviews/artifacts/remediation_response/${responseHash}.json` }, itemReceipts: [{ findingId: "finding-001", remediationItemId: "fix-001", outcome: "VERIFIED", evidence: "Focused test passes." }], testReceipts: [{ findingId: "finding-001", testId: "test-001", outcome: "PASSED", evidence: "Focused test passes." }] };
    expect(ingestValidatedReviewEvidence(request(store, validated(receipt as never)))).toMatchObject({ kind: "persisted", gate: { gateState: "PENDING" } });
    const successor = buildValidManifest({ artifactId: "manifest-approved-successor", scope, result: "APPROVED", findings: [{ ...buildValidFinding(), disposition: "OBSERVATION", severity: "note" }] });
    const successorWithLineage = { ...successor, lineage: { predecessors: [manifestReference] } };

    const result = ingestValidatedReviewEvidence(request(store, validated(successorWithLineage)));

    expect(result).toMatchObject({ kind: "persisted", gate: { gateState: "APPROVED", reasonCode: "approved_terminal_review" } });
    expect(store.calls).toHaveLength(4);
  });

  it("persists an approved successor with incomplete remediation evidence as a coherent pending cycle", () => {
    const store = new RecordingStore();
    const predecessor = buildValidManifest({ artifactId: "manifest-incomplete-lifecycle-basis", scope, result: "NEEDS_CHANGES" });
    const predecessorResult = ingestValidatedReviewEvidence(request(store, validated(predecessor)));
    if (predecessorResult.kind !== "persisted") throw new Error("Predecessor control must persist.");
    const manifestReference = {
      artifactKind: "review_manifest" as const,
      artifactId: predecessor.artifactId,
      contentHash: predecessorResult.contentHash,
      relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${predecessorResult.contentHash}.json`,
    };
    const successor = buildValidManifest({
      artifactId: "manifest-incomplete-lifecycle-successor",
      scope,
      result: "APPROVED",
      findings: [{ ...buildValidFinding(), disposition: "OBSERVATION", severity: "note" }],
      lineage: { predecessors: [manifestReference] },
    });

    const result = ingestValidatedReviewEvidence(request(store, validated(successor)));

    expect(result).toMatchObject({
      kind: "persisted",
      gate: { gateState: "PENDING", reasonCode: "terminal_remediation_required" },
    });
    expect(store.calls.at(-1)?.cycle).toMatchObject({ cycleState: "OPEN" });
  });

  it("renders an approved successor with incomplete remediation evidence as pending rather than refusing the persisted projection", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "review-pending-successor-presentation-"));
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const predecessor = hydrateActiveRuleSnapshots(buildValidManifest({
        artifactId: "manifest-render-pending-basis",
        scope,
        result: "NEEDS_CHANGES",
      }));
      const predecessorValidation = validateReviewContractArtifact(JSON.stringify(predecessor), {
        projectRoot,
        featurePath: featureRootPath,
        expectedManifestScope: scope,
      });
      if (!predecessorValidation.valid) throw new Error("Predecessor control must validate.");
      const predecessorResult = ingestAndRenderAuthoritativeReview({
        projectRoot,
        databasePath,
        featureRootPath,
        expectedScope: scope,
        validationResult: predecessorValidation,
        ingestedAt,
        enforcementEnabled: true,
      });
      if (predecessorResult.kind !== "persisted") throw new Error("Predecessor control must persist.");
      const reference = {
        artifactKind: "review_manifest" as const,
        artifactId: predecessor.artifactId,
        contentHash: predecessorResult.ingestion.contentHash,
        relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${predecessorResult.ingestion.contentHash}.json`,
      };
      const successor = hydrateActiveRuleSnapshots(buildValidManifest({
        artifactId: "manifest-render-pending-successor",
        scope,
        result: "APPROVED",
        findings: [{ ...buildValidFinding(), disposition: "OBSERVATION", severity: "note" }],
        lineage: { predecessors: [reference] },
      }));
      const successorValidation = validateReviewContractArtifact(JSON.stringify(successor), {
        projectRoot,
        featurePath: featureRootPath,
        expectedManifestScope: scope,
      });
      if (!successorValidation.valid) throw new Error("Successor control must validate.");

      const result = ingestAndRenderAuthoritativeReview({
        projectRoot,
        databasePath,
        featureRootPath,
        expectedScope: scope,
        validationResult: successorValidation,
        ingestedAt,
        enforcementEnabled: true,
      });

      expect(result).toMatchObject({
        kind: "persisted",
        ingestion: { gate: { gateState: "PENDING", reasonCode: "terminal_remediation_required" } },
        readModel: { cycleState: "OPEN" },
      });
      expect(readAuthoritativeReviewRerunLineageContext({
        projectRoot,
        databasePath,
        expectedScope: scope,
      })).toEqual({
        kind: "required",
        predecessor: reference,
        findings: [{ findingId: "finding-001", disposition: "IN_SCOPE_BLOCKER" }],
      });
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("rejects every wrong persisted manifest or response reference before the store call", () => {
    const store = new RecordingStore();
    const manifest = buildValidManifest({ artifactId: "manifest-reference-basis", scope, result: "NEEDS_CHANGES" });
    const manifestResult = ingestValidatedReviewEvidence(request(store, validated(manifest)));
    const manifestHash = (manifestResult as Extract<typeof manifestResult, { kind: "persisted" }>).contentHash;
    const manifestReference = {
      artifactKind: "review_manifest" as const, artifactId: manifest.artifactId, contentHash: manifestHash,
      relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${manifestHash}.json`,
    };
    const response = {
      schemaVersion: 1 as const, artifactKind: "remediation_response" as const, artifactId: "response-reference-basis", scope, manifestReference,
      findingResponses: [{ findingId: "finding-001", items: [{ remediationItemId: "fix-001", decision: "APPLIED" as const, changedSurfaceIds: ["affected-1"], rationale: "Applied bounded remediation." }] }],
    };
    const responseResult = ingestValidatedReviewEvidence(request(store, validated(response as never)));
    const responseHash = (responseResult as Extract<typeof responseResult, { kind: "persisted" }>).contentHash;
    const responseReference = { artifactKind: "remediation_response" as const, artifactId: response.artifactId, contentHash: responseHash, relativePath: `${featureRootPath}/code-reviews/artifacts/remediation_response/${responseHash}.json` };
    const receipt = {
      schemaVersion: 1 as const, artifactKind: "verification_receipt" as const, artifactId: "receipt-reference-control", scope, manifestReference, responseReference,
      itemReceipts: [{ findingId: "finding-001", remediationItemId: "fix-001", outcome: "VERIFIED", evidence: "Focused test passes." }],
      testReceipts: [{ findingId: "finding-001", testId: "test-001", outcome: "PASSED", evidence: "Focused test passes." }],
    };
    const malformedReferences = [
      { ...manifestReference, artifactKind: "replan_plan" },
      { ...manifestReference, artifactId: "foreign-manifest" },
      { ...manifestReference, relativePath: "MemoryBank/foreign.json" },
      { ...manifestReference, contentHash: "c".repeat(64) },
    ];
    for (const badReference of malformedReferences) {
      const priorCalls = store.calls.length;
      const result = ingestValidatedReviewEvidence(request(store, validated({ ...response, manifestReference: badReference } as never)));
      expect(result).toMatchObject({ kind: "refusal", code: "invalid_input" });
      expect(store.calls).toHaveLength(priorCalls);
    }
    for (const badResponseReference of malformedReferences.map((reference) => ({ ...reference, artifactKind: "remediation_response" as const }))) {
      const priorCalls = store.calls.length;
      const result = ingestValidatedReviewEvidence(request(store, validated({ ...receipt, responseReference: badResponseReference } as never)));
      expect(result).toMatchObject({ kind: "refusal", code: "invalid_input" });
      expect(store.calls).toHaveLength(priorCalls);
    }
    expect(ingestValidatedReviewEvidence(request(store, validated(receipt as never)))).toMatchObject({ kind: "persisted", gate: { gateState: "PENDING" } });
  });

  it("enforces disposition-specific authority at the public ingress boundary", () => {
    const catalog = trustedCatalog();
    const snapshot = resolveStrictActiveRule(catalog, "secret-safe-governance-artifacts");
    if (!snapshot) throw new Error("Required active rule is unavailable.");
    const base = buildValidFinding();
    const { rootCause: _rootCause, scopeExpansionRationale: _scopeExpansionRationale, remediationItems: _remediationItems, testMatrix: _testMatrix, exhaustivenessDecision: _exhaustivenessDecision, compatibilityDecision: _compatibilityDecision, compatibilityApprovalSource: _compatibilityApprovalSource, compatibilityJustification: _compatibilityJustification, ...debtFields } = base;
    const activeDebt = buildValidManifest({
      artifactId: "manifest-active-rule-debt",
      scope,
      result: "APPROVED",
      ruleSnapshots: [snapshot],
      findings: [{ ...debtFields, disposition: "ARCHITECTURE_DEBT", severity: "note", authority: { ...base.authority, snapshot }, debtImpact: "untouched_non_blocking" }],
    });
    const activeDebtResult = validateReviewContractArtifact(JSON.stringify(activeDebt), { catalog, featurePath: featureRootPath, expectedManifestScope: scope });
    expect(activeDebtResult).toMatchObject({ valid: true });
    const activeStore = new RecordingStore();
    expect(ingestValidatedReviewEvidence(request(activeStore, activeDebtResult))).toMatchObject({ kind: "persisted" });
    expect(activeStore.calls).toHaveLength(1);

    const acceptanceCriterionObservation = buildValidManifest({
      artifactId: "manifest-ac-observation",
      scope,
      result: "APPROVED",
      findings: [{
        ...buildValidFinding(),
        disposition: "OBSERVATION",
        severity: "note",
        claimType: "feature_correctness",
        authority: { kind: "acceptance_criterion", reference: "ac:feat-065:criterion-001", source: { relativePath: "FeatureDescription.md", section: "Acceptance Criteria" } },
      }],
    });
    const observationStore = new RecordingStore();
    expect(ingestValidatedReviewEvidence(request(observationStore, validated(acceptanceCriterionObservation)))).toMatchObject({ kind: "persisted" });
    expect(observationStore.calls[0]?.findings?.[0]).toMatchObject({ acSourcePath: "FeatureDescription.md", acSection: "Acceptance Criteria" });

    const authorityFailures: readonly unknown[] = [undefined, null, "authority", [], {}, { kind: "acceptance_criterion", reference: "ac:feat-065:criterion-001", source: { relativePath: "FeatureDescription.md", section: "Acceptance Criteria" } }];
    for (const disposition of ["IN_SCOPE_BLOCKER", "SCOPE_EXPANSION", "ARCHITECTURE_DEBT"] as const) {
      const invalidAuthorities = disposition === "ARCHITECTURE_DEBT" ? authorityFailures : authorityFailures.slice(0, 5);
      for (const authority of invalidAuthorities) {
        const store = new RecordingStore();
        const manifest = buildValidManifest({
          artifactId: `manifest-${disposition.toLowerCase()}-${authority === undefined ? "missing" : "invalid"}`,
          scope,
          result: "APPROVED",
          findings: [{ ...buildValidFinding(), disposition, severity: "required", authority } as never],
        });
        const result = ingestValidatedReviewEvidence(request(store, validated(manifest)));
        expect(result).toMatchObject({ kind: "refusal", code: "invalid_input" });
        expect(store.calls).toHaveLength(0);
      }
    }
    for (const authority of authorityFailures.slice(1, 5)) {
      const store = new RecordingStore();
      const manifest = buildValidManifest({
        artifactId: "manifest-observation-malformed-authority",
        scope,
        result: "APPROVED",
        findings: [{ ...buildValidFinding(), disposition: "OBSERVATION", severity: "note", authority } as never],
      });
      const result = ingestValidatedReviewEvidence(request(store, validated(manifest)));
      expect(result).toMatchObject({ kind: "refusal", code: "invalid_input" });
      expect(store.calls).toHaveLength(0);
    }

    const acceptanceCriterionDebt = {
      ...activeDebt,
      artifactId: "manifest-ac-debt",
      findings: [{
        ...activeDebt.findings[0]!,
        authority: { kind: "acceptance_criterion", reference: "ac:feat-065:criterion-001", source: { relativePath: "FeatureDescription.md", section: "Acceptance Criteria" } },
      }],
    };
    const rejectedStore = new RecordingStore();
    const result = ingestValidatedReviewEvidence(request(rejectedStore, validated(acceptanceCriterionDebt as never)));
    expect(result).toMatchObject({ kind: "refusal", code: "invalid_input" });
    expect(rejectedStore.calls).toHaveLength(0);
  });

  it("F1/F4 real-store ingress uses scope-bound identities and leaves an approved gate unchanged for debt", () => {
    const { store, cleanup } = createSqliteStore();
    try {
      const secondScope = { ...scope, phaseNumber: 4 } as const;
      const source = readFileSync(new URL("../src/review-ingestion-service.ts", import.meta.url), "utf8");
      expect(source).toContain("function reviewRunId(contentHash: string)");
      expect(source).toContain("function lifecycleCycleId(contentHash: string)");
      expect(source).toContain("projectId: scope.projectId");
      expect(source).not.toContain("review-run-${manifest.artifactId}");
      expect(source).not.toContain("cycle-${manifest.artifactId}");
      const first = buildValidManifest({ artifactId: "manifest-shared-id", scope, result: "APPROVED", findings: [{ ...buildValidFinding(), findingId: "finding-shared", disposition: "OBSERVATION", severity: "note" }] });
      const second = buildValidManifest({ artifactId: "manifest-shared-id", scope: secondScope, result: "APPROVED", findings: [{ ...buildValidFinding(), findingId: "finding-shared", disposition: "OBSERVATION", severity: "note" }] });
      const firstResult = ingestValidatedReviewEvidence(request(store, validated(first)));
      const secondResult = ingestValidatedReviewEvidence(request(store, validated(second), secondScope));
      if (firstResult.kind !== "persisted" || secondResult.kind !== "persisted") throw new Error(`Real-store controls must persist: ${JSON.stringify({ firstResult, secondResult })}`);

      const firstRun = store.getReviewRunByManifestHash(firstResult.contentHash)!;
      const secondRun = store.getReviewRunByManifestHash(secondResult.contentHash)!;
      const firstObservation = store.listFindingObservationsByRun(firstRun.reviewRunId)[0]!;
      const secondObservation = store.listFindingObservationsByRun(secondRun.reviewRunId)[0]!;
      const firstCycles = store.listRemediationCyclesByScope(scope);
      const secondCycles = store.listRemediationCyclesByScope(secondScope);
      expect(firstRun.reviewRunId).toBe(`review-run-${firstResult.contentHash}`);
      expect(secondRun.reviewRunId).toBe(`review-run-${secondResult.contentHash}`);
      expect(firstObservation.observationId).toBe(`observation-${computeReviewArtifactHash({ ...scope, contentHash: firstResult.contentHash, artifactId: first.artifactId, findingId: "finding-shared" })}`);
      expect(new Set([firstObservation.observationId, secondObservation.observationId, firstRun.reviewRunId, secondRun.reviewRunId, firstCycles[0]!.cycleId, secondCycles[0]!.cycleId]).size).toBe(6);

      const debtFindingBase = buildValidFinding();
      const snapshot = resolveStrictActiveRule(trustedCatalog(), "secret-safe-governance-artifacts")!;
      const { rootCause: _rootCause, scopeExpansionRationale: _scopeExpansionRationale, remediationItems: _remediationItems, testMatrix: _testMatrix, exhaustivenessDecision: _exhaustivenessDecision, compatibilityDecision: _compatibilityDecision, compatibilityApprovalSource: _compatibilityApprovalSource, compatibilityJustification: _compatibilityJustification, ...debtFindingFields } = debtFindingBase;
      const debtManifest = buildValidManifest({ artifactId: "manifest-debt-neutral", scope, result: "APPROVED", ruleSnapshots: [snapshot], findings: [{ ...debtFindingFields, findingId: "finding-debt-neutral", disposition: "ARCHITECTURE_DEBT", severity: "note", authority: { ...debtFindingBase.authority, snapshot }, debtImpact: "untouched_non_blocking" }] });
      const debtManifestResult = ingestValidatedReviewEvidence(request(store, validated(debtManifest)));
      if (debtManifestResult.kind !== "persisted") throw new Error("Debt basis must persist.");
      const debtReference = { artifactKind: "review_manifest" as const, artifactId: debtManifest.artifactId, contentHash: debtManifestResult.contentHash, relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${debtManifestResult.contentHash}.json` };
      const priorGate = store.getCurrentAuthoritativeReviewGate(scope);
      const debt = buildValidDebtObservation({ artifactId: "debt-neutral", scope, manifestReference: debtReference, findingId: "finding-debt-neutral", authority: { ...debtManifest.findings[0]!.authority! }, historicalSurface: [debtManifest.findings[0]!.surface.affected[0]!] });
      const debtResult = ingestValidatedReviewEvidence(request(store, validated(debt)));
      expect(debtResult).toMatchObject({ kind: "persisted_non_authoritative" });
      expect(store.getCurrentAuthoritativeReviewGate(scope)).toEqual(priorGate);
      expect(store.listGateDecisions(scope)).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("F2 real-store lifecycle appends content-bound cycles without reinserting the basis", () => {
    const { store, cleanup } = createSqliteStore();
    try {
      const basis = buildValidManifest({ artifactId: "manifest-cycle-chain", scope, result: "NEEDS_CHANGES" });
      const basisResult = ingestValidatedReviewEvidence(request(store, validated(basis)));
      if (basisResult.kind !== "persisted") throw new Error(`Basis control must persist: ${JSON.stringify(basisResult)}`);
      expect(store.getCurrentAuthoritativeReviewGate(scope)?.gateState).toBe("REJECTED");
      const manifestReference = { artifactKind: "review_manifest" as const, artifactId: basis.artifactId, contentHash: basisResult.contentHash, relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${basisResult.contentHash}.json` };
      const response = buildValidRemediationResponse({ artifactId: "response-cycle-chain", scope, manifestReference });
      const responseValidation = validated(response);
      const responseResult = ingestValidatedReviewEvidence(request(store, responseValidation));
      if (responseResult.kind !== "persisted") throw new Error("Response control must persist.");
      const gatesBeforeDuplicate = store.listGateDecisions(scope);
      expect(ingestValidatedReviewEvidence(request(store, responseValidation))).toMatchObject({ kind: "refusal", code: "duplicate_artifact" });
      expect(store.listArtifactsByScope(scope)).toHaveLength(2);
      expect(store.listGateDecisions(scope)).toEqual(gatesBeforeDuplicate);
      expect(store.getCurrentAuthoritativeReviewGate(scope)?.gateState).toBe("PENDING");
      const responseReference = { artifactKind: "remediation_response" as const, artifactId: response.artifactId, contentHash: responseResult.contentHash, relativePath: `${featureRootPath}/code-reviews/artifacts/remediation_response/${responseResult.contentHash}.json` };
      const receipt = buildValidVerificationReceipt({ artifactId: "receipt-cycle-chain", scope, manifestReference, responseReference });
      const receiptResult = ingestValidatedReviewEvidence(request(store, validated(receipt)));
      expect(receiptResult).toMatchObject({ kind: "persisted", gate: { gateState: "PENDING" } });
      const successor = buildValidManifest({ artifactId: "successor-cycle-chain", scope, result: "APPROVED", findings: [{ ...buildValidFinding(), disposition: "OBSERVATION", severity: "note" }], lineage: { predecessors: [manifestReference] } });
      const successorResult = ingestValidatedReviewEvidence(request(store, validated(successor)));
      if (successorResult.kind !== "persisted") throw new Error(`Successor must persist: ${JSON.stringify(successorResult)}`);
      expect(successorResult).toMatchObject({ gate: { gateState: "APPROVED" } });
      const cycles = store.listRemediationCyclesByScope(scope);
      expect(new Set(cycles.map((cycle) => cycle.cycleId))).toEqual(new Set([
        `cycle-${basisResult.contentHash}`,
        `cycle-${responseResult.contentHash}`,
        `cycle-${successorResult.contentHash}`,
      ]));
      expect(cycles.find((cycle) => cycle.cycleId === `cycle-${responseResult.contentHash}`)?.predecessorCycleId).toBe(`cycle-${basisResult.contentHash}`);
      expect(store.getCurrentAuthoritativeReviewGate(scope)?.gateState).toBe("APPROVED");
    } finally {
      cleanup();
    }
  });

  it("F3 sanitizes every store-read failure before ingress", () => {
    const priorGate: StoredReviewGateDecision = {
      gateDecisionId: 1, projectId: scope.projectId, featureId: scope.featureId, phaseNumber: scope.phaseNumber,
      reviewGateId: scope.reviewGateId, triggerArtifactHash: "b".repeat(64), basisManifestHash: "b".repeat(64),
      cycleId: "cycle-prior", gateState: "APPROVED", reasonCode: "approved_terminal_review", evidenceHashesJson: "[]", decidedAt: ingestedAt,
    };
    for (const readFailure of ["list", "get"] as const) {
      const store = new RecordingStore();
      store.currentGate = priorGate;
      store.readFailure = readFailure;
      expect(() => ingestValidatedReviewEvidence(request(store))).not.toThrow();
      expect(ingestValidatedReviewEvidence(request(store))).toMatchObject({ kind: "refusal", code: "persistence_failed", message: "Authoritative review evidence could not be persisted." });
      expect(store.calls).toHaveLength(0);
      expect(store.currentGate).toEqual(priorGate);
    }

    const store = new RecordingStore();
    const basis = buildValidManifest({ artifactId: "manifest-read-failure-basis", scope, result: "NEEDS_CHANGES" });
    const basisResult = ingestValidatedReviewEvidence(request(store, validated(basis)));
    if (basisResult.kind !== "persisted") throw new Error("Basis control must persist.");
    const basisReference = { artifactKind: "review_manifest" as const, artifactId: basis.artifactId, contentHash: basisResult.contentHash, relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${basisResult.contentHash}.json` };
    const response = buildValidRemediationResponse({ artifactId: "response-read-failure", scope, manifestReference: basisReference });
    const callsBefore = store.calls.length;
    store.getCallCount = 0;
    store.throwGetAt = 2;
    expect(ingestValidatedReviewEvidence(request(store, validated(response)))).toMatchObject({ kind: "refusal", code: "persistence_failed", message: "Authoritative review evidence could not be persisted." });
    expect(store.calls).toHaveLength(callsBefore);
  });

  it("maps duplicate and persistence failures to sanitized refusals without replacing the prior gate", () => {
    const store = new RecordingStore();
    const priorGate: StoredReviewGateDecision = {
      gateDecisionId: 1,
      projectId: scope.projectId,
      featureId: scope.featureId,
      phaseNumber: scope.phaseNumber,
      reviewGateId: scope.reviewGateId,
      triggerArtifactHash: "b".repeat(64),
      basisManifestHash: "b".repeat(64),
      cycleId: "cycle-prior",
      gateState: "REJECTED",
      reasonCode: "review_needs_changes",
      evidenceHashesJson: "[]",
      decidedAt: ingestedAt,
    };
    store.currentGate = priorGate;
    store.nextError = new Error("FILE_COLLISION");

    expect(ingestValidatedReviewEvidence(request(store))).toMatchObject({ kind: "refusal", code: "duplicate_artifact" });
    expect(store.currentGate).toEqual(priorGate);

    store.nextError = new Error("PERSISTENCE_FAILED");
    expect(ingestValidatedReviewEvidence(request(store))).toMatchObject({ kind: "refusal", code: "persistence_failed" });
    expect(store.currentGate).toEqual(priorGate);
    expect(store.calls).toHaveLength(2);
  });
});
