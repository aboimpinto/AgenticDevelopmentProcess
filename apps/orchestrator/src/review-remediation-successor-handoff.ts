/**
 * Machine-readable handoff from a review-finding resolver to the immutable
 * review-contract successor ingress.  Markdown remains human audit evidence;
 * these two bounded JSON blocks carry the durable response/verification
 * lifecycle required before an approved rerun can authorize a phase exit.
 */

import type { ArtifactReference, ArtifactScope } from "./review-contract-types.js";

export const REMEDIATION_RESPONSE_HASH_PLACEHOLDER = "__HEPHA_RESPONSE_CONTENT_HASH__";
export const REMEDIATION_RESPONSE_PATH_PLACEHOLDER = "__HEPHA_RESPONSE_RELATIVE_PATH__";

const responseHeading = "## Hepha V1 Remediation Response";
const receiptHeading = "## Hepha V1 Verification Receipt";

export type ReviewRemediationSuccessorHandoff = {
  readonly remediationResponse: string;
  readonly verificationReceipt: string;
};

export type ReviewRemediationSuccessorBindingExpectation = {
  readonly predecessor: ArtifactReference;
  readonly receiptArtifactId: string;
  readonly responseArtifactId: string;
  readonly scope: ArtifactScope;
};

export type ReviewRemediationSuccessorArtifactKind =
  | "remediation-response"
  | "verification-receipt";

function hasSameArtifactReference(left: ArtifactReference, right: ArtifactReference): boolean {
  return left.artifactKind === right.artifactKind
    && left.artifactId === right.artifactId
    && left.contentHash === right.contentHash
    && left.relativePath === right.relativePath;
}

function hasSameArtifactScope(left: ArtifactScope, right: ArtifactScope): boolean {
  return left.projectId === right.projectId
    && left.featureId === right.featureId
    && left.phaseNumber === right.phaseNumber
    && left.reviewGateId === right.reviewGateId;
}

/**
 * Assign immutable successor identities once per logical remediation chain.
 *
 * A retry is another attempt to produce the same response and receipt, so it
 * must keep the executor-owned identities. A newer immutable predecessor (or
 * a different artifact scope) starts a new chain and receives fresh IDs. The
 * policy deliberately knows nothing about feature names, phase titles,
 * findings, task files, or retry counts.
 */
export function resolveReviewRemediationSuccessorIdentityLease(input: {
  readonly current: ReviewRemediationSuccessorBindingExpectation | null;
  readonly predecessor: ArtifactReference;
  readonly scope: ArtifactScope;
  readonly createArtifactId: (kind: ReviewRemediationSuccessorArtifactKind) => string;
}): ReviewRemediationSuccessorBindingExpectation {
  if (
    input.current
    && hasSameArtifactReference(input.current.predecessor, input.predecessor)
    && hasSameArtifactScope(input.current.scope, input.scope)
  ) {
    return input.current;
  }

  return {
    predecessor: input.predecessor,
    responseArtifactId: input.createArtifactId("remediation-response"),
    receiptArtifactId: input.createArtifactId("verification-receipt"),
    scope: input.scope,
  };
}

