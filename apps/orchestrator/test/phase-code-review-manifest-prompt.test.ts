import { describe, expect, it } from "vitest";
import { renderPhaseCodeReviewManifestRules } from "../src/workflows/prompts/phase-code-review-manifest-prompt.js";

const base = {
  artifactId: "artifact-arbitrary",
  canonicalFeatureId: "arbitrary-capability",
  displayFeatureId: "ITEM-X",
  phaseNumber: 12,
  projectId: "project-arbitrary",
};

describe("phase code-review manifest prompt", () => {
  it("binds one baseline review to immutable canonical scope", () => {
    const rules = renderPhaseCodeReviewManifestRules({ ...base, lineage: { kind: "not_required" } }).join("\n");
    expect(rules).toContain("exactly one raw JSON object");
    expect(rules).toContain('artifactId: "artifact-arbitrary"');
    expect(rules).toContain('projectId "project-arbitrary"');
    expect(rules).toContain('featureId "arbitrary-capability"');
    expect(rules).toContain('"ac:arbitrary-capability:<criterionId>"');
    expect(rules).toContain("baseline V1 review with no authoritative remediation predecessor");
  });

  it("copies an authoritative predecessor unchanged on rerun", () => {
    const predecessor = {
      artifactKind: "review_manifest" as const,
      artifactId: "prior-artifact",
      contentHash: "a".repeat(64),
      relativePath: "reviews/prior.json",
    };
    const rules = renderPhaseCodeReviewManifestRules({ ...base, lineage: { kind: "required", predecessor, findings: [] } }).join("\n");
    expect(rules).toContain("authoritative V1 remediation rerun");
    expect(rules).toContain(JSON.stringify({ lineage: { predecessors: [predecessor] } }));
    expect(rules).toContain("include this exact lineage object, unchanged");
  });

  it("uses an invalid sentinel instead of silently accepting a display identity", () => {
    const rules = renderPhaseCodeReviewManifestRules({ ...base, canonicalFeatureId: null }).join("\n");
    expect(rules).toContain("INVALID_FEATURE_SCOPE");
    expect(rules).toContain("do not use the scanner card ID or display ID");
    expect(rules).toContain('display ID "ITEM-X"');
  });
});
