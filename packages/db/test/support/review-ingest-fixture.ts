import {
  canonicalizeJson,
  computeSha256Hex,
} from "../../src/review-governance/review-ingest-validation.js";

export const reviewIngestSnapshot = {
  schemaVersion: 1, catalogSchemaVersion: 1, ruleId: "secret-safe-artifacts", ruleVersion: "1.0.0",
  category: "security", scope: "review-governance", title: "Secret Safe Artifacts",
  source: { document: "docs/architecture.md", section: "Secret Safety" },
  catalogPath: ".hepha/architecture-rules.yaml", catalogSourceHash: "a".repeat(64), ruleHash: "b".repeat(64),
};

export function makeValidReviewIngestRequest(): Record<string, unknown> {
  const ingestedAt = "2026-07-21T00:00:00.000Z";
  const scope = { projectId: "project-alpha", featureId: "work-item-alpha", phaseNumber: 1, reviewGateId: "review-gate" };
  const finding = {
    findingId: "finding-alpha", disposition: "OBSERVATION", claimType: "security",
    authority: { kind: "active_rule", reference: "rule:secret-safe-artifacts", snapshot: reviewIngestSnapshot },
    defectClass: "secret-exposure", severity: "note", summary: "No blocking finding remains.",
    surface: { inspected: [{ surfaceId: "surface-alpha", relativePath: "src/core.ts" }], affected: [], confirmedUnaffected: [] },
  };
  const artifact = {
    schemaVersion: 1, artifactKind: "review_manifest", artifactId: "manifest-alpha", scope,
    result: "APPROVED", ruleSnapshots: [reviewIngestSnapshot], findings: [finding],
  };
  const canonicalJson = canonicalizeJson(artifact);
  const contentHash = computeSha256Hex(canonicalJson);
  const observationId = `observation-${computeSha256Hex(canonicalizeJson({ ...scope, contentHash, artifactId: "manifest-alpha", findingId: "finding-alpha" }))}`;
  const featureRootPath = "MemoryBank/Features/work-item-alpha";
  return {
    contentHash, artifactId: "manifest-alpha", artifactKind: "review_manifest", schemaVersion: 1,
    canonicalJson, ...scope, featureRootPath,
    artifactRelativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${contentHash}.json`,
    sourceMode: "v1_validated_ingress", ingestedAt, lineage: {}, reviewRunId: "run-alpha",
    manifestResult: "APPROVED",
    findings: [{
      findingId: "finding-alpha", disposition: "OBSERVATION", claimType: "security", severity: "note",
      defectClass: "secret-exposure", summary: "No blocking finding remains.",
      ruleReference: "rule:secret-safe-artifacts", ruleId: "secret-safe-artifacts", ruleVersion: "1.0.0", ruleHash: "b".repeat(64),
      observation: {
        observationId, findingId: "finding-alpha", surfaceJson: canonicalizeJson(finding.surface),
        remediationItemsJson: "[]", testMatrixJson: "[]", createdAt: ingestedAt,
      },
    }],
  };
}
