import type {
  ActiveRuleSnapshotV1,
  ArtifactKind,
  ArtifactReference,
  ArtifactScope,
  RemediationResponse,
  ReviewArtifact,
  ReviewManifest,
} from "../review-contract-types.js";

/** Validated manifest evidence required by descendant artifact validators. */
export interface ManifestPredecessorContext {
  readonly manifest: ReviewManifest;
  readonly reference: ArtifactReference;
  readonly scope: ArtifactScope;
}

/** Validated remediation evidence required by verification-receipt validation. */
export interface ResponsePredecessorContext {
  readonly response: RemediationResponse;
  readonly reference: ArtifactReference;
  readonly scope: ArtifactScope;
}

export type PolicyRejectionCode =
  | "invalid_shape"
  | "unsupported_schema_version"
  | "unknown_rule"
  | "inactive_rule"
  | "ambiguous_rule_reference"
  | "invalid_rule_snapshot"
  | "invalid_canonical_value"
  | "hash_mismatch"
  | "duplicate_id"
  | "invalid_predecessor_reference"
  | "invalid_self_reference"
  | "invalid_artifact_reference"
  | "unsafe_content"
  | "size_limit_exceeded"
  | "depth_limit_exceeded"
  | "invalid_project_path"
  | "invalid_feature_path";

export interface PolicyRejection {
  readonly valid: false;
  readonly code: PolicyRejectionCode;
  readonly message: string;
}

export interface PolicyProjection {
  readonly artifactKind: ArtifactKind;
  readonly artifactId: string;
  readonly scope: ArtifactScope;
  readonly schemaVersion: number;
  readonly contentHash: string;
  readonly resolvedRuleSnapshots?: readonly ActiveRuleSnapshotV1[];
}

export interface PolicyAccept<T> {
  readonly valid: true;
  readonly value: T;
  readonly projection: PolicyProjection;
}

export type PolicyResult<T> = PolicyAccept<T> | PolicyRejection;

export type ArtifactValidationPipeline = Array<{
  readonly name: string;
  readonly check: () => PolicyRejection | undefined;
}>;

export type PredecessorValidationResult = PolicyResult<ReviewArtifact> | undefined;
