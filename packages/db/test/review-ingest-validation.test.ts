import { describe, expect, it } from "vitest";
import {
  assertReadBackFields,
  assertValidHash,
  canonicalizeJson,
  computeSha256Hex,
  resolveCurrentCatalogSnapshots,
  validateReviewIngestInput,
} from "../src/review-governance/review-ingest-validation.js";

const ingestedAt = "2026-07-21T00:00:00.000Z";
const scope = { projectId: "project-alpha", featureId: "work-item-alpha", phaseNumber: 1, reviewGateId: "review-gate" };
const snapshot = {
  schemaVersion: 1, catalogSchemaVersion: 1, ruleId: "secret-safe-artifacts", ruleVersion: "1.0.0",
  category: "security", scope: "review-governance", title: "Secret Safe Artifacts",
  source: { document: "docs/architecture.md", section: "Secret Safety" },
  catalogPath: ".hepha/architecture-rules.yaml", catalogSourceHash: "a".repeat(64), ruleHash: "b".repeat(64),
};

function validRequest(): Record<string, unknown> {
  const finding = {
    findingId: "finding-alpha", disposition: "OBSERVATION", claimType: "security",
    authority: { kind: "active_rule", reference: "rule:secret-safe-artifacts", snapshot },
    defectClass: "secret-exposure", severity: "note", summary: "No blocking finding remains.",
    surface: { inspected: [{ surfaceId: "surface-alpha", relativePath: "src/core.ts" }], affected: [], confirmedUnaffected: [] },
  };
  const artifact = {
    schemaVersion: 1, artifactKind: "review_manifest", artifactId: "manifest-alpha", scope,
    result: "APPROVED", ruleSnapshots: [snapshot], findings: [finding],
  };
  const canonicalJson = canonicalizeJson(artifact);
  const contentHash = computeSha256Hex(canonicalJson);
  const observationId = `observation-${computeSha256Hex(canonicalizeJson({ ...scope, contentHash, artifactId: "manifest-alpha", findingId: "finding-alpha" }))}`;
  const normalizedFinding = {
    findingId: "finding-alpha", disposition: "OBSERVATION", claimType: "security", severity: "note",
    defectClass: "secret-exposure", summary: "No blocking finding remains.",
    ruleReference: "rule:secret-safe-artifacts", ruleId: "secret-safe-artifacts", ruleVersion: "1.0.0", ruleHash: "b".repeat(64),
    observation: {
      observationId, findingId: "finding-alpha", surfaceJson: canonicalizeJson(finding.surface),
      remediationItemsJson: "[]", testMatrixJson: "[]", createdAt: ingestedAt,
    },
  };
  const featureRootPath = "MemoryBank/Features/work-item-alpha";
  return {
    contentHash, artifactId: "manifest-alpha", artifactKind: "review_manifest", schemaVersion: 1,
    canonicalJson, ...scope, featureRootPath,
    artifactRelativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${contentHash}.json`,
    sourceMode: "v1_validated_ingress", ingestedAt, lineage: {}, reviewRunId: "run-alpha",
    manifestResult: "APPROVED", findings: [normalizedFinding],
  };
}

describe("review ingest validation", () => {
  it("normalizes one canonical current-contract manifest without changing its authority", () => {
    const input = validRequest();
    const normalized = validateReviewIngestInput(input, resolveCurrentCatalogSnapshots([snapshot]));
    expect(normalized).toMatchObject({
      contentHash: input.contentHash, artifactId: "manifest-alpha", lineage: {},
      findings: [{ findingId: "finding-alpha", ruleId: "secret-safe-artifacts" }],
    });
  });

  it("rejects alternate bytes and caller-authored normalized derivatives", () => {
    const input = validRequest();
    const catalog = resolveCurrentCatalogSnapshots([snapshot]);
    expect(() => validateReviewIngestInput({ ...input, canonicalJson: ` ${input.canonicalJson}` }, catalog)).toThrow(/^INVALID_INPUT$/);
    expect(() => validateReviewIngestInput({ ...input, findings: [{ findingId: "invented" }] }, catalog)).toThrow(/^INVALID_INPUT$/);
  });

  it("validates hashes and independently resolved catalog snapshots", () => {
    expect(assertValidHash("c".repeat(64))).toBe("c".repeat(64));
    expect(resolveCurrentCatalogSnapshots([snapshot]).get(snapshot.ruleId)).toEqual(snapshot);
    expect(() => resolveCurrentCatalogSnapshots([{ ...snapshot, unexpected: true }])).toThrow(/^INVALID_INPUT$/);
  });

  it("uses persistence failures for durable read-back disagreement", () => {
    expect(() => assertReadBackFields(undefined, { id: "row-alpha" })).toThrow(/^PERSISTENCE_FAILED$/);
    expect(() => assertReadBackFields({ id: "row-beta" }, { id: "row-alpha" })).toThrow(/^PERSISTENCE_FAILED$/);
    expect(() => assertReadBackFields({ id: "row-alpha" }, { id: "row-alpha" })).not.toThrow();
  });

  it("accepts schema-valid free-text verification evidence beyond identifier length", () => {
    const input = validRequest();
    input.verificationReceipts = [{
      receiptEventId: "receipt-event",
      cycleId: "cycle-alpha",
      receiptHash: "c".repeat(64),
      reviewRunId: "run-alpha",
      findingId: "finding-alpha",
      subjectKind: "test",
      subjectId: "test-alpha",
      outcome: "PASSED",
      evidenceSummary: "e".repeat(4_096),
      createdAt: ingestedAt,
    }];

    expect(validateReviewIngestInput(input, resolveCurrentCatalogSnapshots([snapshot])))
      .toMatchObject({ verificationReceipts: [{ evidenceSummary: "e".repeat(4_096) }] });
  });

  it("still rejects verification evidence beyond the schema free-text limit", () => {
    const input = validRequest();
    input.verificationReceipts = [{
      receiptEventId: "receipt-event",
      cycleId: "cycle-alpha",
      receiptHash: "c".repeat(64),
      reviewRunId: "run-alpha",
      findingId: "finding-alpha",
      subjectKind: "test",
      subjectId: "test-alpha",
      outcome: "PASSED",
      evidenceSummary: "e".repeat(4_097),
      createdAt: ingestedAt,
    }];

    expect(() => validateReviewIngestInput(input, resolveCurrentCatalogSnapshots([snapshot])))
      .toThrow(/^INVALID_INPUT$/);
  });
});
