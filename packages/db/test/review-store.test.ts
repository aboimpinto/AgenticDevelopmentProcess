// Behavior suite: authoritative review.
/**
 * FEAT-065: ReviewGovernanceSqliteStore Tests
 *
 * Phase 2 — Data Layer. Tests cover migration, transactional ingest,
 * read-back/hash verification, append-only triggers, duplicate handling,
 * rollback, and distinct supersession.
 *
 * Run: pnpm exec vitest run packages/db/test/review-store.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";

import {
  ReviewGovernanceSqliteStore,
  computeSha256Hex,
} from "../src/review-governance-store.js";
import {
  ReviewArtifactFileStore,
  type ReviewArtifactFileOperations,
} from "../src/review-governance/artifact-file-store.js";
import { SafetyKernelSqliteStore } from "../src/safety-kernel-store.js";
import type {
  ReviewIngestInput,
  ReviewStoreArtifactKind,
  ReviewStoreFindingInput,
} from "../src/review-governance-store.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tempDirCounter = 0;

function createTempDbPath(): string {
  tempDirCounter++;
  const dir = resolve(tmpdir(), `feat-065-test-${process.pid}-${tempDirCounter}`);
  return resolve(dir, "hepha-test.sqlite");
}

function currentCatalogSnapshots(): readonly unknown[] {
  const artifact = JSON.parse(makeV1ArtifactJson()) as Record<string, unknown>;
  return artifact.ruleSnapshots as readonly unknown[];
}

function expandedCurrentCatalogSnapshots(count: number): readonly unknown[] {
  const [currentSnapshot] = currentCatalogSnapshots() as readonly Record<string, unknown>[];
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return currentSnapshot;
    return {
      ...currentSnapshot,
      ruleId: `catalog-rule-${index}`,
      title: `Catalog Rule ${index}`,
    };
  });
}

function makeManifestWithFindingCount(artifactId: string, count: number): string {
  const artifact = JSON.parse(makeV1ArtifactJson({ artifactId })) as Record<string, unknown>;
  const [template] = artifact.findings as Record<string, unknown>[];
  artifact.findings = Array.from({ length: count }, (_, index) => ({
    ...JSON.parse(JSON.stringify(template)),
    findingId: `finding-${index + 1}`,
  }));
  return canonicalizeTestJson(artifact);
}

function createStore(): ReviewGovernanceSqliteStore {
  const dbPath = createTempDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  return new ReviewGovernanceSqliteStore(dbPath, { currentActiveRuleSnapshots: currentCatalogSnapshots() });
}

function makeValidFindingInput(overrides?: Partial<ReviewStoreFindingInput>): ReviewStoreFindingInput {
  return {
    findingId: "finding-001",
    disposition: "IN_SCOPE_BLOCKER",
    claimType: "security",
    severity: "blocker",
    defectClass: "secret-exposure",
    summary: "Secret-like content detected in governance artifacts.",
    ruleReference: "rule:secret-safe-governance-artifacts",
    ruleId: "secret-safe-governance-artifacts",
    ruleVersion: "1.0.0",
    ruleHash: "b".repeat(64),
    ...overrides,
  };
}

function canonicalizeTestJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeTestJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeTestJson(record[key])}`).join(",")}}`;
}

function makeV1ArtifactJson(overrides?: {
  artifactKind?: string;
  artifactId?: string;
  projectId?: string;
  featureId?: string;
  phaseNumber?: number;
  reviewGateId?: string;
  schemaVersion?: number;
  manifestResult?: string;
  basisManifestHash?: string;
  basisManifestArtifactId?: string;
  responseHash?: string;
  responseArtifactId?: string;
  lineage?: Record<string, unknown>;
  extraFields?: Record<string, unknown>;
}): string {
  const kind = overrides?.artifactKind ?? "review_manifest";
  const id = overrides?.artifactId ?? "manifest-001";
  const project = overrides?.projectId ?? "hepha";
  const feature = overrides?.featureId ?? "feat-065";
  const phase = overrides?.phaseNumber ?? 2;
  const gate = overrides?.reviewGateId ?? "code-review";
  const sv = overrides?.schemaVersion ?? 1;

  const obj: Record<string, unknown> = {
    schemaVersion: sv,
    artifactKind: kind,
    artifactId: id,
    scope: { projectId: project, featureId: feature, phaseNumber: phase, reviewGateId: gate },
  };

  if (overrides?.lineage) obj.lineage = overrides.lineage;

  if (kind !== "review_manifest" && overrides?.basisManifestHash && overrides?.basisManifestArtifactId) {
    obj.manifestReference = {
      artifactKind: "review_manifest",
      artifactId: overrides.basisManifestArtifactId,
      contentHash: overrides.basisManifestHash,
      relativePath: `MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/code-reviews/artifacts/review_manifest/${overrides.basisManifestHash}.json`,
    };
    if (kind === "remediation_response") obj.findingResponses = [{ findingId: "finding-001", items: [{ remediationItemId: "fix-001", decision: "APPLIED", changedSurfaceIds: ["affected-1"], rationale: "Applied the bounded remediation." }] }];
    if (kind === "verification_receipt") {
      obj.responseReference = {
        artifactKind: "remediation_response",
        artifactId: overrides.responseArtifactId ?? "response-001",
        contentHash: overrides.responseHash ?? "c".repeat(64),
        relativePath: "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/code-reviews/artifacts/remediation_response/" + (overrides.responseHash ?? "c".repeat(64)) + ".json",
      };
      obj.itemReceipts = [];
      obj.testReceipts = [];
    }
    if (kind === "replan_plan") {
      obj.findingIds = ["finding-001"];
      obj.defectClass = "secret-exposure";
      obj.replanReason = "finding_exhaustiveness";
      obj.rootCause = "Bounded root cause.";
      obj.surface = { inspected: [], affected: [], confirmedUnaffected: [] };
      obj.explicitExclusions = [];
      obj.remediationItems = [];
      obj.testMatrix = [];
      obj.verificationPlan = "Run focused tests.";
      obj.closureCriteria = "All checks pass.";
    }
    if (kind === "debt_observation") {
      obj.findingId = "finding-001";
      obj.authority = {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: {
          schemaVersion: 1,
          catalogSchemaVersion: 1,
          ruleId: "secret-safe-governance-artifacts",
          ruleVersion: "1.0.0",
          category: "security",
          scope: "review-governance",
          title: "Secret-Safe Governance Artifacts",
          source: {
            document: "docs/architecture/code-review-remediation-and-architecture-debt-overview.md",
            section: "Secret Safety",
          },
          catalogPath: ".hepha/architecture-rules.yaml",
          catalogSourceHash: "a".repeat(64),
          ruleHash: "b".repeat(64),
        },
      };
      obj.historicalSurface = [];
      obj.evidence = "Historical evidence.";
      obj.riskRationale = "Non-blocking.";
      obj.currentFeatureImpact = "untouched_non_blocking";
    }
  }

  if (kind === "review_manifest") {
    const snapshot = {
      schemaVersion: 1,
      catalogSchemaVersion: 1,
      ruleId: "secret-safe-governance-artifacts",
      ruleVersion: "1.0.0",
      category: "security",
      scope: "review-governance",
      title: "Secret-Safe Governance Artifacts",
      source: {
        document: "docs/architecture/code-review-remediation-and-architecture-debt-overview.md",
        section: "Secret Safety",
      },
      catalogPath: ".hepha/architecture-rules.yaml",
      catalogSourceHash: "a".repeat(64),
      ruleHash: "b".repeat(64),
    };
    obj.result = overrides?.manifestResult ?? "NEEDS_CHANGES";
    obj.ruleSnapshots = [snapshot];
    obj.findings = obj.result === "APPROVED" ? [{
      findingId: "finding-001",
      disposition: "OBSERVATION",
      claimType: "security",
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot,
      },
      defectClass: "secret-exposure",
      severity: "note",
      summary: "No blocking review finding remains.",
      surface: { inspected: [{ surfaceId: "inspected-1", relativePath: "src/lib/core.ts" }], affected: [], confirmedUnaffected: [] },
    }] : [{
      findingId: "finding-001",
      disposition: "IN_SCOPE_BLOCKER",
      claimType: "security",
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot,
      },
      defectClass: "secret-exposure",
      severity: "blocker",
      summary: "Secret-like content detected in governance artifacts.",
      surface: {
        inspected: [{ surfaceId: "inspected-1", relativePath: "src/lib/core.ts" }],
        affected: [{ surfaceId: "affected-1", relativePath: "src/lib/core.ts" }],
        confirmedUnaffected: [{ surfaceId: "unaffected-1", relativePath: "src/lib/utils.ts" }],
      },
      rootCause: "No pre-persistence secret validation.",
      remediationItems: [{
        remediationItemId: "fix-001",
        instruction: "Add secret validation before persistence.",
        targetSurfaceIds: ["affected-1"],
      }],
      testMatrix: [{
        testId: "test-001",
        requirement: "Secret validation rejects known secret patterns.",
        targetSurfaceIds: ["affected-1"],
      }],
      exhaustivenessDecision: "local_only",
      compatibilityDecision: "breaking_change_permitted",
    }];
  }

  // Extra fields deliberately never become part of a valid V1 fixture.
  // Tests that need a different identity vary an allowed field such as
  // artifactId; unknown members are covered by an explicit refusal test.
  void overrides?.extraFields;

  return canonicalizeTestJson(obj);
}

function makeHash(obj: Record<string, unknown>): string {
  return computeSha256Hex(JSON.stringify(obj));
}

function deriveTestFindings(canonicalJson: string, artifactId: string, ingestedAt: string): ReviewStoreFindingInput[] {
  const artifact = JSON.parse(canonicalJson) as Record<string, unknown>;
  if (artifact.artifactKind !== "review_manifest") return [];
  const scope = artifact.scope as Record<string, unknown>;
  const contentHash = computeSha256Hex(canonicalJson);
  return (artifact.findings as Record<string, unknown>[]).map((finding) => {
    const authority = finding.authority as Record<string, unknown> | undefined;
    const snapshot = authority?.snapshot as Record<string, unknown> | undefined;
    const findingId = finding.findingId as string;
    const observationId = `observation-${computeSha256Hex(canonicalizeTestJson({
      projectId: scope.projectId,
      featureId: scope.featureId,
      phaseNumber: scope.phaseNumber,
      reviewGateId: scope.reviewGateId,
      contentHash,
      artifactId,
      findingId,
    }))}`;
    return {
      findingId,
      disposition: finding.disposition as string,
      claimType: finding.claimType as string,
      severity: finding.severity as string,
      defectClass: finding.defectClass as string,
      summary: finding.summary as string,
      ...(authority?.kind === "active_rule" ? {
        ruleReference: authority.reference as string,
        ruleId: snapshot?.ruleId as string,
        ruleVersion: snapshot?.ruleVersion as string,
        ruleHash: snapshot?.ruleHash as string,
      } : authority?.kind === "acceptance_criterion" ? {
        acSourcePath: (authority.source as Record<string, unknown>).relativePath as string,
        acSection: (authority.source as Record<string, unknown>).section as string,
      } : {}),
      observation: {
        observationId,
        findingId,
        surfaceJson: canonicalizeTestJson(finding.surface),
        remediationItemsJson: canonicalizeTestJson(finding.remediationItems ?? []),
        testMatrixJson: canonicalizeTestJson(finding.testMatrix ?? []),
        ...(typeof finding.rootCause === "string" ? { rootCause: finding.rootCause } : {}),
        ...(typeof finding.scopeExpansionRationale === "string" ? { scopeRationale: finding.scopeExpansionRationale } : {}),
        createdAt: ingestedAt,
      },
    };
  });
}

function makeValidIngestInput(overrides?: Partial<ReviewIngestInput>): ReviewIngestInput {
  const now = new Date().toISOString();

  // Determine identity fields from overrides or defaults
  const artifactKind: ReviewStoreArtifactKind = (overrides?.artifactKind ?? "review_manifest") as ReviewStoreArtifactKind;
  const artifactId = overrides?.artifactId ?? "manifest-001";
  const projectId = overrides?.projectId ?? "hepha";
  const featureId = overrides?.featureId ?? "feat-065";
  const phaseNumber = overrides?.phaseNumber ?? 2;
  const reviewGateId = overrides?.reviewGateId ?? "code-review";
  const schemaVersion = overrides?.schemaVersion ?? 1;
  const manifestResult = overrides?.manifestResult ?? "NEEDS_CHANGES";

  // Build V1 artifact JSON matching the identity — this ensures the
  // F1 V1 content validation (added in validateReviewIngestInput) passes.
  const canonicalJson = overrides?.canonicalJson ?? makeV1ArtifactJson({
    artifactKind,
    artifactId,
    projectId,
    featureId,
    phaseNumber,
    reviewGateId,
    schemaVersion,
    manifestResult,
  });
  const contentHash = overrides?.contentHash ?? computeSha256Hex(canonicalJson);

  const featureRootPath = overrides?.featureRootPath ??
    "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha";

  return {
    contentHash,
    artifactId,
    artifactKind,
    schemaVersion,
    canonicalJson,
    projectId,
    featureId,
    phaseNumber,
    reviewGateId,
    featureRootPath,
    artifactRelativePath: overrides?.artifactRelativePath ?? `${featureRootPath}/code-reviews/artifacts/${artifactKind}/${contentHash}.json`,
    sourceMode: "v1_validated_ingress",
    ingestedAt: overrides?.ingestedAt ?? now,
    lineage: overrides?.lineage ?? {},
    reviewRunId: overrides?.reviewRunId ?? "run-001",
    manifestResult,
    findings: overrides?.findings ?? (() => {
      try {
        return deriveTestFindings(canonicalJson, artifactId, overrides?.ingestedAt ?? now);
      } catch {
        // Malformed canonical payloads are intentional public-boundary tests;
        // let ingress produce its required sanitized refusal.
        return [];
      }
    })(),
    cycle: overrides?.cycle,
    gateDecision: overrides?.gateDecision,
    basisManifestHash: overrides?.basisManifestHash,
    remediationItems: overrides?.remediationItems,
    verificationReceipts: overrides?.verificationReceipts,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Migration and Additive Schema
// ---------------------------------------------------------------------------

describe("migration-and-additive-legacy-preservation", () => {
  it("creates all tables and migration ledger on empty database", () => {
    const store = createStore();

    // First ensureSchema called by constructor — verify migration row exists
    const migrationRow = store["database"]
      .prepare("select version, applied_at from hepha_review_schema_migrations where version = 1")
      .get() as { version: number; applied_at: string } | undefined;
    expect(migrationRow).toBeTruthy();
    expect(migrationRow!.version).toBe(1);
    expect(migrationRow!.applied_at).toBeTruthy();

    // Verify every expected table exists
    const tables = store["database"]
      .prepare("select name from sqlite_master where type='table' and name like 'hepha_review_%' order by name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("hepha_review_schema_migrations");
    expect(tableNames).toContain("hepha_review_artifacts");
    expect(tableNames).toContain("hepha_review_artifact_lineage");
    expect(tableNames).toContain("hepha_review_runs");
    expect(tableNames).toContain("hepha_review_findings");
    expect(tableNames).toContain("hepha_review_finding_observations");
    expect(tableNames).toContain("hepha_review_remediation_cycles");
    expect(tableNames).toContain("hepha_review_remediation_items");
    expect(tableNames).toContain("hepha_review_verification_receipts");
    expect(tableNames).toContain("hepha_review_phase_gate_decisions");
    expect(tableNames).toContain("hepha_review_safe_incidents");

    store.close();
  });

  it("is idempotent on second ensureSchema call", () => {
    const store = createStore();
    // Second ensureSchema should not throw and should keep one migration row
    store.ensureSchemaForTest();

    const rows = store["database"]
      .prepare("select count(*) as cnt from hepha_review_schema_migrations")
      .get() as { cnt: number } | undefined;
    expect(rows!.cnt).toBe(3);

    store.close();
  });

  it("migrates a populated pre-V1 database additively without treating legacy Markdown as gate authority", () => {
    const dbPath = createTempDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    const legacyMarkdown = "# Historical review\n\nApproved in an old rendered report.";
    const legacyHash = "a".repeat(64);

    // This is a realistic pre-migration database: it has a populated V0
    // Safety Kernel record whose content is legacy Markdown rather than V1
    // canonical JSON. Seed it only through its public V0 store API.
    const v0Store = new SafetyKernelSqliteStore(dbPath);
    v0Store.persistManifest({
      artifactHash: legacyHash,
      artifactKind: "review_manifest",
      projectId: "hepha",
      cardKey: "FEAT-065",
      canonicalJson: legacyMarkdown,
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    v0Store.close();

    const reviewStore = new ReviewGovernanceSqliteStore(dbPath, { currentActiveRuleSnapshots: currentCatalogSnapshots() });
    const scope = { projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" };
    expect(reviewStore.getCurrentAuthoritativeReviewGate(scope)).toBeNull();
    expect(reviewStore["database"]
      .prepare("select name from sqlite_master where type='table' and name like 'hepha_safety_kernel_%'")
      .all()).not.toHaveLength(0);

    const input = makeValidIngestInput({
      artifactId: "manifest-after-v0-migration",
      reviewRunId: "run-after-v0-migration",
      gateDecision: {
        triggerArtifactHash: "",
        basisManifestHash: "",
        gateState: "APPROVED",
        reasonCode: "approved_terminal_review",
        decidedAt: "2026-07-15T00:00:00.000Z",
      },
    });
    input.gateDecision = {
      ...input.gateDecision!,
      triggerArtifactHash: input.contentHash,
      basisManifestHash: input.contentHash,
      evidenceHashes: [input.contentHash],
    };
    expect(reviewStore.ingestValidatedReviewEvidence(input)).toBe(input.contentHash);
    reviewStore.close();

    // A restart reads only the newly committed V1 rows; it does not parse the
    // retained V0 Markdown to synthesize a gate.
    const reopened = new ReviewGovernanceSqliteStore(dbPath, { currentActiveRuleSnapshots: currentCatalogSnapshots() });
    expect(reopened.getCurrentAuthoritativeReviewGate(scope)).toMatchObject({
      gateState: "APPROVED",
      triggerArtifactHash: input.contentHash,
    });
    expect(reopened.getArtifactByHash(input.contentHash)?.canonicalJson).toBe(input.canonicalJson);
    reopened.close();

    const preservedV0 = new SafetyKernelSqliteStore(dbPath);
    expect(preservedV0.getArtifactByHash(legacyHash)?.canonicalJson).toBe(legacyMarkdown);
    preservedV0.close();
  });

  it("reopens an empty migrated database and reads newly ingested V1 authority", () => {
    const dbPath = createTempDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    const scope = { projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" };
    const firstStore = new ReviewGovernanceSqliteStore(dbPath, { currentActiveRuleSnapshots: currentCatalogSnapshots() });
    expect(firstStore.getCurrentAuthoritativeReviewGate(scope)).toBeNull();

    const input = makeValidIngestInput({
      artifactId: "manifest-empty-db-restart",
      reviewRunId: "run-empty-db-restart",
      gateDecision: {
        triggerArtifactHash: "",
        basisManifestHash: "",
        gateState: "REJECTED",
        reasonCode: "review_needs_changes",
        decidedAt: "2026-07-15T00:00:00.000Z",
      },
    });
    input.gateDecision = {
      ...input.gateDecision!,
      triggerArtifactHash: input.contentHash,
      basisManifestHash: input.contentHash,
      evidenceHashes: [input.contentHash],
    };
    expect(firstStore.ingestValidatedReviewEvidence(input)).toBe(input.contentHash);
    firstStore.close();

    const restartedStore = new ReviewGovernanceSqliteStore(dbPath, { currentActiveRuleSnapshots: currentCatalogSnapshots() });
    expect(restartedStore.getCurrentAuthoritativeReviewGate(scope)).toMatchObject({
      gateState: "REJECTED",
      triggerArtifactHash: input.contentHash,
    });
    expect(restartedStore.listArtifactsByScope(scope)).toHaveLength(1);
    restartedStore.close();
  });

  it("creates append-only triggers for every immutable table", () => {
    const store = createStore();

    const triggers = store["database"]
      .prepare("select name from sqlite_master where type='trigger' and name like 'trg_review_%'")
      .all() as { name: string }[];
    const triggerNames = triggers.map((t) => t.name);

    // Each immutable table should have both no-update and no-delete triggers
    expect(triggerNames).toContain("trg_review_artifacts_no_update");
    expect(triggerNames).toContain("trg_review_artifacts_no_delete");
    expect(triggerNames).toContain("trg_review_lineage_no_update");
    expect(triggerNames).toContain("trg_review_lineage_no_delete");
    expect(triggerNames).toContain("trg_review_runs_no_update");
    expect(triggerNames).toContain("trg_review_runs_no_delete");
    expect(triggerNames).toContain("trg_review_gates_no_update");
    expect(triggerNames).toContain("trg_review_gates_no_delete");

    store.close();
  });
});

// ---------------------------------------------------------------------------
// Validated Aggregate Ingest and Read-Back
// ---------------------------------------------------------------------------

describe("validated-aggregate-ingest-and-read-back", () => {
  it("persists a fully populated manifest aggregate and reads it back", () => {
    const store = createStore();
    const input = makeValidIngestInput({
      manifestResult: "APPROVED",
      reviewRunId: "run-approved-001",
    });

    const hash = store.ingestValidatedReviewEvidence(input);
    expect(hash).toBe(input.contentHash);

    // Read back artifact
    const artifact = store.getArtifactByHash(hash);
    expect(artifact).toBeTruthy();
    expect(artifact!.contentHash).toBe(hash);
    expect(artifact!.canonicalJson).toBe(input.canonicalJson);
    expect(artifact!.projectId).toBe("hepha");
    expect(artifact!.featureId).toBe("feat-065");
    expect(artifact!.phaseNumber).toBe(2);
    expect(artifact!.reviewGateId).toBe("code-review");

    // Read back review run
    const run = store.getReviewRunByManifestHash(hash);
    expect(run).toBeTruthy();
    expect(run!.manifestResult).toBe("APPROVED");

    // Read back findings
    const findings = store.listFindingsByRun(input.reviewRunId);
    expect(findings.length).toBe(1);
    expect(findings[0].findingId).toBe("finding-001");
    expect(findings[0].defectClass).toBe("secret-exposure");

    store.close();
  });

  it("persists artifact with lineage and gate decision", () => {
    const store = createStore();
    const now = new Date().toISOString();

    // First, ingest a predecessor with distinct V1 artifact JSON
    const pre1JsonStr = makeV1ArtifactJson({
      artifactId: "manifest-pred",
      manifestResult: "NEEDS_CHANGES",
      extraFields: { seq: 1 },
    });
    const preContentHash = computeSha256Hex(pre1JsonStr);
    const preInput = makeValidIngestInput({
      contentHash: preContentHash,
      canonicalJson: pre1JsonStr,
      artifactId: "manifest-pred",
      reviewRunId: "run-pred",
      manifestResult: "NEEDS_CHANGES",
    });
    store.ingestValidatedReviewEvidence(preInput);

    // Second distinct predecessor
    const pre2JsonStr = makeV1ArtifactJson({
      artifactId: "manifest-pred-2",
      manifestResult: "NEEDS_CHANGES",
      extraFields: { seq: 2 },
    });
    const pre2ContentHash = computeSha256Hex(pre2JsonStr);
    const pre2Input = makeValidIngestInput({
      contentHash: pre2ContentHash,
      canonicalJson: pre2JsonStr,
      artifactId: "manifest-pred-2",
      reviewRunId: "run-pred-2",
      manifestResult: "NEEDS_CHANGES",
    });
    store.ingestValidatedReviewEvidence(pre2Input);

    // Now ingest successor with distinct V1 artifact JSON + lineage + gate decision
    const succJsonStr = makeV1ArtifactJson({
      artifactId: "manifest-succ",
      manifestResult: "APPROVED",
      lineage: {
        predecessors: [{ artifactKind: "review_manifest", artifactId: "manifest-pred", contentHash: preContentHash, relativePath: `MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/code-reviews/artifacts/review_manifest/${preContentHash}.json` }],
        supersedes: { artifactKind: "review_manifest", artifactId: "manifest-pred-2", contentHash: pre2ContentHash, relativePath: `MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/code-reviews/artifacts/review_manifest/${pre2ContentHash}.json` },
      },
      extraFields: { seq: 3 },
    });
    const succContentHash = computeSha256Hex(succJsonStr);
    const succInput = makeValidIngestInput({
      contentHash: succContentHash,
      canonicalJson: succJsonStr,
      artifactId: "manifest-succ",
      reviewRunId: "run-succ",
      manifestResult: "APPROVED",
      lineage: {
        predecessorHashes: [preContentHash],
        supersedesHash: pre2ContentHash,
      },
      gateDecision: {
        triggerArtifactHash: succContentHash,
        basisManifestHash: succContentHash,
        gateState: "APPROVED",
        reasonCode: "approved_terminal_review",
        evidenceHashes: [succContentHash],
        decidedAt: now,
      },
    });

    const returnedHash = store.ingestValidatedReviewEvidence(succInput);
    expect(returnedHash).toBe(succContentHash);

    // Read back gate
    const gate = store.getCurrentAuthoritativeReviewGate({
      projectId: "hepha",
      featureId: "feat-065",
      phaseNumber: 2,
      reviewGateId: "code-review",
    });
    expect(gate).toBeTruthy();
    expect(gate!.gateState).toBe("APPROVED");
    expect(gate!.reasonCode).toBe("approved_terminal_review");
    expect(gate!.triggerArtifactHash).toBe(succContentHash);

    store.close();
  });

  it("persists findings with observations", () => {
    const store = createStore();
    const now = new Date().toISOString();
    const input = makeValidIngestInput({ ingestedAt: now });

    store.ingestValidatedReviewEvidence(input);

    const findings = store.listFindingsByRun(input.reviewRunId);
    expect(findings.length).toBe(1);

    store.close();
  });
});

// ---------------------------------------------------------------------------
// Rollback on Injected Failures
// ---------------------------------------------------------------------------

describe("rollback-on-every-injected-failure", () => {
  it("rolls back all rows on duplicate primary key collision", () => {
    const store = createStore();
    const input = makeValidIngestInput();

    // First insert succeeds
    store.ingestValidatedReviewEvidence(input);

    // Second insert with same content hash must fail
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow();

    // Verify only one artifact row exists
    const hash = input.contentHash;
    const artifact = store.getArtifactByHash(hash);
    expect(artifact).toBeTruthy();
    expect(artifact!.contentHash).toBe(hash);

    store.close();
  });

  it("rolls back all rows on an invalid hash", () => {
    const store = createStore();
    const input = makeValidIngestInput({ contentHash: "not-a-valid-hash" });

    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");

    // Verify nothing was persisted
    const gate = store.getCurrentAuthoritativeReviewGate({
      projectId: "hepha",
      featureId: "feat-065",
      phaseNumber: 2,
      reviewGateId: "code-review",
    });
    expect(gate).toBeNull();

    store.close();
  });

  it("rolls back all rows on invalid scope input", () => {
    const store = createStore();
    const input = makeValidIngestInput({ projectId: "" });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");

    // Snapshot prior state — should be empty
    const artifacts = store.listArtifactsByScope({
      projectId: "hepha",
      featureId: "feat-065",
      phaseNumber: 2,
      reviewGateId: "code-review",
    });
    expect(artifacts).toHaveLength(0);

    store.close();
  });

  it("rolls back when a read-back verification fails (simulated via foreign key constraint)", () => {
    const store = createStore();

    // Insert with a predecessor hash that does not exist as an artifact
    const input = makeValidIngestInput({
      lineage: {
        predecessorHashes: ["0000000000000000000000000000000000000000000000000000000000000000"],
      },
    });

    // This should fail because the lineage resolver validates the predecessor exists
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow();

    store.close();
  });
});

// ---------------------------------------------------------------------------
// Append-Only Trigger and Distinct Supersession
// ---------------------------------------------------------------------------

describe("append-only-trigger-and-distinct-supersession", () => {
  it("rejects direct UPDATE on artifacts table", () => {
    const store = createStore();
    const input = makeValidIngestInput();
    store.ingestValidatedReviewEvidence(input);

    expect(() => {
      store["database"]
        .prepare("update hepha_review_artifacts set canonical_json = '{}' where content_hash = ?")
        .run(input.contentHash);
    }).toThrow("append-only");

    store.close();
  });

  it("rejects direct DELETE on artifacts table", () => {
    const store = createStore();
    const input = makeValidIngestInput();
    store.ingestValidatedReviewEvidence(input);

    expect(() => {
      store["database"]
        .prepare("delete from hepha_review_artifacts where content_hash = ?")
        .run(input.contentHash);
    }).toThrow("append-only");

    store.close();
  });

  it("rejects UPDATE on phase_gate_decisions", () => {
    const store = createStore();
    const now = new Date().toISOString();
    const inputJson = makeV1ArtifactJson({
      artifactId: "manifest-gate-update-test",
      manifestResult: "NEEDS_CHANGES",
      extraFields: { seq: 99 },
    });
    const inputHash = computeSha256Hex(inputJson);
    const input = makeValidIngestInput({
      contentHash: inputHash,
      canonicalJson: inputJson,
      artifactId: "manifest-gate-update-test",
      reviewRunId: "run-gate-update-test",
      manifestResult: "NEEDS_CHANGES",
      gateDecision: {
        triggerArtifactHash: inputHash,
        basisManifestHash: inputHash,
        gateState: "REJECTED",
        reasonCode: "review_needs_changes",
        decidedAt: now,
      },
    });
    store.ingestValidatedReviewEvidence(input);

    expect(() => {
      store["database"]
        .prepare("update hepha_review_phase_gate_decisions set gate_state = 'APPROVED' where gate_state = 'REJECTED'")
        .run();
    }).toThrow("append-only");

    store.close();
  });

  it("allows distinct second artifact with new content hash to coexist", () => {
    const store = createStore();

    const v1Json = makeV1ArtifactJson({ artifactId: "manifest-v1", extraFields: { v: 1 } });
    const v2Json = makeV1ArtifactJson({ artifactId: "manifest-v2", extraFields: { v: 2 } });

    const input1 = makeValidIngestInput({
      contentHash: computeSha256Hex(v1Json),
      canonicalJson: v1Json,
      artifactId: "manifest-v1",
      reviewRunId: "run-v1",
    });
    const input2 = makeValidIngestInput({
      contentHash: computeSha256Hex(v2Json),
      canonicalJson: v2Json,
      artifactId: "manifest-v2",
      reviewRunId: "run-v2",
    });

    const hash1 = input1.contentHash;
    const hash2 = input2.contentHash;

    store.ingestValidatedReviewEvidence(input1);
    store.ingestValidatedReviewEvidence(input2);

    const a1 = store.getArtifactByHash(hash1);
    const a2 = store.getArtifactByHash(hash2);
    expect(a1).toBeTruthy();
    expect(a2).toBeTruthy();
    expect(a1!.artifactId).toBe("manifest-v1");
    expect(a2!.artifactId).toBe("manifest-v2");

    store.close();
  });

  // -----------------------------------------------------------------------
  // F2: Non-manifest artifact binding by exact hash reference
  // -----------------------------------------------------------------------

  it("F2: non-manifest artifact binds to exact basisManifestHash", () => {
    const store = createStore();
    const now = new Date().toISOString();

    // First, ingest a manifest to create the run
    const manifestJson = makeV1ArtifactJson({
      artifactId: "manifest-for-non-manifest",
      manifestResult: "NEEDS_CHANGES",
    });
    const manifestHash = computeSha256Hex(manifestJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({
      artifactKind: "review_manifest",
      contentHash: manifestHash,
      canonicalJson: manifestJson,
      artifactId: "manifest-for-non-manifest",
      reviewRunId: "run-non-manifest-target",
      manifestResult: "NEEDS_CHANGES",
    }));

    // Now ingest a remediation_response with exact basisManifestHash
    const respJson = makeV1ArtifactJson({
      artifactKind: "remediation_response",
      artifactId: "response-001",
      basisManifestHash: manifestHash,
      basisManifestArtifactId: "manifest-for-non-manifest",
    });
    const respHash = computeSha256Hex(respJson);
    store.ingestValidatedReviewEvidence({
      contentHash: respHash,
      artifactId: "response-001",
      artifactKind: "remediation_response",
      schemaVersion: 1,
      canonicalJson: respJson,
      projectId: "hepha",
      featureId: "feat-065",
      phaseNumber: 2,
      reviewGateId: "code-review",
      featureRootPath: "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha",
      artifactRelativePath: `MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/code-reviews/artifacts/remediation_response/${respHash}.json`,
      sourceMode: "v1_validated_ingress",
      ingestedAt: now,
      basisManifestHash: manifestHash,
      lineage: {},
      cycle: { cycleId: "cycle-response-001", basisManifestHash: manifestHash, cycleState: "AWAITING_RESPONSE", createdAt: now },
      remediationItems: [{ itemEventId: "response-item-001", cycleId: "cycle-response-001", reviewRunId: "run-non-manifest-target", findingId: "finding-001", remediationItemId: "fix-001", eventKind: "response_evidence", responseHash: respHash, decision: "APPLIED", createdAt: now }],
    });

    // Verify the artifact was persisted
    const artifact = store.getArtifactByHash(respHash);
    expect(artifact).toBeTruthy();
    expect(artifact!.artifactKind).toBe("remediation_response");

    store.close();
  });

  it("F2: rejects non-manifest artifact without basisManifestHash", () => {
    const store = createStore();
    const now = new Date().toISOString();
    const respJson = makeV1ArtifactJson({
      artifactKind: "remediation_response",
      artifactId: "response-no-ref",
    });
    const respHash = computeSha256Hex(respJson);

    expect(() =>
      store.ingestValidatedReviewEvidence({
        contentHash: respHash,
        artifactId: "response-no-ref",
        artifactKind: "remediation_response",
        schemaVersion: 1,
        canonicalJson: respJson,
        projectId: "hepha",
        featureId: "feat-065",
        phaseNumber: 2,
        reviewGateId: "code-review",
        featureRootPath: "MemoryBank/Features/03_IN_PROGRESS",
        artifactRelativePath: `MemoryBank/Features/03_IN_PROGRESS/artifacts/remediation_response/${respHash}.json`,
        sourceMode: "v1_validated_ingress",
        ingestedAt: now,
        lineage: {},
      } as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F2: rejects non-manifest artifact referencing non-existent manifest", () => {
    const store = createStore();
    const now = new Date().toISOString();
    const respJson = makeV1ArtifactJson({
      artifactKind: "remediation_response",
      artifactId: "response-bad-ref",
    });
    const respHash = computeSha256Hex(respJson);
    const fakeHash = "a".repeat(64);

    expect(() =>
      store.ingestValidatedReviewEvidence({
        contentHash: respHash,
        artifactId: "response-bad-ref",
        artifactKind: "remediation_response",
        schemaVersion: 1,
        canonicalJson: respJson,
        featureRootPath: "MemoryBank/Features/03_IN_PROGRESS",
        artifactRelativePath: `MemoryBank/Features/03_IN_PROGRESS/artifacts/remediation_response/${respHash}.json`,
        basisManifestHash: fakeHash,
      } as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });
});

// ---------------------------------------------------------------------------
// Duplicate and Non-Mutation
// ---------------------------------------------------------------------------

describe("duplicate-and-path-hash-non-mutation", () => {
  it("rejects duplicate content hash deterministically", () => {
    const store = createStore();
    const input = makeValidIngestInput();

    // First succeeds
    store.ingestValidatedReviewEvidence(input);

    // Second must fail; prior gate unchanged
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow();

    // Only one row
    const scope = {
      projectId: "hepha",
      featureId: "feat-065",
      phaseNumber: 2,
      reviewGateId: "code-review",
    };
    const artifacts = store.listArtifactsByScope(scope);
    expect(artifacts).toHaveLength(1);

    store.close();
  });

  it("rejects scope/artifact-ID collision deterministically", () => {
    const store = createStore();

    const now = new Date().toISOString();
    const v1Json1 = makeV1ArtifactJson({ artifactId: "manifest-dup-id", manifestResult: "NEEDS_CHANGES", extraFields: { seq: 1 } });
    const v1Hash1 = computeSha256Hex(v1Json1);
    const input1 = makeValidIngestInput({
      contentHash: v1Hash1, canonicalJson: v1Json1, artifactId: "manifest-dup-id",
      reviewRunId: "run-dup-1", manifestResult: "NEEDS_CHANGES", ingestedAt: now,
    });
    const v1Json2 = makeV1ArtifactJson({ artifactId: "manifest-dup-id", manifestResult: "NEEDS_CHANGES", extraFields: { seq: 2 } });
    const v1Hash2 = computeSha256Hex(v1Json2);
    const input2 = makeValidIngestInput({
      contentHash: v1Hash2, canonicalJson: v1Json2, artifactId: "manifest-dup-id",
      reviewRunId: "run-dup-2", manifestResult: "NEEDS_CHANGES", ingestedAt: now,
    });

    store.ingestValidatedReviewEvidence(input1);
    // Second must fail on the unique constraint
    expect(() => store.ingestValidatedReviewEvidence(input2)).toThrow();

    store.close();
  });

  it("appends second APPROVED gate decision after first REJECTED", () => {
    const store = createStore();
    const now = new Date().toISOString();
    const scope = {
      projectId: "hepha",
      featureId: "feat-065",
      phaseNumber: 2,
      reviewGateId: "code-review",
    };

    // First ingest with REJECTED gate
    const v1Json1 = makeV1ArtifactJson({ artifactId: "manifest-rejected", manifestResult: "NEEDS_CHANGES", extraFields: { seq: 1 } });
    const hash1 = computeSha256Hex(v1Json1);
    const input1 = makeValidIngestInput({
      contentHash: hash1,
      canonicalJson: v1Json1,
      artifactId: "manifest-rejected",
      reviewRunId: "run-rejected",
      manifestResult: "NEEDS_CHANGES",
      gateDecision: {
        triggerArtifactHash: hash1,
        basisManifestHash: hash1,
        gateState: "REJECTED",
        reasonCode: "review_needs_changes",
        decidedAt: now,
      },
    });
    store.ingestValidatedReviewEvidence(input1);

    // Verify REJECTED is current
    let currentGate = store.getCurrentAuthoritativeReviewGate(scope);
    expect(currentGate).toBeTruthy();
    expect(currentGate!.gateState).toBe("REJECTED");

    // Second ingest with APPROVED gate (distinct content hash)
    const v1Json2 = makeV1ArtifactJson({ artifactId: "manifest-approved", manifestResult: "APPROVED", extraFields: { seq: 2 } });
    const hash2 = computeSha256Hex(v1Json2);
    const input2 = makeValidIngestInput({
      contentHash: hash2,
      canonicalJson: v1Json2,
      artifactId: "manifest-approved",
      reviewRunId: "run-approved",
      manifestResult: "APPROVED",
      gateDecision: {
        triggerArtifactHash: hash2,
        basisManifestHash: hash2,
        gateState: "APPROVED",
        reasonCode: "approved_terminal_review",
        decidedAt: now,
      },
    });
    store.ingestValidatedReviewEvidence(input2);

    // Verify APPROVED is now current
    currentGate = store.getCurrentAuthoritativeReviewGate(scope);
    expect(currentGate).toBeTruthy();
    expect(currentGate!.gateState).toBe("APPROVED");

    // Both gates exist in list
    const gates = store.listGateDecisions(scope);
    expect(gates).toHaveLength(2);

    store.close();
  });

  it("the store API has no update or replace method — only append", () => {
    const store = createStore();

    // Verify that the store instance has no update or replace methods
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(store))
      .filter((m) => m !== "constructor");
    const mutationMethods = methods.filter(
      (m) => m.startsWith("update") || m.startsWith("replace") || m.startsWith("delete") || m === "upsert"
    );
    expect(mutationMethods).toHaveLength(0);

    // Verify only public write APIs are append-only
    expect(typeof store.ingestValidatedReviewEvidence).toBe("function");
    expect(typeof store.recordSafeIncident).toBe("function");
    expect(typeof store.getArtifactByHash).toBe("function");
    expect(typeof store.getCurrentAuthoritativeReviewGate).toBe("function");
    expect(typeof store.listArtifactsByScope).toBe("function");
    expect(typeof store.listFindingsByRun).toBe("function");
    expect(typeof store.getReviewRunByManifestHash).toBe("function");

    store.close();
  });
});

// ---------------------------------------------------------------------------
// Safe Incident Recording
// ---------------------------------------------------------------------------

describe("safe-incident-recording", () => {
  it("records and reads back a safe incident", () => {
    const store = createStore();
    const now = new Date().toISOString();

    store.recordSafeIncident({
      incidentId: "incident-001",
      projectId: "hepha",
      featureId: "feat-065",
      phaseNumber: 2,
      reviewGateId: "code-review",
      stage: "validation",
      incidentCode: "unsafe_content_detected",
      createdAt: now,
    });

    // Verify through direct SQL that the incident was recorded
    const row = store["database"]
      .prepare("select incident_id, stage, incident_code from hepha_review_safe_incidents where incident_id = ?")
      .get("incident-001") as Record<string, unknown> | undefined;
    expect(row).toBeTruthy();
    expect(row!.incident_code).toBe("unsafe_content_detected");

    store.close();
  });

  it("rejects UPDATE and DELETE on safe incidents", () => {
    const store = createStore();
    const now = new Date().toISOString();

    store.recordSafeIncident({
      incidentId: "incident-002",
      projectId: "hepha",
      stage: "persistence",
      incidentCode: "storage_unavailable",
      createdAt: now,
    });

    expect(() => {
      store["database"]
        .prepare("update hepha_review_safe_incidents set incident_code = 'modified' where incident_id = 'incident-002'")
        .run();
    }).toThrow("append-only");

    expect(() => {
      store["database"]
        .prepare("delete from hepha_review_safe_incidents where incident_id = 'incident-002'")
        .run();
    }).toThrow("append-only");

    store.close();
  });

  // -----------------------------------------------------------------------
  // F4: Null rejection and safe content validation
  // -----------------------------------------------------------------------

  it("F4: rejects null for optional scope members", () => {
    const store = createStore();
    const now = new Date().toISOString();

    expect(() =>
      store.recordSafeIncident({
        incidentId: "incident-null-feature",
        projectId: "hepha",
        featureId: null,
        phaseNumber: 2,
        reviewGateId: "code-review",
        stage: "validation",
        incidentCode: "test",
        createdAt: now,
      }),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F4: rejects invalid UTC timestamp", () => {
    const store = createStore();

    expect(() =>
      store.recordSafeIncident({
        incidentId: "incident-bad-ts",
        projectId: "hepha",
        stage: "validation",
        incidentCode: "test",
        createdAt: "2024-01-01",
      } as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F4: rejects contentHash as null when explicitly supplied", () => {
    const store = createStore();
    const now = new Date().toISOString();

    expect(() =>
      store.recordSafeIncident({
        incidentId: "incident-null-hash",
        projectId: "hepha",
        stage: "validation",
        incidentCode: "test",
        contentHash: null,
        createdAt: now,
      } as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });
});

// ---------------------------------------------------------------------------
// Content-Addressed File Persistence Helpers
// ---------------------------------------------------------------------------

describe("content-addressed-file-persistence", () => {
  const featureRootPath = "MemoryBank/Features/03_IN_PROGRESS/FEAT-065";

  function request(projectRoot: string, canonicalJson: string, overrides: Record<string, unknown> = {}) {
    return {
      projectRoot,
      featureRootPath,
      artifactKind: "review_manifest",
      contentHash: computeSha256Hex(canonicalJson),
      canonicalJson,
      ...overrides,
    };
  }

  it("F3-derived-path-boundary-matrix: derives and publishes only the V1 path", () => {
    const projectRoot = resolve(tmpdir(), `feat-065-file-${process.pid}-${Date.now()}`);
    mkdirSync(projectRoot, { recursive: true });
    const canonicalJson = canonicalizeTestJson({ artifactId: "file-001", artifactKind: "review_manifest" });
    const contentHash = computeSha256Hex(canonicalJson);
    try {
      const publication = ReviewGovernanceSqliteStore.persistArtifactFileV1(request(projectRoot, canonicalJson));
      expect(publication).toEqual({ path: resolve(projectRoot, `${featureRootPath}/code-reviews/artifacts/review_manifest/${contentHash}.json`), created: true });
      expect(readFileSync(publication.path, "utf8")).toBe(canonicalJson);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("F3-derived-path-boundary-matrix: rejects all caller path escape forms before creation", () => {
    const projectRoot = resolve(tmpdir(), `feat-065-path-${process.pid}-${Date.now()}`);
    mkdirSync(projectRoot, { recursive: true });
    const canonicalJson = canonicalizeTestJson({ artifactId: "file-002", artifactKind: "review_manifest" });
    try {
      for (const featureRootPath of ["../escape", "/absolute", "D:/drive", "file:///uri", "a\\b", "safe//empty", "safe/../escape"]) {
        expect(() => ReviewGovernanceSqliteStore.persistArtifactFileV1(request(projectRoot, canonicalJson, { featureRootPath }))).toThrow("INVALID_INPUT");
      }
      expect(existsSync(resolve(projectRoot, "safe"))).toBe(false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("F3-safe-content-and-hash-negative: rejects unsafe or mismatched bytes before publish", () => {
    const projectRoot = resolve(tmpdir(), `feat-065-unsafe-${process.pid}-${Date.now()}`);
    mkdirSync(projectRoot, { recursive: true });
    const safeJson = canonicalizeTestJson({ artifactId: "file-003", artifactKind: "review_manifest" });
    const unsafeJson = canonicalizeTestJson({ apiKey: "sk-abcdefghijklmnopqrstuvwxyz1234567890" });
    try {
      expect(() => ReviewGovernanceSqliteStore.persistArtifactFileV1(request(projectRoot, unsafeJson))).toThrow("INVALID_INPUT");
      expect(() => ReviewGovernanceSqliteStore.persistArtifactFileV1(request(projectRoot, safeJson, { contentHash: "a".repeat(64) }))).toThrow("INVALID_INPUT");
      expect(existsSync(resolve(projectRoot, featureRootPath))).toBe(false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("F3-existing-file-and-race-matrix: reuses verified content and refuses collision", () => {
    const projectRoot = resolve(tmpdir(), `feat-065-collision-${process.pid}-${Date.now()}`);
    mkdirSync(projectRoot, { recursive: true });
    const canonicalJson = canonicalizeTestJson({ artifactId: "file-004", artifactKind: "review_manifest" });
    try {
      const first = ReviewGovernanceSqliteStore.persistArtifactFileV1(request(projectRoot, canonicalJson));
      expect(first.created).toBe(true);
      expect(ReviewGovernanceSqliteStore.persistArtifactFileV1(request(projectRoot, canonicalJson))).toEqual({ path: first.path, created: false });
      writeFileSync(first.path, canonicalizeTestJson({ altered: true }), "utf8");
      expect(() => ReviewGovernanceSqliteStore.persistArtifactFileV1(request(projectRoot, canonicalJson))).toThrow("FILE_COLLISION");
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("F2-file-request-closed-runtime-boundary: rejects every malformed request before filesystem access", () => {
    const projectRoot = resolve(tmpdir(), `feat-065-file-request-shape-${process.pid}-${Date.now()}`);
    const canonicalJson = canonicalizeTestJson({ artifactId: "file-request-shape", artifactKind: "review_manifest" });
    const validRequest = request(projectRoot, canonicalJson);
    const callCounts = { mkdir: 0, lstat: 0, realpath: 0, open: 0, write: 0, fsync: 0, link: 0, read: 0, unlink: 0, close: 0 };
    const noFilesystemOperations = {
      mkdirSync: (() => { callCounts.mkdir++; throw new Error("unexpected filesystem operation"); }) as typeof mkdirSync,
      lstatSync: (() => { callCounts.lstat++; throw new Error("unexpected filesystem operation"); }) as typeof lstatSync,
      realpathSync: (() => { callCounts.realpath++; throw new Error("unexpected filesystem operation"); }) as typeof realpathSync,
      openSync: (() => { callCounts.open++; throw new Error("unexpected filesystem operation"); }) as typeof openSync,
      writeFileSync: (() => { callCounts.write++; throw new Error("unexpected filesystem operation"); }) as typeof writeFileSync,
      fsyncSync: (() => { callCounts.fsync++; throw new Error("unexpected filesystem operation"); }) as typeof fsyncSync,
      linkSync: (() => { callCounts.link++; throw new Error("unexpected filesystem operation"); }) as typeof linkSync,
      readFileSync: (() => { callCounts.read++; throw new Error("unexpected filesystem operation"); }) as typeof readFileSync,
      unlinkSync: (() => { callCounts.unlink++; throw new Error("unexpected filesystem operation"); }) as typeof unlinkSync,
      closeSync: (() => { callCounts.close++; throw new Error("unexpected filesystem operation"); }) as typeof closeSync,
    };
    const missingFieldCases = Object.keys(validRequest).map((field) => {
      const value = { ...validRequest } as Record<string, unknown>;
      delete value[field as keyof typeof value];
      return [`missing ${field}`, value] as const;
    });
    const invalidCases: readonly [string, unknown][] = [
      ...missingFieldCases,
      ...Object.keys(validRequest).flatMap((field) => [
        [`null ${field}`, { ...validRequest, [field]: null }] as const,
        [`wrong type ${field}`, { ...validRequest, [field]: 42 }] as const,
      ]),
      ["relative project root", { ...validRequest, projectRoot: "relative-root" }],
      ["overlong feature root", { ...validRequest, featureRootPath: "a".repeat(1025) }],
      ...["destination", "path", "relativePath", "projectRelativePath", "basename", "arbitrary"].map((field) => [
        `unknown ${field}`, { ...validRequest, [field]: "forbidden" },
      ] as const),
    ];
    const publisher = new ReviewArtifactFileStore(noFilesystemOperations);
    for (const [_label, malformed] of invalidCases) {
      Object.keys(callCounts).forEach((key) => { callCounts[key as keyof typeof callCounts] = 0; });
      expect(() => ReviewGovernanceSqliteStore.persistArtifactFileV1(malformed, publisher))
        .toThrow(/^INVALID_INPUT$/);
      expect(Object.values(callCounts).reduce((total, count) => total + count, 0)).toBe(0);
    }
  });

  it("F2-file-request-positive-controls: publishes, reuses, and rejects unavailable or non-regular destinations", () => {
    const projectRoot = resolve(tmpdir(), `feat-065-file-request-positive-${process.pid}-${Date.now()}`);
    const unavailableRoot = resolve(tmpdir(), `feat-065-file-request-unavailable-${process.pid}-${Date.now()}`);
    const collisionRoot = resolve(tmpdir(), `feat-065-file-request-nonregular-${process.pid}-${Date.now()}`);
    const canonicalJson = canonicalizeTestJson({ artifactId: "file-request-positive", artifactKind: "review_manifest" });
    const contentHash = computeSha256Hex(canonicalJson);
    try {
      expect(() => ReviewGovernanceSqliteStore.persistArtifactFileV1(request(unavailableRoot, canonicalJson))).toThrow(/^PERSISTENCE_FAILED$/);
      expect(existsSync(unavailableRoot)).toBe(false);
      mkdirSync(projectRoot, { recursive: true });
      const first = ReviewGovernanceSqliteStore.persistArtifactFileV1(request(projectRoot, canonicalJson));
      expect(first.created).toBe(true);
      expect(readFileSync(first.path, "utf8")).toBe(canonicalJson);
      expect(ReviewGovernanceSqliteStore.persistArtifactFileV1(request(projectRoot, canonicalJson))).toEqual({ path: first.path, created: false });
      mkdirSync(resolve(collisionRoot, `${featureRootPath}/code-reviews/artifacts/review_manifest/${contentHash}.json`), { recursive: true });
      expect(() => ReviewGovernanceSqliteStore.persistArtifactFileV1(request(collisionRoot, canonicalJson))).toThrow(/^FILE_COLLISION$/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(unavailableRoot, { recursive: true, force: true });
      rmSync(collisionRoot, { recursive: true, force: true });
    }
  });

  it("F3-derived-path-boundary-matrix: rejects parent and final symlinks without following them", () => {
    const projectRoot = resolve(tmpdir(), `feat-065-symlink-${process.pid}-${Date.now()}`);
    const outside = resolve(tmpdir(), `feat-065-outside-${process.pid}-${Date.now()}`);
    const canonicalJson = canonicalizeTestJson({ artifactId: "file-symlink", artifactKind: "review_manifest" });
    const hash = computeSha256Hex(canonicalJson);
    const finalPath = resolve(projectRoot, `${featureRootPath}/code-reviews/artifacts/review_manifest/${hash}.json`);
    try {
      mkdirSync(outside, { recursive: true });
      mkdirSync(resolve(projectRoot, featureRootPath), { recursive: true });
      symlinkSync(outside, resolve(projectRoot, featureRootPath, "code-reviews"));
      expect(() => ReviewGovernanceSqliteStore.persistArtifactFileV1(request(projectRoot, canonicalJson))).toThrow("INVALID_INPUT");
      rmSync(resolve(projectRoot, featureRootPath, "code-reviews"), { force: true });
      mkdirSync(dirname(finalPath), { recursive: true });
      writeFileSync(resolve(outside, "same.json"), canonicalJson, "utf8");
      symlinkSync(resolve(outside, "same.json"), finalPath);
      expect(() => ReviewGovernanceSqliteStore.persistArtifactFileV1(request(projectRoot, canonicalJson))).toThrow("FILE_COLLISION");
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// F1: Runtime boundary validation
// ---------------------------------------------------------------------------

describe("f1-runtime-boundary-validation", () => {
  it("F1: rejects empty findings array for manifest", () => {
    const store = createStore();
    const input = makeValidIngestInput({
      findings: [],
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1: rejects null cycle when explicitly supplied", () => {
    const store = createStore();
    const now = new Date().toISOString();
    const input = makeValidIngestInput({
      cycle: null as never,
      ingestedAt: now,
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1: rejects null gateDecision when explicitly supplied", () => {
    const store = createStore();
    const now = new Date().toISOString();
    const input = makeValidIngestInput({
      gateDecision: null as never,
      ingestedAt: now,
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1: rejects null remediationItems when explicitly supplied", () => {
    const store = createStore();
    const now = new Date().toISOString();
    const input = makeValidIngestInput({
      remediationItems: null as never,
      ingestedAt: now,
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1: rejects null verificationReceipts when explicitly supplied", () => {
    const store = createStore();
    const now = new Date().toISOString();
    const input = makeValidIngestInput({
      verificationReceipts: null as never,
      ingestedAt: now,
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1: rejects non-JSON canonicalJson string matching its hash", () => {
    const store = createStore();
    // Create a hash that matches a non-JSON string
    const badJson = "not-json-but-matches-hash";
    const badHash = computeSha256Hex(badJson);
    const input = makeValidIngestInput({
      canonicalJson: badJson,
      contentHash: badHash,
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1: rejects null observation when explicitly supplied", () => {
    const store = createStore();
    const input = makeValidIngestInput({
      findings: [
        makeValidFindingInput({
          findingId: "finding-null-obs",
          observation: null as never,
        }),
      ],
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1-canonical-identity-negative: rejects hash-matching non-V1 payload", () => {
    const store = createStore();
    // A valid JSON object that matches its hash but is NOT a V1 artifact
    // (no schemaVersion, artifactKind, artifactId, or scope fields).
    const nonV1Json = JSON.stringify({ random: true, data: "not-a-v1-artifact" });
    const nonV1Hash = computeSha256Hex(nonV1Json);
    const input = makeValidIngestInput({
      canonicalJson: nonV1Json,
      contentHash: nonV1Hash,
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1-canonical-identity-negative: rejects unknown V1 members and mismatched payload derivatives", () => {
    const store = createStore();
    const unknownMemberJson = makeV1ArtifactJson({ extraFields: { injected: true } });
    // Build an actually unknown member because valid fixture helpers never add one.
    const parsed = JSON.parse(unknownMemberJson) as Record<string, unknown>;
    parsed.injected = true;
    const unknownCanonical = canonicalizeTestJson(parsed);
    expect(() => store.ingestValidatedReviewEvidence(makeValidIngestInput({
      canonicalJson: unknownCanonical,
      contentHash: computeSha256Hex(unknownCanonical),
    }))).toThrow("INVALID_INPUT");

    const mismatchJson = makeV1ArtifactJson();
    expect(() => store.ingestValidatedReviewEvidence(makeValidIngestInput({
      canonicalJson: mismatchJson,
      contentHash: computeSha256Hex(mismatchJson),
      manifestResult: "APPROVED",
    }))).toThrow("INVALID_INPUT");
    expect(store.listArtifactsByScope({ projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" })).toHaveLength(0);
    store.close();
  });

  it("F1-canonical-identity-negative: rejects wrong hash", () => {
    const store = createStore();
    // Valid V1 JSON but contentHash doesn't match
    const v1Json = makeV1ArtifactJson({ artifactId: "manifest-wrong-hash" });
    const wrongHash = "a".repeat(64);  // not the actual SHA-256 of v1Json
    const input = makeValidIngestInput({
      canonicalJson: v1Json,
      contentHash: wrongHash,
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1-runtime-boundary-negative-matrix: rejects absent/null outer input", () => {
    const store = createStore();
    expect(() => store.ingestValidatedReviewEvidence(null)).toThrow("INVALID_INPUT");
    expect(() => store.ingestValidatedReviewEvidence(undefined as never)).toThrow("INVALID_INPUT");
    expect(() => store.ingestValidatedReviewEvidence("string")).toThrow("INVALID_INPUT");
    expect(() => store.ingestValidatedReviewEvidence(42)).toThrow("INVALID_INPUT");
    expect(() => store.ingestValidatedReviewEvidence([])).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1-runtime-boundary-negative-matrix: rejects missing scope", () => {
    const store = createStore();
    const now = new Date().toISOString();
    const v1Json = makeV1ArtifactJson({ artifactId: "manifest-no-scope" });
    const hash = computeSha256Hex(v1Json);

    // Missing projectId
    expect(() =>
      store.ingestValidatedReviewEvidence({
        contentHash: hash,
        artifactId: "manifest-no-scope",
        artifactKind: "review_manifest",
        schemaVersion: 1,
        canonicalJson: v1Json,
        projectId: "",
        featureId: "feat-065",
        phaseNumber: 2,
        reviewGateId: "code-review",
        featureRootPath: "MemoryBank/Features/FEAT-065",
        artifactRelativePath: `MemoryBank/Features/FEAT-065/artifacts/review_manifest/${hash}.json`,
        sourceMode: "v1_validated_ingress",
        ingestedAt: now,
        lineage: {},
      } as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F1-runtime-boundary-negative-matrix: rejects non-UTC ingestedAt", () => {
    const store = createStore();
    const input = makeValidIngestInput({
      ingestedAt: "2026-01-01T00:00:00",  // missing Z or +00:00
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1-runtime-boundary-negative-matrix: rejects non-array findings", () => {
    const store = createStore();
    const input = makeValidIngestInput({
      findings: "not-an-array" as never,
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1-runtime-boundary-negative-matrix: rejects beyond-max findings", () => {
    const store = createStore();
    const tooManyFindings = [];
    for (let i = 0; i < 65; i++) {
      tooManyFindings.push(makeValidFindingInput({ findingId: `finding-${i}` }));
    }
    const input = makeValidIngestInput({
      findings: tooManyFindings,
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1-runtime-boundary-negative-matrix: rejects malformed finding (missing summary)", () => {
    const store = createStore();
    const input = makeValidIngestInput({
      findings: [
        {
          findingId: "finding-incomplete",
          disposition: "IN_SCOPE_BLOCKER",
          claimType: "security",
          severity: "blocker",
          defectClass: "missing",
          // summary is required but omitted
        },
      ],
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1-runtime-boundary-negative-matrix: unchanged exact-scope reads after rejection", () => {
    const store = createStore();

    const scope = {
      projectId: "hepha",
      featureId: "feat-065",
      phaseNumber: 2,
      reviewGateId: "code-review",
    };

    // Baseline: no artifacts
    expect(store.listArtifactsByScope(scope)).toHaveLength(0);

    // Attempt invalid ingest
    expect(() => store.ingestValidatedReviewEvidence(null)).toThrow("INVALID_INPUT");

    // Verify unchanged
    expect(store.listArtifactsByScope(scope)).toHaveLength(0);

    store.close();
  });

  it("F1-runtime-boundary-negative-matrix: rejects V1 JSON with artifactId mismatch", () => {
    const store = createStore();
    // V1 JSON says artifactId "wrong-id" but request says "manifest-001"
    const mismatchedJson = makeV1ArtifactJson({ artifactId: "wrong-id" });
    const mismatchedHash = computeSha256Hex(mismatchedJson);
    const input = makeValidIngestInput({
      canonicalJson: mismatchedJson,
      contentHash: mismatchedHash,
      artifactId: "manifest-001",  // differs from V1 JSON
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1-runtime-boundary-negative-matrix: rejects V1 JSON with scope mismatch", () => {
    const store = createStore();
    // V1 JSON says featureId "different-feat" but request says "feat-065"
    const mismatchedJson = makeV1ArtifactJson({ featureId: "different-feat" });
    const mismatchedHash = computeSha256Hex(mismatchedJson);
    const input = makeValidIngestInput({
      canonicalJson: mismatchedJson,
      contentHash: mismatchedHash,
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1-runtime-boundary-positive: valid fully bound V1 manifest aggregate commits", () => {
    const store = createStore();
    const input = makeValidIngestInput({
      manifestResult: "APPROVED",
      reviewRunId: "run-positive-test",
    });

    const hash = store.ingestValidatedReviewEvidence(input);
    expect(hash).toBe(input.contentHash);

    // Verify complete read-back: hash, bytes, scope, kind, paths
    const artifact = store.getArtifactByHash(hash);
    expect(artifact).toBeTruthy();
    expect(artifact!.contentHash).toBe(hash);
    expect(artifact!.canonicalJson).toBe(input.canonicalJson);
    expect(artifact!.projectId).toBe("hepha");
    expect(artifact!.featureId).toBe("feat-065");
    expect(artifact!.phaseNumber).toBe(2);
    expect(artifact!.reviewGateId).toBe("code-review");
    expect(artifact!.artifactKind).toBe("review_manifest");
    expect(artifact!.featureRootPath).toBe(input.featureRootPath);
    expect(artifact!.artifactRelativePath).toBe(input.artifactRelativePath);

    store.close();
  });
});

describe("review-rerun-regression-matrix", () => {
  it("F1 rejects non-canonical bytes even when their SHA-256 matches", () => {
    const store = createStore();
    const nonCanonical = JSON.stringify({ schemaVersion: 1, artifactKind: "review_manifest", artifactId: "noncanonical", scope: { projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" }, ruleSnapshots: [], findings: [], result: "NEEDS_CHANGES" });
    const input = makeValidIngestInput({ canonicalJson: nonCanonical, contentHash: computeSha256Hex(nonCanonical), artifactId: "noncanonical" });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    expect(store.listArtifactsByScope({ projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" })).toHaveLength(0);
    store.close();
  });

  it("F2 rejects a gate that is not bound to the artifact being ingested", () => {
    const store = createStore();
    const input = makeValidIngestInput({
      gateDecision: {
        triggerArtifactHash: "a".repeat(64),
        basisManifestHash: "a".repeat(64),
        gateState: "REJECTED",
        reasonCode: "review_needs_changes",
        decidedAt: new Date().toISOString(),
      },
    });
    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow("INVALID_INPUT");
    expect(store.getCurrentAuthoritativeReviewGate({ projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" })).toBeNull();
    store.close();
  });
});

// ---------------------------------------------------------------------------
// F2: Non-manifest aggregate binding
// ---------------------------------------------------------------------------

describe("f2-non-manifest-aggregate-binding", () => {
  it("F2: persists cycle for non-manifest artifact", () => {
    const store = createStore();
    const now = new Date().toISOString();

    // Ingest manifest
    const manifestJson = makeV1ArtifactJson({
      artifactId: "manifest-cycle-test",
      manifestResult: "NEEDS_CHANGES",
    });
    const manifestHash = computeSha256Hex(manifestJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({
      artifactKind: "review_manifest",
      contentHash: manifestHash,
      canonicalJson: manifestJson,
      artifactId: "manifest-cycle-test",
      reviewRunId: "run-cycle-test",
      manifestResult: "NEEDS_CHANGES",
      cycle: {
        cycleId: "cycle-for-manifest",
        basisManifestHash: manifestHash,
        cycleState: "OPEN" as const,
        createdAt: now,
      },
    }));

    // Ingest remediation_response with cycle
    const respJson = makeV1ArtifactJson({
      artifactKind: "remediation_response",
      artifactId: "response-cycle-test",
      basisManifestHash: manifestHash,
      basisManifestArtifactId: "manifest-cycle-test",
    });
    const respHash = computeSha256Hex(respJson);
    store.ingestValidatedReviewEvidence({
      contentHash: respHash,
      artifactId: "response-cycle-test",
      artifactKind: "remediation_response",
      schemaVersion: 1,
      canonicalJson: respJson,
      projectId: "hepha",
      featureId: "feat-065",
      phaseNumber: 2,
      reviewGateId: "code-review",
      featureRootPath: "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha",
      artifactRelativePath: `MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/code-reviews/artifacts/remediation_response/${respHash}.json`,
      sourceMode: "v1_validated_ingress",
      ingestedAt: now,
      basisManifestHash: manifestHash,
      lineage: {},
      remediationItems: [{ itemEventId: "response-cycle-item", cycleId: "cycle-for-response", reviewRunId: "run-cycle-test", findingId: "finding-001", remediationItemId: "fix-001", eventKind: "response_evidence", responseHash: respHash, decision: "APPLIED", createdAt: now }],
      cycle: {
        cycleId: "cycle-for-response",
        basisManifestHash: manifestHash,
        cycleState: "AWAITING_RESPONSE" as const,
        createdAt: now,
      },
    });

    // Verify both cycles exist
    const cycle1Exists = store["database"]
      .prepare("select count(*) as cnt from hepha_review_remediation_cycles where cycle_id = ?")
      .get("cycle-for-manifest") as { cnt: number };
    expect(cycle1Exists.cnt).toBe(1);

    const cycle2Exists = store["database"]
      .prepare("select count(*) as cnt from hepha_review_remediation_cycles where cycle_id = ?")
      .get("cycle-for-response") as { cnt: number };
    expect(cycle2Exists.cnt).toBe(1);

    store.close();
  });

  it("F2: persists gate decision for non-manifest artifact", () => {
    const store = createStore();
    const now = new Date().toISOString();

    // Ingest manifest
    const manifestJson = makeV1ArtifactJson({
      artifactId: "manifest-gate-test",
      manifestResult: "NEEDS_CHANGES",
    });
    const manifestHash = computeSha256Hex(manifestJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({
      artifactKind: "review_manifest",
      contentHash: manifestHash,
      canonicalJson: manifestJson,
      artifactId: "manifest-gate-test",
      reviewRunId: "run-gate-test",
      manifestResult: "NEEDS_CHANGES",
    }));

    // Ingest response with gate decision
    const respJson = makeV1ArtifactJson({
      artifactKind: "remediation_response",
      artifactId: "response-gate-test",
      basisManifestHash: manifestHash,
      basisManifestArtifactId: "manifest-gate-test",
    });
    const respHash = computeSha256Hex(respJson);
    store.ingestValidatedReviewEvidence({
      contentHash: respHash,
      artifactId: "response-gate-test",
      artifactKind: "remediation_response",
      schemaVersion: 1,
      canonicalJson: respJson,
      projectId: "hepha",
      featureId: "feat-065",
      phaseNumber: 2,
      reviewGateId: "code-review",
      featureRootPath: "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha",
      artifactRelativePath: `MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/code-reviews/artifacts/remediation_response/${respHash}.json`,
      sourceMode: "v1_validated_ingress",
      ingestedAt: now,
      basisManifestHash: manifestHash,
      lineage: {},
      cycle: { cycleId: "cycle-gate-response", basisManifestHash: manifestHash, cycleState: "AWAITING_RESPONSE", createdAt: now },
      remediationItems: [{ itemEventId: "response-gate-item", cycleId: "cycle-gate-response", reviewRunId: "run-gate-test", findingId: "finding-001", remediationItemId: "fix-001", eventKind: "response_evidence", responseHash: respHash, decision: "APPLIED", createdAt: now }],
      gateDecision: {
        triggerArtifactHash: respHash,
        basisManifestHash: manifestHash,
        gateState: "APPROVED" as const,
        reasonCode: "approved_terminal_review",
        decidedAt: now,
      },
    });

    // Verify gate was persisted from non-manifest path
    const gate = store.getCurrentAuthoritativeReviewGate({
      projectId: "hepha",
      featureId: "feat-065",
      phaseNumber: 2,
      reviewGateId: "code-review",
    });
    expect(gate).toBeTruthy();
    expect(gate!.gateState).toBe("APPROVED");
    expect(gate!.triggerArtifactHash).toBe(respHash);

    store.close();
  });

  it("F2: rejects non-manifest items with mismatched reviewRunId", () => {
    const store = createStore();
    const now = new Date().toISOString();

    const manifestJson = makeV1ArtifactJson({
      artifactId: "manifest-runid-test",
      manifestResult: "NEEDS_CHANGES",
    });
    const manifestHash = computeSha256Hex(manifestJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({
      artifactKind: "review_manifest",
      contentHash: manifestHash,
      canonicalJson: manifestJson,
      artifactId: "manifest-runid-test",
      reviewRunId: "run-correct",
      manifestResult: "NEEDS_CHANGES",
    }));

    // Try to ingest response with mismatched reviewRunId on items
    const respJson = makeV1ArtifactJson({
      artifactKind: "remediation_response",
      artifactId: "response-runid-wrong",
    });
    const respHash = computeSha256Hex(respJson);
    expect(() =>
      store.ingestValidatedReviewEvidence({
        contentHash: respHash,
        artifactId: "response-runid-wrong",
        artifactKind: "remediation_response",
        schemaVersion: 1,
        canonicalJson: respJson,
        projectId: "hepha",
        featureId: "feat-065",
        phaseNumber: 2,
        reviewGateId: "code-review",
        featureRootPath: "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha",
        artifactRelativePath: `MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/code-reviews/artifacts/remediation_response/${respHash}.json`,
        sourceMode: "v1_validated_ingress",
        ingestedAt: now,
        basisManifestHash: manifestHash,
        lineage: {},
        remediationItems: [{
          itemEventId: "item-runid-wrong",
          cycleId: "cycle-dummy",
          reviewRunId: "run-wrong",
          findingId: "finding-001",
          remediationItemId: "item-001",
          eventKind: "response",
          createdAt: now,
        }],
      } as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F2: two distinct artifacts remain readable", () => {
    const store = createStore();
    const now = new Date().toISOString();

    const v1Json1 = makeV1ArtifactJson({ artifactId: "manifest-distinct-1", manifestResult: "NEEDS_CHANGES" });
    const hash1 = computeSha256Hex(v1Json1);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({
      contentHash: hash1,
      canonicalJson: v1Json1,
      artifactId: "manifest-distinct-1",
      reviewRunId: "run-distinct-1",
      manifestResult: "NEEDS_CHANGES",
    }));

    const v1Json2 = makeV1ArtifactJson({ artifactId: "manifest-distinct-2", manifestResult: "APPROVED" });
    const hash2 = computeSha256Hex(v1Json2);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({
      contentHash: hash2,
      canonicalJson: v1Json2,
      artifactId: "manifest-distinct-2",
      reviewRunId: "run-distinct-2",
      manifestResult: "APPROVED",
    }));

    // Both remain readable
    const a1 = store.getArtifactByHash(hash1);
    const a2 = store.getArtifactByHash(hash2);
    expect(a1).toBeTruthy();
    expect(a2).toBeTruthy();
    expect(a1!.artifactId).toBe("manifest-distinct-1");
    expect(a2!.artifactId).toBe("manifest-distinct-2");

    store.close();
  });

  it("F2: two distinct artifacts with one valid supersedes edge", () => {
    const store = createStore();

    // Ingest two distinct predecessors
    const pre1Json = makeV1ArtifactJson({ artifactId: "manifest-super-pred-1", manifestResult: "NEEDS_CHANGES" });
    const pre1Hash = computeSha256Hex(pre1Json);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({
      contentHash: pre1Hash,
      canonicalJson: pre1Json,
      artifactId: "manifest-super-pred-1",
      reviewRunId: "run-super-pred-1",
      manifestResult: "NEEDS_CHANGES",
    }));

    const pre2Json = makeV1ArtifactJson({ artifactId: "manifest-super-pred-2", manifestResult: "NEEDS_CHANGES" });
    const pre2Hash = computeSha256Hex(pre2Json);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({
      contentHash: pre2Hash,
      canonicalJson: pre2Json,
      artifactId: "manifest-super-pred-2",
      reviewRunId: "run-super-pred-2",
      manifestResult: "NEEDS_CHANGES",
    }));

    // Ingest successor with lineage referencing both distinct predecessors
    const succJson = makeV1ArtifactJson({ artifactId: "manifest-super-succ", manifestResult: "APPROVED", lineage: {
      predecessors: [{ artifactKind: "review_manifest", artifactId: "manifest-super-pred-1", contentHash: pre1Hash, relativePath: `MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/code-reviews/artifacts/review_manifest/${pre1Hash}.json` }],
      supersedes: { artifactKind: "review_manifest", artifactId: "manifest-super-pred-2", contentHash: pre2Hash, relativePath: `MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/code-reviews/artifacts/review_manifest/${pre2Hash}.json` },
    } });
    const succHash = computeSha256Hex(succJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({
      contentHash: succHash,
      canonicalJson: succJson,
      artifactId: "manifest-super-succ",
      reviewRunId: "run-super-succ",
      manifestResult: "APPROVED",
      lineage: {
        predecessorHashes: [pre1Hash],
        supersedesHash: pre2Hash,
      },
    }));

    // All three remain readable and distinct
    const a1 = store.getArtifactByHash(pre1Hash);
    const a2 = store.getArtifactByHash(pre2Hash);
    const a3 = store.getArtifactByHash(succHash);
    expect(a1).toBeTruthy();
    expect(a2).toBeTruthy();
    expect(a3).toBeTruthy();
    expect(a1!.artifactId).toBe("manifest-super-pred-1");
    expect(a2!.artifactId).toBe("manifest-super-pred-2");
    expect(a3!.artifactId).toBe("manifest-super-succ");

    store.close();
  });

  it("F2: unique index rejects a second supersedes row for the same artifact via direct SQL", () => {
    const store = createStore();

    // Ingest a predecessor and successor with one supersedes edge
    const preJson = makeV1ArtifactJson({ artifactId: "manifest-super-solo", manifestResult: "NEEDS_CHANGES" });
    const preHash = computeSha256Hex(preJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({
      contentHash: preHash,
      canonicalJson: preJson,
      artifactId: "manifest-super-solo",
      reviewRunId: "run-super-solo",
      manifestResult: "NEEDS_CHANGES",
    }));

    const succJson: string = makeV1ArtifactJson({ artifactId: "manifest-super-only", manifestResult: "APPROVED", lineage: {
      supersedes: { artifactKind: "review_manifest", artifactId: "manifest-super-solo", contentHash: preHash, relativePath: `MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/code-reviews/artifacts/review_manifest/${preHash}.json` },
    } });
    const succHash: string = computeSha256Hex(succJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({
      contentHash: succHash,
      canonicalJson: succJson,
      artifactId: "manifest-super-only",
      reviewRunId: "run-super-only",
      manifestResult: "APPROVED",
      lineage: { supersedesHash: preHash },
    }));

    // Direct SQL attempt to insert a second supersedes row for the same artifact
    expect(() => {
      store["database"]
        .prepare(
          "insert into hepha_review_artifact_lineage (artifact_hash, predecessor_hash, relation_kind) values (?, ?, 'supersedes')",
        )
        .run(succHash, preHash);
    }).toThrow();

    store.close();
  });

  it("F2: remediation response exact basis binding persists", () => {
    const store = createStore();
    const now = new Date().toISOString();

    // Ingest manifest first
    const manifestJson: string = makeV1ArtifactJson({ artifactId: "manifest-for-all-kinds", manifestResult: "NEEDS_CHANGES" });
    const manifestHash: string = computeSha256Hex(manifestJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({
      artifactKind: "review_manifest",
      contentHash: manifestHash,
      canonicalJson: manifestJson,
      artifactId: "manifest-for-all-kinds",
      reviewRunId: "run-all-kinds",
      manifestResult: "NEEDS_CHANGES",
    }));

    // The response positive control uses the exact blocker/item contract.
    // Replan/debt have dedicated contract fixtures below.
    const kinds: ReviewStoreArtifactKind[] = ["remediation_response"];

    let responseHash: string | undefined;
    let responseArtifactId: string | undefined;
    for (let i = 0; i < kinds.length; i++) {
      const kind: ReviewStoreArtifactKind = kinds[i];
      const artifactId = `${kind.replaceAll("_", "-")}-bind-test`;
      const artifactJson: string = makeV1ArtifactJson({
        artifactKind: kind,
        artifactId,
        basisManifestHash: manifestHash,
        basisManifestArtifactId: "manifest-for-all-kinds",
        responseHash,
        responseArtifactId,
      });
      const artifactHash: string = computeSha256Hex(artifactJson);

      store.ingestValidatedReviewEvidence({
        contentHash: artifactHash,
        artifactId,
        artifactKind: kind,
        schemaVersion: 1,
        canonicalJson: artifactJson,
        projectId: "hepha",
        featureId: "feat-065",
        phaseNumber: 2,
        reviewGateId: "code-review",
        featureRootPath: "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha",
        artifactRelativePath: `MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/code-reviews/artifacts/${kind}/${artifactHash}.json`,
        sourceMode: "v1_validated_ingress",
        ingestedAt: now,
        basisManifestHash: manifestHash,
        lineage: {},
        cycle: { cycleId: `cycle-${artifactId}`, basisManifestHash: manifestHash, cycleState: "AWAITING_RESPONSE", createdAt: now },
        remediationItems: [{ itemEventId: `item-${artifactId}`, cycleId: `cycle-${artifactId}`, reviewRunId: "run-all-kinds", findingId: "finding-001", remediationItemId: "fix-001", eventKind: "response_evidence", responseHash: artifactHash, decision: "APPLIED", createdAt: now }],
      });

      const artifact = store.getArtifactByHash(artifactHash);
      expect(artifact).toBeTruthy();
      expect(artifact!.artifactKind).toBe(kind);
      if (kind === "remediation_response") {
        responseHash = artifactHash;
        responseArtifactId = artifactId;
      }
    }

    store.close();
  });
});

// ---------------------------------------------------------------------------
// F4: Safe incident bounded validation
// ---------------------------------------------------------------------------

describe("f4-safe-incident-bounded-validation", () => {
  it("F4: rejects overlong stage label", () => {
    const store = createStore();
    const now = new Date().toISOString();

    expect(() =>
      store.recordSafeIncident({
        incidentId: "incident-long-stage",
        projectId: "hepha",
        stage: "x".repeat(200),
        incidentCode: "test",
        createdAt: now,
      }),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F4: rejects overlong incidentCode", () => {
    const store = createStore();
    const now = new Date().toISOString();

    expect(() =>
      store.recordSafeIncident({
        incidentId: "incident-long-code",
        projectId: "hepha",
        stage: "validation",
        incidentCode: "x".repeat(200),
        createdAt: now,
      }),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F4: accepts benign credential vocabulary without assignment syntax", () => {
    const store = createStore();
    const now = new Date().toISOString();

    expect(() =>
      store.recordSafeIncident({
        incidentId: "incident-secret-stage",
        projectId: "hepha",
        stage: "password-policy-audit",
        incidentCode: "test",
        createdAt: now,
      }),
    ).not.toThrow();

    store.close();
  });

  it("F4: rejects impossible timestamp year", () => {
    const store = createStore();

    expect(() =>
      store.recordSafeIncident({
        incidentId: "incident-year-3000",
        projectId: "hepha",
        stage: "validation",
        incidentCode: "test",
        createdAt: "3000-01-01T00:00:00Z",
      } as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F4: rejects malformed outer input", () => {
    const store = createStore();

    expect(() =>
      store.recordSafeIncident(null as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F4: rejects primitive outer input", () => {
    const store = createStore();

    expect(() =>
      store.recordSafeIncident("not-an-object" as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F4: rejects non-UTC timestamp without Z suffix", () => {
    const store = createStore();

    expect(() =>
      store.recordSafeIncident({
        incidentId: "incident-non-utc",
        projectId: "hepha",
        stage: "validation",
        incidentCode: "test",
        createdAt: "2026-01-15T10:30:00",  // missing Z or +00:00
      } as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F4: rejects impossible month 13", () => {
    const store = createStore();

    expect(() =>
      store.recordSafeIncident({
        incidentId: "incident-month-13",
        projectId: "hepha",
        stage: "validation",
        incidentCode: "test",
        createdAt: "2026-13-01T00:00:00Z",
      } as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F4: rejects impossible day 32", () => {
    const store = createStore();

    expect(() =>
      store.recordSafeIncident({
        incidentId: "incident-day-32",
        projectId: "hepha",
        stage: "validation",
        incidentCode: "test",
        createdAt: "2026-01-32T00:00:00Z",
      } as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F4: rejects impossible date Feb 30", () => {
    const store = createStore();

    expect(() =>
      store.recordSafeIncident({
        incidentId: "incident-feb-30",
        projectId: "hepha",
        stage: "validation",
        incidentCode: "test",
        createdAt: "2026-02-30T00:00:00Z",
      } as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F4-safe-incident-negative-matrix: rejects seconds 60 and 99 while accepting 00 and 59", () => {
    const store = createStore();
    for (const second of ["60", "99"]) {
      expect(() => store.recordSafeIncident({
        incidentId: `incident-second-${second}`,
        projectId: "hepha",
        stage: "validation",
        incidentCode: "test",
        createdAt: `2026-01-01T00:00:${second}Z`,
      } as never)).toThrow("INVALID_INPUT");
    }
    for (const second of ["00", "59"]) {
      store.recordSafeIncident({
        incidentId: `incident-valid-second-${second}`,
        projectId: "hepha",
        stage: "validation",
        incidentCode: "test",
        createdAt: `2026-01-01T00:00:${second}Z`,
      });
    }
    const count = store["database"].prepare("select count(*) as count from hepha_review_safe_incidents").get() as { count: number };
    expect(count.count).toBe(2);
    store.close();
  });

  it("F4: rejects null projectId", () => {
    const store = createStore();
    const now = new Date().toISOString();

    expect(() =>
      store.recordSafeIncident({
        incidentId: "incident-null-project",
        projectId: null as never,
        stage: "validation",
        incidentCode: "test",
        createdAt: now,
      } as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F4: rejects empty string incidentId", () => {
    const store = createStore();
    const now = new Date().toISOString();

    expect(() =>
      store.recordSafeIncident({
        incidentId: "",
        projectId: "hepha",
        stage: "validation",
        incidentCode: "test",
        createdAt: now,
      } as never),
    ).toThrow("INVALID_INPUT");

    store.close();
  });

  it("F4: rejects null featureId when key is present", () => {
    const store = createStore();
    const now = new Date().toISOString();

    expect(() =>
      store.recordSafeIncident({
        incidentId: "incident-feature-null",
        projectId: "hepha",
        featureId: null,
        stage: "validation",
        incidentCode: "test",
        createdAt: now,
      }),
    ).toThrow("INVALID_INPUT");

    store.close();
  });
});

// ---------------------------------------------------------------------------
// Latest F1–F3 review acceptance evidence
// ---------------------------------------------------------------------------

describe("latest-review-required-regressions", () => {
  it("F1-canonical-identity-negative: rejects missing or malformed nested V1 finding members before writes", () => {
    const store = createStore();
    const base = JSON.parse(makeV1ArtifactJson()) as Record<string, unknown>;
    const finding = (base.findings as Record<string, unknown>[])[0];
    delete finding.surface;
    const missingSurface = canonicalizeTestJson(base);
    expect(() => store.ingestValidatedReviewEvidence(makeValidIngestInput({
      canonicalJson: missingSurface,
      contentHash: computeSha256Hex(missingSurface),
    }))).toThrow("INVALID_INPUT");

    const malformed = JSON.parse(makeV1ArtifactJson()) as Record<string, unknown>;
    ((malformed.findings as Record<string, unknown>[])[0].surface as Record<string, unknown>).affected = [{}];
    const malformedSurface = canonicalizeTestJson(malformed);
    expect(() => store.ingestValidatedReviewEvidence(makeValidIngestInput({
      canonicalJson: malformedSurface,
      contentHash: computeSha256Hex(malformedSurface),
    }))).toThrow("INVALID_INPUT");
    expect(store.listArtifactsByScope({ projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" })).toHaveLength(0);
    store.close();
  });

  it("F1-current-v1-authority-matrix: rejects stale catalog bytes and independently altered canonical derivatives", () => {
    const store = createStore();
    const staleArtifact = JSON.parse(makeV1ArtifactJson()) as Record<string, unknown>;
    ((staleArtifact.ruleSnapshots as Record<string, unknown>[])[0]).ruleHash = "c".repeat(64);
    const staleCanonicalJson = canonicalizeTestJson(staleArtifact);
    expect(() => store.ingestValidatedReviewEvidence(makeValidIngestInput({
      canonicalJson: staleCanonicalJson,
      contentHash: computeSha256Hex(staleCanonicalJson),
    }))).toThrow("INVALID_INPUT");

    const base = makeValidIngestInput();
    const alteredFindings = JSON.parse(JSON.stringify(base.findings)) as Record<string, unknown>[];
    const observation = alteredFindings[0].observation as Record<string, unknown>;
    observation.surfaceJson = "[]";
    expect(() => store.ingestValidatedReviewEvidence({ ...base, findings: alteredFindings as never })).toThrow("INVALID_INPUT");
    expect(store.listArtifactsByScope({ projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" })).toHaveLength(0);
    store.close();
  });

  it("F1-current-v1-policy-matrix: rejects authority, severity, duplicate-ID, and obligation violations", () => {
    const store = createStore();
    const invalidArtifacts: Record<string, unknown>[] = [];

    const noteBlocker = JSON.parse(makeV1ArtifactJson()) as Record<string, unknown>;
    (noteBlocker.findings as Record<string, unknown>[])[0].severity = "note";
    invalidArtifacts.push(noteBlocker);

    const activeRuleFeatureClaim = JSON.parse(makeV1ArtifactJson()) as Record<string, unknown>;
    (activeRuleFeatureClaim.findings as Record<string, unknown>[])[0].claimType = "feature_correctness";
    invalidArtifacts.push(activeRuleFeatureClaim);

    const debtBlocker = JSON.parse(makeV1ArtifactJson()) as Record<string, unknown>;
    const debtFinding = (debtBlocker.findings as Record<string, unknown>[])[0];
    debtFinding.disposition = "ARCHITECTURE_DEBT";
    delete debtFinding.rootCause;
    delete debtFinding.remediationItems;
    delete debtFinding.testMatrix;
    delete debtFinding.exhaustivenessDecision;
    delete debtFinding.compatibilityDecision;
    debtFinding.debtImpact = "untouched_non_blocking";
    invalidArtifacts.push(debtBlocker);

    const duplicateIds = JSON.parse(makeV1ArtifactJson()) as Record<string, unknown>;
    (duplicateIds.findings as Record<string, unknown>[]).push(JSON.parse(JSON.stringify((duplicateIds.findings as Record<string, unknown>[])[0])));
    invalidArtifacts.push(duplicateIds);

    for (const artifact of invalidArtifacts) {
      const canonicalJson = canonicalizeTestJson(artifact);
      expect(() => store.ingestValidatedReviewEvidence(makeValidIngestInput({
        canonicalJson,
        contentHash: computeSha256Hex(canonicalJson),
      }))).toThrow("INVALID_INPUT");
    }
    expect(store.listArtifactsByScope({ projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" })).toHaveLength(0);
    store.close();
  });

  it("F1-exact-artifact-readback: exposes every immutable field verified by the public ingest boundary", () => {
    const store = createStore();
    const input = makeValidIngestInput();
    store.ingestValidatedReviewEvidence(input);
    const artifact = store.getArtifactByHash(input.contentHash)!;
    expect(artifact).toMatchObject({
      artifactId: input.artifactId,
      artifactKind: input.artifactKind,
      schemaVersion: input.schemaVersion,
      canonicalJson: input.canonicalJson,
      sourceMode: input.sourceMode,
      ingestedAt: input.ingestedAt,
    });
    store.close();
  });

  it("F2-response-exact-binding: rejects missing, extra, and duplicate normalized mappings", () => {
    const store = createStore();
    const now = new Date().toISOString();
    const manifestJson = makeV1ArtifactJson({ artifactId: "manifest-response-exact" });
    const manifestHash = computeSha256Hex(manifestJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({ canonicalJson: manifestJson, contentHash: manifestHash, artifactId: "manifest-response-exact", reviewRunId: "run-response-exact" }));
    const responseJson = makeV1ArtifactJson({ artifactKind: "remediation_response", artifactId: "response-exact", basisManifestHash: manifestHash, basisManifestArtifactId: "manifest-response-exact" });
    const responseHash = computeSha256Hex(responseJson);
    const base = {
      contentHash: responseHash, artifactId: "response-exact", artifactKind: "remediation_response" as const,
      schemaVersion: 1, canonicalJson: responseJson, projectId: "hepha", featureId: "feat-065", phaseNumber: 2,
      reviewGateId: "code-review", featureRootPath: "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha",
      artifactRelativePath: `MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/code-reviews/artifacts/remediation_response/${responseHash}.json`,
      sourceMode: "v1_validated_ingress" as const, ingestedAt: now, basisManifestHash: manifestHash, lineage: {},
      cycle: { cycleId: "cycle-response-exact", basisManifestHash: manifestHash, cycleState: "AWAITING_RESPONSE" as const, createdAt: now },
    };
    const item = { itemEventId: "response-exact-item", cycleId: "cycle-response-exact", reviewRunId: "run-response-exact", findingId: "finding-001", remediationItemId: "fix-001", eventKind: "response_evidence", responseHash, decision: "APPLIED", createdAt: now };
    expect(() => store.ingestValidatedReviewEvidence({ ...base, remediationItems: [] })).toThrow("INVALID_INPUT");
    expect(() => store.ingestValidatedReviewEvidence({ ...base, remediationItems: [item, { ...item, itemEventId: "response-exact-item-2" }] })).toThrow("INVALID_INPUT");
    expect(() => store.ingestValidatedReviewEvidence({ ...base, remediationItems: [{ ...item, remediationItemId: "unknown-item" }] })).toThrow("INVALID_INPUT");
    expect(store.getArtifactByHash(responseHash)).toBeNull();
    store.ingestValidatedReviewEvidence({ ...base, remediationItems: [item] });
    expect(store.getArtifactByHash(responseHash)).toBeTruthy();
    store.close();
  });

  it("F2-receipt-replan-debt-binding: exact non-manifest controls persist and foreign bindings reject", () => {
    const store = createStore();
    const now = new Date().toISOString();
    const featureRootPath = "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha";
    const manifestJson = makeV1ArtifactJson({ artifactId: "manifest-descendant-contract" });
    const manifestHash = computeSha256Hex(manifestJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({ canonicalJson: manifestJson, contentHash: manifestHash, artifactId: "manifest-descendant-contract", reviewRunId: "run-descendant-contract" }));

    const responseJson = makeV1ArtifactJson({ artifactKind: "remediation_response", artifactId: "response-descendant-contract", basisManifestHash: manifestHash, basisManifestArtifactId: "manifest-descendant-contract" });
    const responseHash = computeSha256Hex(responseJson);
    store.ingestValidatedReviewEvidence({
      contentHash: responseHash, artifactId: "response-descendant-contract", artifactKind: "remediation_response", schemaVersion: 1,
      canonicalJson: responseJson, projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review", featureRootPath,
      artifactRelativePath: `${featureRootPath}/code-reviews/artifacts/remediation_response/${responseHash}.json`, sourceMode: "v1_validated_ingress", ingestedAt: now,
      basisManifestHash: manifestHash, lineage: {}, cycle: { cycleId: "cycle-descendant-contract", basisManifestHash: manifestHash, cycleState: "AWAITING_RESPONSE", createdAt: now },
      remediationItems: [{ itemEventId: "item-descendant-contract", cycleId: "cycle-descendant-contract", reviewRunId: "run-descendant-contract", findingId: "finding-001", remediationItemId: "fix-001", eventKind: "response_evidence", responseHash, decision: "APPLIED", createdAt: now }],
    });

    const receipt = JSON.parse(makeV1ArtifactJson({ artifactKind: "verification_receipt", artifactId: "receipt-descendant-contract", basisManifestHash: manifestHash, basisManifestArtifactId: "manifest-descendant-contract", responseHash, responseArtifactId: "response-descendant-contract" })) as Record<string, unknown>;
    receipt.itemReceipts = [{ findingId: "finding-001", remediationItemId: "fix-001", outcome: "VERIFIED", evidence: "Applied remediation verified." }];
    receipt.testReceipts = [{ findingId: "finding-001", testId: "test-001", outcome: "PASSED", evidence: "Focused test passed." }];
    const receiptJson = canonicalizeTestJson(receipt);
    const receiptHash = computeSha256Hex(receiptJson);
    store.ingestValidatedReviewEvidence({
      contentHash: receiptHash, artifactId: "receipt-descendant-contract", artifactKind: "verification_receipt", schemaVersion: 1,
      canonicalJson: receiptJson, projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review", featureRootPath,
      artifactRelativePath: `${featureRootPath}/code-reviews/artifacts/verification_receipt/${receiptHash}.json`, sourceMode: "v1_validated_ingress", ingestedAt: now,
      basisManifestHash: manifestHash, lineage: {},
      verificationReceipts: [
        { receiptEventId: "receipt-item-contract", cycleId: "cycle-descendant-contract", receiptHash, reviewRunId: "run-descendant-contract", findingId: "finding-001", subjectKind: "remediation_item", subjectId: "fix-001", outcome: "VERIFIED", evidenceSummary: "Applied remediation verified.", createdAt: now },
        { receiptEventId: "receipt-test-contract", cycleId: "cycle-descendant-contract", receiptHash, reviewRunId: "run-descendant-contract", findingId: "finding-001", subjectKind: "test", subjectId: "test-001", outcome: "PASSED", evidenceSummary: "Focused test passed.", createdAt: now },
      ],
    });
    expect(store.getArtifactByHash(receiptHash)).toBeTruthy();

    const replanManifest = JSON.parse(makeV1ArtifactJson({ artifactId: "manifest-replan-contract" })) as Record<string, unknown>;
    (replanManifest.findings as Record<string, unknown>[])[0].exhaustivenessDecision = "replan_required";
    const replanManifestJson = canonicalizeTestJson(replanManifest);
    const replanManifestHash = computeSha256Hex(replanManifestJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({ canonicalJson: replanManifestJson, contentHash: replanManifestHash, artifactId: "manifest-replan-contract", reviewRunId: "run-replan-contract" }));
    const replanJson = makeV1ArtifactJson({ artifactKind: "replan_plan", artifactId: "replan-contract", basisManifestHash: replanManifestHash, basisManifestArtifactId: "manifest-replan-contract" });
    const replanHash = computeSha256Hex(replanJson);
    store.ingestValidatedReviewEvidence({ contentHash: replanHash, artifactId: "replan-contract", artifactKind: "replan_plan", schemaVersion: 1, canonicalJson: replanJson, projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review", featureRootPath, artifactRelativePath: `${featureRootPath}/code-reviews/artifacts/replan_plan/${replanHash}.json`, sourceMode: "v1_validated_ingress", ingestedAt: now, basisManifestHash: replanManifestHash, lineage: {} });
    expect(store.getArtifactByHash(replanHash)).toBeTruthy();

    const debtManifest = JSON.parse(makeV1ArtifactJson({ artifactId: "manifest-debt-contract" })) as Record<string, unknown>;
    const debtFinding = JSON.parse(JSON.stringify((debtManifest.findings as Record<string, unknown>[])[0])) as Record<string, unknown>;
    debtFinding.findingId = "finding-debt";
    debtFinding.disposition = "ARCHITECTURE_DEBT";
    debtFinding.severity = "note";
    delete debtFinding.rootCause;
    delete debtFinding.remediationItems;
    delete debtFinding.testMatrix;
    delete debtFinding.exhaustivenessDecision;
    delete debtFinding.compatibilityDecision;
    debtFinding.debtImpact = "untouched_non_blocking";
    (debtManifest.findings as Record<string, unknown>[]).push(debtFinding);
    const debtManifestJson = canonicalizeTestJson(debtManifest);
    const debtManifestHash = computeSha256Hex(debtManifestJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({ canonicalJson: debtManifestJson, contentHash: debtManifestHash, artifactId: "manifest-debt-contract", reviewRunId: "run-debt-contract", ingestedAt: now, findings: deriveTestFindings(debtManifestJson, "manifest-debt-contract", now) }));
    const debtArtifact = JSON.parse(makeV1ArtifactJson({ artifactKind: "debt_observation", artifactId: "debt-contract", basisManifestHash: debtManifestHash, basisManifestArtifactId: "manifest-debt-contract" })) as Record<string, unknown>;
    debtArtifact.findingId = "finding-debt";
    const debtJson = canonicalizeTestJson(debtArtifact);
    const debtHash = computeSha256Hex(debtJson);
    store.ingestValidatedReviewEvidence({ contentHash: debtHash, artifactId: "debt-contract", artifactKind: "debt_observation", schemaVersion: 1, canonicalJson: debtJson, projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review", featureRootPath, artifactRelativePath: `${featureRootPath}/code-reviews/artifacts/debt_observation/${debtHash}.json`, sourceMode: "v1_validated_ingress", ingestedAt: now, basisManifestHash: debtManifestHash, lineage: {} });
    expect(store.getArtifactByHash(debtHash)).toBeTruthy();

    const wrongDebt = JSON.parse(debtJson) as Record<string, unknown>;
    wrongDebt.artifactId = "debt-contract-foreign";
    wrongDebt.findingId = "foreign-finding";
    const wrongDebtJson = canonicalizeTestJson(wrongDebt);
    expect(() => store.ingestValidatedReviewEvidence({ contentHash: computeSha256Hex(wrongDebtJson), artifactId: "debt-contract-foreign", artifactKind: "debt_observation", schemaVersion: 1, canonicalJson: wrongDebtJson, projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review", featureRootPath, artifactRelativePath: `${featureRootPath}/code-reviews/artifacts/debt_observation/${computeSha256Hex(wrongDebtJson)}.json`, sourceMode: "v1_validated_ingress", ingestedAt: now, basisManifestHash: debtManifestHash, lineage: {} })).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F2-reference-negative-matrix: rejects canonical-versus-request lineage mismatch before writes", () => {
    const store = createStore();
    const predecessorJson = makeV1ArtifactJson({ artifactId: "manifest-lineage-predecessor", manifestResult: "NEEDS_CHANGES" });
    const predecessorHash = computeSha256Hex(predecessorJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({
      canonicalJson: predecessorJson, contentHash: predecessorHash, artifactId: "manifest-lineage-predecessor", reviewRunId: "run-lineage-predecessor",
    }));
    const successorJson = makeV1ArtifactJson({ artifactId: "manifest-lineage-successor", manifestResult: "APPROVED", lineage: {
      supersedes: { artifactKind: "review_manifest", artifactId: "manifest-lineage-predecessor", contentHash: predecessorHash, relativePath: `MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/code-reviews/artifacts/review_manifest/${predecessorHash}.json` },
    } });
    const successorHash = computeSha256Hex(successorJson);
    expect(() => store.ingestValidatedReviewEvidence(makeValidIngestInput({
      canonicalJson: successorJson, contentHash: successorHash, artifactId: "manifest-lineage-successor", reviewRunId: "run-lineage-successor",
      lineage: { supersedesHash: "a".repeat(64) },
    }))).toThrow("INVALID_INPUT");
    expect(store.getArtifactByHash(successorHash)).toBeNull();
    store.close();
  });

  it("F2-reference-negative-matrix: rejects same-scope cycle and gate basis hashes that differ from this manifest", () => {
    const store = createStore();
    const now = new Date().toISOString();
    const priorJson = makeV1ArtifactJson({ artifactId: "manifest-prior-basis" });
    const priorHash = computeSha256Hex(priorJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({ canonicalJson: priorJson, contentHash: priorHash, artifactId: "manifest-prior-basis", reviewRunId: "run-prior-basis" }));

    const candidateJson = makeV1ArtifactJson({ artifactId: "manifest-wrong-basis" });
    const candidateHash = computeSha256Hex(candidateJson);
    const candidate = makeValidIngestInput({ canonicalJson: candidateJson, contentHash: candidateHash, artifactId: "manifest-wrong-basis", reviewRunId: "run-wrong-basis" });
    expect(() => store.ingestValidatedReviewEvidence({
      ...candidate,
      cycle: { cycleId: "cycle-wrong-basis", basisManifestHash: priorHash, cycleState: "OPEN", createdAt: now },
      gateDecision: { triggerArtifactHash: candidateHash, basisManifestHash: priorHash, gateState: "REJECTED", reasonCode: "review_needs_changes", decidedAt: now },
    })).toThrow("INVALID_INPUT");
    expect(store.getArtifactByHash(candidateHash)).toBeNull();
    expect(store.listArtifactsByScope({ projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" })).toHaveLength(1);
    store.close();
  });

  it("F1-current-v1-authority-residual: accepts current V1 feature authority and observations while rejecting authority and collection violations", () => {
    const store = createStore();
    const featureRootPath = "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha";
    const ingest = (artifact: Record<string, unknown>, artifactId: string): void => {
      const canonicalJson = canonicalizeTestJson(artifact);
      store.ingestValidatedReviewEvidence(makeValidIngestInput({
        artifactId,
        canonicalJson,
        contentHash: computeSha256Hex(canonicalJson),
        featureRootPath,
        manifestResult: artifact.result as string,
        reviewRunId: `run-${artifactId}`,
        findings: deriveTestFindings(canonicalJson, artifactId, "2026-07-14T15:00:00Z"),
        ingestedAt: "2026-07-14T15:00:00Z",
      }));
    };
    const featureOnly = JSON.parse(makeV1ArtifactJson({ artifactId: "manifest-feature-authority" })) as Record<string, unknown>;
    featureOnly.ruleSnapshots = [];
    (featureOnly.findings as Record<string, unknown>[])[0].claimType = "feature_correctness";
    (featureOnly.findings as Record<string, unknown>[])[0].authority = {
      kind: "acceptance_criterion", reference: "ac:feat-065:acceptance-1",
      source: { relativePath: "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha/FeatureDescription.md", section: "Acceptance Criteria" },
    };
    ingest(featureOnly, "manifest-feature-authority");

    const authoritylessObservation = JSON.parse(makeV1ArtifactJson({ artifactId: "manifest-authorityless-observation", manifestResult: "APPROVED" })) as Record<string, unknown>;
    authoritylessObservation.ruleSnapshots = [];
    delete (authoritylessObservation.findings as Record<string, unknown>[])[0].authority;
    ingest(authoritylessObservation, "manifest-authorityless-observation");

    const rejects = (mutate: (artifact: Record<string, unknown>) => void, id: string): void => {
      const artifact = JSON.parse(makeV1ArtifactJson({ artifactId: id })) as Record<string, unknown>;
      mutate(artifact);
      const canonicalJson = canonicalizeTestJson(artifact);
      expect(() => store.ingestValidatedReviewEvidence(makeValidIngestInput({
        artifactId: id, canonicalJson, contentHash: computeSha256Hex(canonicalJson),
        findings: deriveTestFindings(canonicalJson, id, "2026-07-14T15:00:00Z"), ingestedAt: "2026-07-14T15:00:00Z",
      }))).toThrow("INVALID_INPUT");
    };
    rejects((artifact) => {
      const finding = (artifact.findings as Record<string, unknown>[])[0];
      finding.claimType = "feature_correctness";
      finding.authority = { kind: "acceptance_criterion", reference: "ac:other-feature:acceptance-1", source: { relativePath: "FeatureDescription.md", section: "Acceptance" } };
      artifact.ruleSnapshots = [];
    }, "manifest-cross-feature-authority");
    rejects((artifact) => {
      const finding = (artifact.findings as Record<string, unknown>[])[0];
      finding.claimType = "security";
      finding.authority = { kind: "acceptance_criterion", reference: "ac:feat-065:acceptance-1", source: { relativePath: "FeatureDescription.md", section: "Acceptance" } };
      artifact.ruleSnapshots = [];
    }, "manifest-nonfeature-ac");
    rejects((artifact) => {
      const finding = (artifact.findings as Record<string, unknown>[])[0];
      finding.claimType = "feature_correctness";
      finding.authority = { kind: "acceptance_criterion", reference: "ac:feat-065:", source: { relativePath: "FeatureDescription.md", section: "Acceptance" } };
      artifact.ruleSnapshots = [];
    }, "manifest-malformed-ac");
    rejects((artifact) => { const finding = (artifact.findings as Record<string, unknown>[])[0]; finding.disposition = "OBSERVATION"; finding.severity = "blocker"; delete finding.rootCause; delete finding.remediationItems; delete finding.testMatrix; delete finding.exhaustivenessDecision; delete finding.compatibilityDecision; }, "manifest-observation-blocker");
    rejects((artifact) => { const finding = (artifact.findings as Record<string, unknown>[])[0]; finding.surface.inspected.push({ surfaceId: "inspected-1", relativePath: "src/lib/core.ts" }); }, "manifest-duplicate-surface");
    rejects((artifact) => {
      const finding = (artifact.findings as Record<string, unknown>[])[0];
      const targetIds = Array.from({ length: 129 }, (_, index) => `affected-${index + 1}`);
      finding.surface.affected = targetIds.map((surfaceId) => ({ surfaceId, relativePath: "src/lib/core.ts" }));
      finding.remediationItems[0].targetSurfaceIds = targetIds;
      finding.testMatrix[0].targetSurfaceIds = targetIds;
    }, "manifest-target-over-limit");
    rejects((artifact) => { const finding = (artifact.findings as Record<string, unknown>[])[0]; finding.remediationItems[0].targetSurfaceIds = ["affected-1", "affected-1"]; }, "manifest-duplicate-target");
    rejects((artifact) => {
      const finding = (artifact.findings as Record<string, unknown>[])[0];
      finding.surface = { inspected: Array.from({ length: 129 }, (_, index) => ({ surfaceId: `inspected-${index + 1}`, relativePath: "src/lib/core.ts" })), affected: [], confirmedUnaffected: [] };
    }, "manifest-surface-over-limit");
    rejects((artifact) => {
      const finding = (artifact.findings as Record<string, unknown>[])[0];
      finding.surface.affected[0].surfaceId = "inspected-1";
      finding.remediationItems[0].targetSurfaceIds = ["inspected-1"];
      finding.testMatrix[0].targetSurfaceIds = ["inspected-1"];
      finding.surface.confirmedUnaffected[0].surfaceId = "inspected-1";
    }, "manifest-surface-overlap");

    const roleReuse = JSON.parse(makeV1ArtifactJson({ artifactId: "manifest-surface-role-reuse" })) as Record<string, unknown>;
    const roleFinding = (roleReuse.findings as Record<string, unknown>[])[0];
    roleFinding.surface.affected[0].surfaceId = "inspected-1";
    roleFinding.remediationItems[0].targetSurfaceIds = ["inspected-1"];
    roleFinding.testMatrix[0].targetSurfaceIds = ["inspected-1"];
    ingest(roleReuse, "manifest-surface-role-reuse");
    store.close();
  });

  it("F2-response-complete-binding-residual: requires complete canonical response mappings", () => {
    const store = createStore();
    const now = "2026-07-14T15:00:00Z";
    const featureRootPath = "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha";
    const manifest = JSON.parse(makeV1ArtifactJson({ artifactId: "manifest-complete-response" })) as Record<string, unknown>;
    (manifest.findings as Record<string, unknown>[])[0].remediationItems.push({ remediationItemId: "fix-002", instruction: "Add the second bounded fix.", targetSurfaceIds: ["affected-1"] });
    const manifestJson = canonicalizeTestJson(manifest);
    const manifestHash = computeSha256Hex(manifestJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({ artifactId: "manifest-complete-response", canonicalJson: manifestJson, contentHash: manifestHash, reviewRunId: "run-complete-response", ingestedAt: now, findings: deriveTestFindings(manifestJson, "manifest-complete-response", now) }));
    const makeResponseInput = (response: Record<string, unknown>, items: readonly Record<string, unknown>[]): Record<string, unknown> => {
      const canonicalJson = canonicalizeTestJson(response);
      const contentHash = computeSha256Hex(canonicalJson);
      return { contentHash, artifactId: response.artifactId, artifactKind: "remediation_response", schemaVersion: 1, canonicalJson, projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review", featureRootPath, artifactRelativePath: `${featureRootPath}/code-reviews/artifacts/remediation_response/${contentHash}.json`, sourceMode: "v1_validated_ingress", ingestedAt: now, basisManifestHash: manifestHash, lineage: {}, cycle: { cycleId: "cycle-complete-response", basisManifestHash: manifestHash, cycleState: "AWAITING_RESPONSE", createdAt: now }, remediationItems: items };
    };
    const incomplete = JSON.parse(makeV1ArtifactJson({ artifactKind: "remediation_response", artifactId: "response-incomplete", basisManifestHash: manifestHash, basisManifestArtifactId: "manifest-complete-response" })) as Record<string, unknown>;
    const incompleteJson = canonicalizeTestJson(incomplete);
    const incompleteHash = computeSha256Hex(incompleteJson);
    const incompleteItem = { itemEventId: "item-incomplete", cycleId: "cycle-complete-response", reviewRunId: "run-complete-response", findingId: "finding-001", remediationItemId: "fix-001", eventKind: "response_evidence", responseHash: incompleteHash, decision: "APPLIED", createdAt: now };
    expect(() => store.ingestValidatedReviewEvidence(makeResponseInput(incomplete, [incompleteItem]))).toThrow("INVALID_INPUT");
    const unknownItemResponse = JSON.parse(JSON.stringify(incomplete)) as Record<string, unknown>;
    unknownItemResponse.artifactId = "response-unknown-item";
    (unknownItemResponse.findingResponses as Record<string, unknown>[])[0].items[0].remediationItemId = "unknown-item";
    const unknownItemJson = canonicalizeTestJson(unknownItemResponse);
    const unknownItemHash = computeSha256Hex(unknownItemJson);
    expect(() => store.ingestValidatedReviewEvidence(makeResponseInput(unknownItemResponse, [{ ...incompleteItem, itemEventId: "item-unknown", remediationItemId: "unknown-item", responseHash: unknownItemHash }]))).toThrow("INVALID_INPUT");
    const duplicateItemResponse = JSON.parse(JSON.stringify(incomplete)) as Record<string, unknown>;
    duplicateItemResponse.artifactId = "response-duplicate-item";
    (duplicateItemResponse.findingResponses as Record<string, unknown>[])[0].items.push(JSON.parse(JSON.stringify((duplicateItemResponse.findingResponses as Record<string, unknown>[])[0].items[0])));
    const duplicateItemJson = canonicalizeTestJson(duplicateItemResponse);
    const duplicateItemHash = computeSha256Hex(duplicateItemJson);
    expect(() => store.ingestValidatedReviewEvidence(makeResponseInput(duplicateItemResponse, [{ ...incompleteItem, itemEventId: "item-duplicate", responseHash: duplicateItemHash }]))).toThrow("INVALID_INPUT");

    const complete = JSON.parse(JSON.stringify(incomplete)) as Record<string, unknown>;
    complete.artifactId = "response-complete";
    (complete.findingResponses as Record<string, unknown>[])[0].items.push({ remediationItemId: "fix-002", decision: "APPLIED", changedSurfaceIds: ["affected-1"], rationale: "Applied the second bounded remediation." });
    const completeJson = canonicalizeTestJson(complete);
    const completeHash = computeSha256Hex(completeJson);
    const completeItems = [
      { itemEventId: "item-complete-1", cycleId: "cycle-complete-response", reviewRunId: "run-complete-response", findingId: "finding-001", remediationItemId: "fix-001", eventKind: "response_evidence", responseHash: completeHash, decision: "APPLIED", createdAt: now },
      { itemEventId: "item-complete-2", cycleId: "cycle-complete-response", reviewRunId: "run-complete-response", findingId: "finding-001", remediationItemId: "fix-002", eventKind: "response_evidence", responseHash: completeHash, decision: "APPLIED", createdAt: now },
    ];
    store.ingestValidatedReviewEvidence(makeResponseInput(complete, completeItems));
    expect(store.getArtifactByHash(completeHash)).toBeTruthy();
    store.close();
  });

  it("F2-receipt-response-and-cycle-basis-residual: rejects a same-scope foreign response basis", () => {
    const store = createStore();
    const now = "2026-07-14T15:00:00Z";
    const featureRootPath = "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha";
    const ingestManifest = (id: string, runId: string, cycleId?: string): string => {
      const canonicalJson = makeV1ArtifactJson({ artifactId: id });
      const contentHash = computeSha256Hex(canonicalJson);
      store.ingestValidatedReviewEvidence(makeValidIngestInput({ artifactId: id, canonicalJson, contentHash, reviewRunId: runId, ingestedAt: now, findings: deriveTestFindings(canonicalJson, id, now), ...(cycleId ? { cycle: { cycleId, basisManifestHash: contentHash, cycleState: "AWAITING_RECEIPT" as const, createdAt: now } } : {}) }));
      return contentHash;
    };
    const firstManifestHash = ingestManifest("manifest-response-basis-one", "run-response-basis-one", "cycle-response-basis-one");
    const secondManifestHash = ingestManifest("manifest-response-basis-two", "run-response-basis-two", "cycle-response-basis-two");
    const responseJson = makeV1ArtifactJson({ artifactKind: "remediation_response", artifactId: "response-basis-one", basisManifestHash: firstManifestHash, basisManifestArtifactId: "manifest-response-basis-one" });
    const responseHash = computeSha256Hex(responseJson);
    store.ingestValidatedReviewEvidence({ contentHash: responseHash, artifactId: "response-basis-one", artifactKind: "remediation_response", schemaVersion: 1, canonicalJson: responseJson, projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review", featureRootPath, artifactRelativePath: `${featureRootPath}/code-reviews/artifacts/remediation_response/${responseHash}.json`, sourceMode: "v1_validated_ingress", ingestedAt: now, basisManifestHash: firstManifestHash, lineage: {}, remediationItems: [{ itemEventId: "item-response-basis-one", cycleId: "cycle-response-basis-one", reviewRunId: "run-response-basis-one", findingId: "finding-001", remediationItemId: "fix-001", eventKind: "response_evidence", responseHash, decision: "APPLIED", createdAt: now }] });
    const foreignCycleResponse = JSON.parse(responseJson) as Record<string, unknown>;
    foreignCycleResponse.artifactId = "response-foreign-cycle";
    const foreignCycleJson = canonicalizeTestJson(foreignCycleResponse);
    const foreignCycleHash = computeSha256Hex(foreignCycleJson);
    expect(() => store.ingestValidatedReviewEvidence({ contentHash: foreignCycleHash, artifactId: "response-foreign-cycle", artifactKind: "remediation_response", schemaVersion: 1, canonicalJson: foreignCycleJson, projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review", featureRootPath, artifactRelativePath: `${featureRootPath}/code-reviews/artifacts/remediation_response/${foreignCycleHash}.json`, sourceMode: "v1_validated_ingress", ingestedAt: now, basisManifestHash: firstManifestHash, lineage: {}, remediationItems: [{ itemEventId: "item-response-foreign-cycle", cycleId: "cycle-response-basis-two", reviewRunId: "run-response-basis-one", findingId: "finding-001", remediationItemId: "fix-001", eventKind: "response_evidence", responseHash: foreignCycleHash, decision: "APPLIED", createdAt: now }] })).toThrow("INVALID_INPUT");
    const receipt = JSON.parse(makeV1ArtifactJson({ artifactKind: "verification_receipt", artifactId: "receipt-foreign-response", basisManifestHash: secondManifestHash, basisManifestArtifactId: "manifest-response-basis-two", responseHash, responseArtifactId: "response-basis-one" })) as Record<string, unknown>;
    receipt.itemReceipts = [{ findingId: "finding-001", remediationItemId: "fix-001", outcome: "VERIFIED", evidence: "Verified." }];
    receipt.testReceipts = [{ findingId: "finding-001", testId: "test-001", outcome: "PASSED", evidence: "Passed." }];
    const receiptJson = canonicalizeTestJson(receipt);
    const receiptHash = computeSha256Hex(receiptJson);
    expect(() => store.ingestValidatedReviewEvidence({ contentHash: receiptHash, artifactId: "receipt-foreign-response", artifactKind: "verification_receipt", schemaVersion: 1, canonicalJson: receiptJson, projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review", featureRootPath, artifactRelativePath: `${featureRootPath}/code-reviews/artifacts/verification_receipt/${receiptHash}.json`, sourceMode: "v1_validated_ingress", ingestedAt: now, basisManifestHash: secondManifestHash, lineage: {}, verificationReceipts: [{ receiptEventId: "receipt-foreign-item", cycleId: "cycle-response-basis-two", receiptHash, reviewRunId: "run-response-basis-two", findingId: "finding-001", subjectKind: "remediation_item", subjectId: "fix-001", outcome: "VERIFIED", evidenceSummary: "Verified.", createdAt: now }, { receiptEventId: "receipt-foreign-test", cycleId: "cycle-response-basis-two", receiptHash, reviewRunId: "run-response-basis-two", findingId: "finding-001", subjectKind: "test", subjectId: "test-001", outcome: "PASSED", evidenceSummary: "Passed.", createdAt: now }] })).toThrow("INVALID_INPUT");
    store.close();
  });

  it("F1/F2/F3/F4/F5 review contract regressions: validates lifecycle collections, safe V1 prose, reads all normalized evidence, and sanitizes storage failures", () => {
    const store = createStore();
    const scope = { projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" };
    const input = makeValidIngestInput({ reviewRunId: "run-review-contract" });

    for (const evidenceHashes of [42, {}, null, Array(129).fill("a".repeat(64)), ["a".repeat(64), "a".repeat(64)], ["not-a-hash"]]) {
      expect(() => store.ingestValidatedReviewEvidence({
        ...input,
        gateDecision: {
          triggerArtifactHash: input.contentHash,
          basisManifestHash: input.contentHash,
          gateState: "REJECTED",
          reasonCode: "review_needs_changes",
          evidenceHashes,
          decidedAt: input.ingestedAt,
        },
      } as never)).toThrow("INVALID_INPUT");
      expect(store.listArtifactsByScope(scope)).toHaveLength(0);
    }

    const benign = JSON.parse(makeV1ArtifactJson({ artifactId: "manifest-token-policy", featureId: "feat-token-management" })) as Record<string, unknown>;
    ((benign.findings as Record<string, unknown>[])[0]).summary = "Tokenizer follows password-policy and authorization-flow 😀.";
    const benignJson = canonicalizeTestJson(benign);
    const benignInput = makeValidIngestInput({
      artifactId: "manifest-token-policy", featureId: "feat-token-management", canonicalJson: benignJson,
      contentHash: computeSha256Hex(benignJson), reviewRunId: "run-token-policy",
      findings: deriveTestFindings(benignJson, "manifest-token-policy", input.ingestedAt), ingestedAt: input.ingestedAt,
    });
    expect(() => store.ingestValidatedReviewEvidence(benignInput)).not.toThrow();
    expect(store.getArtifactByHash(benignInput.contentHash)?.canonicalJson).toBe(benignJson);

    // Typed read APIs expose every normalized table without raw SQL or canonical JSON parsing.
    expect(store.listFindingObservationsByRun("run-token-policy")).toHaveLength(1);
    expect(store.listArtifactLineageByArtifactHash(benignInput.contentHash)).toEqual([]);
    expect(store.listRemediationCyclesByScope({ projectId: "hepha", featureId: "feat-token-management", phaseNumber: 2, reviewGateId: "code-review" })).toEqual([]);
    expect(store.listRemediationItemEventsByRun("run-token-policy")).toEqual([]);
    expect(store.listVerificationReceiptEventsByRun("run-token-policy")).toEqual([]);
    for (const invalidRead of [null, [], 42, { projectId: "hepha" }]) {
      expect(() => store.listRemediationCyclesByScope(invalidRead)).toThrow("INVALID_INPUT");
    }

    // The V2 defence-in-depth migration rejects direct SQL that bypasses the public ingress.
    expect(() => store["database"].prepare(
      `insert into hepha_review_artifacts (content_hash, artifact_id, artifact_kind, schema_version, project_id, feature_id, phase_number, review_gate_id, feature_root_path, artifact_relative_path, canonical_json, source_mode, ingested_at)
       values (?, 'direct-invalid-schema', 'review_manifest', 2, 'hepha', 'feat-065', 2, 'code-review', 'MemoryBank/Features/03_IN_PROGRESS/FEAT-065', 'MemoryBank/Features/03_IN_PROGRESS/FEAT-065/code-reviews/artifacts/review_manifest/${"b".repeat(64)}.json', '{}', 'v1_validated_ingress', ?)`
    ).run("b".repeat(64), input.ingestedAt)).toThrow(/CHECK constraint/);

    store.recordSafeIncident({ incidentId: "incident-storage-sanitize", projectId: "hepha", stage: "persistence", incidentCode: "safe", createdAt: input.ingestedAt });
    expect(() => store.recordSafeIncident({ incidentId: "incident-storage-sanitize", projectId: "hepha", stage: "persistence", incidentCode: "safe", createdAt: input.ingestedAt })).toThrow("PERSISTENCE_FAILED");
    expect(store["database"].prepare("select count(*) as count from hepha_review_safe_incidents where incident_id = ?").get("incident-storage-sanitize")).toMatchObject({ count: 1 });
    store.close();
    expect(() => store.recordSafeIncident({ incidentId: "incident-closed-store", projectId: "hepha", stage: "persistence", incidentCode: "safe", createdAt: input.ingestedAt })).toThrow("PERSISTENCE_FAILED");
  });

  it("F3-existing-file-and-race-matrix: maps injected write, fsync, staged-read, link, close, cleanup, race, and unreadable-final failures safely", () => {
    const projectRoot = resolve(tmpdir(), `feat-065-failure-${process.pid}-${Date.now()}`);
    const canonicalJson = canonicalizeTestJson({ artifactId: "file-failure", artifactKind: "review_manifest" });
    const baseRequest = requestForFileTest(projectRoot, canonicalJson);
    mkdirSync(projectRoot, { recursive: true });
    const runFailure = (operations: Partial<ReviewArtifactFileOperations>) => {
      const publisher = new ReviewArtifactFileStore(operations);
      expect(() => ReviewGovernanceSqliteStore.persistArtifactFileV1(baseRequest, publisher))
        .toThrow("PERSISTENCE_FAILED");
    };
    try {
      runFailure({ writeFileSync: (() => { throw Object.assign(new Error("write"), { code: "EIO" }); }) as typeof writeFileSync });
      runFailure({ fsyncSync: (() => { throw Object.assign(new Error("fsync"), { code: "EIO" }); }) as typeof import("node:fs").fsyncSync });
      runFailure({ readFileSync: (() => { throw Object.assign(new Error("staged-read"), { code: "EIO" }); }) as typeof readFileSync });
      runFailure({ linkSync: (() => { throw Object.assign(new Error("link"), { code: "EIO" }); }) as typeof import("node:fs").linkSync });
      runFailure({ closeSync: (() => { throw Object.assign(new Error("close"), { code: "EIO" }); }) as typeof import("node:fs").closeSync });
      runFailure({ unlinkSync: (() => { throw Object.assign(new Error("cleanup"), { code: "EIO" }); }) as typeof import("node:fs").unlinkSync });
      // Cleanup was deliberately unavailable in the preceding case. Its
      // retained staging file is not evidence authority; remove it before
      // checking the cases where cleanup is available.
      const artifactDirectory = resolve(projectRoot, "MemoryBank/Features/03_IN_PROGRESS/FEAT-065/code-reviews/artifacts/review_manifest");
      for (const name of readdirSync(artifactDirectory)) {
        if (name.endsWith(".tmp")) rmSync(resolve(artifactDirectory, name), { force: true });
      }
      const racePublisher = new ReviewArtifactFileStore({
        linkSync: ((stagingPath: Parameters<typeof import("node:fs").linkSync>[0], finalPath: Parameters<typeof import("node:fs").linkSync>[1]) => {
          writeFileSync(finalPath, readFileSync(stagingPath));
          throw Object.assign(new Error("race"), { code: "EEXIST" });
        }) as typeof import("node:fs").linkSync,
      });
      expect(ReviewGovernanceSqliteStore.persistArtifactFileV1(baseRequest, racePublisher).path)
        .toContain(".json");
      const finalPath = ReviewGovernanceSqliteStore.persistArtifactFileV1(baseRequest).path;
      const unreadablePublisher = new ReviewArtifactFileStore({
        readFileSync: ((path: Parameters<typeof readFileSync>[0], ...args: unknown[]) => {
          if (path === finalPath) throw Object.assign(new Error("unreadable"), { code: "EACCES" });
          return readFileSync(path, ...(args as []));
        }) as typeof readFileSync,
      });
      expect(() => ReviewGovernanceSqliteStore.persistArtifactFileV1(baseRequest, unreadablePublisher))
        .toThrow("PERSISTENCE_FAILED");
      expect(readdirSync(dirname(finalPath)).filter((name) => name.endsWith(".tmp"))).toHaveLength(0);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

function requestForFileTest(projectRoot: string, canonicalJson: string) {
  return {
    projectRoot,
    featureRootPath: "MemoryBank/Features/03_IN_PROGRESS/FEAT-065",
    artifactKind: "review_manifest" as const,
    contentHash: computeSha256Hex(canonicalJson),
    canonicalJson,
  };
}

// ---------------------------------------------------------------------------
// Current required review regressions
// ---------------------------------------------------------------------------

describe("catalog-context-cardinality", () => {
  it("catalog-bound-positive: accepts 65 and 256 independently resolved snapshots while a manifest cites one", () => {
    for (const catalogSize of [65, 256]) {
      const dbPath = createTempDbPath();
      const canonicalJson = makeManifestWithFindingCount(`manifest-catalog-${catalogSize}`, 1);
      const contentHash = computeSha256Hex(canonicalJson);
      const store = new ReviewGovernanceSqliteStore(dbPath, {
        currentActiveRuleSnapshots: expandedCurrentCatalogSnapshots(catalogSize),
      });
      const input = makeValidIngestInput({
        artifactId: `manifest-catalog-${catalogSize}`,
        canonicalJson,
        contentHash,
        reviewRunId: `run-catalog-${catalogSize}`,
        ingestedAt: "2026-07-15T00:00:00Z",
        findings: deriveTestFindings(canonicalJson, `manifest-catalog-${catalogSize}`, "2026-07-15T00:00:00Z"),
      });

      expect(store.ingestValidatedReviewEvidence(input)).toBe(contentHash);
      expect(store.getArtifactByHash(contentHash)?.canonicalJson).toBe(canonicalJson);
      store.close();
    }
  });

  it("catalog-bound-negative: rejects invalid or oversized authority before database creation", () => {
    const invalidContexts: unknown[] = [
      undefined,
      { currentActiveRuleSnapshots: null },
      { currentActiveRuleSnapshots: 42 },
      { currentActiveRuleSnapshots: {} },
      { currentActiveRuleSnapshots: [] },
      { currentActiveRuleSnapshots: [{}] },
      { currentActiveRuleSnapshots: [currentCatalogSnapshots()[0], currentCatalogSnapshots()[0]] },
      // This still contains the snapshot a valid request would cite: it must
      // reject rather than truncate or derive authority from that request.
      { currentActiveRuleSnapshots: expandedCurrentCatalogSnapshots(257) },
    ];

    for (const context of invalidContexts) {
      const dbPath = createTempDbPath();
      expect(() => new ReviewGovernanceSqliteStore(dbPath, context as never)).toThrow(/^INVALID_INPUT$/);
      expect(existsSync(dbPath)).toBe(false);
    }
  });

  it("manifest-bound-control: preserves the independent 64-finding manifest limit", () => {
    const store = new ReviewGovernanceSqliteStore(createTempDbPath(), {
      currentActiveRuleSnapshots: expandedCurrentCatalogSnapshots(256),
    });
    const acceptedJson = makeManifestWithFindingCount("manifest-sixty-four-findings", 64);
    const acceptedHash = computeSha256Hex(acceptedJson);
    const accepted = makeValidIngestInput({
      artifactId: "manifest-sixty-four-findings",
      canonicalJson: acceptedJson,
      contentHash: acceptedHash,
      reviewRunId: "run-sixty-four-findings",
      ingestedAt: "2026-07-15T00:00:00Z",
      findings: deriveTestFindings(acceptedJson, "manifest-sixty-four-findings", "2026-07-15T00:00:00Z"),
    });
    expect(store.ingestValidatedReviewEvidence(accepted)).toBe(acceptedHash);

    const rejectedJson = makeManifestWithFindingCount("manifest-sixty-five-findings", 65);
    expect(() => store.ingestValidatedReviewEvidence(makeValidIngestInput({
      artifactId: "manifest-sixty-five-findings",
      canonicalJson: rejectedJson,
      contentHash: computeSha256Hex(rejectedJson),
      reviewRunId: "run-sixty-five-findings",
      ingestedAt: "2026-07-15T00:00:00Z",
      findings: deriveTestFindings(rejectedJson, "manifest-sixty-five-findings", "2026-07-15T00:00:00Z"),
    }))).toThrow(/^INVALID_INPUT$/);
    expect(store.listArtifactsByScope({ projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" })).toHaveLength(1);
    store.close();
  });
});

describe("current-review-required-regressions", () => {
  it("V1 contract-projection conformance: persists every maximum-sized current-V1 finding derivative accepted at ingress", () => {
    const store = createStore();
    const artifact = JSON.parse(makeV1ArtifactJson({ artifactId: "manifest-v1-projection-boundary" })) as Record<string, unknown>;
    const finding = (artifact.findings as Record<string, unknown>[])[0]!;
    const maximumV1Text = "x".repeat(4_096);

    // Each field is valid at the V1 boundary.  The serialized remediation
    // and test matrices are intentionally larger than one V1 text field,
    // proving that persistence accepts the canonical projection rather than
    // accidentally applying the 256-character identifier limit.
    finding.rootCause = maximumV1Text;
    ((finding.remediationItems as Record<string, unknown>[])[0]!).instruction = maximumV1Text;
    ((finding.testMatrix as Record<string, unknown>[])[0]!).requirement = maximumV1Text;
    const scopeExpansionFinding = JSON.parse(JSON.stringify(finding)) as Record<string, unknown>;
    scopeExpansionFinding.findingId = "finding-002";
    scopeExpansionFinding.disposition = "SCOPE_EXPANSION";
    scopeExpansionFinding.scopeExpansionRationale = maximumV1Text;
    (artifact.findings as Record<string, unknown>[]).push(scopeExpansionFinding);

    const canonicalJson = canonicalizeTestJson(artifact);
    const input = makeValidIngestInput({
      artifactId: "manifest-v1-projection-boundary",
      canonicalJson,
      contentHash: computeSha256Hex(canonicalJson),
      reviewRunId: "run-v1-projection-boundary",
      ingestedAt: "2026-07-15T12:00:00Z",
      findings: deriveTestFindings(canonicalJson, "manifest-v1-projection-boundary", "2026-07-15T12:00:00Z"),
    });

    expect(input.findings?.[0]?.observation?.remediationItemsJson.length).toBeGreaterThan(4_096);
    expect(input.findings?.[0]?.observation?.testMatrixJson.length).toBeGreaterThan(4_096);
    expect(store.ingestValidatedReviewEvidence(input)).toBe(input.contentHash);

    const [persisted] = store.listFindingObservationsByRun("run-v1-projection-boundary");
    expect(persisted).toMatchObject({
      rootCause: maximumV1Text,
      remediationItemsJson: input.findings?.[0]?.observation?.remediationItemsJson,
      testMatrixJson: input.findings?.[0]?.observation?.testMatrixJson,
    });
    expect(store.listFindingObservationsByRun("run-v1-projection-boundary")[1]).toMatchObject({
      scopeRationale: maximumV1Text,
    });
    store.close();
  });

  it("V1 contract-projection conformance: rejects text beyond the current-V1 boundary before persistence", () => {
    const store = createStore();
    const artifact = JSON.parse(makeV1ArtifactJson({ artifactId: "manifest-v1-projection-overflow" })) as Record<string, unknown>;
    ((artifact.findings as Record<string, unknown>[])[0]!).rootCause = "x".repeat(4_097);
    const canonicalJson = canonicalizeTestJson(artifact);
    const input = makeValidIngestInput({
      artifactId: "manifest-v1-projection-overflow",
      canonicalJson,
      contentHash: computeSha256Hex(canonicalJson),
      reviewRunId: "run-v1-projection-overflow",
      ingestedAt: "2026-07-15T12:00:00Z",
      findings: deriveTestFindings(canonicalJson, "manifest-v1-projection-overflow", "2026-07-15T12:00:00Z"),
    });

    expect(() => store.ingestValidatedReviewEvidence(input)).toThrow(/^INVALID_INPUT$/);
    expect(store.listArtifactsByScope({ projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" })).toEqual([]);
    store.close();
  });

  it("F1-observation-identity: binds a short deterministic observation ID to immutable scope and manifest identity", () => {
    const store = createStore();
    const first = makeValidIngestInput({ artifactId: "manifest-observation-scope", reviewRunId: "run-observation-scope-one" });
    const second = makeValidIngestInput({ artifactId: "manifest-observation-scope", projectId: "hepha-second", reviewRunId: "run-observation-scope-two" });
    expect(store.ingestValidatedReviewEvidence(first)).toBe(first.contentHash);
    expect(store.ingestValidatedReviewEvidence(second)).toBe(second.contentHash);
    const firstObservation = store.listFindingObservationsByRun("run-observation-scope-one")[0];
    const secondObservation = store.listFindingObservationsByRun("run-observation-scope-two")[0];
    expect(firstObservation).toMatchObject({ reviewRunId: "run-observation-scope-one", findingId: "finding-001" });
    expect(secondObservation).toMatchObject({ reviewRunId: "run-observation-scope-two", findingId: "finding-001" });
    expect(firstObservation.observationId).not.toBe(secondObservation.observationId);
    expect(firstObservation.observationId.length).toBeLessThanOrEqual(256);

    const longIdentifier = `a${"-a".repeat(63)}a`;
    expect(longIdentifier).toHaveLength(128);
    const longArtifact = JSON.parse(makeV1ArtifactJson({ artifactId: longIdentifier })) as Record<string, unknown>;
    ((longArtifact.findings as Record<string, unknown>[])[0]).findingId = longIdentifier;
    const longCanonicalJson = canonicalizeTestJson(longArtifact);
    const longInput = makeValidIngestInput({
      artifactId: longIdentifier,
      canonicalJson: longCanonicalJson,
      contentHash: computeSha256Hex(longCanonicalJson),
      reviewRunId: "run-observation-long-identifiers",
      findings: deriveTestFindings(longCanonicalJson, longIdentifier, "2026-07-14T21:30:00Z"),
      ingestedAt: "2026-07-14T21:30:00Z",
    });
    expect(store.ingestValidatedReviewEvidence(longInput)).toBe(longInput.contentHash);
    const longObservation = store.listFindingObservationsByRun("run-observation-long-identifiers")[0];
    expect(longObservation.observationId).not.toBe("");
    expect(longObservation.observationId.length).toBeLessThanOrEqual(256);
    expect(() => store.ingestValidatedReviewEvidence(longInput)).toThrow(/^PERSISTENCE_FAILED$/);
    expect(store.listFindingObservationsByRun("run-observation-long-identifiers")).toHaveLength(1);
    store.close();
  });
  it("F1 resolution-failure-sanitization: closed exact manifest/run lookup returns only PERSISTENCE_FAILED without mutation", () => {
    const dbPath = createTempDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    const store = new ReviewGovernanceSqliteStore(dbPath, { currentActiveRuleSnapshots: currentCatalogSnapshots() });
    const now = "2026-07-14T16:00:00Z";
    const featureRootPath = "MemoryBank/Features/03_IN_PROGRESS/FEAT-065-immutable-review-ingestion-and-authoritative-pha";
    const manifestJson = makeV1ArtifactJson({ artifactId: "manifest-resolution-sanitize" });
    const manifestHash = computeSha256Hex(manifestJson);
    store.ingestValidatedReviewEvidence(makeValidIngestInput({
      canonicalJson: manifestJson,
      contentHash: manifestHash,
      artifactId: "manifest-resolution-sanitize",
      reviewRunId: "run-resolution-sanitize",
      ingestedAt: now,
      findings: deriveTestFindings(manifestJson, "manifest-resolution-sanitize", now),
    }));

    const responseJson = makeV1ArtifactJson({
      artifactKind: "remediation_response",
      artifactId: "response-resolution-sanitize",
      basisManifestHash: manifestHash,
      basisManifestArtifactId: "manifest-resolution-sanitize",
    });
    const responseHash = computeSha256Hex(responseJson);
    const responseInput = {
      contentHash: responseHash,
      artifactId: "response-resolution-sanitize",
      artifactKind: "remediation_response" as const,
      schemaVersion: 1,
      canonicalJson: responseJson,
      projectId: "hepha",
      featureId: "feat-065",
      phaseNumber: 2,
      reviewGateId: "code-review",
      featureRootPath,
      artifactRelativePath: `${featureRootPath}/code-reviews/artifacts/remediation_response/${responseHash}.json`,
      sourceMode: "v1_validated_ingress" as const,
      ingestedAt: now,
      basisManifestHash: manifestHash,
      lineage: {},
      cycle: { cycleId: "cycle-resolution-sanitize", basisManifestHash: manifestHash, cycleState: "AWAITING_RESPONSE" as const, createdAt: now },
      remediationItems: [{ itemEventId: "item-resolution-sanitize", cycleId: "cycle-resolution-sanitize", reviewRunId: "run-resolution-sanitize", findingId: "finding-001", remediationItemId: "fix-001", eventKind: "response_evidence", responseHash, decision: "APPLIED", createdAt: now }],
    };

    store.close();
    expect(() => store.ingestValidatedReviewEvidence(responseInput)).toThrow(/^PERSISTENCE_FAILED$/);

    const reopened = new ReviewGovernanceSqliteStore(dbPath, { currentActiveRuleSnapshots: currentCatalogSnapshots() });
    const scope = { projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" };
    expect(reopened.listArtifactsByScope(scope)).toHaveLength(1);
    expect(reopened.listFindingsByRun("run-resolution-sanitize")).toHaveLength(1);
    expect(reopened.getCurrentAuthoritativeReviewGate(scope)).toBeNull();

    const foreignInput = { ...responseInput, basisManifestHash: "a".repeat(64) };
    expect(() => reopened.ingestValidatedReviewEvidence(foreignInput)).toThrow(/^INVALID_INPUT$/);
    expect(reopened.listArtifactsByScope(scope)).toHaveLength(1);

    expect(reopened.ingestValidatedReviewEvidence(responseInput)).toBe(responseHash);
    expect(reopened.getArtifactByHash(responseHash)?.canonicalJson).toBe(responseJson);
    reopened.close();
  });

  it("F2 parsed-unicode-safety: rejects lone surrogates at ingress and publication, while preserving valid supplementary Unicode", () => {
    const store = createStore();
    const projectRoot = resolve(tmpdir(), `feat-065-unicode-${process.pid}-${Date.now()}`);
    mkdirSync(projectRoot, { recursive: true });
    const scope = { projectId: "hepha", featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review" };
    try {
      for (const surrogate of ["\ud800", "\udc00"]) {
        const artifact = JSON.parse(makeV1ArtifactJson({ artifactId: `manifest-unicode-${surrogate.charCodeAt(0).toString(16)}` })) as Record<string, unknown>;
        ((artifact.findings as Record<string, unknown>[])[0]).summary = `Unicode boundary ${surrogate}`;
        const canonicalJson = canonicalizeTestJson(artifact);
        const contentHash = computeSha256Hex(canonicalJson);
        expect(() => store.ingestValidatedReviewEvidence(makeValidIngestInput({
          artifactId: artifact.artifactId as string,
          canonicalJson,
          contentHash,
        }))).toThrow(/^INVALID_INPUT$/);
        expect(() => ReviewGovernanceSqliteStore.persistArtifactFileV1(requestForFileTest(projectRoot, canonicalJson))).toThrow(/^INVALID_INPUT$/);
        expect(store.listArtifactsByScope(scope)).toHaveLength(0);
        expect(existsSync(resolve(projectRoot, "MemoryBank/Features/03_IN_PROGRESS/FEAT-065"))).toBe(false);
      }

      const artifact = JSON.parse(makeV1ArtifactJson({ artifactId: "manifest-unicode-supplementary" })) as Record<string, unknown>;
      ((artifact.findings as Record<string, unknown>[])[0]).summary = "Tokenizer password-policy authorization-flow 😀.";
      const canonicalJson = canonicalizeTestJson(artifact);
      const contentHash = computeSha256Hex(canonicalJson);
      const input = makeValidIngestInput({
        artifactId: "manifest-unicode-supplementary",
        canonicalJson,
        contentHash,
        findings: deriveTestFindings(canonicalJson, "manifest-unicode-supplementary", "2026-07-14T16:00:00Z"),
        ingestedAt: "2026-07-14T16:00:00Z",
      });
      expect(store.ingestValidatedReviewEvidence(input)).toBe(contentHash);
      const published = ReviewGovernanceSqliteStore.persistArtifactFileV1(requestForFileTest(projectRoot, canonicalJson));
      expect(readFileSync(published.path, "utf8")).toBe(canonicalJson);
      expect(computeSha256Hex(readFileSync(published.path, "utf8"))).toBe(contentHash);
    } finally {
      store.close();
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
