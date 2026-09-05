import {
  ARTIFACT_KINDS,
  REVIEW_ARTIFACT_MAX_DEPTH,
  REVIEW_ARTIFACT_MAX_PAYLOAD_BYTES,
  isFeatureBoundPath,
  isReviewContractSafeString,
  isValidKebabCaseIdentifier,
  isValidProjectRelativePath,
  type ArtifactKind,
  type ReviewArtifact,
} from "../review-contract-types.js";
import type {
  PolicyRejection,
  PolicyRejectionCode,
  PolicyResult,
} from "./policy-types.js";

const SUPPORTED_VERSIONS: Record<ArtifactKind, ReadonlySet<number>> = {
  review_manifest: new Set([1]),
  remediation_response: new Set([1]),
  verification_receipt: new Set([1]),
  replan_plan: new Set([1]),
  debt_observation: new Set([1]),
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function requireValidPredecessorContext(
  context: unknown,
  requiredMembers?: readonly string[],
): PolicyResult<ReviewArtifact> | undefined {
  if (!isPlainObject(context)) return reject("invalid_artifact_reference");
  if (!isPlainObject(context.reference) || !isPlainObject(context.scope)) {
    return reject("invalid_artifact_reference");
  }
  for (const member of requiredMembers ?? []) {
    if (!isPlainObject(context[member])) return reject("invalid_artifact_reference");
  }
  return undefined;
}

export function checkDepth(value: unknown, currentDepth: number, activePath?: object[]): boolean {
  if (currentDepth > REVIEW_ARTIFACT_MAX_DEPTH) return false;
  if (typeof value !== "object" || value === null) return true;

  const path = activePath ?? [];
  if (path.includes(value)) return false;
  path.push(value);
  try {
    if (Array.isArray(value)) {
      return value.every((item) => checkDepth(item, currentDepth + 1, path));
    }
    if (isPlainObject(value)) {
      return Object.values(value).every((item) => checkDepth(item, currentDepth + 1, path));
    }
    return true;
  } finally {
    path.pop();
  }
}

export function reject(code: PolicyRejectionCode): PolicyRejection {
  const safeMessages: Record<PolicyRejectionCode, string> = {
    invalid_shape: "Artifact has an invalid structure.",
    unsupported_schema_version: "Artifact schema version is not supported.",
    unknown_rule: "Referenced rule is not found in the active catalog.",
    inactive_rule: "Referenced rule is not active.",
    ambiguous_rule_reference: "Rule reference format is ambiguous or invalid.",
    invalid_rule_snapshot: "Rule snapshot does not match the active catalog entry.",
    invalid_canonical_value: "Artifact contains non-canonical values.",
    hash_mismatch: "Artifact hash does not match its content.",
    duplicate_id: "Artifact contains duplicate identifiers.",
    invalid_predecessor_reference: "Predecessor reference is invalid.",
    invalid_self_reference: "Artifact references itself.",
    invalid_artifact_reference: "Artifact reference is invalid.",
    unsafe_content: "Artifact contains unsafe content.",
    size_limit_exceeded: "Artifact exceeds a supported size limit.",
    depth_limit_exceeded: "Artifact exceeds a supported nesting limit.",
    invalid_project_path: "Artifact path is invalid.",
    invalid_feature_path: "Artifact path is outside the allowed feature boundary.",
  };
  return { valid: false, code, message: safeMessages[code] };
}

export function checkPayloadSizeAndDepth(
  rawPayload: string,
  parsed: unknown,
): PolicyRejection | undefined {
  if (Buffer.byteLength(rawPayload, "utf8") > REVIEW_ARTIFACT_MAX_PAYLOAD_BYTES) {
    return reject("size_limit_exceeded");
  }
  return checkDepth(parsed, 0) ? undefined : reject("depth_limit_exceeded");
}

export function checkArtifactUnsafeContent(value: unknown, activePath?: object[]): PolicyRejection | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "number") return undefined;
  if (typeof value === "string") {
    return isReviewContractSafeString(value) ? undefined : reject("unsafe_content");
  }
  if (typeof value !== "object") return reject("invalid_shape");

  const path = activePath ?? [];
  if (path.includes(value)) return reject("depth_limit_exceeded");
  path.push(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) {
        const result = checkArtifactUnsafeContent(item, path);
        if (result) return result;
      }
      return undefined;
    }
    if (!isPlainObject(value)) return reject("invalid_shape");
    for (const item of Object.values(value)) {
      const result = checkArtifactUnsafeContent(item, path);
      if (result) return result;
    }
    return undefined;
  } finally {
    path.pop();
  }
}

export function checkArtifactPathSafety(
  value: unknown,
  featurePath: string | undefined,
): PolicyRejection | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = checkArtifactPathSafety(item, featurePath);
      if (result) return result;
    }
    return undefined;
  }
  if (!isPlainObject(value)) return reject("invalid_shape");

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      const isPathField = key === "relativePath" || key === "location"
        || key.endsWith("Path") || key.endsWith("path");
      if (isPathField && item.length > 0) {
        if (!isValidProjectRelativePath(item)) return reject("invalid_project_path");
        if (featurePath !== undefined && !isFeatureBoundPath(item, featurePath)) {
          return reject("invalid_feature_path");
        }
      }
    }
    const result = checkArtifactPathSafety(item, featurePath);
    if (result) return result;
  }
  return undefined;
}

export function validateSchemaVersion(
  artifactKind: ArtifactKind,
  schemaVersion: number,
): PolicyRejection | undefined {
  return SUPPORTED_VERSIONS[artifactKind]?.has(schemaVersion)
    ? undefined
    : reject("unsupported_schema_version");
}

export function validateEnvelopeShape(value: unknown): PolicyRejection | undefined {
  if (!isPlainObject(value)) return reject("invalid_shape");
  if (typeof value.schemaVersion !== "number" || value.schemaVersion !== 1) {
    return reject("unsupported_schema_version");
  }
  if (typeof value.artifactKind !== "string"
    || !(ARTIFACT_KINDS as readonly string[]).includes(value.artifactKind)) {
    return reject("invalid_shape");
  }
  if (typeof value.artifactId !== "string" || !isValidKebabCaseIdentifier(value.artifactId)) {
    return reject("invalid_shape");
  }
  if (!isPlainObject(value.scope)) return reject("invalid_shape");

  const { scope } = value;
  if (typeof scope.projectId !== "string" || !isValidKebabCaseIdentifier(scope.projectId, 64)) return reject("invalid_shape");
  if (typeof scope.featureId !== "string" || !isValidKebabCaseIdentifier(scope.featureId, 64)) return reject("invalid_shape");
  if (typeof scope.phaseNumber !== "number" || scope.phaseNumber < 0 || !Number.isInteger(scope.phaseNumber)) return reject("invalid_shape");
  if (typeof scope.reviewGateId !== "string" || !isValidKebabCaseIdentifier(scope.reviewGateId, 64)) return reject("invalid_shape");
  return undefined;
}

export interface IdCollection {
  readonly kind: string;
  readonly ids: readonly string[];
}

export function checkIdUniqueness(collections: IdCollection[]): PolicyRejection | undefined {
  const seen = new Set<string>();
  for (const collection of collections) {
    for (const id of collection.ids) {
      if (seen.has(id)) return reject("duplicate_id");
      seen.add(id);
    }
  }
  return undefined;
}
