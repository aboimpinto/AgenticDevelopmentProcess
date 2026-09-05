import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderPhaseCodeReviewManifestRules } from "../src/workflows/prompts/phase-code-review-manifest-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-phase-code-review-manifest-prompt.feature", import.meta.url));

describe("generic review manifest Gherkin integration", () => {
  it("documents generic manifest binding without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A baseline review emits a manifest");
    expect(specification).toContain("Scenario: A remediation rerun emits a successor manifest");
    expect(specification).toContain("Scenario: Canonical feature identity is unavailable");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds arbitrary canonical scope to one artifact", () => {
    const rules = renderPhaseCodeReviewManifestRules({
      artifactId: "A", canonicalFeatureId: "canonical", displayFeatureId: "DISPLAY",
      phaseNumber: 41, projectId: "P",
    }).join("\n");
    expect(rules).toContain('artifactId: "A"');
    expect(rules).toContain('featureId "canonical"');
    expect(rules).toContain("phaseNumber 41");
  });
});
