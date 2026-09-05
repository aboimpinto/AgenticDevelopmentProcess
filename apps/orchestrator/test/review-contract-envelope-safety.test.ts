import { describe, expect, it } from "vitest";
import {
  checkArtifactPathSafety,
  checkArtifactUnsafeContent,
  checkDepth,
  checkIdUniqueness,
  checkPayloadSizeAndDepth,
  isPlainObject,
  reject,
  requireValidPredecessorContext,
  validateEnvelopeShape,
  validateSchemaVersion,
} from "../src/review-contract-policy/envelope-safety.js";

const validEnvelope = {
  schemaVersion: 1,
  artifactKind: "review_manifest",
  artifactId: "review-output",
  scope: {
    projectId: "project-alpha",
    featureId: "feature-beta",
    phaseNumber: 4,
    reviewGateId: "quality-review",
  },
};

describe("review contract envelope safety", () => {
  it("recognizes only plain records", () => {
    expect(isPlainObject({ value: true })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
  });

  it("validates predecessor context members before dereferencing them", () => {
    expect(requireValidPredecessorContext({
      reference: {},
      scope: {},
      manifest: {},
    }, ["manifest"])).toBeUndefined();
    expect(requireValidPredecessorContext({ reference: {}, scope: {} }, ["manifest"])).toEqual(
      reject("invalid_artifact_reference"),
    );
  });

  it("bounds payload size, depth, unsafe strings, and paths", () => {
    expect(checkDepth({ nested: { value: true } }, 0)).toBe(true);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(checkDepth(cycle, 0)).toBe(false);
    expect(checkPayloadSizeAndDepth("{}", {})).toBeUndefined();
    expect(checkArtifactUnsafeContent({ summary: "bounded evidence" })).toBeUndefined();
    expect(checkArtifactUnsafeContent({ token: "sk-live-abc123def456" })?.code).toBe("unsafe_content"); // gitleaks:allow -- synthetic rejection fixture
    expect(checkArtifactPathSafety({ relativePath: "src/domain/policy.ts" }, "src")).toBeUndefined();
    expect(checkArtifactPathSafety({ relativePath: "../outside.ts" }, "src")?.code).toBe("invalid_project_path");
  });

  it("validates version, envelope, and identifier uniqueness independently", () => {
    expect(validateSchemaVersion("review_manifest", 1)).toBeUndefined();
    expect(validateSchemaVersion("review_manifest", 2)?.code).toBe("unsupported_schema_version");
    expect(validateEnvelopeShape(validEnvelope)).toBeUndefined();
    expect(validateEnvelopeShape({ ...validEnvelope, artifactId: "Invalid ID" })?.code).toBe("invalid_shape");
    expect(checkIdUniqueness([
      { kind: "finding", ids: ["finding-a"] },
      { kind: "surface", ids: ["surface-b"] },
    ])).toBeUndefined();
    expect(checkIdUniqueness([
      { kind: "finding", ids: ["duplicate"] },
      { kind: "surface", ids: ["duplicate"] },
    ])?.code).toBe("duplicate_id");
  });

  it("maps every rejection to sanitized static text", () => {
    const refusal = reject("invalid_feature_path");
    expect(refusal).toEqual({
      valid: false,
      code: "invalid_feature_path",
      message: "Artifact path is outside the allowed feature boundary.",
    });
  });
});