function readJsonObject(raw: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} expected an object but received ${JSON.stringify(value)}.`);
  }
}

function assertExactBinding(path: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`${path} expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}.`);
  }
}

function assertScopeBinding(path: string, actual: unknown, expected: ArtifactScope): void {
  assertRecord(actual, path);
  assertExactBinding(`${path}.projectId`, actual.projectId, expected.projectId);
  assertExactBinding(`${path}.featureId`, actual.featureId, expected.featureId);
  assertExactBinding(`${path}.phaseNumber`, actual.phaseNumber, expected.phaseNumber);
  assertExactBinding(`${path}.reviewGateId`, actual.reviewGateId, expected.reviewGateId);
}

function assertReferenceBinding(path: string, actual: unknown, expected: ArtifactReference): void {
  assertRecord(actual, path);
  assertExactBinding(`${path}.artifactKind`, actual.artifactKind, expected.artifactKind);
  assertExactBinding(`${path}.artifactId`, actual.artifactId, expected.artifactId);
  assertExactBinding(`${path}.contentHash`, actual.contentHash, expected.contentHash);
  assertExactBinding(`${path}.relativePath`, actual.relativePath, expected.relativePath);
}

function readUniqueJsonBlock(output: string, heading: string): Record<string, unknown> {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(
    `${escapedHeading}\\s*\\r?\\n\\s*` + "```json" + "\\s*\\r?\\n([\\s\\S]*?)\\r?\\n" + "```",
    "gi",
  );
  const matches = [...output.matchAll(expression)];
  if (matches.length !== 1 || !matches[0]?.[1]) {
    throw new Error(`Expected exactly one JSON block under ${heading}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(matches[0][1]);
  } catch {
    throw new Error(`Invalid JSON block under ${heading}.`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object under ${heading}.`);
  }
  return parsed as Record<string, unknown>;
}

export function parseReviewRemediationSuccessorHandoff(output: string): ReviewRemediationSuccessorHandoff {
  const remediationResponse = readUniqueJsonBlock(output, responseHeading);
  const verificationReceipt = readUniqueJsonBlock(output, receiptHeading);
  if (remediationResponse.artifactKind !== "remediation_response") {
    throw new Error("Remediation handoff must contain a remediation_response artifact.");
  }
  if (verificationReceipt.artifactKind !== "verification_receipt") {
    throw new Error("Verification handoff must contain a verification_receipt artifact.");
  }
  return {
    remediationResponse: JSON.stringify(remediationResponse),
    verificationReceipt: JSON.stringify(verificationReceipt),
  };
}

/**
 * Compare every model-copied immutable binding with the executor-owned values
 * before either successor artifact is persisted. This provides a bounded,
 * field-level repair diagnostic without weakening the authoritative schema or
 * ingestion boundary.
 */
export function assertReviewRemediationSuccessorHandoffBindings(
  handoff: ReviewRemediationSuccessorHandoff,
  expected: ReviewRemediationSuccessorBindingExpectation,
): void {
  const remediationResponse = readJsonObject(handoff.remediationResponse, "remediationResponse");
  const verificationReceipt = readJsonObject(handoff.verificationReceipt, "verificationReceipt");

  assertExactBinding("remediationResponse.artifactId", remediationResponse.artifactId, expected.responseArtifactId);
  assertScopeBinding("remediationResponse.scope", remediationResponse.scope, expected.scope);
  assertReferenceBinding("remediationResponse.manifestReference", remediationResponse.manifestReference, expected.predecessor);

  assertExactBinding("verificationReceipt.artifactId", verificationReceipt.artifactId, expected.receiptArtifactId);
  assertScopeBinding("verificationReceipt.scope", verificationReceipt.scope, expected.scope);
  assertReferenceBinding("verificationReceipt.manifestReference", verificationReceipt.manifestReference, expected.predecessor);
  assertRecord(verificationReceipt.responseReference, "verificationReceipt.responseReference");
  assertExactBinding("verificationReceipt.responseReference.artifactKind", verificationReceipt.responseReference.artifactKind, "remediation_response");
  assertExactBinding("verificationReceipt.responseReference.artifactId", verificationReceipt.responseReference.artifactId, expected.responseArtifactId);
  assertExactBinding("verificationReceipt.responseReference.contentHash", verificationReceipt.responseReference.contentHash, REMEDIATION_RESPONSE_HASH_PLACEHOLDER);
  assertExactBinding("verificationReceipt.responseReference.relativePath", verificationReceipt.responseReference.relativePath, REMEDIATION_RESPONSE_PATH_PLACEHOLDER);
}

/** Bind the receipt to the response HEPHA just persisted; no model may invent its immutable hash/path. */
export function bindVerificationReceiptResponseReference(
  rawReceipt: string,
  responseReference: ArtifactReference,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawReceipt);
  } catch {
    throw new Error("Verification handoff is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Verification handoff must be a JSON object.");
  }
  const receipt = parsed as Record<string, unknown>;
  const suppliedReference = receipt.responseReference;
  if (typeof suppliedReference !== "object" || suppliedReference === null || Array.isArray(suppliedReference)) {
    throw new Error("Verification handoff must declare responseReference.");
  }
  const reference = suppliedReference as Record<string, unknown>;
  if (
    reference.artifactKind !== "remediation_response"
    || reference.artifactId !== responseReference.artifactId
    || reference.contentHash !== REMEDIATION_RESPONSE_HASH_PLACEHOLDER
    || reference.relativePath !== REMEDIATION_RESPONSE_PATH_PLACEHOLDER
  ) {
    throw new Error("Verification handoff must use the exact assigned response ID and HEPHA response-reference placeholders.");
  }
  receipt.responseReference = responseReference;
  return JSON.stringify(receipt);
}
