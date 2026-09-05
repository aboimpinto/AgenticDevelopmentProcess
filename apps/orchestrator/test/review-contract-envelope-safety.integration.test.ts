import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkArtifactPathSafety,
  checkArtifactUnsafeContent,
  checkIdUniqueness,
  checkPayloadSizeAndDepth,
  validateEnvelopeShape,
} from "../src/review-contract-policy/envelope-safety.js";

const featurePath = fileURLToPath(new URL("./review-contract-envelope-safety.feature", import.meta.url));
const facadePath = fileURLToPath(new URL("../src/review-contract-policy.ts", import.meta.url));

describe("generic review contract envelope safety Gherkin integration", () => {
  const feature = readFileSync(featurePath, "utf8");

  it("keeps product-blind scenarios connected to the compatibility facade", () => {
    expect(feature.match(/Scenario:/g)).toHaveLength(4);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|task \d+/i);
    const facade = readFileSync(facadePath, "utf8");
    expect(facade).toContain('from "./review-contract-policy/envelope-safety.js"');
    expect(facade).toContain("validateEnvelopeShape,");
  });

  it("executes the supported envelope and bounded transport scenarios", () => {
    const envelope = {
      schemaVersion: 1,
      artifactKind: "review_manifest",
      artifactId: "review-evidence",
      scope: {
        projectId: "project-alpha",
        featureId: "feature-beta",
        phaseNumber: 0,
        reviewGateId: "review-gate",
      },
    };
    expect(validateEnvelopeShape(envelope)).toBeUndefined();
    expect(checkPayloadSizeAndDepth(JSON.stringify(envelope), envelope)).toBeUndefined();
  });

  it("executes sanitized content, path, and duplicate refusals", () => {
    expect(checkArtifactUnsafeContent({ authorization: "sk-live-abc123def456" })?.code).toBe("unsafe_content");
    expect(checkArtifactPathSafety({ relativePath: "../../escape" }, "feature")?.code).toBe("invalid_project_path");
    expect(checkIdUniqueness([
      { kind: "first", ids: ["shared-id"] },
      { kind: "second", ids: ["shared-id"] },
    ])?.code).toBe("duplicate_id");
  });
});
